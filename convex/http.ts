import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Paystack webhook: POST /webhook/paystack
// Signature = HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY), hex-encoded,
// delivered in the x-paystack-signature header.
http.route({
  path: "/webhook/paystack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return new Response("Webhook not configured", { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }

    // Compute HMAC-SHA512 with Web Crypto.
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== signature) {
      return new Response("Invalid signature", { status: 401 });
    }

    let event: { event?: string; data?: { reference?: string } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (event.event === "charge.success" && event.data?.reference) {
      // markPurchasePaid is idempotent, so duplicate deliveries are safe.
      await ctx.runMutation(internal.payments.markPurchasePaid, {
        reference: event.data.reference,
      });
    }

    // Always 200 so Paystack doesn't retry forever on unrelated events.
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
