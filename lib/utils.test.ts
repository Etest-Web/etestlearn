import { describe, expect, test } from "vitest";
import { formatRelativeTime } from "./utils";

/**
 * `now` is fixed and passed in, so these assertions cannot drift with the wall
 * clock the way `Date.now()` comparisons would.
 */
const NOW = new Date(2026, 2, 15, 12, 0, 0).getTime();

const ago = (ms: number) => NOW - ms;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  test("collapses anything under 45 seconds to 'just now'", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(ago(10 * SECOND), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(44 * SECOND), NOW)).toBe("just now");
  });

  test("minutes are singular at one and plural after", () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(ago(12 * MINUTE), NOW)).toBe("12 minutes ago");
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe("59 minutes ago");
  });

  test("hours take over at sixty minutes", () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(ago(5 * HOUR), NOW)).toBe("5 hours ago");
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe("23 hours ago");
  });

  test("a whole day reads as Yesterday rather than '1 day ago'", () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe("Yesterday");
    expect(formatRelativeTime(ago(2 * DAY), NOW)).toBe("2 days ago");
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe("6 days ago");
  });

  test("past a week it falls back to a calendar date", () => {
    const eightDaysAgo = new Date(2026, 2, 7, 9, 30, 0).getTime();
    expect(formatRelativeTime(eightDaysAgo, NOW)).toBe("7 Mar");
  });

  test("the year is included when it is not the current one", () => {
    const lastYear = new Date(2025, 10, 4, 9, 30, 0).getTime();
    expect(formatRelativeTime(lastYear, NOW)).toBe("4 Nov 2025");
  });

  test("a future timestamp reads as 'just now', never a negative duration", () => {
    // Client clocks drift; "in -3 seconds" reads as a bug to a user.
    expect(formatRelativeTime(ago(-3 * SECOND), NOW)).toBe("just now");
    expect(formatRelativeTime(ago(-5 * DAY), NOW)).toBe("just now");
  });
});
