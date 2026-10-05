import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  pickLadder,
} from "./video-encode";
import {
  buildMasterPlaylist,
  decorateMasterPlaylist,
  decorateMediaPlaylist,
} from "./video-playlists";

describe("video-encode", () => {
  it("caps the ladder at the source height", () => {
    expect(pickLadder(1080).map((v) => v.label)).toEqual(["1080p", "720p", "480p", "270p"]);
    expect(pickLadder(500).map((v) => v.label)).toEqual(["480p", "270p"]);
    expect(pickLadder(100).map((v) => v.label)).toEqual(["270p"]);
  });

  it("builds one ffmpeg invocation for the whole ladder", () => {
    const args = buildFfmpegArgs("/tmp/in.mp4", "/tmp/out", pickLadder(480));
    expect(args).toContain("libx264");
    expect(args).toContain("/tmp/out/out_%v.m3u8");
  });

  it("decorates stored playlists only at serve time", () => {
    const stored = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:6",
      "#EXTINF:6.0,",
      "seg_0_001.ts",
      "#EXT-X-ENDLIST",
      "",
    ].join("\n");
    const served = decorateMediaPlaylist(stored, {
      keyUri: "/api/video/a1/key?t=tok",
      ivHex: "0".repeat(32),
      tokenParam: "t=tok",
    });
    expect(served).toContain('#EXT-X-KEY:METHOD=AES-128,URI="/api/video/a1/key?t=tok"');
    expect(served).toContain("seg_0_001.ts?t=tok");
    expect(stored).not.toContain("EXT-X-KEY");

    const master = buildMasterPlaylist(pickLadder(480));
    expect(decorateMasterPlaylist(master, "t=tok")).toContain("v0.m3u8?t=tok");
  });
});
