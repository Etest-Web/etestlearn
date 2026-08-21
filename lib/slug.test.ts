import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates titles", () => {
    expect(slugify("Intro to Web Development")).toBe("intro-to-web-development");
  });

  it("collapses runs of non-alphanumerics into one hyphen", () => {
    expect(slugify("Data  Science   &  AI!")).toBe("data-science-ai");
  });

  it("trims leading/trailing separators", () => {
    expect(slugify("  --Hello World--  ")).toBe("hello-world");
  });

  it("keeps digits", () => {
    expect(slugify("React 19 Deep Dive v2.1")).toBe("react-19-deep-dive-v2-1");
  });

  it("returns an empty string for symbol-only input", () => {
    expect(slugify("*** ???")).toBe("");
  });
});
