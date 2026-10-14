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
  normalizeMaintenanceMessage,
} from "../lib/maintenance";

/**
 * Maintenance mode: the switch, its note, and the two readers that need it.
 *
 * The policy — which routes survive, the wording, the length ceiling — lives in
 * `lib/maintenance.ts` and is imported, not restated. This module is the stored
 * state plus the authorization around it.
 *
 * Two very different callers, and that split drives the shape of the file:
 *
 *   · `proxy.ts` runs on the Edge runtime in front of every request and often
 *     with **no Clerk session at all**, so `getStatus` is deliberately public.
 *     That is not a hole: everything it returns is text the outage page is about
 *     to render in the visitor's browser anyway. It exposes no user data, no
 *     ids and no capability — only "is the site down", the note, and the
 *     applications setting.
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
  const newest = await newestRow(ctx);
  if (!newest) return OFF;

  return {
    enabled: newest.enabled,
    message: newest.message,
    allowInstructorApplications: newest.allowInstructorApplications,
    updatedAt: newest.updatedAt,
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