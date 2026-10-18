import { describe, expect, test } from "vitest";
import {
  MAX_BOOKMARKS,
  bookmarkableCourse,
} from "./bookmarks";

describe("bookmarkableCourse", () => {
  test("a published course the caller does not teach is saveable", () => {
    expect(bookmarkableCourse({ published: true, isOwnCourse: false })).toEqual({
      eligible: true,
    });
  });

  test("an unpublished course is refused, so a saved list has nothing it cannot show", () => {
    expect(bookmarkableCourse({ published: false, isOwnCourse: false })).toEqual({
      eligible: false,
      reason: "This course is not available to save.",
    });
  });

  test("your own course is refused — the console is where that belongs", () => {
    expect(bookmarkableCourse({ published: true, isOwnCourse: true })).toEqual({
      eligible: false,
      reason: "You teach this course, so there is nothing to save it for.",
    });
  });

  test("an unpublished course you teach reports the unpublished reason", () => {
    // Ordering matters only for which message a person reads; both refusals are
    // correct, and the cheaper-to-explain one comes first.
    expect(bookmarkableCourse({ published: false, isOwnCourse: true })).toEqual({
      eligible: false,
      reason: "This course is not available to save.",
    });
  });
});

describe("MAX_BOOKMARKS", () => {
  test("is a read bound, not a policy — it just has to be positive", () => {
    expect(MAX_BOOKMARKS).toBeGreaterThan(0);
  });
});