import { describe, expect, it } from "vitest";
import {
  normalizePathname,
  prerenderedHtmlCandidates,
  shouldWarnAboutFallback,
} from "../lib/prerendered-csp";

/**
 * The pure half of the CSP hash lookup (H-1).
 *
 * `isPrerenderedRoute` and `readPrerenderedScriptHashes` read the build output
 * and are covered by `tests/csp.test.ts` indirectly through the policy they
 * produce; the path arithmetic below is what decides *which* file gets read,
 * so it is worth pinning on its own.
 */
describe("normalizePathname", () => {
  it("keeps plain paths and drops the trailing slash", () => {
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("/courses")).toBe("/courses");
    expect(normalizePathname("/courses/")).toBe("/courses");
    expect(normalizePathname("/courses/beginner")).toBe("/courses/beginner");
  });

  it("refuses traversal and non-absolute input outright", () => {
    // None of these should ever be joined onto `.next/server/app`: a `..`
    // here is either a bug or an attempt to read outside the dist directory.
    expect(normalizePathname("/../secrets")).toBeNull();
    expect(normalizePathname("/courses/../../etc/passwd")).toBeNull();
    expect(normalizePathname("courses")).toBeNull();
    expect(normalizePathname("")).toBeNull();
    expect(normalizePathname("/a\0b")).toBeNull();
  });
});

describe("prerenderedHtmlCandidates", () => {
  it("maps a path to both layouts Next writes", () => {
    expect(prerenderedHtmlCandidates("/")).toEqual(["index.html"]);
    expect(prerenderedHtmlCandidates("/courses")).toEqual([
      "courses.html",
      "courses/index.html",
    ]);
    expect(prerenderedHtmlCandidates("/courses/")).toEqual([
      "courses.html",
      "courses/index.html",
    ]);
  });

  it("returns null for anything normalizePathname rejects", () => {
    expect(prerenderedHtmlCandidates("/../../etc/passwd")).toBeNull();
    expect(prerenderedHtmlCandidates("relative")).toBeNull();
  });
});

describe("shouldWarnAboutFallback", () => {
  it("reports each path once, not once per request", () => {
    // A broken build must announce itself, then shut up: the degraded policy
    // is a per-request fallback, and logging it per hit would bury the rest
    // of the server's output.
    expect(shouldWarnAboutFallback("/warn-once")).toBe(true);
    expect(shouldWarnAboutFallback("/warn-once")).toBe(false);
    expect(shouldWarnAboutFallback("/warn-once")).toBe(false);

    // Other paths are independent.
    expect(shouldWarnAboutFallback("/warn-once-too")).toBe(true);
    expect(shouldWarnAboutFallback("/")).toBe(true);
    expect(shouldWarnAboutFallback("/")).toBe(false);
  });
});
