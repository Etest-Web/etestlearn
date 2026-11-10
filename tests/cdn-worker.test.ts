import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  isAllowedMediaMethod,
  isAllowedMediaPath,
  mediaCacheControl,
  mediaContentType,
  parseAllowedOrigins,
} from "../edge/cdn-worker/src/policy";

/**
 * Pins the two rules the Worker's security rests on: the path allowlist and
 * per-origin CORS. `src/index.ts` is excluded from the root tsconfig (it needs
 * `aws4fetch` and Workers globals), so everything below is imported from
 * `policy.ts`, which has no runtime dependencies.
 */

const ASSET = "k97d3s8m4n2q1w5e6r7t";

describe("isAllowedMediaPath", () => {
  it("accepts the master, variant playlists and segments", () => {
    expect(isAllowedMediaPath(`/hls/${ASSET}/master.m3u8`)).toBe(true);
    expect(isAllowedMediaPath(`/hls/${ASSET}/0/index.m3u8`)).toBe(true);
    expect(isAllowedMediaPath(`/hls/${ASSET}/1/seg_0.ts`)).toBe(true);
    expect(isAllowedMediaPath(`/hls/${ASSET}/01/seg_000123.ts`)).toBe(true);
  });

  it("rejects traversal and encoded separators", () => {
    for (const path of [
      `/hls/${ASSET}/../master.m3u8`,
      `/hls/${ASSET}/0/../seg_0.ts`,
      "/hls/..%2fmaster.m3u8",
      `/hls/${ASSET}/0/seg_0.ts%00`,
    ]) {
      expect(isAllowedMediaPath(path), path).toBe(false);
    }
  });

  it("rejects other paths, prefixes and extensions", () => {
    for (const path of [
      "/",
      "/hls",
      `/hls/${ASSET}`,
      `/hls/${ASSET}/master.m3u8/`,
      `/hls/${ASSET}/master.m3u8.bak`,
      `/hls//master.m3u8`,
      `/media/${ASSET}/master.m3u8`,
      `/hls/${ASSET}/0/init.mp4`,
      `/hls/${ASSET}/0/seg_0.m4s`,
      `/hls/${ASSET}/100/seg_0.ts`,
      `/hls/${ASSET}/0/seg_1234567.ts`,
    ]) {
      expect(isAllowedMediaPath(path), path).toBe(false);
    }
  });

  it("rejects an asset id that is empty or longer than 64 characters", () => {
    expect(isAllowedMediaPath("/hls//master.m3u8")).toBe(false);
    expect(isAllowedMediaPath(`/hls/${"a".repeat(65)}/master.m3u8`)).toBe(false);
  });

  it("rejects an asset id containing a path separator or dot", () => {
    expect(isAllowedMediaPath("/hls/a.b/master.m3u8")).toBe(false);
    expect(isAllowedMediaPath("/hls/a%2Fb/master.m3u8")).toBe(false);
  });
});

describe("isAllowedMediaMethod", () => {
  it("allows only GET and OPTIONS", () => {
    expect(isAllowedMediaMethod("GET")).toBe(true);
    expect(isAllowedMediaMethod("OPTIONS")).toBe(true);

    for (const method of ["POST", "PUT", "DELETE", "PATCH", "HEAD"]) {
      expect(isAllowedMediaMethod(method), method).toBe(false);
    }
  });
});

describe("parseAllowedOrigins", () => {
  it("trims, dedupes and keeps bare origins", () => {
    expect(
      parseAllowedOrigins(" https://glypha.com.ng, https://www.glypha.com.ng ,https://glypha.com.ng"),
    ).toEqual(["https://glypha.com.ng", "https://www.glypha.com.ng"]);
  });

  it("drops entries with a path, trailing slash, wildcard or no scheme", () => {
    expect(
      parseAllowedOrigins(
        "https://glypha.com.ng/,https://glypha.com.ng/path,*,glypha.com.ng,https://*.glypha.com.ng,,",
      ),
    ).toEqual([]);
  });

  it("returns an empty list for an unset value", () => {
    expect(parseAllowedOrigins("")).toEqual([]);
  });
});

describe("corsHeaders", () => {
  const allowed = ["https://glypha.com.ng"];

  it("returns per-origin headers for an allowed origin", () => {
    const headers = corsHeaders("https://glypha.com.ng", allowed);

    expect(headers).not.toBeNull();
    expect(headers?.["access-control-allow-origin"]).toBe("https://glypha.com.ng");
    expect(headers?.["access-control-allow-methods"]).toBe("GET, OPTIONS");
  });

  it("never answers `*` and refuses unknown or absent origins", () => {
    expect(corsHeaders("https://evil.example", allowed)).toBeNull();
    expect(corsHeaders(null, allowed)).toBeNull();
    expect(corsHeaders("https://glypha.com.ng", [])).toBeNull();
  });

  it("matches exactly — no prefix or case folding", () => {
    expect(corsHeaders("https://glypha.com.ng.evil.example", allowed)).toBeNull();
    expect(corsHeaders("https://GLYPHA.com.ng", allowed)).toBeNull();
  });
});

describe("media headers", () => {
  it("marks objects immutable for a year", () => {
    expect(mediaCacheControl()).toBe("public, max-age=31536000, immutable");
  });

  it("maps playlists and segments to their content types", () => {
    expect(mediaContentType("/hls/a/master.m3u8")).toBe("application/vnd.apple.mpegurl");
    expect(mediaContentType("/hls/a/1/index.m3u8")).toBe("application/vnd.apple.mpegurl");
    expect(mediaContentType("/hls/a/1/seg_4.ts")).toBe("video/mp2t");
  });
});
