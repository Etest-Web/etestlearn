import { describe, expect, test } from "vitest";

import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_LIMITS,
  audienceLabel,
  audienceMatchesRole,
  cleanAnnouncementText,
  normalizeAudience,
} from "./announcements";

/**
 * The audience rule is the whole feature: `everyone` reaches all, `instructors`
 * reaches staff, `students` reaches learners. These tests exist so a future
 * "just show it to everybody" shortcut has to break something visible.
 */
describe("audienceMatchesRole", () => {
  test("everyone reaches every role", () => {
    for (const role of ["student", "instructor", "admin"] as const) {
      expect(audienceMatchesRole("everyone", role)).toBe(true);
    }
  });

  test("instructors reaches teaching staff, not learners", () => {
    expect(audienceMatchesRole("instructors", "instructor")).toBe(true);
    expect(audienceMatchesRole("instructors", "admin")).toBe(true);
    expect(audienceMatchesRole("instructors", "student")).toBe(false);
  });

  test("students reaches learners, not staff", () => {
    expect(audienceMatchesRole("students", "student")).toBe(true);
    expect(audienceMatchesRole("students", "instructor")).toBe(false);
    expect(audienceMatchesRole("students", "admin")).toBe(false);
  });

  test("an absent audience behaves as everyone", () => {
    expect(audienceMatchesRole(undefined, "student")).toBe(true);
    expect(audienceMatchesRole(null, "instructor")).toBe(true);
  });
});

describe("normalizeAudience", () => {
  test("keeps known audiences", () => {
    expect(normalizeAudience("instructors")).toBe("instructors");
    expect(normalizeAudience("students")).toBe("students");
    expect(normalizeAudience("everyone")).toBe("everyone");
  });

  test("falls back to everyone for anything unrecognised", () => {
    expect(normalizeAudience(undefined)).toBe("everyone");
    expect(normalizeAudience(null)).toBe("everyone");
    expect(normalizeAudience("")).toBe("everyone");
    expect(normalizeAudience("slug:admins")).toBe("everyone");
  });
});

describe("audienceLabel", () => {
  test("labels every option offered by the admin form", () => {
    for (const option of ANNOUNCEMENT_AUDIENCES) {
      expect(audienceLabel(option.value)).toBe(option.label);
    }
  });

  test("labels a legacy row as Everyone", () => {
    expect(audienceLabel(undefined)).toBe("Everyone");
  });
});

describe("cleanAnnouncementText", () => {
  test("trims surrounding whitespace", () => {
    const result = cleanAnnouncementText({ title: "  Hi  ", body: "\n Body \n" });
    expect(result).toEqual({ title: "Hi", body: "Body", error: null });
  });

  test("rejects a blank title", () => {
    const result = cleanAnnouncementText({ title: "   ", body: "Body" });
    expect(result.error).toMatch(/Title is required/);
  });

  test("rejects a blank body", () => {
    const result = cleanAnnouncementText({ title: "Hi", body: "   " });
    expect(result.error).toMatch(/Body is required/);
  });

  test("accepts text exactly at the limit and rejects one character more", () => {
    const atLimit = cleanAnnouncementText({
      title: "t".repeat(ANNOUNCEMENT_LIMITS.title),
      body: "b".repeat(ANNOUNCEMENT_LIMITS.body),
    });
    expect(atLimit.error).toBeNull();

    const overTitle = cleanAnnouncementText({
      title: "t".repeat(ANNOUNCEMENT_LIMITS.title + 1),
      body: "Body",
    });
    expect(overTitle.error).toMatch(/at most 120 characters/);

    const overBody = cleanAnnouncementText({
      title: "Hi",
      body: "b".repeat(ANNOUNCEMENT_LIMITS.body + 1),
    });
    expect(overBody.error).toMatch(/at most 2000 characters/);
  });

  test("trims before measuring, so trailing whitespace cannot fail a valid post", () => {
    const result = cleanAnnouncementText({
      title: "t".repeat(ANNOUNCEMENT_LIMITS.title) + "     ",
      body: "Body    ",
    });
    expect(result.error).toBeNull();
  });
});
