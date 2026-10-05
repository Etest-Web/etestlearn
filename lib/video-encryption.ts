import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-128-CBC segment encryption for self-hosted HLS.
 *
 * ffmpeg produces plaintext fMP4 segments; each segment is encrypted here with
 * a per-asset 16-byte key and IV. hls.js decrypts in the browser using the key
 * served by the auth-gated route.
 */

export function createAes128Key(): Buffer {
  return randomBytes(16);
}

export function createAes128Iv(): Buffer {
  return randomBytes(16);
}

export function encryptAes128Cbc(plaintext: Buffer, key: Buffer, iv: Buffer): Buffer {
  if (key.length !== 16) throw new Error("AES-128 key must be 16 bytes");
  if (iv.length !== 16) throw new Error("AES-128 IV must be 16 bytes");
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function decryptAes128Cbc(ciphertext: Buffer, key: Buffer, iv: Buffer): Buffer {
  if (key.length !== 16) throw new Error("AES-128 key must be 16 bytes");
  if (iv.length !== 16) throw new Error("AES-128 IV must be 16 bytes");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export type PlaybackTokenPayload = {
  /** Video asset id the token was minted for. */
  a: string;
  /** User id the token was minted for. */
  u: string;
  /** Expiry as ms since epoch. */
  exp: number;
};

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input as Buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

/** Fail closed when the playback secret is missing. */
function playbackSecret(): string {
  const secret = process.env.VIDEO_PLAYBACK_SECRET;
  if (!secret) throw new Error("VIDEO_PLAYBACK_SECRET is not set");
  return secret;
}

/** Self-contained playback token: `payload.signature`, HMAC-SHA256 signed. */
export function signPlaybackToken(payload: PlaybackTokenPayload): string {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", playbackSecret()).update(body).digest();
  return `${body}.${base64UrlEncode(sig)}`;
}

/** Verify signature + expiry + asset/user binding. Throws on any mismatch. */
export function verifyPlaybackToken(
  token: string,
  expected: { assetId: string; userId: string; now?: number },
): PlaybackTokenPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Malformed playback token");
  const expectedSig = createHmac("sha256", playbackSecret()).update(body).digest();
  const actualSig = base64UrlDecode(sig);
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    throw new Error("Invalid playback token signature");
  }
  const payload = JSON.parse(base64UrlDecode(body).toString("utf8")) as PlaybackTokenPayload;
  const now = expected.now ?? Date.now();
  if (payload.a !== expected.assetId) throw new Error("Playback token asset mismatch");
  if (payload.u !== expected.userId) throw new Error("Playback token user mismatch");
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new Error("Playback token expired");
  }
  return payload;
}
