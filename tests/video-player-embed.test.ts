import { describe, expect, it } from "vitest";
import { getEmbedUrl } from "../components/video-player";

/**
 * The host allow-list behind M-6.
 *
 * `getEmbedUrl` decides which third-party player a lesson's `src` is handed
 * to, so a host that is accepted here becomes an iframe/frame target. The
 * Publitio branch used a substring match (`host.includes("publit.io")`), which
 * accepted `publit.io.attacker.com` and `evil.publit.io.example` — an
 * attacker-controlled origin wearing the brand. Everything below is about
 * that boundary.
 */
describe("getEmbedUrl — Publitio host matching", () => {
  it("accepts the Publitio domain and its real subdomains", () => {
    expect(getEmbedUrl("https://media.publit.io/file/8D4Nr5G1.mp4")).toBe(
      "https://media.publit.io/file/8D4Nr5G1.html?player=main",
    );
    expect(getEmbedUrl("https://publit.io/file/8D4Nr5G1.mp4")).toBe(
      "https://publit.io/file/8D4Nr5G1.html?player=main",
    );
    expect(getEmbedUrl("https://media.publit.io/file/x.html")).toBe(
      "https://media.publit.io/file/x.html?player=main",
    );
  });

  it("refuses hosts that merely contain the brand", () => {
    expect(getEmbedUrl("https://publit.io.attacker.com/file/x.mp4")).toBeNull();
    expect(getEmbedUrl("https://evil.publit.io.example/file/x.mp4")).toBeNull();
    expect(getEmbedUrl("https://notpublit.io/file/x.mp4")).toBeNull();
    expect(getEmbedUrl("https://publit.io.evil.com/file/x.html?player=main")).toBeNull();
  });

  it("keeps the YouTube and Vimeo branches on exact hostnames too", () => {
    expect(getEmbedUrl("https://youtube.com.attacker.com/watch?v=abc")).toBeNull();
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
  });
});
