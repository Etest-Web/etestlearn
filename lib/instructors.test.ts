import { describe, expect, test } from "vitest";
import { isConvexId, websiteHref, websiteLabel } from "./instructors";

/**
 * Both helpers guard something a URL can carry: an id that reaches a Convex
 * validator, and a website string that reaches an `href`. Neither is allowed to
 * throw and neither is allowed to pass obvious garbage through, so the cases
 * that matter are the boundaries rather than the happy path.
 */

describe("isConvexId", () => {
  test("accepts a real-looking id", () => {
    expect(isConvexId("jn7f3k2m9xq4v8w1z5t6r0s3b7c2d9h4")).toBe(true);
  });

  test("rejects values a URL can actually produce", () => {
    expect(isConvexId("")).toBe(false);
    expect(isConvexId(null)).toBe(false);
    expect(isConvexId(undefined)).toBe(false);
    expect(isConvexId("short")).toBe(false);
    expect(isConvexId("..")).toBe(false);
    expect(isConvexId("%2e%2e%2f")).toBe(false);
    expect(isConvexId("courses")).toBe(false);
  });

  test("rejects anything carrying path, query or whitespace characters", () => {
    expect(isConvexId("jn7f3k2m9xq4v8w1z5t6r0s3b7c2d9h4/extra")).toBe(false);
    expect(isConvexId("jn7f3k2m9xq4v8w1z5t6r0s3b7c2d9h4?x=1")).toBe(false);
    expect(isConvexId("jn7f3k2m9xq4v8w1z5t6r0s3b7c2d9h4 ")).toBe(false);
    expect(isConvexId("jn7f3k2m9xq4v8w1z5t6r0s3b7c2d9h4\n")).toBe(false);
  });

  test("rejects an over-long value rather than forwarding it", () => {
    expect(isConvexId("a".repeat(64))).toBe(true);
    expect(isConvexId("a".repeat(65))).toBe(false);
  });
});

describe("websiteHref", () => {
  test("leaves an explicit scheme alone", () => {
    expect(websiteHref("https://example.com")).toBe("https://example.com");
    expect(websiteHref("http://example.com/a")).toBe("http://example.com/a");
  });

  test("prefixes https onto the way people actually type a domain", () => {
    expect(websiteHref("example.com")).toBe("https://example.com");
    expect(websiteHref("www.example.com/teaching")).toBe("https://www.example.com/teaching");
    expect(websiteHref("  example.com  ")).toBe("https://example.com");
  });

  test("pins protocol-relative input to https", () => {
    expect(websiteHref("//example.com")).toBe("https://example.com");
  });

  test("does not turn a javascript: scheme into a runnable link", () => {
    // The result is a broken https URL, which is the point: the browser treats
    // it as an unreachable host rather than as script.
    expect(websiteHref("javascript:alert(1)")).toBe("https://javascript:alert(1)");
    expect(websiteHref("JavaScript:alert(1)")).toBe("https://JavaScript:alert(1)");
  });
});

describe("websiteLabel", () => {
  test("shows a domain without its scheme", () => {
    expect(websiteLabel("https://example.com")).toBe("example.com");
    expect(websiteLabel("http://example.com/a/")).toBe("example.com/a");
    expect(websiteLabel("example.com")).toBe("example.com");
  });
});
