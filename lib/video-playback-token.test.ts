import { describe, expect, it } from "vitest";
import { signPlaybackToken, verifyPlaybackToken } from "./video-playback-token";

describe("video-playback-token", () => {
  it("signs and verifies playback tokens, failing closed", async () => {
    process.env.VIDEO_PLAYBACK_SECRET = "test-secret";
    const payload = { a: "asset1", u: "user1", exp: Date.now() + 60_000 };
    const token = await signPlaybackToken(payload);
    expect(await verifyPlaybackToken(token, { assetId: "asset1", userId: "user1" })).toMatchObject(payload);
    await expect(verifyPlaybackToken(token, { assetId: "other", userId: "user1" })).rejects.toThrow();
    await expect(
      verifyPlaybackToken(token, { assetId: "asset1", userId: "user1", now: payload.exp + 1 }),
    ).rejects.toThrow();
  });
});
