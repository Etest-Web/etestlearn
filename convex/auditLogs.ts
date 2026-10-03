/**
 * Admin-only reader for the `auditLogs` table.
 *
 * The table itself is append-only (see `convex/helpers/audit.ts`); this
 * module deliberately exposes no writes — rows are only ever created inside
 * the privileged mutations that perform the audited action, so nobody can
 * forge a trail from outside.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./helpers/auth";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Newest-first audit trail, optionally filtered to one dotted action name.
 *
 * Admin only: the rows name who did what to whom, which is itself sensitive
 * (and a map of the privileged surface for anyone reconnoitring it).
 */
export const listAuditLogs = query({
  args: {
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") {
      throw new Error("Not authorized");
    }

    // Clamp rather than trust the caller: a limit of 1e9 would otherwise
    // turn a single query into a full-table scan and response dump.
    const requested = args.limit ?? DEFAULT_LIMIT;
    const limit = Math.max(
      1,
      Math.min(MAX_LIMIT, Math.floor(requested)),
    );

    // Both indexes end in the same field they are sorted by, so `order("desc")`
    // yields newest-first either way — for by_action that means reverse
    // insertion order within a single action name.
    const rows = args.action !== undefined
      ? await ctx.db
          .query("auditLogs")
          .withIndex("by_action", (q) => q.eq("action", args.action!))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("auditLogs")
          .withIndex("by_createdAt")
          .order("desc")
          .take(limit);

    return await Promise.all(
      rows.map(async (row) => {
        // The actor can be missing: `deleteFromClerk` removes user rows while
        // audit rows stay (append-only), so the id may dangle.
        const actor = await ctx.db.get(row.actorId);

        let details: unknown = null;
        if (row.details !== undefined) {
          try {
            details = JSON.parse(row.details);
          } catch {
            // A corrupt payload should not take the whole feed down.
            details = null;
          }
        }

        return {
          _id: row._id,
          action: row.action,
          targetType: row.targetType ?? null,
          targetId: row.targetId ?? null,
          details,
          createdAt: row.createdAt,
          actor: actor
            ? { name: actor.name ?? null, email: actor.email ?? null }
            : null,
        };
      }),
    );
  },
});
