import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signScormToken,
  decodeScormToken,
  verifyScormToken,
} from "../lib/scorm/token";

describe("SCORM Delivery Tokens", () => {
  const originalSecret = process.env.SCORM_PLAYBACK_SECRET;

  beforeEach(() => {
    process.env.SCORM_PLAYBACK_SECRET = "super-secret-test-scorm-key-1234567890";
  });

  afterEach(() => {
    process.env.SCORM_PLAYBACK_SECRET = originalSecret;
  });

  it("mints, decodes, and verifies valid token", async () => {
    const payload = {
      p: "pkg_12345",
      u: "user_67890",
      exp: Date.now() + 60000,
    };

    const token = await signScormToken(payload);
    expect(token).toContain(".");

    const decoded = decodeScormToken(token);
    expect(decoded.p).toBe("pkg_12345");
    expect(decoded.u).toBe("user_67890");

    const verified = await verifyScormToken(token, {
      packageId: "pkg_12345",
      userId: "user_67890",
    });
    expect(verified.p).toBe("pkg_12345");
    expect(verified.u).toBe("user_67890");
  });

  it("rejects expired token", async () => {
    const token = await signScormToken({
      p: "pkg_12345",
      u: "user_67890",
      exp: Date.now() - 1000,
    });

    await expect(
      verifyScormToken(token, { packageId: "pkg_12345" })
    ).rejects.toThrow("Token expired");
  });

  it("rejects packageId mismatch", async () => {
    const token = await signScormToken({
      p: "pkg_12345",
      u: "user_67890",
      exp: Date.now() + 60000,
    });

    await expect(
      verifyScormToken(token, { packageId: "pkg_different" })
    ).rejects.toThrow("Token packageId mismatch");
  });

  it("rejects tampered signature", async () => {
    const token = await signScormToken({
      p: "pkg_12345",
      u: "user_67890",
      exp: Date.now() + 60000,
    });

    const [body, sig] = token.split(".");
    const tampered = `${body}.${sig.slice(0, -4)}AAAA`;

    await expect(
      verifyScormToken(tampered, { packageId: "pkg_12345" })
    ).rejects.toThrow("Invalid token signature");
  });
});
