/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker — media CDN for the B2 video pipeline.
 *
 * The bucket (`glypha-media`) is private. This Worker is the only reader of
 * the read-only key: it signs its own `GET`s with aws4fetch and streams the
 * object back. Browsers never see a B2 host, a signature or a credential.
 *
 * Contract (see `docs/video-pipeline.md` and `README.md`):
 *   · GET and OPTIONS only; anything else is 405.
 *   · Strict path allowlist (`policy.ts`); query strings are rejected.
 *   · Cache key is the bare URL — responses are identical for every viewer,
 *     so auth never participates in the key.
 *   · `Range` is ignored and the full object is served `200`, because a cache
 *     key cannot carry `Range` and `cache.put` cannot store a `206`.
 *   · CORS only for `ALLOWED_ORIGINS`, with `Vary: Origin`.
 *   · No client request header is forwarded upstream; no secret is logged.
 */

import { AwsClient } from "aws4fetch";
import {
  corsHeaders,
  isAllowedMediaPath,
  isAllowedMediaMethod,
  mediaCacheControl,
  mediaContentType,
  parseAllowedOrigins,
  type CorsHeaders,
} from "./policy";

export interface Env {
  /** S3-compatible endpoint, e.g. `https://s3.us-west-004.backblazeb2.com`. */
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_BUCKET: string;
  /** Read-only key, scoped to `glypha-media`. Secrets, never `[vars]`. */
  B2_ACCESS_KEY_ID: string;
  B2_ACCESS_KEY: string;
  /** Comma-separated bare origins allowed to read media cross-origin. */
  ALLOWED_ORIGINS: string;
}

const REQUIRED_BINDINGS: readonly (keyof Env)[] = [
  "B2_ENDPOINT",
  "B2_REGION",
  "B2_BUCKET",
  "B2_ACCESS_KEY_ID",
  "B2_ACCESS_KEY",
];

/** One signer per credential set per isolate — rebuilding it per request is waste. */
let signerCache:
  | { keyId: string; region: string; endpoint: string; client: AwsClient }
  | undefined;

function signerFor(env: Env): AwsClient {
  if (
    !signerCache ||
    signerCache.keyId !== env.B2_ACCESS_KEY_ID ||
    signerCache.region !== env.B2_REGION ||
    signerCache.endpoint !== env.B2_ENDPOINT
  ) {
    signerCache = {
      keyId: env.B2_ACCESS_KEY_ID,
      region: env.B2_REGION,
      endpoint: env.B2_ENDPOINT,
      client: new AwsClient({
        accessKeyId: env.B2_ACCESS_KEY_ID,
        secretAccessKey: env.B2_ACCESS_KEY,
        service: "s3",
        region: env.B2_REGION,
      }),
    };
  }
  return signerCache.client;
}

/** Build the response headers: object headers + per-origin CORS + `Vary`. */
function respond(body: BodyInit | null, status: number, headers: Headers, cors: CorsHeaders | null) {
  const out = new Headers(headers);
  if (cors) {
    for (const [name, value] of Object.entries(cors)) out.set(name, value);
  }
  out.set("vary", "Origin");
  return new Response(body, { status, headers: out });
}

function errorResponse(message: string, status: number, cors: CorsHeaders | null): Response {
  return respond(message, status, new Headers({ "content-type": "text/plain; charset=utf-8" }), cors);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS ?? "");
    const cors = corsHeaders(request.headers.get("origin"), allowedOrigins);

    if (request.method === "OPTIONS") {
      if (!cors) return errorResponse("Forbidden", 403, null);
      return respond(null, 204, new Headers(), cors);
    }

    if (!isAllowedMediaMethod(request.method)) {
      return respond(
        "Method Not Allowed",
        405,
        new Headers({ allow: "GET, OPTIONS", "content-type": "text/plain; charset=utf-8" }),
        cors,
      );
    }

    // A query string cannot be part of a media path, and ignoring it would let
    // one cache entry answer many URLs. Reject rather than normalise.
    if (url.search.length > 0) return errorResponse("Not Found", 404, cors);
    if (!isAllowedMediaPath(url.pathname)) return errorResponse("Not Found", 404, cors);

    const missing = REQUIRED_BINDINGS.find((name) => (env[name] ?? "").length === 0);
    if (missing) {
      // Name only — the value may be a secret.
      console.error(`cdn worker: missing binding ${missing}`);
      return errorResponse("Media service unavailable", 500, cors);
    }

    const cache = caches.default;
    const cacheRequest = new Request(`${url.origin}${url.pathname}`, { method: "GET" });

    const cached = await cache.match(cacheRequest);
    if (cached) return respond(cached.body, 200, cached.headers, cors);

    const endpoint = env.B2_ENDPOINT.replace(/\/+$/, "");
    const key = url.pathname
      .replace(/^\/+/, "")
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const objectUrl = `${endpoint}/${encodeURIComponent(env.B2_BUCKET)}/${key}`;

    let upstream: Response;
    try {
      // Only our own signed request goes upstream: no client header (cookies,
      // Range, conditional headers) is copied into it.
      const signed = await signerFor(env).sign(objectUrl, { method: "GET" });
      upstream = await fetch(signed);
    } catch {
      console.error("cdn worker: upstream request failed");
      return errorResponse("Media service unavailable", 502, cors);
    }

    if (!upstream.ok) {
      // B2 reports a missing key as 404; auth mistakes and 5xx are ours, not
      // the viewer's, so they must not leak as 404 (that would look like a
      // deleted video) or as an upstream body.
      console.error(`cdn worker: upstream status ${upstream.status}`);
      return errorResponse(
        upstream.status === 404 ? "Not Found" : "Media service unavailable",
        upstream.status === 404 ? 404 : 502,
        cors,
      );
    }

    const objectHeaders = new Headers({
      "content-type": mediaContentType(url.pathname),
      "cache-control": mediaCacheControl(),
    });

    // Store without CORS headers: the cache serves every origin, so a stored
    // `access-control-allow-origin` would leak one viewer's grant to another.
    const stored = new Response(upstream.body, { status: 200, headers: objectHeaders });
    ctx.waitUntil(cache.put(cacheRequest, stored.clone()));

    return respond(stored.body, 200, objectHeaders, cors);
  },
} satisfies ExportedHandler<Env>;
