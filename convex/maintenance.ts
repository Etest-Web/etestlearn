import { internalMutation, mutation, query } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  getCurrentUser,
  isStaff,
  requireAdmin,
  type Doc,
  type ReadCtx,
} from "./helpers/auth";
import { logAudit } from "./helpers/audit";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  isMaintenanceOverridden,
  MAINTENANCE_OVERRIDE_ENV,
  normalizeMaintenanceMessage,
  resolveMaintenanceDeadline,
} from "../lib/maintenance";

/**
 * Maintenance mode: the switch, its note, and the two readers that need it.
 *
 * The policy — which routes survive, the wording, the length ceiling — lives in
 * `lib/maintenance.ts` and is imported, not restated. This module is the stored
 * state plus the authorization around it.
 *
 * Four callers, and that split drives the shape of the file:
 *
 *   · `proxy.ts` runs on the Edge runtime in front of every request and often
 *     with **no Clerk session at all**, so `getStatus` is deliberately public.
 *     That is not a hole: everything it returns is text the outage page is about
 *     to render in the visitor's browser anyway. It exposes no user data, no
 *     ids and no capability — only "is the site down", the note, and the
 *     applications setting.
 *   · `isStaffCaller` is the middleware's escape hatch, read only while the
 *     gate is actually blocking. Same reasoning for being public: the caller
 *     has to present a session token, and the answer is a boolean about the
 *     caller alone.
 *   · `preflight` is the operator's diagnosis, and it is the one reader that
 *     must NOT be admin-gated — an admin-gated query throws exactly when the
 *     identity is broken, which is the only case it exists for.
 *   · `setMode` is the admin-only write, and it is audited like every other
 *     privileged mutation because it takes the entire public site away.
 */

/**
 * The auto-off job, referenced by wire name rather than
 * `internal.maintenance.releaseIfDue`.
 *
 * The same reason `proxy.ts` and `lib/durable-rate-limit.ts` do it: `internal`
 * is generated, so a self-reference to a function added in this very commit
 * resolves to `undefined` until `npx convex dev` has run — and that fails at
 * runtime rather than at compile time, in the scheduler path only, which is
 * precisely the path nobody exercises until an outage. The string is what
 * codegen emits for the `internalMutation` below.
 */
const releaseIfDueJob = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { released: boolean }
>("maintenance:releaseIfDue");

/** The subset of the row that is safe to serve anonymously. */
export type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  allowInstructorApplications: boolean;
  updatedAt: number | null;
  /**
   * When the site went down — stamped on the rising edge only, so it survives
   * edits to the note made mid-outage and is cleared on the way back up.
   * `null` whenever the site is up.
   */
  enabledAt: number | null;
  /**
   * When the site releases itself if nobody stops it. Stamped on the rising
   * edge, kept across edits to the note, cleared on the way back up. `null`
   * whenever the site is up or no deadline was ever set.
   */
  disableAt: number | null;
  /**
   * True while `MAINTENANCE_OVERRIDE` is forcing the site up. Reported separately
   * from `enabled` so the admin console can say "the stored switch is on, but the
   * deployment is overriding it" instead of showing a switch that appears to be
   * lying about what it wrote.
   */
  overrideActive: boolean;
};

/**
 * "Off", and the answer for every failure to read the row.
 *
 * Fail-*open* here is the opposite of the convention used for the shared-secret
 * and rate-limit helpers, and deliberately so. Those refuse because an absent
 * secret would mean "no limit". This refuses because an unreadable flag would
 * mean "site down", and a gate that cannot tell whether there is an outage must
 * never manufacture one — a Convex blip would take the storefront offline.
 */
const OFF: MaintenanceStatus = {
  enabled: false,
  message: DEFAULT_MAINTENANCE_MESSAGE,
  allowInstructorApplications: true,
  updatedAt: null,
  overrideActive: false,
  enabledAt: null,
  disableAt: null,
};

/**
 * The newest settings row, or `null` on a deployment nobody has saved to yet.
 *
 * A `collect()` over `by_updatedAt` rather than `.first()`: the schema permits
 * more than one row, and taking the newest means a stray duplicate can never
 * shadow the row an admin just saved. Same reasoning as
 * `referrals.loadSettings`.
 */
async function newestRow(ctx: ReadCtx): Promise<Doc<"maintenanceMode"> | null> {
  const rows = await ctx.db
    .query("maintenanceMode")
    .withIndex("by_updatedAt")
    .collect();

  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}

async function loadStatus(ctx: ReadCtx): Promise<MaintenanceStatus> {
  // The kill-switch is folded in here rather than in the gate, so there is
  // exactly one place that decides "is the site down". `proxy.ts`, the outage
  // page and the admin console all read this query and therefore cannot
  // disagree — and the gate's 5s cache cannot serve a stale answer to the one
  // case the lever exists for.
  const overrideActive = isMaintenanceOverridden(process.env[MAINTENANCE_OVERRIDE_ENV]);
  const newest = await newestRow(ctx);
  if (!newest) return { ...OFF, overrideActive };

  return {
    // Read-time only: the stored switch is left exactly as the admin left it,
    // so pulling the env var re-closes the site rather than having to be
    // toggled twice, and so the override is never mistaken for somebody
    // turning it off.
    enabled: newest.enabled && !overrideActive,
    message: newest.message,
    allowInstructorApplications: newest.allowInstructorApplications,
    updatedAt: newest.updatedAt,
    overrideActive,
    // Null while overridden, for the same reason as `enabledAt`: both answer
    // "is the site down, and since when?", and reporting a start or a release
    // time next to `enabled: false` would contradict the flag beside it. The
    // console's override banner is where that state gets explained.
    enabledAt: newest.enabled && !overrideActive ? newest.enabledAt ?? null : null,
    disableAt: newest.enabled && !overrideActive ? newest.disableAt ?? null : null,
  };
}

/**
 * The gate's read. **Intentionally public** — see the module header.
 *
 * Also what the admin console reads to render the current state, and what the
 * maintenance page reads for the note.
 */
export const getStatus = query({
  args: {},
  handler: async (ctx) => await loadStatus(ctx),
});

/**
 * Whether the caller is staff (instructor or admin).
 *
 * This is the middleware's escape hatch, and it is the reason the gate cannot
 * lock the platform's own operators out of the page that turns it off. It
 * answers from `getCurrentUser`, so a suspended account resolves to `false`
 * exactly as it does everywhere else — suspension cannot be used to obtain the
 * bypass.
 *
 * Deliberately a boolean rather than the user document: the caller needs a
 * yes/no, and returning nothing else keeps this from becoming a way to read
 * another account's record by guessing whether an identity is signed in.
 */
export const isStaffCaller = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return user ? isStaff(user) : false;
  },
});

/** The caller's own route back in — what {@link preflight} reports. */
export type MaintenancePreflight = {
  identity: "resolved" | "none";
  user: "not_checked" | "found" | "missing" | "duplicate" | "suspended";
  role: "student" | "instructor" | "admin" | null;
  bypassWorks: boolean;
};

/**
 * Why this caller would — or would not — get back past the gate.
 *
 * `isStaffCaller` answers a boolean and the middleware flattens every failure
 * into `false`, so an operator who has locked themselves out has no way to tell
 * *which* of the four very different problems they are looking at:
 *
 *   · `identity: "none"`       the session never resolved. Issuer mismatch, an
 *                              expired token, or a browser with no session at
 *                              all — fixed in Clerk or in `auth.config.ts`.
 *   · `user: "missing"`        the session is fine and no `users` row matches
 *                              it. The Clerk webhook has not run for this
 *                              account — fixed in the webhook, not in Convex.
 *   · `user: "duplicate"`      two rows share the clerkId. `getCurrentUser`
 *                              reads with `.unique()`, so *every* identity call
 *                              throws and the gate silently refuses everyone.
 *   · `user: "suspended"`      the row exists and the account is suspended.
 *
 * Each has a different fix, and each is invisible through `isStaffCaller`.
 *
 * **Deliberately not behind `requireAdmin`.** If the identity or the row is
 * broken, an admin-gated query throws the very diagnosis that was requested —
 * it would work only in the case where nothing is wrong. The cost is that an
 * anonymous caller can invoke it, which is why it returns only the caller's
 * own state: no id, no email, no cross-user read, nothing that turns it into a
 * probe for other accounts. See `lib/maintenance.ts` for the policy it feeds.
 */
export const preflight = query({
  args: {},
  handler: async (ctx): Promise<MaintenancePreflight> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { identity: "none", user: "not_checked", role: null, bypassWorks: false };
    }

    // Read with `collect()` rather than `getCurrentUser`'s `.unique()`: a
    // duplicate is one of the states this exists to name, and `.unique()` would
    // throw it away as an error.
    const rows = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .collect();

    if (rows.length === 0) {
      return { identity: "resolved", user: "missing", role: null, bypassWorks: false };
    }
    if (rows.length > 1) {
      // Role is null rather than the duplicated value: with two rows the lookup
      // cannot say which one the caller is, and guessing would send whoever
      // reads this chasing the wrong account.
      return { identity: "resolved", user: "duplicate", role: null, bypassWorks: false };
    }

    const user = rows[0];
    if (user.suspendedAt !== undefined) {
      return { identity: "resolved", user: "suspended", role: user.role, bypassWorks: false };
    }

    // `isStaff` is the same predicate `isStaffCaller` consults, so the two
    // cannot drift — the preflight is a reading of the bypass, not a second
    // opinion about who counts as staff.
    return { identity: "resolved", user: "found", role: user.role, bypassWorks: isStaff(user) };
  },
});

/**
 * Turns maintenance on or off, edits the note shown while it is on, and sets
 * when the site should release itself.
 *
 * `message` and `allowInstructorApplications` are optional so the console's
 * primary switch can send `{ enabled }` alone and cannot accidentally overwrite
 * the note with a stale copy from a form that was rendered before somebody else
 * edited it. Omitted means "leave as it is".
 *
 * `disableAt` follows the same rule. Omitted while the site is already down
 * keeps the existing deadline, so saving the note mid-outage does not quietly
 * extend the window; omitted on the way up falls back to the two-hour default.
 * Either way the value is clamped through `resolveMaintenanceDeadline` rather
 * than stored as sent.
 */
export const setMode = mutation({
  args: {
    enabled: v.boolean(),
    message: v.optional(v.string()),
    allowInstructorApplications: v.optional(v.boolean()),
    disableAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await newestRow(ctx);
    const previous = await loadStatus(ctx);
    const message =
      args.message === undefined
        ? previous.message
        : normalizeMaintenanceMessage(args.message);
    const allowInstructorApplications =
      args.allowInstructorApplications ??
      previous.allowInstructorApplications;

    const now = Date.now();
    // Both stamps are rising-edge only, so "how long has this been down?" and
    // "when does it come back?" stay answerable after two edits to the note —
    // and both are cleared on the way back up rather than left pointing at a
    // window that is already over.
    const siteIsUp = row === null || !row.enabled;
    const enabledAt = args.enabled ? (previous.enabled ? row?.enabledAt : now) : undefined;

    let disableAt: number | undefined;
    if (!args.enabled) {
      disableAt = undefined;
    } else if (previous.enabled && args.disableAt === undefined) {
      // Already down and no new deadline asked for: keep the one in force.
      disableAt = row?.disableAt;
    } else {
      disableAt = resolveMaintenanceDeadline(args.disableAt, now);
    }

    if (row) {
      await ctx.db.patch(row._id, {
        enabled: args.enabled,
        message,
        allowInstructorApplications,
        enabledAt,
        disableAt,
        updatedAt: now,
        updatedBy: admin._id,
      });
    } else {
      await ctx.db.insert("maintenanceMode", {
        enabled: args.enabled,
        message,
        allowInstructorApplications,
        enabledAt,
        disableAt,
        updatedAt: now,
        updatedBy: admin._id,
      });
    }

    // Armed on the rising edge, and again whenever the deadline moves while the
    // site is already down. The second case matters: pulling the window
    // *forward* would otherwise never take effect, because the job armed at the
    // original time is the only one scheduled. A later move needs no re-arm —
    // that job re-arms itself for the remainder. Saving the note without
    // touching the deadline arms nothing: `releaseIfDue` is idempotent, but a
    // job per save would still be pointless work at 3am.
    const deadlineMoved = disableAt !== (row?.disableAt ?? undefined);
    if (args.enabled && disableAt !== undefined && (siteIsUp || deadlineMoved)) {
      await ctx.scheduler.runAfter(Math.max(0, disableAt - now), releaseIfDueJob, {});
    }

    // Audited because this is the most consequential switch on the platform:
    // it removes the storefront, the catalog and every dashboard from the
    // public in one write, and a support question about "what was the site
    // saying at 14:03?" is otherwise unanswerable.
    await logAudit(ctx, {
      actorId: admin._id,
      action: "maintenance.set_mode",
      targetType: "maintenance",
      details: {
        enabled: args.enabled,
        allowInstructorApplications,
        wasEnabled: previous.enabled,
        messageChanged: args.message !== undefined,
        autoReleaseAt: disableAt ?? null,
      },
    });

    return { enabled: args.enabled, message, allowInstructorApplications, disableAt };
  },
});

/**
 * Releases the site when its window is up.
 *
 * The half that makes auto-off real: `setMode` can only *arm* a deadline, and
 * something has to act on it when the operator has gone home or been locked
 * out — which is the whole reason this feature exists.
 *
 * Written to be safe against every arrival order:
 *   · the site is already up (the operator turned it off by hand, and the armed
 *     job lands later anyway) — a no-op;
 *   · the row has no deadline (a row written before this feature) — a no-op,
 *     because only a deadline can say the window is over;
 *   · the deadline has been *extended* since this job was armed — re-arm for
 *     the remainder rather than firing early, which is the difference between a
 *     deadline an operator can move and one they cannot.
 *
 * **Not audited, deliberately.** `auditLogs.actorId` is required, and the actor
 * here is a scheduler. Attaching the last admin would make the log claim a
 * human turned the site off when nobody did — which is exactly the kind of
 * record an incident review would later lean on. The window stays
 * reconstructable from `enabledAt` and `updatedAt` on the row instead.
 */
export const releaseIfDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const row = await newestRow(ctx);
    if (!row || !row.enabled) return { released: false };
    if (row.disableAt === undefined) return { released: false };

    const now = Date.now();
    if (row.disableAt > now) {
      // Re-armed rather than dropped: an extended deadline must still fire.
      await ctx.scheduler.runAfter(row.disableAt - now, releaseIfDueJob, {});
      return { released: false };
    }

    await ctx.db.patch(row._id, {
      enabled: false,
      enabledAt: undefined,
      disableAt: undefined,
      updatedAt: now,
    });

    return { released: true };
  },
});