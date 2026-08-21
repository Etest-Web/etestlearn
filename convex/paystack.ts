"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

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

// ─── Ask Paystack for a hosted checkout URL (secret key stays server-side) ──
export const initializeCheckout = action({
  args: { reference: v.string() },
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

    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: purchase.email,
        amount: purchase.amount,
        currency: purchase.currency,
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

    const res = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(args.reference)}`,
      { headers: { Authorization: `Bearer ${secretKey()}` } },
    );
    const json = await res.json();

    if (!json.status || !json.data) {
      throw new Error(json.message ?? "Verification failed");
    }

    // Verify amount + currency match what we recorded — never trust the
    // client-side redirect alone.
    if (
      json.data.status === "success" &&
      json.data.amount >= purchase.amount &&
      json.data.currency === purchase.currency
    ) {
      await ctx.runMutation(internal.payments.markPurchasePaid, {
        reference: args.reference,
      });
      return { paid: true };
    }

    return { paid: false, status: json.data.status as string };
  },
});
