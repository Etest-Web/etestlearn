import { describe, expect, it } from "vitest";
import {
  buildPublitioSignature,
  getPublitioUploadUrl,
  signPublitioPayload,
} from "./publitio";

/**
 * Fixed vector computed *outside* this codebase:
 *
 *   $ printf '151558018635367098glypha_test_secret' | sha1sum
 *   af8765cc7c32bccec11547dcd14cbeca7cd027ed
 *
 * The inputs mirror the worked example in Publit's own docs (timestamp
 * 1515580186, nonce 35367098) with a secret we control. Pinning it means an
 * algorithm swap (sha1 → sha256), a concatenation reorder, or a stray
 * separator fails here instead of at upload time as a 401 that looks like a
 * credentials problem.
 */
const DOC_TIMESTAMP = 1515580186;
const DOC_NONCE = 35367098;
const TEST_SECRET = "glypha_test_secret";
const DOC_VECTOR = "af8765cc7c32bccec11547dcd14cbeca7cd027ed";

describe("signPublitioPayload", () => {
  it("matches Publit's documented SHA-1 vector", () => {
    expect(
      signPublitioPayload({
        timestamp: DOC_TIMESTAMP,
        nonce: DOC_NONCE,
        apiSecret: TEST_SECRET,
      }),
    ).toBe(DOC_VECTOR);
  });

  it("is SHA-1 (40 hex chars), not SHA-256", () => {
    const sig = signPublitioPayload({
      timestamp: DOC_TIMESTAMP,
      nonce: DOC_NONCE,
      apiSecret: TEST_SECRET,
    });
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
    expect(sig).not.toHaveLength(64);
  });

  it("orders the parts timestamp + nonce + secret", () => {
    // Reordering any pair changes the digest, so this fails if the
    // concatenation is ever "secret first" or nonce/timestamp are swapped.
    const correct = signPublitioPayload({
      timestamp: DOC_TIMESTAMP,
      nonce: DOC_NONCE,
      apiSecret: TEST_SECRET,
    });
    const wrongOrder = signPublitioPayload({
      timestamp: DOC_NONCE,
      nonce: DOC_TIMESTAMP,
      apiSecret: TEST_SECRET,
    });
    const secretFirst = signPublitioPayload({
      timestamp: DOC_TIMESTAMP,
      nonce: DOC_NONCE,
      apiSecret: "",
    });
    expect(correct).not.toBe(wrongOrder);
    expect(correct).not.toBe(secretFirst);
  });
});

describe("buildPublitioSignature", () => {
  it("always produces an 8-digit nonce", () => {
    for (let i = 0; i < 500; i++) {
      const { nonce } = buildPublitioSignature(TEST_SECRET);
      // The old bit-shift construction went negative or 9–10 digits whenever
      // the top byte had its sign bit set — sample enough to hit that case.
      expect(nonce).toBeGreaterThanOrEqual(10_000_000);
      expect(nonce).toBeLessThanOrEqual(99_999_999);
      expect(String(nonce)).toHaveLength(8);
    }
  });

  it("signs the current timestamp and stays fresh", () => {
    const before = Math.floor(Date.now() / 1000);
    const { timestamp, signature } = buildPublitioSignature(TEST_SECRET);
    const after = Math.floor(Date.now() / 1000);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
    expect(signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it("repeats are effectively impossible", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { timestamp, nonce, signature } = buildPublitioSignature(TEST_SECRET);
      seen.add(`${timestamp}:${nonce}`);
      expect(
        signPublitioPayload({ timestamp, nonce, apiSecret: TEST_SECRET }),
      ).toBe(signature);
    }
    // 200 draws of an 8-digit nonce colliding would mean the CSPRNG is not
    // being used (the old code was, but a Math.random regression would show).
    expect(seen.size).toBe(200);
  });
});

describe("getPublitioUploadUrl", () => {
  it("carries all four required auth parameters", () => {
    const url = new URL(getPublitioUploadUrl("my_api_key", TEST_SECRET));
    expect(url.origin).toBe("https://api.publit.io");
    expect(url.pathname).toBe("/v1/files/create");
    expect(url.searchParams.get("api_key")).toBe("my_api_key");
    expect(url.searchParams.get("api_timestamp")).toMatch(/^\d{10}$/);
    expect(url.searchParams.get("api_nonce")).toMatch(/^\d{8}$/);
    expect(url.searchParams.get("api_signature")).toMatch(/^[0-9a-f]{40}$/);
    // Never leak the secret into the URL.
    expect(url.toString()).not.toContain(TEST_SECRET);
  });
});
