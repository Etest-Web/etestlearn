import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

/**
 * Server-side client for the durable rate limiter in convex/rateLimit.ts.
 *
 * Kept in its own module (rather than inlined in the route) so it is a single
 * mockable seam: tests `vi.mock` this file and never touch the network.
 *
 * The function reference is built with `makeFunctionReference` instead of
 * `api.rateLimit.consume` because `convex/_generated/api` is produced by
 * `npx convex dev` and does not yet list the new module — the generated types
 * would not compile until codegen runs again. The wire name is the same one
 * codegen will emit ("modulePath:exportName").
 */
type ConsumeArgs = {
  token: string;
  key: string;
  max: number;
  windowMs: number;
};

type ConsumeResult = {
  allowed: boolean;
  retryAfterMs: number;
};

const consumeReference = makeFunctionReference<
  "mutation",
  ConsumeArgs,
  ConsumeResult
>("rateLimit:consume");

/**
 * Thrown when the durable limiter cannot be consulted at all: missing env
 * config or Convex unreachable. Deliberately a distinct class so callers can
 * tell "the limiter said no" (429) apart from "the limiter is down" (503) —
 * the route maps this to 503, because silently skipping the check would hand
 * an attacker a bypass for the cost of a network outage.
 */
export class DurableRateLimitUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DurableRateLimitUnavailableError";
  }
}

/**
 * Consume one unit from the durable bucket for `key`.
 *
 * Fails CLOSED: if the Convex URL or the shared token is missing this throws
 * instead of degrading to "allowed". An absent secret must never mean "no
 * limit", and a missing deployment URL is indistinguishable from a limiter
 * that cannot answer — both must stop the request, not let it through.
 */
export async function consumeDurableRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<ConsumeResult> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const token = process.env.NOTIFY_RATE_LIMIT_TOKEN;

  if (!url || !token) {
    throw new DurableRateLimitUnavailableError(
      "Durable rate limiter is not configured (NEXT_PUBLIC_CONVEX_URL / NOTIFY_RATE_LIMIT_TOKEN missing).",
    );
  }

  try {
    const client = new ConvexHttpClient(url);
    return await client.mutation(consumeReference, { token, key, max, windowMs });
  } catch (error) {
    // Network failure, rejected token, or a validation error from the
    // mutation — all of them mean we do not have a trustworthy answer, so
    // surface them as "unavailable" rather than a permissive default.
    throw new DurableRateLimitUnavailableError(
      "Durable rate limiter call failed.",
      { cause: error },
    );
  }
}
