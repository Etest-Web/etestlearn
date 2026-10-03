import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { consumeRateLimit } from "./helpers/rateLimit";

/**
 * Constant-time string compare. Verbatim copy of the helper in
 * convex/users.ts (`timingSafeEqualString`, used by syncFromClerk): a plain
 * `!==` on a shared secret leaks its contents through response timing, which
 * is enough to recover it byte by byte against a publicly reachable endpoint.
 */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Bounds the caller may request. Anything outside these ranges is a bug or an
// attempt to shape the bucket from the outside (e.g. windowMs = 0 to disable
// the window, or max = Number.MAX_SAFE_INTEGER to create an unbounded bucket),
// so it is rejected rather than clamped into something the caller did not ask
// for — silent clamping would hide the bug.
const MIN_MAX = 1;
const MAX_MAX = 100;
const MIN_WINDOW_MS = 1_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Durable rate-limit counter for server-side callers (the instructor-
 * application notify route).
 *
 * Why public and not internalMutation: `ConvexHttpClient` can only invoke
 * public functions, so any Next.js server code that needs a Convex mutation
 * must expose it — the same constraint that keeps `users.syncFromClerk`
 * public. That makes it reachable by anyone holding the deployment URL (it
 * ships in NEXT_PUBLIC_CONVEX_URL), so it carries the same bearer-token guard
 * as syncFromClerk: a shared secret compared in constant time, read inside
 * the handler so a module-scope capture cannot freeze it at import time.
 *
 * Without the guard this would be a DoS primitive: an attacker could burn
 * arbitrary buckets (`key` is caller-chosen) and lock other callers out, or
 * park one caller's key with max=1 and a 24h window.
 */
export const consume = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    max: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const secret = process.env.NOTIFY_RATE_LIMIT_TOKEN;

    if (!secret) {
      // Fail closed: an unset secret must never mean "no token required".
      // With it missing, every call throws and the calling route serves 503
      // (endpoint unavailable) instead of running unlimited.
      throw new Error("rate limiting is not configured");
    }

    // Same guarded constant-time pattern as users.syncFromClerk: the length
    // check short-circuits, then timingSafeEqualString compares every byte.
    if (
      args.token.length !== secret.length ||
      !timingSafeEqualString(args.token, secret)
    ) {
      throw new Error("Not authorized");
    }

    if (
      !Number.isInteger(args.max) ||
      args.max < MIN_MAX ||
      args.max > MAX_MAX
    ) {
      throw new Error(`max must be an integer between ${MIN_MAX} and ${MAX_MAX}`);
    }
    if (
      !Number.isFinite(args.windowMs) ||
      args.windowMs < MIN_WINDOW_MS ||
      args.windowMs > MAX_WINDOW_MS
    ) {
      throw new Error(
        `windowMs must be between ${MIN_WINDOW_MS} and ${MAX_WINDOW_MS}`,
      );
    }
    if (!args.key || args.key.length > 256) {
      // Keys become indexed rows; a caller-chosen key must stay bounded.
      throw new Error("key must be a non-empty string of at most 256 characters");
    }

    return await consumeRateLimit(ctx, args.key, args.max, args.windowMs);
  },
});
