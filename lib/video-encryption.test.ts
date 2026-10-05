import { describe, expect, it } from "vitest";
import {
  createAes128Iv,
  createAes128Key,
  decryptAes128Cbc,
  encryptAes128Cbc,
} from "./video-encryption";

describe("video-encryption", () => {
  it("round-trips AES-128-CBC segments", () => {
    const key = createAes128Key();
    const iv = createAes128Iv();
    const plaintext = Buffer.from("fake fmp4 segment bytes ".repeat(64));
    const ciphertext = encryptAes128Cbc(plaintext, key, iv);
    expect(ciphertext.equals(plaintext)).toBe(false);
    expect(ciphertext.length % 16).toBe(0);
    expect(decryptAes128Cbc(ciphertext, key, iv).equals(plaintext)).toBe(true);
  });
});
