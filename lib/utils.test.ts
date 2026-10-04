import { describe, expect, test } from "vitest";
import { formatDate, formatRelativeTime } from "./utils";

/**
 * The wording is the contract: every dashboard surface shares this helper, so a
 * change here moves text on several pages at once. `now` is pinned so the
 * assertions cannot drift with the wall clock.
 */
const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);
const seconds = (n: number) => NOW - n * 1000;
const minutes = (n: number) => NOW - n * 60 * 1000;
const hours = (n: number) => NOW - n * 60 * 60 * 1000;
const days = (n: number) => NOW - n * 24 * 60 * 60 * 1000;

describe("formatRelativeTime", () => {
  test("collapses the immediate past into 'just now'", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(seconds(1), NOW)).toBe("just now");
    expect(formatRelativeTime(seconds(44), NOW)).toBe("just now");
  });

  test("uses the singular minute form once it is unambiguously a minute", () => {
    expect(formatRelativeTime(seconds(45), NOW)).toBe("a minute ago");
    expect(formatRelativeTime(seconds(89), NOW)).toBe("a minute ago");
  });

  test("pluralises minutes and hours", () => {
    expect(formatRelativeTime(minutes(5), NOW)).toBe("5 minutes ago");
    expect(formatRelativeTime(minutes(59), NOW)).toBe("59 minutes ago");
    expect(formatRelativeTime(hours(2), NOW)).toBe("2 hours ago");
    expect(formatRelativeTime(hours(23), NOW)).toBe("23 hours ago");
  });

  test("uses the idiomatic singular forms at one hour and one day", () => {
    expect(formatRelativeTime(minutes(90), NOW)).toBe("an hour ago");
    expect(formatRelativeTime(hours(30), NOW)).toBe("yesterday");
  });

  test("pluralises days, then falls back to an absolute date", () => {
    expect(formatRelativeTime(days(3), NOW)).toBe("3 days ago");
    expect(formatRelativeTime(days(6), NOW)).toBe("6 days ago");

    const old = formatRelativeTime(days(40), NOW);
    expect(old).not.toMatch(/ago/);
    expect(old).toContain("2026");
  });

  test("treats a future timestamp as clock skew rather than rendering nonsense", () => {
    // Browser and server clocks disagree; "-3 hours ago" would be a bug report.
    expect(formatRelativeTime(NOW + hours(3), NOW)).toBe("just now");
  });

  test("unusable input never throws inside a render", () => {
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("just now");
    expect(formatRelativeTime(Number.POSITIVE_INFINITY, NOW)).toBe("just now");
    expect(formatDate(Number.NaN)).toBe("unknown date");
  });

  test("defaults `now` to the current time", () => {
    expect(formatRelativeTime(Date.now())).toBe("just now");
  });
});
