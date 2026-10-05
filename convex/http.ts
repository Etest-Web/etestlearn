import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";
import { decodePlaybackToken, verifyPlaybackToken } from "../lib/video-playback-token";
import { decorateMasterPlaylist, decorateMediaPlaylist } from "../lib/video-playlists";

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

/**
 * Hard cap on webhook request bodies (256 KB).
 *
 * A real Paystack charge event is under 1 KB and a Clerk user event a few KB,
 * so anything past this is either a misconfiguration or an attempt to make an
 * unauthenticated endpoint buffer (and then parse) megabytes. The cap is
 * enforced twice — see `readBodyWithinLimit` — because Content-Length alone is
 * client-controlled: it may be absent (chunked bodies have none) or simply
 * lie about the real size.
 */
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

/**
 * CORS is deliberately absent from both webhook routes — do not "fix" that.
 *
 * These are server-to-server endpoints. Paystack and Clerk/svix sign their
 * POSTs and deliver them from their own backends; CORS is a browser-only
 * mechanism and never applies to those deliveries. Adding
 * `Access-Control-Allow-Origin: *` would grant the real callers nothing while
 * advertising to every browser on the internet that it may read responses
 * from this endpoint. Signature verification is the authentication here, and
 * without CORS headers a browser can never read a response either way.
 *
 * As a cheap early filter, requests that DO carry a browser `Origin` header
 * are refused outright: no supported webhook provider sends one (their docs
 * prescribe signature validation and IP allow-listing, not browser calls), so
 * its presence means the request was driven by browser code — a probe, a CSRF
 * attempt, or someone "testing" the URL from a page. Such callers cannot
 * forge a signature anyway; this only turns them away sooner and without
 * buffering their body. If a provider ever starts sending Origin and events
 * stop landing, this check is the first thing to revisit — the signature
 * verification behind it stays regardless.
 */
function refuseBrowserOrigin(request: Request): Response | null {
  if (request.headers.get("origin") !== null) {
    return new Response("Unexpected origin", { status: 403 });
  }
  return null;
}

/**
 * Reads the request body, returning either the bytes or the response to send.
 *
 * The declared Content-Length is checked first so an honestly-labelled
 * oversized body is refused before it is buffered at all; the actual byte
 * count is checked after reading, so a header that lies (smaller than the
 * body) or is missing entirely cannot carry a larger payload past the cap.
 * Returns the raw bytes rather than text because both signatures are
 * computed over the exact bytes on the wire.
 */
async function readBodyWithinLimit(
  request: Request,
): Promise<ArrayBuffer | Response> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number.parseInt(declared, 10);
    if (Number.isFinite(size) && size > MAX_WEBHOOK_BODY_BYTES) {
      return new Response("Payload Too Large", { status: 413 });
    }
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_WEBHOOK_BODY_BYTES) {
    return new Response("Payload Too Large", { status: 413 });
  }
  return bytes;
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

    const refused = refuseBrowserOrigin(request);
    if (refused) return refused;

    // Size cap before signature work: no point HMAC-ing a body we would refuse.
    const bytes = await readBodyWithinLimit(request);
    if (bytes instanceof Response) return bytes;

    const signature = request.headers.get("x-paystack-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }

    // Compute HMAC-SHA512 with Web Crypto, over the bytes exactly as received —
    // that is precisely what Paystack signs, while re-encoding through a JS
    // string first would change the digest for any non-ASCII character.
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, bytes);
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (!timingSafeEqualHex(computed, signature)) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Verification (401) and the size cap (413) are done, so the payload is
    // authenticated before it is decoded or parsed — an unauthenticated
    // caller never reaches the JSON parser.
    const rawBody = new TextDecoder().decode(bytes);
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

    const refused = refuseBrowserOrigin(request);
    if (refused) return refused;

    const bytes = await readBodyWithinLimit(request);
    if (bytes instanceof Response) return bytes;

    const rawBody = new TextDecoder().decode(bytes);
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

/**
 * Self-hosted video playback: GET /video/:assetId/<file>?t=<token>
 *
 * Unlike the webhooks above, these ARE browser-facing: hls.js fetches the
 * manifest, key and segments cross-origin from the Convex site URL. Three
 * consequences are deliberate:
 *
 * 1. Authentication is the signed `t` token (HMAC, expiry, asset+user
 *    binding), verified before anything is read — there is no cookie or JWT
 *    on these requests. Enrollment is re-checked server-side per request, so
 *    revoking access takes effect immediately even with a live token.
 * 2. CORS allows exactly one origin, `APP_ORIGIN` (fail closed). No wildcard:
 *    the token travels in the URL and must not be readable from any page.
 *    Only simple GETs are used, so no preflight handling is needed.
 * 3. Nothing is cacheable (`no-store` everywhere) and storage URLs are never
 *    exposed — every byte flows through this gate.
 */
http.route({
  pathPrefix: "/video/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const appOrigin = process.env.APP_ORIGIN;
    if (!appOrigin) {
      return new Response("Playback not configured", { status: 500 });
    }
    const cors = { "Access-Control-Allow-Origin": appOrigin, "Vary": "Origin" };

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const parts = url.pathname.replace(/^\/video\//, "").split("/").filter(Boolean);
    const [assetId, file, extra] = parts;
    const token = url.searchParams.get("t");
    if (!assetId || !file || !token) {
      return new Response("Not found", { status: 404, headers: cors });
    }

    // Decode first to learn the claimed user, then verify against the URL.
    let claimed: { a: string; u: string };
    try {
      claimed = decodePlaybackToken(token);
    } catch {
      return new Response("Forbidden", { status: 403, headers: cors });
    }
    if (claimed.a !== assetId) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }
    try {
      await verifyPlaybackToken(token, { assetId, userId: claimed.u });
      const ok = await ctx.runQuery(internal.videoAssets.checkPlaybackAccess, {
        assetId: assetId as never,
        userId: claimed.u as never,
      });
      if (!ok) return new Response("Forbidden", { status: 403, headers: cors });
    } catch {
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    const asset = await ctx.runQuery(internal.videoAssets.getAssetForWorker, {
      assetId: assetId as never,
    });
    if (!asset || asset.status !== "ready") {
      return new Response("Not found", { status: 404, headers: cors });
    }

    const noStore = { ...cors, "Cache-Control": "no-store" };
    const tokenParam = `t=${token}`;

    if (file === "master.m3u8") {
      if (!asset.masterManifestStorageId) return new Response("Not found", { status: 404, headers: cors });
      const blob = await ctx.storage.get(asset.masterManifestStorageId);
      if (!blob) return new Response("Not found", { status: 404, headers: cors });
      const body = decorateMasterPlaylist(await blob.text(), tokenParam);
      return new Response(body, {
        headers: { ...noStore, "Content-Type": "application/x-mpegURL" },
      });
    }

    const variantMatch = /^v(\d+)\.m3u8$/.exec(file);
    if (variantMatch) {
      const i = Number(variantMatch[1]);
      const manifestId = asset.variantManifestStorageIds?.[i];
      if (manifestId === undefined || !asset.ivHex) {
        return new Response("Not found", { status: 404, headers: cors });
      }
      const blob = await ctx.storage.get(manifestId);
      if (!blob) return new Response("Not found", { status: 404, headers: cors });
      // Segment names resolve relative to /video/:id/, so they are prefixed
      // with `seg/` BEFORE decoration appends the token query.
      const stored = (await blob.text())
        .split("\n")
        .map((line) => (line.trim().endsWith(".ts") ? `seg/${line.trim()}` : line))
        .join("\n");
      const body = decorateMediaPlaylist(stored, {
        keyUri: `key?${tokenParam}`,
        ivHex: asset.ivHex,
        tokenParam,
      });
      return new Response(body, {
        headers: { ...noStore, "Content-Type": "application/x-mpegURL" },
      });
    }

    if (file === "key") {
      if (!asset.keyStorageId) return new Response("Not found", { status: 404, headers: cors });
      const blob = await ctx.storage.get(asset.keyStorageId);
      if (!blob) return new Response("Not found", { status: 404, headers: cors });
      return new Response(blob, {
        headers: { ...noStore, "Content-Type": "application/octet-stream" },
      });
    }

    if (file === "seg" && extra) {
      const seg = (asset.segments ?? []).find((s) => s.name === extra);
      if (!seg) return new Response("Not found", { status: 404, headers: cors });
      const blob = await ctx.storage.get(seg.storageId);
      if (!blob) return new Response("Not found", { status: 404, headers: cors });
      return new Response(blob, {
        headers: { ...noStore, "Content-Type": "video/mp2t" },
      });
    }

    return new Response("Not found", { status: 404, headers: cors });
  }),
});

export default http;
