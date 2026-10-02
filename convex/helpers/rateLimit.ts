import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type MutationCtx = GenericMutationCtx<DataModel>;

export interface RateLimitResult {
  allowed: boolean;
  /** How long until the current window resets. 0 when allowed. */
  retryAfterMs: number;
}

/**
 * Fixed-window rate limiter backed by the `rateLimits` table.
 *
 * Why a table and not an in-memory Map: Convex functions run across many
 * serverless instances, so a module-level counter resets on every cold start
 * and can be bypassed by forcing new instances. Persisting the bucket makes
 * the limit hold across instances and restarts.
 *
 * Why it only accepts a mutation context: reading is free but bumping the
 * counter is a write, and only mutations can write. Callers that need to
 * throttle a query should enforce the limit inside a mutation that precedes
 * the work (or move the work into a mutation).
 *
 * Concurrency: Convex mutations are serializable transactions, so two
 * simultaneous calls cannot both read `count = max - 1` and both increment
 * past the cap — the second transaction retries against the committed value.
 *
 * @param key       Bucket identity, e.g. `submitQuizAttempt:${user._id}`.
 *                  Always include the user (or IP) so one caller cannot
 *                  exhaust another caller's bucket.
 * @param max       Maximum number of calls allowed per window.
 * @param windowMs  Window length in milliseconds.
 */
export async function consumeRateLimit(
  ctx: MutationCtx,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();

  const bucket = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  // No bucket yet, or the window has elapsed: start a fresh window.
  if (!bucket || now >= bucket.resetAt) {
    if (bucket) {
      await ctx.db.patch(bucket._id, { count: 1, resetAt: now + windowMs });
    } else {
      await ctx.db.insert("rateLimits", {
        key,
        count: 1,
        resetAt: now + windowMs,
      });
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * {@link consumeRateLimit}, but throws when the bucket is exhausted.
 *
 * The error message deliberately tells the caller how long to wait — the
 * existing quiz and discussion limiters do the same, and hiding it only
 * produces clients that retry blindly.
 */
export async function requireRateLimit(
  ctx: MutationCtx,
  key: string,
  max: number,
  windowMs: number,
): Promise<void> {
  const result = await consumeRateLimit(ctx, key, max, windowMs);
  if (!result.allowed) {
    const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    throw new Error(
      `Too many requests — please wait ${seconds} seconds before trying again`,
    );
  }
}
