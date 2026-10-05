import { describe, expect, it } from "vitest";
import { isUploadthingFileUrl } from "./video-source";

describe("video-source", () => {
  it("pins sources to UploadThing hosts over https", () => {
    expect(isUploadthingFileUrl("https://abc123.ufs.sh/f/key-1")).toBe(true);
    expect(isUploadthingFileUrl("https://utfs.io/f/key-1")).toBe(true);
    expect(isUploadthingFileUrl("http://abc123.ufs.sh/f/key-1")).toBe(false);
    expect(isUploadthingFileUrl("https://evil.com/f/key-1")).toBe(false);
    expect(isUploadthingFileUrl("https://ufs.sh.evil.com/f/key-1")).toBe(false);
    expect(isUploadthingFileUrl("not a url")).toBe(false);
  });
});
