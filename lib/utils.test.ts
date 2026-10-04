import { describe, expect, test } from "vitest";
import { formatAbsoluteDate, formatRelativeTime, pluralize } from "./utils";

/**
 * `now` is injected throughout: these assertions are about the *rule*, and a
 * test that reads the wall clock is a test that fails on a slow machine.
 */
const NOW = Date.UTC(2026, 2, 4, 12, 0, 0);
const ago = (ms: number) => NOW - ms;
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe("pluralize", () => {
  test("agrees with the count", () => {
    expect(pluralize(0, "member")).toBe("0 members");
    expect(pluralize(1, "member")).toBe("1 member");
    expect(pluralize(2, "member")).toBe("2 members");
  });

  test("takes an irregular plural when one exists", () => {
    expect(pluralize(1, "person", "people")).toBe("1 person");
    expect(pluralize(3, "person", "people")).toBe("3 people");
  });
});

describe("formatRelativeTime", () => {
  test("the immediate present is not a number", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(ago(30 * SECOND), NOW)).toBe("just now");
  });

  test("clock skew in the other direction is still 'just now', not 'in 3 seconds'", () => {
    expect(formatRelativeTime(NOW + 5 * SECOND, NOW)).toBe("just now");
  });

  test("minutes, hours, days and weeks", () => {
    expect(formatRelativeTime(ago(2 * MINUTE), NOW)).toBe("2 minutes ago");
    expect(formatRelativeTime(ago(5 * HOUR), NOW)).toBe("5 hours ago");
    expect(formatRelativeTime(ago(3 * DAY), NOW)).toBe("3 days ago");
    expect(formatRelativeTime(ago(2 * WEEK), NOW)).toBe("2 weeks ago");
  });

  test("singular units are singular", () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(ago(DAY), NOW)).toBe("1 day ago");
  });

  test("a timestamp in the future reads as future", () => {
    expect(formatRelativeTime(NOW + 3 * HOUR, NOW)).toBe("in 3 hours");
  });

  test("past a month it switches to an absolute date", () => {
    expect(formatRelativeTime(ago(60 * DAY), NOW)).toBe("on 3 Jan 2026");
    expect(formatRelativeTime(ago(365 * DAY), NOW)).toBe("on 4 Mar 2025");
  });

  test("garbage in, empty string out — never 'NaN ago'", () => {
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("");
    expect(formatRelativeTime(Number.POSITIVE_INFINITY, NOW)).toBe("");
  });
});

describe("formatAbsoluteDate", () => {
  test("renders in UTC so SSR and the client cannot disagree", () => {
    expect(formatAbsoluteDate(Date.UTC(2026, 0, 5))).toBe("5 Jan 2026");
    expect(formatAbsoluteDate(Date.UTC(2026, 11, 31))).toBe("31 Dec 2026");
    expect(formatAbsoluteDate(Number.NaN)).toBe("");
  });
});