import { mutation, query } from "./_generated/server";
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

/** The subset of the row that is safe to serve anonymously. */
export type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  allowInstructorApplications: boolean;
  /** `null` until an admin has saved once — i.e. on every fresh deployment. */
  updatedAt: number | null;
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
 * Turns maintenance on or off, and edits the note shown while it is on.
 *
 * `message` and `allowInstructorApplications` are optional so the console's
 * primary switch can send `{ enabled }` alone and cannot accidentally overwrite
 * the note with a stale copy from a form that was rendered before somebody else
 * edited it. Omitted means "leave as it is".
 */
export const setMode = mutation({
  args: {
    enabled: v.boolean(),
    message: v.optional(v.string()),
    allowInstructorApplications: v.optional(v.boolean()),
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
    // Stamped only on the rising edge, so "how long has this been down?" stays
    // answerable after two edits to the note — and cleared on the way back up,
    // rather than left pointing at a window that is already over.
    const enabledAt = args.enabled ? (previous.enabled ? row?.enabledAt : now) : undefined;

    if (row) {
      await ctx.db.patch(row._id, {
        enabled: args.enabled,
        message,
        allowInstructorApplications,
        enabledAt,
        updatedAt: now,
        updatedBy: admin._id,
      });
    } else {
      await ctx.db.insert("maintenanceMode", {
        enabled: args.enabled,
        message,
        allowInstructorApplications,
        enabledAt,
        updatedAt: now,
        updatedBy: admin._id,
      });
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
      },
    });

    return { enabled: args.enabled, message, allowInstructorApplications };
  },
});