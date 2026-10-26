"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { makeFunctionReference } from "convex/server";

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not set. Add it with: npx convex env set PAYSTACK_SECRET_KEY sk_test_...",
    );
  }
  return key;
}

/** Wire reference to the public rateLimit:consume mutation. */
const consumeRateLimitRef = makeFunctionReference<
  "mutation",
  {
    token: string;
    key: string;
    max: number;
    windowMs: number;
  },
  { allowed: boolean; retryAfterMs: number }
>("rateLimit:consume");

/**
 * Enforces a rate limit from inside a `"use node"` action.
 *
 * `consumeRateLimit` *returns* `{ allowed, retryAfterMs }` — it never throws;
 * only `requireRateLimit` throws, and that one needs a mutation ctx, which an
 * action does not have. Awaiting the consume call and dropping its result
 * bumps the bucket and enforces nothing, which is exactly what both call
 * sites below used to do (they read as rate-limited and were not).
 */
async function enforceRateLimit(
  ctx: ActionCtx,
  args: { key: string; max: number; windowMs: number },
): Promise<void> {
  const { allowed, retryAfterMs } = await ctx.runMutation(consumeRateLimitRef, {
    token: process.env.NOTIFY_RATE_LIMIT_TOKEN ?? "",
    key: args.key,
    max: args.max,
    windowMs: args.windowMs,
  });
  if (!allowed) {
    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    throw new Error(
      `Too many requests — please wait ${seconds} seconds before trying again`,
    );
  }
}

// ─── Ask Paystack for a hosted checkout URL (secret key stays server-side) ──
export const initializeCheckout = action({
  args: {
    reference: v.string(),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ authorizationUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const purchase = await ctx.runQuery(internal.payments.getPurchaseByRef, {
      reference: args.reference,
    });
    if (!purchase) throw new Error("Purchase not found");

    // Only the buyer may initialize this checkout.
    if (purchase.clerkId !== identity.subject) {
      throw new Error("Not authorized for this purchase");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not set (e.g. http://localhost:3000)",
      );
    }
    const callbackUrl = `${appUrl}/courses/paid/${args.reference}`;

    // Rate limit checkout initialization: 5 per hour per user to prevent API abuse
    await enforceRateLimit(ctx, {
      key: `paystackCheckoutInit:${identity.subject}`,
      max: 5,
      windowMs: 60 * 60 * 1000,
    });

    // --- Multi-currency Calculation ---
    let finalAmount = purchase.amount;
    let finalCurrency = purchase.currency;

    // A currency code is caller-supplied and ends up as a key into the rate
    // table and as a field on the Paystack request, so it is normalised and
    // shape-checked before either (M-2's input half). Anything that is not
    // three ASCII letters is refused outright rather than quietly falling back
    // to the base currency — a buyer who asked for a price in one currency
    // must not be charged in another without knowing.
    const requested = args.currency?.trim().toUpperCase();
    if (requested !== undefined && requested !== "" && !/^[A-Z]{3}$/.test(requested)) {
      throw new Error(`Unsupported currency: ${JSON.stringify(args.currency)}`);
    }

    if (requested && requested !== purchase.currency) {
      try {
        // Use the same exchange rate logic as the client.
        // Since we are in a "use node" action, we can fetch the rates.
        const res = await fetch(`https://open.er-api.com/v6/latest/${purchase.currency}`);
        const data = await res.json();

        if (data.result === 'success') {
          const rate = data.rates?.[requested];
          // A rate is only usable if it is a real positive number: `0`, a
          // negative or a NaN would price the course at nothing, and the old
          // `if (rate)` accepted all three.
          if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
            // purchase.amount is in base currency cents (e.g. kobo)
            // Convert base cents to target units, then to target cents
            const baseUnits = purchase.amount / 100;
            const targetUnits = baseUnits * rate;
            const converted = Math.round(targetUnits * 100);
            if (Number.isFinite(converted) && converted > 0) {
              finalAmount = converted;
              finalCurrency = requested;
            }
          }
        }
      } catch (e) {
        console.error("Exchange rate error during checkout:", e);
        // Fallback to base currency if conversion fails
      }
    }

    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: purchase.email,
        amount: finalAmount,
        currency: finalCurrency,
        reference: args.reference,
        metadata: { userId: purchase.userId, courseId: purchase.courseId },
        callback_url: callbackUrl,
      }),
    });

    const json = await res.json();
    if (!json.status || !json.data?.authorization_url) {
      throw new Error(
        json.message ?? "Failed to initialize Paystack transaction",
      );
    }

    // Record what we just asked Paystack to charge, so both verification paths
    // (webhook and redirect) have a server-side figure to check the eventual
    // charge against. For a converted checkout these are NOT `amount`/
    // `currency`, which is exactly why they exist (M-2). Written after the
    // initialize succeeded and before the buyer can reach Paystack, so the
    // intent is always on file before any charge can come back.
    await ctx.runMutation(internal.payments.recordCheckoutIntent, {
      reference: args.reference,
      checkoutAmount: finalAmount,
      checkoutCurrency: finalCurrency,
    });

    return { authorizationUrl: json.data.authorization_url as string };
  },
});

// ─── Fallback verification for the callback page (webhooks can't reach localhost) ─
export const verifyAndCompletePurchase = action({
  args: { reference: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ paid: boolean; status?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const purchase = await ctx.runQuery(internal.payments.getPurchaseByRef, {
      reference: args.reference,
    });
    if (!purchase) throw new Error("Purchase not found");
    if (purchase.clerkId !== identity.subject) {
      throw new Error("Not authorized for this purchase");
    }
    if (purchase.status === "paid") return { paid: true };

    // Rate limit Paystack transaction verification: 5 per hour per user
    await enforceRateLimit(ctx, {
      key: `paystackVerify:${identity.subject}`,
      max: 5,
      windowMs: 60 * 60 * 1000,
    });

    const res = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(args.reference)}`,
      { headers: { Authorization: `Bearer ${secretKey()}` } },
    );
    const json = await res.json();

    if (!json.status || !json.data) {
      throw new Error(json.message ?? "Verification failed");
    }

    // Verify amount + currency match the checkout intent — never trust the
    // client-side redirect alone.
    //
    // The comparison is against `checkoutAmount`/`checkoutCurrency` (what we
    // actually asked Paystack to charge) rather than `amount`/`currency`,
    // because on a converted checkout the two differ and the old comparison
    // could never succeed — a buyer who picked USD was charged, then shown
    // "payment failed" forever. `markPurchasePaid` re-checks the same figures
    // before it settles, so passing them here is belt and braces rather than
    // the only line of defence (M-2).
    const expectedAmount = purchase.checkoutAmount ?? purchase.amount;
    const expectedCurrency = purchase.checkoutCurrency ?? purchase.currency;
    const chargedAmount =
      typeof json.data.amount === "number" ? json.data.amount : Number.NaN;

    if (
      json.data.status === "success" &&
      Number.isFinite(chargedAmount) &&
      Math.round(chargedAmount) === Math.round(expectedAmount) &&
      json.data.currency === expectedCurrency
    ) {
      await ctx.runMutation(internal.payments.markPurchasePaid, {
        reference: args.reference,
        amount: chargedAmount,
        currency: typeof json.data.currency === "string" ? json.data.currency : undefined,
      });
      return { paid: true };
    }

    return { paid: false, status: json.data.status as string };
  },
});