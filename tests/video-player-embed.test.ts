import { describe, expect, it } from "vitest";
import { getEmbedUrl } from "../components/video-player";

/**
 * The host allow-list behind M-6.
 *
 * `getEmbedUrl` decides which third-party player a lesson's `src` is handed
 * to, so a host that is accepted here becomes an iframe/frame target. Hosts
 * are matched exactly (plus the two vendors' real subdomain shapes) so an
 * attacker-controlled origin wearing a brand — `youtube.com.attacker.com` —
 * never becomes an embed target.
 */
describe("getEmbedUrl — host matching", () => {
  it("keeps the YouTube and Vimeo branches on exact hostnames too", () => {
    expect(getEmbedUrl("https://youtube.com.attacker.com/watch?v=abc")).toBeNull();
    expect(getEmbedUrl("https://m.youtube.com/watch?v=abc")).toBe(
      "https://www.youtube-nocookie.com/embed/abc",
    );
    expect(getEmbedUrl("https://unknown.youtube-nocookie.com/embed/abc")).toBeNull();
    expect(getEmbedUrl("https://vimeo.com.attacker.com/12345")).toBeNull();
    expect(getEmbedUrl("https://player.vimeo.com/video/12345")).toBe(
      "https://player.vimeo.com/video/12345",
    );
    expect(getEmbedUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
  });

  it("returns null for anything it does not recognise", () => {
    expect(getEmbedUrl("not a url")).toBeNull();
    expect(getEmbedUrl("https://example.com/video.mp4")).toBeNull();
    expect(getEmbedUrl("https://media.publit.io/file/8D4Nr5G1.mp4")).toBeNull();
  });
});
