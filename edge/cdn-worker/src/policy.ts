/**
 * Pure policy for the Cloudflare media Worker.
 *
 * Kept free of `aws4fetch` and of Cloudflare runtime globals so the same rules
 * the Worker enforces in production are the ones the root test suite can call.
 * Anything that needs a binding, a cache or the network lives in `index.ts`.
 */

/**
 * The only paths the Worker will answer.
 *
 *   /hls/<assetId>/master.m3u8
 *   /hls/<assetId>/<variant>/index.m3u8
 *   /hls/<assetId>/<variant>/seg_<n>.ts
 *
 * The asset id is the Convex document id (alphanumeric, `-` and `_`), the
 * variant is one or two digits and the segment number at most six. Anchored,
 * character-class only — no dots or slashes inside a segment, so traversal
 * (`..`, `%2e%2e`) cannot match. Query strings are rejected by `index.ts`
 * separately, because `URL.pathname` never contains them.
 */
export const ALLOWED_MEDIA_PATH =
  /^\/hls\/[A-Za-z0-9_-]{1,64}\/(?:master\.m3u8|[0-9]{1,2}\/(?:index\.m3u8|seg_[0-9]{1,6}\.ts))$/;

/**
 * Slide images, stored in the separate slides bucket and never transcoded:
 *
 *   /slides/<courseId>/<lessonId>/<uuid>.<ext>
 *
 * Both ids are Convex ids (alphanumeric and `_`), the uuid is a v4 hex string
 * and the extension is one of the four the presign action accepts. Anchored,
 * character-class only — no dots or slashes inside an id segment, so traversal
 * cannot match. This is the second half of the same strict allowlist.
 */
export const ALLOWED_SLIDE_IMAGE_PATH =
  /^\/slides\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp|gif)$/;

export function isSlideImagePath(pathname: string): boolean {
  return ALLOWED_SLIDE_IMAGE_PATH.test(pathname);
}

export function isAllowedMediaPath(pathname: string): boolean {
  return ALLOWED_MEDIA_PATH.test(pathname) || isSlideImagePath(pathname);
}

/** The Worker is read-only; OPTIONS exists only for CORS preflight. */
export function isAllowedMediaMethod(method: string): boolean {
  return method === "GET" || method === "OPTIONS";
}

/**
 * Parse `ALLOWED_ORIGINS` (comma-separated). Bare origins only — a trailing
 * slash or a path is a configuration mistake that would silently never match
 * an `Origin` header, so those entries are dropped rather than "repaired".
 * An empty list grants no CORS at all, which is the safe default.
 */
export function parseAllowedOrigins(raw: string): string[] {
  const seen = new Set<string>();
  for (const entry of raw.split(",")) {
    const candidate = entry.trim();
    if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(candidate)) continue;
    seen.add(candidate);
  }
  return [...seen];
}

export type CorsHeaders = {
  "access-control-allow-origin": string;
  "access-control-allow-methods": string;
  "access-control-allow-headers": string;
  "access-control-expose-headers": string;
  "access-control-max-age": string;
};

/**
 * CORS is per-origin, never `*`, and only for an origin the deployer listed.
 * Returns `null` when the request has no `Origin` (same-origin fetch, curl) or
 * the origin is not allowed — the caller then serves the object without CORS
 * headers and the browser refuses to expose it.
 */
export function corsHeaders(
  origin: string | null,
  allowedOrigins: readonly string[],
): CorsHeaders | null {
  if (!origin || !allowedOrigins.includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-expose-headers": "content-length, content-type",
    "access-control-max-age": "86400",
  };
}

/**
 * Immutable: a path's bytes never change. A re-run that replaced them would
 * mint a new AES key while the edge cache still held old ciphertext — which is
 * exactly why completed videos are never re-transcoded (see
 * `docs/video-pipeline.md`). Changing content means a new asset id.
 */
export function mediaCacheControl(): string {
  return "public, max-age=31536000, immutable";
}

export function mediaContentType(pathname: string): string {
  if (pathname.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (pathname.endsWith(".ts")) return "video/mp2t";
  switch (pathname.split(".").pop()?.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
