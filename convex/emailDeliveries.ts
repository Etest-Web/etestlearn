import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/auth";

/**
 * The send ledger. Every lifecycle email claims a `dedupeKey` here before it
 * touches the network.
 *
 * The problem this solves: Convex retries a failed action, and a scheduled
 * drip can be scheduled twice by a retried mutation. Neither knows whether mail
 * already went out. Claiming first, inside a mutation, makes the question
 * answerable: mutations are serializable, so check-then-insert is atomic and
 * exactly one caller ever holds a fresh claim.
 */

/**
 * How long a `claimed` row is honoured before another attempt may take it.
 *
 * A claim that has not moved for ten minutes means the action died mid-flight
 * (deploy, timeout, crash). Reclaiming it risks a duplicate if the original
 * actually did send, but not retrying loses the mail forever, and a lost
 * reminder is the cheaper failure. Bounded because an unbounded window would
 * wedge the key permanently if a claim were ever orphaned.
 */
const CLAIM_TTL_MS = 10 * 60 * 1000;

export type ClaimResult =
  | { claimed: true }
  | { claimed: false; reason: string };

/**
 * Take the ticket for a send, or explain why this caller should not proceed.
 *
 * `dataJson` is stored on the claim so a send that later fails can be inspected
 * or re-run without the caller having to reconstruct it.
 */
export const claim = internalMutation({
  args: {
    dedupeKey: v.string(),
    templateId: v.string(),
    group: v.string(),
    category: v.union(
      v.literal("transactional"),
      v.literal("nudge"),
      v.literal("broadcast"),
    ),
    recipient: v.string(),
    userId: v.optional(v.id("users")),
    dataJson: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ClaimResult> => {
    const now = Date.now();

    const existing = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();

    if (existing) {
      if (existing.status === "sent") {
        return { claimed: false, reason: "already sent" };
      }
      if (existing.status === "skipped") {
        // A skip is a decision, not a gap. A drip step whose condition was not
        // met must not re-fire because the learner opened a dashboard.
        return { claimed: false, reason: existing.reason ?? "previously skipped" };
      }
      if (existing.status === "claimed" && now - existing.claimedAt < CLAIM_TTL_MS) {
        // Another attempt is still in flight. Two concurrent actions on the same
        // key must produce one email.
        return { claimed: false, reason: "send already in flight" };
      }
      // Either a failed attempt worth retrying, or a claim abandoned past the
      // TTL. Both re-claim.
      await ctx.db.patch(existing._id, {
        status: "claimed",
        claimedAt: now,
        recipient: args.recipient,
        error: undefined,
      });
      return { claimed: true };
    }

    await ctx.db.insert("emailDeliveries", {
      dedupeKey: args.dedupeKey,
      templateId: args.templateId,
      group: args.group,
      category: args.category,
      status: "claimed",
      recipient: args.recipient,
      userId: args.userId,
      dataJson: args.dataJson,
      claimedAt: now,
    });

    return { claimed: true };
  },
});

/** Record a terminal outcome. Failures are recorded, not thrown, so the row is the record. */
export const complete = internalMutation({
  args: {
    dedupeKey: v.string(),
    outcome: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    providerMessageId: v.optional(v.string()),
    reason: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();

    if (!existing) return;

    await ctx.db.patch(existing._id, {
      status: args.outcome,
      sentAt: args.outcome === "sent" ? Date.now() : existing.sentAt,
      providerMessageId: args.providerMessageId ?? existing.providerMessageId,
      reason: args.reason ?? existing.reason,
      error: args.error ?? existing.error,
    });
  },
});

/** Reads a single delivery by its key, for tests and support tooling. */
export const getByDedupeKey = internalQuery({
  args: { dedupeKey: v.string() },
  handler: async (ctx, args): Promise<Doc<"emailDeliveries"> | null> => {
    return await ctx.db
      .query("emailDeliveries")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();
  },
});

/**
 * Admin view of recent sends. Gated on `isStaff` rather than just `role`, so a
 * suspended admin cannot read it.
 */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // `requireAdmin` refuses suspended admins, which a bare role check would not.
    await requireAdmin(ctx);

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    return await ctx.db
      .query("emailDeliveries")
      .withIndex("by_status")
      .order("desc")
      .take(limit);
  },
});