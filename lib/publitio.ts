import { createHash, randomBytes } from "node:crypto";

/**
 * Signs a Publit.io API v1 request.
 *
 * The spec is Publit's, not ours, and it is exact:
 *
 *   - `api_signature` is a **SHA-1** digest of `<api_timestamp><api_nonce><api_secret>`
 *     (OAuth-Core-1.0-shaped, per publit.io/docs — SHA-256 is rejected).
 *   - `api_nonce` is an **8-digit** random number.
 *   - Timestamps older than 1 hour, and signatures seen in the last 48 hours,
 *     are refused — so the nonce has to be both well-formed and fresh.
 *
 * Two ways this used to be wrong, both silently: `sha256` instead of `sha1`
 * (every call 401s, so uploads fail with an error that reads like a
 * credentials problem), and a nonce built as `10000000 + (byte << 24 | …)`,
 * whose `<<24` overflows into the sign bit and produces a *negative* or
 * 9–10 digit value about half the time. Neither is covered by guessing at the
 * output — hence the fixed test vector in `lib/publitio.test.ts`.
 */
export function buildPublitioSignature(apiSecret: string): {
  timestamp: number;
  nonce: number;
  signature: string;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  // Exactly 8 digits: 10000000..99999999. readUInt32BE is unsigned, so the
  // sign-bit overflow of `<<` cannot happen. The modulo's tiny bias is
  // irrelevant — the nonce only has to be unpredictable and unique, and
  // Publit itself remembers the last 48h of signatures on top of this.
  const nonce = 10000000 + (randomBytes(4).readUInt32BE(0) % 90000000);
  return { timestamp, nonce, signature: signPublitioPayload({ timestamp, nonce, apiSecret }) };
}

/**
 * The signature itself, split out so it can be pinned to a fixed vector in
 * tests — `buildPublitioSignature` reads a clock and a CSPRNG, so testing the
 * digest through it would only ever assert "some hash came back".
 */
export function signPublitioPayload(payload: {
  timestamp: number;
  nonce: number;
  apiSecret: string;
}): string {
  return createHash("sha1")
    .update(`${payload.timestamp}${payload.nonce}${payload.apiSecret}`)
    .digest("hex");
}

export function getPublitioUploadUrl(apiKey: string, apiSecret: string): string {
  const { timestamp, nonce, signature } = buildPublitioSignature(apiSecret);
  const query = new URLSearchParams({
    api_key: apiKey,
    api_timestamp: String(timestamp),
    api_nonce: String(nonce),
    api_signature: signature,
  });
  return `https://api.publit.io/v1/files/create?${query.toString()}`;
}
