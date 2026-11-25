/**
 * SCORM player asset delivery tokens, Web Crypto only.
 *
 * Runs in Convex V8 isolates and Next.js runtimes.
 * Format: `base64url(payload).base64url(hmac-sha256)`
 */

export interface ScormTokenPayload {
  /** SCORM package ID */
  p: string;
  /** Convex user ID */
  u: string;
  /** Expiry timestamp in ms */
  exp: number;
}

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

function scormSecret(): string {
  const secret = process.env.SCORM_PLAYBACK_SECRET || process.env.VIDEO_PLAYBACK_SECRET;
  if (!secret) {
    // In local dev/testing if unset, provide a fallback to avoid crash
    if (process.env.NODE_ENV !== "production") {
      return "dev-scorm-secret-key-32-bytes-minimum-length!";
    }
    throw new Error("SCORM_PLAYBACK_SECRET or VIDEO_PLAYBACK_SECRET must be set");
  }
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(scormSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBuffer(u: Uint8Array): ArrayBuffer {
  return new Uint8Array(u).buffer;
}

/** Mint signed `payload.signature` token. */
export async function signScormToken(payload: ScormTokenPayload): Promise<string> {
  const body = base64UrlEncodeBytes(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(), toBuffer(enc.encode(body)))
  );
  return `${body}.${base64UrlEncodeBytes(sig)}`;
}

/** Decode payload without verifying signature. */
export function decodeScormToken(token: string): ScormTokenPayload {
  const [bodyB64] = token.split(".");
  if (!bodyB64) throw new Error("Invalid token format");
  const json = new TextDecoder().decode(base64UrlDecodeBytes(bodyB64));
  const parsed = JSON.parse(json) as ScormTokenPayload;
  if (!parsed.p || !parsed.u || typeof parsed.exp !== "number") {
    throw new Error("Invalid token payload structure");
  }
  return parsed;
}

/** Verify signature, expiry, and package+user binding. */
export async function verifyScormToken(
  token: string,
  expected: { packageId: string; userId?: string }
): Promise<ScormTokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid token structure");
  const [bodyB64, sigB64] = parts;

  const key = await hmacKey();
  const expectedSig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, toBuffer(enc.encode(bodyB64)))
  );
  const actualSig = base64UrlDecodeBytes(sigB64);

  if (!timingSafeEqual(expectedSig, actualSig)) {
    throw new Error("Invalid token signature");
  }

  const payload = decodeScormToken(token);
  if (Date.now() > payload.exp) {
    throw new Error("Token expired");
  }

  if (payload.p !== expected.packageId) {
    throw new Error("Token packageId mismatch");
  }

  if (expected.userId && payload.u !== expected.userId) {
    throw new Error("Token userId mismatch");
  }

  return payload;
}
