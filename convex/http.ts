import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

type ClerkUserEvent = {
  type: "user.created" | "user.updated" | "user.deleted" | string;
  data: {
    id: string;
    // user.deleted carries only an id; the rest are absent.
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: Array<{ id: string; email_address: string }>;
  };
};

/** Primary email address of a Clerk user, falling back to the first on file. */
function primaryEmailOf(
  data: ClerkUserEvent["data"]
): string | undefined {
  const addresses = data.email_addresses ?? [];
  return (
    addresses.find((e) => e.id === data.primary_email_address_id)?.email_address ??
    addresses[0]?.email_address
  );
}

/**
 * Constant-time comparison of two hex digests.
 *
 * This endpoint is reachable without authentication, so a `!==` on the
 * signature leaks the expected MAC one byte at a time via response timing —
 * enough to forge a `charge.success` payload and mark any reference paid.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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

    if (!timingSafeEqualHex(computed, signature)) {
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

// Clerk webhook: POST /webhook/clerk
// Signature headers are svix-id / svix-timestamp / svix-signature, signed with
// the endpoint's CLERK_WEBHOOK_SECRET. Keeps users in sync for every sign-in
// method (Google OAuth included), since JWT claims may not carry profile data.
http.route({
  path: "/webhook/clerk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Webhook not configured", { status: 500 });
    }

    const rawBody = await request.text();
    const svixHeaders = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };

    // verify() throws on a bad signature and returns nothing on success, so
    // the body is parsed only after verification passes.
    try {
      new Webhook(secret).verify(rawBody, svixHeaders);
    } catch {
      return new Response("Invalid signature", { status: 401 });
    }

    let event: ClerkUserEvent;
    try {
      event = JSON.parse(rawBody) as ClerkUserEvent;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (
      event.type === "user.created" ||
      event.type === "user.updated" ||
      event.type === "email_address.created" ||
      event.type === "email_address.updated"
    ) {
      // An email change arrives as its own event, so all four funnel into the
      // same idempotent upsert. Fields absent from an event are left
      // undefined and the mutation skips them rather than clearing them.
      const { id, first_name, last_name, image_url } = event.data;
      const name = [first_name, last_name].filter(Boolean).join(" ").trim();

      await ctx.runMutation(internal.users.upsertFromClerk, {
        clerkId: id,
        email: primaryEmailOf(event.data),
        name: name || undefined,
        imageUrl: image_url || undefined,
      });
    } else if (event.type === "user.deleted") {
      // user.deleted carries only an id. Enrollments, purchases and attempts
      // are left intact so financial history stays auditable.
      await ctx.runMutation(internal.users.deleteFromClerk, {
        clerkId: event.data.id,
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
