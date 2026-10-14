/**
 * Account-number encryption for payout details.
 *
 * Web Crypto only, for the same reason `lib/video-playback-token.ts` is: this
 * runs inside Convex V8 isolates (mutations), where Node builtins like
 * `node:crypto` are unavailable. AES-256-GCM gives confidentiality *and*
 * integrity — a tampered ciphertext fails to decrypt rather than yielding
 * attacker-chosen plaintext.
 *
 * Format: `base64url(iv).base64url(ciphertext)` — the 12-byte IV is random per
 * encryption and stored alongside, which is the correct thing to do for GCM
 * (a repeated IV with a repeated key catastrophically breaks the mode). GCM's
 * 16-byte auth tag is appended to the ciphertext by Web Crypto itself.
 *
 * Key management: a single 32-byte key, base64-encoded, in the
 * `BANK_ENCRYPTION_KEY` env var. Generate once and never rotate casually —
 * losing it makes stored account numbers permanently unreadable, and re-keying
 * requires re-encrypting every row. Fails closed when unset: an unencrypted
 * account number must never reach the database.
 */

const IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const s = atob(padded);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Fresh `ArrayBuffer` copy — satisfies Web Crypto's `BufferSource` typing. */
function bytes(u: Uint8Array): ArrayBuffer {
  return new Uint8Array(u).buffer;
}

/**
 * Import the env key, validating it is exactly 32 bytes.
 *
 * A short key is rejected rather than accepted: AES-256 silently truncates a
 * longer key, and a short one throws deep inside Web Crypto with a message
 * that points nowhere near the actual problem.
 */
async function encryptionKey(): Promise<CryptoKey> {
  const raw = process.env.BANK_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "BANK_ENCRYPTION_KEY is not set. Generate one with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" " +
        "then: npx convex env set BANK_ENCRYPTION_KEY <value>",
    );
  }

  let keyBytes: Uint8Array;
  try {
    keyBytes = base64UrlDecodeBytes(raw.replace(/\+/g, "-").replace(/\//g, "_"));
  } catch {
    throw new Error("BANK_ENCRYPTION_KEY is not valid base64");
  }
  if (keyBytes.length !== 32) {
    throw new Error(
      `BANK_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${keyBytes.length}`,
    );
  }

  return crypto.subtle.importKey("raw", bytes(keyBytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt `plaintext` to `base64url(iv).base64url(ciphertext)`. */
export async function encryptAccountNumber(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bytes(iv) },
      await encryptionKey(),
      bytes(enc.encode(plaintext)),
    ),
  );
  return `${base64UrlEncodeBytes(iv)}.${base64UrlEncodeBytes(ciphertext)}`;
}

/** Inverse of {@link encryptAccountNumber}. Throws on tampering or a wrong key. */
export async function decryptAccountNumber(payload: string): Promise<string> {
  const [ivPart, ciphertextPart] = payload.split(".");
  if (!ivPart || !ciphertextPart) throw new Error("Malformed encrypted value");

  const iv = base64UrlDecodeBytes(ivPart);
  if (iv.length !== IV_BYTES) throw new Error("Malformed encrypted value");

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(iv) },
    await encryptionKey(),
    bytes(base64UrlDecodeBytes(ciphertextPart)),
  );
  return dec.decode(plaintext);
}

/**
 * Last-four display mask. Computed from the decrypted number at read time, so
 * the database never stores the mask *and* the ciphertext — one source of
 * truth, and the mask cannot drift from the real number after a change.
 *
 * An account number shorter than four digits (a malformed value that should
 * never arrive, since the mutation validates) masks fully.
 */
export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return "*".repeat(accountNumber.length);
  return "*".repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}
