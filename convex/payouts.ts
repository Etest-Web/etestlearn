import { v } from "convex/values";
import {
  makeFunctionReference,
  type GenericMutationCtx,
} from "convex/server";
import { mutation, query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import {
  requireAdmin,
  requireUser,
  isStaff,
  type Doc,
  type Id,
  type ReadCtx,
  type UserDoc,
} from "./helpers/auth";
import { logAudit } from "./helpers/audit";
import { requireRateLimit } from "./helpers/rateLimit";
import { createNotification } from "./helpers/notifications";
import { formatNaira } from "../lib/instructor-earnings";
import {
  summarizePayouts,
  type PayoutBalance,
  type PayoutStatus,
} from "../lib/payouts";
import { lifetimeEarnedKobo } from "./instructorStats";

/**
 * The payout ledger: what instructors ask to be paid, and what admins record
 * paying them.
 *
 * There is no transfer automation in this codebase (see the note in
 * `lib/instructor-earnings.ts`): money leaves through Paystack's dashboard by a
 * human. This module is the *record* of that work and the queue that prompts it.
 * It never claims money moved on its own — an admin writes `paid` only after they
 * have actually sent it, and captures the transfer reference as the receipt.
 *
 * The arithmetic lives in `lib/payouts.summarizePayouts`, and the earnings total
 * it subtracts from is `instructorStats.lifetimeEarnedKobo` — the same figure the
 * Earnings page shows. That is deliberate: an instructor's "available to
 * request" and "All time earnings" can never disagree, because they are the same
 * number minus the same ledger.
 *
 * Every role check is `isStaff`, never `role === "instructor"`: an admin may
 * teach and therefore earn, exactly as `convex/instructorBank.ts` spells out.
 */

/** Ledger rows returned to a console in one page. */
const PAYOUT_LIST_CAP = 200;
/** Rows the admin queue returns before it is truncated. */
const PAYOUT_QUEUE_CAP = 200;
/** Staff enumerated for the admin's "record a payout" picker. */
const RECIPIENT_CAP = 500;
/** Requests one instructor may file per day — a signal, not a chat channel. */
const REQUESTS_PER_DAY = 3;

const CURRENCY = "NGN";

/**
 * Scheduled, not imported through `internal`: this module is itself in
 * `_generated/api`, so reaching a sibling action through `internal` makes
 * TypeScript infer through a cycle it sits inside and collapses the file to
 * `any` (TS7022). Same workaround as `lib/durable-rate-limit.ts`.
 */
const sendPayoutRequestEmailRef = makeFunctionReference<
  "action",
  {
    payoutId: string;
    amountKobo: number;
    userName?: string;
    userEmail?: string;
    note?: string;
  },
  void
>("bankVerification:sendPayoutRequestEmail");

// ─── Result shapes ──────────────────────────────────────────────────────────

/** One ledger row as an instructor sees it (no admin join). */
export interface PayoutView {
  _id: Id<"payouts">;
  amountKobo: number;
  currency: string;
  status: PayoutStatus;
  note: string | null;
  reference: string | null;
  requestedAt: number;
  resolvedAt: number | null;
}

/** A queue row: the ledger row plus who it belongs to and who paid it. */
export interface AdminPayoutView extends PayoutView {
  instructorId: Id<"users">;
  instructorName: string | null;
  instructorEmail: string | null;
  recordedByName: string | null;
}

export interface PayoutOverview {
  balance: PayoutBalance;
  currency: string;
  /** Whether the ledger's owner has a verified account to be paid into. */
  bankVerified: boolean;
  payouts: PayoutView[];
}

/** One row of the admin's recipient picker. No money computed — see the query. */
export interface PayoutRecipientView {
  id: Id<"users">;
  name: string | null;
  email: string | null;
  bankVerified: boolean;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

function toPayoutView(row: Doc<"payouts">): PayoutView {
  return {
    _id: row._id,
    amountKobo: row.amountKobo,
    currency: row.currency,
    status: row.status,
    note: row.note ?? null,
    reference: row.reference ?? null,
    requestedAt: row.requestedAt,
    resolvedAt: row.resolvedAt ?? null,
  };
}

async function toAdminPayoutView(
  ctx: ReadCtx,
  row: Doc<"payouts">,
): Promise<AdminPayoutView> {
  const [instructor, recordedBy] = await Promise.all([
    ctx.db.get(row.instructorId),
    row.recordedBy ? ctx.db.get(row.recordedBy) : Promise.resolve(null),
  ]);

  return {
    ...toPayoutView(row),
    instructorId: row.instructorId,
    instructorName: instructor?.name?.trim() || null,
    instructorEmail: instructor?.email ?? null,
    recordedByName: recordedBy?.name?.trim() || null,
  };
}

/**
 * Every ledger row for one instructor, newest first.
 *
 * `collect()` rather than a capped read because this feeds the balance: a
 * truncated list would over-report what is requestable. The set is one
 * instructor's own payouts, which is small by construction (a human sends each
 * one), so an exact read is the honest choice — the same reasoning as
 * `countPendingUnpublishRequests`.
 */
async function loadInstructorRows(
  ctx: ReadCtx,
  instructorId: Id<"users">,
): Promise<Doc<"payouts">[]> {
  return await ctx.db
    .query("payouts")
    .withIndex("by_instructor", (q) => q.eq("instructorId", instructorId))
    .collect();
}

/** The four money figures for one instructor, from earnings and the ledger. */
async function loadBalance(
  ctx: ReadCtx,
  user: UserDoc,
): Promise<PayoutBalance> {
  const earnedKobo = await lifetimeEarnedKobo(ctx, user);
  const rows = await loadInstructorRows(ctx, user._id);
  return summarizePayouts(earnedKobo, rows);
}

/**
 * The caller's payout ledger — or, for an admin, whichever instructor they name.
 *
 * One query for both consoles: the instructor page calls it with no argument and
 * gets its own ledger; the admin's "record a payout" form calls it with a chosen
 * `instructorId` to show that person's balance before writing a row. A
 * non-admin may never name someone else.
 */
export const getPayoutOverview = query({
  args: { instructorId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<PayoutOverview> => {
    const user = await requireUser(ctx);

    let target = user;
    if (args.instructorId && args.instructorId !== user._id) {
      if (user.role !== "admin") {
        throw new Error("Not authorized — admin access required");
      }
      const other = await ctx.db.get(args.instructorId);
      if (!other) throw new Error("Instructor not found");
      target = other;
    }

    const [balance, rows] = await Promise.all([
      loadBalance(ctx, target),
      loadInstructorRows(ctx, target._id),
    ]);

    return {
      balance,
      currency: CURRENCY,
      bankVerified: target.bankVerified === true,
      payouts: rows
        .sort((a, b) => b.requestedAt - a.requestedAt)
        .slice(0, PAYOUT_LIST_CAP)
        .map(toPayoutView),
    };
  },
});

/** Admin queue: every request, newest first, with who asked and who paid. */
export const listPayoutQueue = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("requested"),
        v.literal("paid"),
        v.literal("cancelled"),
      ),
    ),
  },
  handler: async (ctx, args): Promise<AdminPayoutView[]> => {
    await requireAdmin(ctx);

    const rows = await (args.status
      ? ctx.db
          .query("payouts")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
      : ctx.db.query("payouts").order("desc")
    ).take(PAYOUT_QUEUE_CAP);

    return await Promise.all(rows.map((row) => toAdminPayoutView(ctx, row)));
  },
});

/**
 * How many payout requests are waiting on an admin — the sidebar badge.
 *
 * A number, not a list: this renders on the chrome of every admin route, so it
 * reads only the rows it counts. `collect()` is honest here because a pending
 * queue is small by construction (a person clears each row), and Convex has no
 * count aggregation. Do not "optimise" it to `.take(1)`.
 */
export const countPendingPayouts = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("payouts")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();
    return rows.length;
  },
});

/**
 * Staff the admin may record a payout for.
 *
 * Returns identities only — deliberately no money. Computing a balance here
 * would mean walking every instructor's courses and purchases on one page load;
 * `getPayoutOverview({ instructorId })` does that for the single instructor the
 * admin actually selects. Reads the `by_role` index instead of scanning the
 * whole `users` table, so it stays bounded as learners accumulate.
 */
export const listPayoutRecipients = query({
  args: {},
  handler: async (ctx): Promise<PayoutRecipientView[]> => {
    await requireAdmin(ctx);

    const [instructors, admins] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "instructor"))
        .take(RECIPIENT_CAP),
      ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .take(RECIPIENT_CAP),
    ]);

    return [...instructors, ...admins]
      .filter((u) => u.suspendedAt === undefined)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map((u) => ({
        id: u._id,
        name: u.name?.trim() || null,
        email: u.email ?? null,
        bankVerified: u.bankVerified === true,
      }));
  },
});

// ─── Instructor writes ──────────────────────────────────────────────────────

/**
 * Ask to be paid the available balance.
 *
 * Takes no amount. The ledger has exactly one thing worth asking for — "pay me
 * what you owe me" — and a partial amount would open a reconciliation problem
 * (which sale did this ₦X come from?) for no product benefit. The computed
 * balance is snapshotted onto the row, so a later refund cannot silently change
 * what was requested.
 */
export const requestPayout = mutation({
  args: { note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) {
      throw new Error("Only instructors and admins can request a payout");
    }
    if (!user.bankVerified) {
      throw new Error(
        "Add a verified payout account before requesting a payout",
      );
    }

    const note = args.note?.trim();
    if (note && note.length > 500) {
      throw new Error("Note must be 500 characters or less");
    }

    // A payout request is a message to a human, not a habit: three a day is
    // generous for correcting a mistake and useless for nagging.
    await requireRateLimit(
      ctx,
      `payoutRequest:${user._id}`,
      REQUESTS_PER_DAY,
      24 * 60 * 60 * 1000,
    );

    const pending = await ctx.db
      .query("payouts")
      .withIndex("by_instructor_status", (q) =>
        q.eq("instructorId", user._id).eq("status", "requested"),
      )
      .first();
    if (pending) {
      throw new Error("You already have a payout request waiting to be paid");
    }

    const balance = await loadBalance(ctx, user);
    if (balance.availableKobo <= 0) {
      throw new Error("There is nothing available to request right now");
    }

    const now = Date.now();
    const payoutId = await ctx.db.insert("payouts", {
      instructorId: user._id,
      amountKobo: balance.availableKobo,
      status: "requested",
      currency: CURRENCY,
      note: note || undefined,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(ctx, {
      actorId: user._id,
      action: "payout.request",
      targetType: "payout",
      targetId: payoutId,
      details: {
        amountKobo: balance.availableKobo,
        earnedKobo: balance.earnedKobo,
        paidKobo: balance.paidKobo,
      },
    });

    await notifyAdmins(ctx, {
      title: "Payout requested",
      body: `${user.name?.trim() || "An instructor"} asked to be paid ${formatNaira(balance.availableKobo)}.`,
      href: "/dashboard/admin/payouts",
      actorId: user._id,
    });

    const identity = await ctx.auth.getUserIdentity();
    await ctx.scheduler.runAfter(0, sendPayoutRequestEmailRef, {
      payoutId,
      amountKobo: balance.availableKobo,
      userName: user.name ?? identity?.name ?? undefined,
      userEmail: user.email ?? identity?.email ?? undefined,
      note: note || undefined,
    });

    return { payoutId, amountKobo: balance.availableKobo };
  },
});

/** Withdraw your own pending request so the balance is requestable again. */
export const cancelPayoutRequest = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const row = await ctx.db.get(args.payoutId);
    if (!row || row.instructorId !== user._id) {
      throw new Error("Payout request not found");
    }
    if (row.status !== "requested") {
      throw new Error("This request can no longer be withdrawn");
    }

    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "cancelled",
      resolvedAt: now,
      updatedAt: now,
    });

    await logAudit(ctx, {
      actorId: user._id,
      action: "payout.cancel",
      targetType: "payout",
      targetId: row._id,
      details: { amountKobo: row.amountKobo, byInstructor: true },
    });

    return { success: true };
  },
});

// ─── Admin writes ───────────────────────────────────────────────────────────

/**
 * Mark a request paid. This is the receipt: it records that the transfer was
 * sent, by whom, and the reference that proves it.
 */
export const markPayoutPaid = mutation({
  args: {
    payoutId: v.id("payouts"),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.payoutId);
    if (!row) throw new Error("Payout request not found");
    if (row.status !== "requested") {
      throw new Error("This payout has already been resolved");
    }

    const reference = cleanOptional(args.reference, 200, "Reference");
    const note = cleanOptional(args.note, 500, "Note");

    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "paid",
      resolvedAt: now,
      recordedBy: admin._id,
      reference,
      // Preserve the instructor's own note; an admin note is added alongside.
      note: note ?? row.note,
      updatedAt: now,
    });

    await logAudit(ctx, {
      actorId: admin._id,
      action: "payout.mark_paid",
      targetType: "payout",
      targetId: row._id,
      details: {
        amountKobo: row.amountKobo,
        instructorId: row.instructorId,
        reference: reference ?? null,
      },
    });

    await createNotification(ctx, {
      userId: row.instructorId,
      type: "payout_paid",
      title: "Payout sent",
      body: `${formatNaira(row.amountKobo)} is on its way to your payout account.`,
      href: "/dashboard/instructor/payouts",
    });

    return { success: true };
  },
});

/** Decline a request without paying it. The instructor is told why. */
export const declinePayoutRequest = mutation({
  args: {
    payoutId: v.id("payouts"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.payoutId);
    if (!row) throw new Error("Payout request not found");
    if (row.status !== "requested") {
      throw new Error("This payout has already been resolved");
    }

    const note = cleanOptional(args.note, 500, "Note");
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "cancelled",
      resolvedAt: now,
      recordedBy: admin._id,
      note: note ?? row.note,
      updatedAt: now,
    });

    await logAudit(ctx, {
      actorId: admin._id,
      action: "payout.decline",
      targetType: "payout",
      targetId: row._id,
      details: {
        amountKobo: row.amountKobo,
        instructorId: row.instructorId,
        note: note ?? null,
      },
    });

    await createNotification(ctx, {
      userId: row.instructorId,
      type: "payout_declined",
      title: "Payout request declined",
      body:
        note ??
        "A payout request was declined. Contact support if you have questions.",
      href: "/dashboard/instructor/payouts",
    });

    return { success: true };
  },
});

/**
 * Record a payout that was arranged outside the request queue.
 *
 * An instructor need not have pressed anything for money to have moved — an
 * admin may simply have sent it — so the ledger must be writable directly. The
 * row lands already `paid`, indistinguishable from a fulfilled request except
 * that it was never `requested`.
 */
export const recordPayout = mutation({
  args: {
    instructorId: v.id("users"),
    amountKobo: v.number(),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const instructor = await ctx.db.get(args.instructorId);
    if (!instructor) throw new Error("Instructor not found");
    if (!isStaff(instructor)) {
      throw new Error("Payouts can only be recorded for instructors and admins");
    }

    if (
      !Number.isFinite(args.amountKobo) ||
      !Number.isInteger(args.amountKobo) ||
      args.amountKobo <= 0
    ) {
      throw new Error("Amount must be a positive whole number of kobo");
    }

    const reference = cleanOptional(args.reference, 200, "Reference");
    const note = cleanOptional(args.note, 500, "Note");

    const now = Date.now();
    const payoutId = await ctx.db.insert("payouts", {
      instructorId: args.instructorId,
      amountKobo: args.amountKobo,
      status: "paid",
      currency: CURRENCY,
      note,
      reference,
      requestedAt: now,
      resolvedAt: now,
      recordedBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(ctx, {
      actorId: admin._id,
      action: "payout.record",
      targetType: "payout",
      targetId: payoutId,
      details: {
        amountKobo: args.amountKobo,
        instructorId: args.instructorId,
        reference: reference ?? null,
      },
    });

    await createNotification(ctx, {
      userId: args.instructorId,
      type: "payout_paid",
      title: "Payout sent",
      body: `${formatNaira(args.amountKobo)} is on its way to your payout account.`,
      href: "/dashboard/instructor/payouts",
    });

    return { payoutId };
  },
});

// ─── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Notify every admin, in-app.
 *
 * Reads the `by_role` index rather than the whole `users` table, and skips the
 * actor (an admin who requests their own payout should not be told about it) and
 * suspended accounts (`helpers/auth` already treats those as signed out).
 *
 * In-app only: the actionable copy is the support email the caller also
 * schedules, and supporting both channels here would mean maintaining a second
 * template for the same event.
 */
async function notifyAdmins(
  ctx: GenericMutationCtx<DataModel>,
  args: {
    title: string;
    body: string;
    href: string;
    actorId: Id<"users">;
  },
): Promise<void> {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();

  for (const admin of admins) {
    if (admin._id === args.actorId) continue;
    if (admin.suspendedAt !== undefined) continue;
    await createNotification(ctx, {
      userId: admin._id,
      type: "payout_requested",
      title: args.title,
      body: args.body,
      href: args.href,
      actorId: args.actorId,
    });
  }
}

/** Trim a free-text field and enforce a ceiling. Returns undefined when blank. */
function cleanOptional(
  value: string | undefined,
  max: number,
  label: string,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    throw new Error(`${label} must be ${max} characters or less`);
  }
  return trimmed;
}
