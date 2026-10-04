import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./utils";

const NOW = Date.UTC(2026, 2, 10, 12, 0, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("collapses anything inside a minute to just now", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 30 * SECOND, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW + 30 * SECOND, NOW)).toBe("just now");
  });

  it("counts minutes, hours and days in the past", () => {
    expect(formatRelativeTime(NOW - MINUTE, NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(NOW - 5 * MINUTE, NOW)).toBe("5 minutes ago");
    expect(formatRelativeTime(NOW - HOUR, NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(NOW - 6 * HOUR, NOW)).toBe("6 hours ago");
    expect(formatRelativeTime(NOW - DAY, NOW)).toBe("1 day ago");
    expect(formatRelativeTime(NOW - 3 * DAY, NOW)).toBe("3 days ago");
  });

  it("escalates to weeks, months and years", () => {
    expect(formatRelativeTime(NOW - 8 * DAY, NOW)).toBe("1 week ago");
    expect(formatRelativeTime(NOW - 20 * DAY, NOW)).toBe("2 weeks ago");
    expect(formatRelativeTime(NOW - 45 * DAY, NOW)).toBe("1 month ago");
    expect(formatRelativeTime(NOW - 200 * DAY, NOW)).toBe("6 months ago");
    expect(formatRelativeTime(NOW - 400 * DAY, NOW)).toBe("1 year ago");
  });

  it("says \"in\" for the future", () => {
    expect(formatRelativeTime(NOW + 2 * MINUTE, NOW)).toBe("in 2 minutes");
    expect(formatRelativeTime(NOW + 5 * HOUR, NOW)).toBe("in 5 hours");
  });

  it("does not throw on a bad timestamp", () => {
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("unknown");
  });

  it("defaults to the real clock", () => {
    expect(formatRelativeTime(Date.now())).toBe("just now");
  });
});