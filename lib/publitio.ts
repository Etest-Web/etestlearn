import { createHash } from "node:crypto";

/**
 * Signs a Publit.io API v1 request.
 * Signature algorithm: SHA1(timestamp + nonce + api_secret)
 */
export function buildPublitioSignature(apiSecret: string): {
  timestamp: number;
  nonce: number;
  signature: string;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(10000000 + Math.random() * 90000000);
  const signature = createHash("sha1")
    .update(`${timestamp}${nonce}${apiSecret}`)
    .digest("hex");
  return { timestamp, nonce, signature };
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
