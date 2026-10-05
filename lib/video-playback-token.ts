/**
 * Self-contained playback tokens, Web Crypto only.
 *
 * This module must stay free of `node:` imports: it runs in Convex V8
 * isolates (mutations + http actions), where Node builtins are unavailable.
 * Format: `base64url(payload).base64url(hmac-sha256)` — verified with a
 * constant-time comparison, failing closed when the secret is unset.
 */

export type PlaybackTokenPayload = {
  /** Video asset id the token was minted for. */
  a: string;
  /** Convex user id the token was minted for. */
  u: string;
  /** Expiry as ms since epoch. */
  exp: number;
};

const enc = new TextEncoder();

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecodeBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const s = atob(padded);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Fail closed when the playback secret is missing. */
function playbackSecret(): string {
  const secret = process.env.VIDEO_PLAYBACK_SECRET;
  if (!secret) throw new Error("VIDEO_PLAYBACK_SECRET is not set");
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(playbackSecret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Fresh `ArrayBuffer` copy — satisfies Web Crypto's `BufferSource` typing. */
function bytes(u: Uint8Array): ArrayBuffer {
  return new Uint8Array(u).buffer;
}

/** Mint `payload.signature`. */
export async function signPlaybackToken(payload: PlaybackTokenPayload): Promise<string> {
  const body = base64UrlEncodeBytes(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), bytes(enc.encode(body))));
  return `${body}.${base64UrlEncodeBytes(sig)}`;
}

/**
 * Verify signature + expiry + asset/user binding. The caller supplies the
 * asset id from the URL path and the user id it resolved independently, so a
 * token minted for another asset or user never validates.
 */
export async function verifyPlaybackToken(
  token: string,
  expected: { assetId: string; userId: string; now?: number },
): Promise<PlaybackTokenPayload> {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Malformed playback token");
  const verified = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    bytes(base64UrlDecodeBytes(sig)),
    bytes(enc.encode(body)),
  );
  if (!verified) throw new Error("Invalid playback token signature");
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(body))) as PlaybackTokenPayload;
  const now = expected.now ?? Date.now();
  if (payload.a !== expected.assetId) throw new Error("Playback token asset mismatch");
  if (payload.u !== expected.userId) throw new Error("Playback token user mismatch");
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new Error("Playback token expired");
  }
  return payload;
}

/**
 * Read the unverified payload to learn which user/asset a token claims, so
 * the caller can then verify it against independently resolved values.
 */
export function decodePlaybackToken(token: string): PlaybackTokenPayload {
  const [body] = token.split(".");
  if (!body) throw new Error("Malformed playback token");
  return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(body))) as PlaybackTokenPayload;
}

/** Constant-time byte comparison for raw key material. */
export { timingSafeEqual };
