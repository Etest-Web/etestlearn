import { describe, expect, test } from "vitest";
import {
  REVIEW_COMMENT_MAX_LENGTH,
  averageRating,
  formatRating,
  instructorReviewEligibility,
  normalizeComment,
  ratingLabel,
  ratingPatch,
  ratingPatchOf,
  reviewDraftError,
  reviewEligibility,
  starFill,
} from "./reviews";

describe("normalizeComment", () => {
  test("trims, and treats blank as absent rather than as an empty string", () => {
    expect(normalizeComment("  Great course  ")).toBe("Great course");
    expect(normalizeComment("")).toBeUndefined();
    expect(normalizeComment("   \n\t ")).toBeUndefined();
    expect(normalizeComment(null)).toBeUndefined();
    expect(normalizeComment(undefined)).toBeUndefined();
  });

  test("keeps inner newlines, because a review can be more than one line", () => {
    expect(normalizeComment("One.\n\nTwo.")).toBe("One.\n\nTwo.");
  });
});

describe("reviewDraftError", () => {
  test("accepts every whole star from 1 to 5", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(reviewDraftError({ rating })).toBeNull();
    }
  });

  test("rejects a rating that is not a whole star in range", () => {
    for (const rating of [0, 6, -1, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reviewDraftError({ rating })).toMatch(/1 to 5 stars/);
    }
  });

  test("accepts a comment at the cap and rejects one past it", () => {
    expect(
      reviewDraftError({ rating: 5, comment: "a".repeat(REVIEW_COMMENT_MAX_LENGTH) }),
    ).toBeNull();
    expect(
      reviewDraftError({ rating: 5, comment: "a".repeat(REVIEW_COMMENT_MAX_LENGTH + 1) }),
    ).toMatch(/under 1000 characters/);
  });

  test("measures the comment after trimming, so padding is not a violation", () => {
    const padded = `  ${"a".repeat(REVIEW_COMMENT_MAX_LENGTH)}  `;
    expect(reviewDraftError({ rating: 3, comment: padded })).toBeNull();
  });

  test("a rating with no comment is fine", () => {
    expect(reviewDraftError({ rating: 4, comment: "" })).toBeNull();
    expect(reviewDraftError({ rating: 4, comment: undefined })).toBeNull();
  });
});

describe("ratingLabel", () => {
  test("singular only at one star", () => {
    expect(ratingLabel(1)).toBe("1 out of 5 star");
    expect(ratingLabel(4)).toBe("4 out of 5 stars");
  });
});

describe("averageRating / formatRating", () => {
  test("is null when a course has no ratings", () => {
    expect(averageRating(undefined, undefined)).toBeNull();
    expect(averageRating(0, 0)).toBeNull();
    expect(averageRating(5, 0)).toBeNull();
    expect(formatRating(null)).toBeNull();
  });

  test("is the mean of the running total, unrounded", () => {
    expect(averageRating(25, 5)).toBe(5);
    expect(averageRating(23, 5)).toBe(4.6);
  });

  test("formats to one decimal place", () => {
    expect(formatRating(5)).toBe("5.0");
    expect(formatRating(23 / 5)).toBe("4.6");
    expect(formatRating(17 / 4)).toBe("4.3");
  });
});

describe("starFill", () => {
  test("a whole rating fills whole stars and leaves the rest empty", () => {
    expect([0, 1, 2, 3, 4].map((i) => starFill(3, i))).toEqual([1, 1, 1, 0, 0]);
  });

  test("a fractional average fills the next star partially", () => {
    expect([0, 1, 2, 3].map((i) => starFill(4.6, i))).toEqual([1, 1, 1, 1]);
    expect(starFill(4.6, 4)).toBeCloseTo(0.6);
    // Floating point means the partial value is compared loosely.
    expect(starFill(4.7, 4)).toBeCloseTo(0.7);
  });

  test("a zero average fills nothing", () => {
    expect([0, 1, 2, 3, 4].map((i) => starFill(0, i))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("reviewEligibility", () => {
  const enrolledLearner = {
    signedIn: true,
    role: "student",
    isCourseInstructor: false,
    isEnrolled: true,
  };

  test("an enrolled learner may review", () => {
    expect(reviewEligibility(enrolledLearner)).toEqual({ eligible: true });
  });

  test("a signed-out visitor is told to sign in first", () => {
    expect(reviewEligibility({ ...enrolledLearner, signedIn: false })).toEqual({
      eligible: false,
      reason: "Sign in to leave a review.",
    });
  });

  test("the course's own instructor cannot review it, whatever their role", () => {
    // Checked before the role gate, so the message names the real reason.
    expect(reviewEligibility({ ...enrolledLearner, isCourseInstructor: true })).toEqual({
      eligible: false,
      reason: "You teach this course, so you cannot review it.",
    });
    expect(
      reviewEligibility({ ...enrolledLearner, role: "admin", isCourseInstructor: true }),
    ).toEqual({
      eligible: false,
      reason: "You teach this course, so you cannot review it.",
    });
  });

  test("another instructor cannot review, even though enrollment is free for them", () => {
    // `enrollInCourse` exempts instructors from paying, so their enrollment row
    // is not proof of a purchase; letting them through would be a free way to
    // rate a competitor's course.
    expect(reviewEligibility({ ...enrolledLearner, role: "instructor" })).toEqual({
      eligible: false,
      reason: "Only learners can review a course.",
    });
    expect(reviewEligibility({ ...enrolledLearner, role: "admin" })).toEqual({
      eligible: false,
      reason: "Only learners can review a course.",
    });
    expect(reviewEligibility({ ...enrolledLearner, role: undefined })).toEqual({
      eligible: false,
      reason: "Only learners can review a course.",
    });
  });

  test("a learner who is not enrolled is told to enroll", () => {
    expect(reviewEligibility({ ...enrolledLearner, isEnrolled: false })).toEqual({
      eligible: false,
      reason: "Enroll in this course to leave a review.",
    });
  });
});

describe("ratingPatch", () => {
  test("the first review seeds the pair", () => {
    expect(ratingPatch({}, { sum: 5, count: 1 })).toEqual({ ratingSum: 5, ratingCount: 1 });
  });

  test("an added review moves both halves of the pair", () => {
    expect(ratingPatch({ ratingSum: 5, ratingCount: 1 }, { sum: 3, count: 1 })).toEqual({
      ratingSum: 8,
      ratingCount: 2,
    });
  });

  test("an edited review moves the sum by the delta and not the count", () => {
    // 5 stars changed to 2: the sum loses 3, the count is untouched.
    expect(ratingPatch({ ratingSum: 8, ratingCount: 2 }, { sum: -3, count: 0 })).toEqual({
      ratingSum: 5,
      ratingCount: 2,
    });
  });

  test("the last review removed clears both fields rather than zeroing them", () => {
    expect(ratingPatch({ ratingSum: 5, ratingCount: 1 }, { sum: -5, count: -1 })).toEqual({
      ratingSum: undefined,
      ratingCount: undefined,
    });
  });

  test("an unrated course reads as zero, and removing from zero stays unrated", () => {
    expect(ratingPatch({}, { sum: 0, count: 0 })).toEqual({
      ratingSum: undefined,
      ratingCount: undefined,
    });
  });

  test("the pair stays exact across a long run of writes and undoes", () => {
    // This is the invariant the tests in `tests/reviews.test.ts` check against a
    // full recount; here it is checked as arithmetic, over enough writes that a
    // stuck fractional average would show up.
    let course: { ratingSum?: number; ratingCount?: number } = {};
    const ratings = [5, 3, 4, 4, 1, 5, 2];
    for (const r of ratings) {
      course = ratingPatch(course, { sum: r, count: 1 });
    }
    expect(course).toEqual({
      ratingSum: 24,
      ratingCount: 7,
    });
    // Change the 1-star to a 5-star, then delete it.
    course = ratingPatch(course, { sum: 4, count: 0 });
    expect(course).toEqual({ ratingSum: 28, ratingCount: 7 });
    course = ratingPatch(course, { sum: -5, count: -1 });
    expect(course).toEqual({ ratingSum: 23, ratingCount: 6 });
    // And the mean still equals the mean of the six that remain.
    const remaining = [5, 3, 4, 4, 5, 2];
    expect(course.ratingSum).toBe(remaining.reduce((a, b) => a + b, 0));
    expect(averageRating(course.ratingSum, course.ratingCount)).toBeCloseTo(23 / 6);
  });

  test("ratingPatch is the course pair and nothing else", () => {
    // The wrapper exists so a caller that is *not* about a course has to name its
    // fields. If this ever starts accepting instructor names, the two
    // denormalizations on `users` and `courses` can silently swap.
    expect(
      ratingPatch({ ratingSum: 5, ratingCount: 1 }, { sum: 1, count: 1 }),
    ).toEqual({ ratingSum: 6, ratingCount: 2 });
  });
});

describe("ratingPatchOf", () => {
  const TOTAL = { sum: "instructorRatingSum", count: "instructorRatingCount" } as const;

  test("writes the names it was given, not the course ones", () => {
    const patch = ratingPatchOf({}, { sum: 5, count: 1 }, TOTAL);
    expect(patch).toEqual({ instructorRatingSum: 5, instructorRatingCount: 1 });
    expect(patch).not.toHaveProperty("ratingSum");
  });

  test("does the same arithmetic as the course pair", () => {
    expect(
      ratingPatchOf(
        { instructorRatingSum: 5, instructorRatingCount: 1 },
        { sum: 3, count: 1 },
        TOTAL,
      ),
    ).toEqual({ instructorRatingSum: 8, instructorRatingCount: 2 });
  });

  test("an edited rating moves the sum by the delta and not the count", () => {
    expect(
      ratingPatchOf(
        { instructorRatingSum: 8, instructorRatingCount: 2 },
        { sum: -3, count: 0 },
        TOTAL,
      ),
    ).toEqual({ instructorRatingSum: 5, instructorRatingCount: 2 });
  });

  test("the last review removed clears both fields under their own names", () => {
    const patch = ratingPatchOf(
      { instructorRatingSum: 5, instructorRatingCount: 1 },
      { sum: -5, count: -1 },
      TOTAL,
    );
    expect(patch).toEqual({
      instructorRatingSum: undefined,
      instructorRatingCount: undefined,
    });
    expect(patch).not.toHaveProperty("ratingSum");
  });

  test("stays exact across a long run of writes and undos", () => {
    let instructor: { instructorRatingSum?: number; instructorRatingCount?: number } = {};
    for (const r of [5, 3, 4, 4, 1, 5, 2]) {
      instructor = ratingPatchOf(instructor, { sum: r, count: 1 }, TOTAL);
    }
    expect(instructor).toEqual({ instructorRatingSum: 24, instructorRatingCount: 7 });
    instructor = ratingPatchOf(instructor, { sum: 4, count: 0 }, TOTAL);
    instructor = ratingPatchOf(instructor, { sum: -5, count: -1 }, TOTAL);
    expect(instructor).toEqual({ instructorRatingSum: 23, instructorRatingCount: 6 });
  });
});

describe("instructorReviewEligibility", () => {
  const eligible = {
    signedIn: true,
    role: "student",
    isSelf: false,
    tookTheirCourse: true,
  };

  test("a student who took one of their courses may rate them", () => {
    expect(instructorReviewEligibility(eligible)).toEqual({ eligible: true });
  });

  test("a signed-out visitor is offered a sign-in", () => {
    expect(
      instructorReviewEligibility({ ...eligible, signedIn: false }),
    ).toEqual({ eligible: false, reason: "Sign in to leave a review." });
  });

  test("you cannot rate yourself, and the message says so rather than blaming the role", () => {
    // The self check runs before the role check so the person looking at their
    // own profile reads "you cannot review yourself", not the confusing "only
    // learners can review an instructor".
    expect(instructorReviewEligibility({ ...eligible, role: "instructor", isSelf: true })).toEqual({
      eligible: false,
      reason: "You cannot review yourself.",
    });
  });

  test("a rival instructor is refused on role, not on what they have taken", () => {
    expect(
      instructorReviewEligibility({ ...eligible, role: "instructor", tookTheirCourse: true }),
    ).toEqual({ eligible: false, reason: "Only learners can review an instructor." });
  });

  test("an admin is refused too — the gate is the role, not seniority", () => {
    expect(
      instructorReviewEligibility({ ...eligible, role: "admin", tookTheirCourse: true }),
    ).toEqual({ eligible: false, reason: "Only learners can review an instructor." });
  });

  test("a student who has taken nothing of theirs is refused", () => {
    expect(
      instructorReviewEligibility({ ...eligible, tookTheirCourse: false }),
    ).toEqual({
      eligible: false,
      reason: "Enroll in one of this instructor's courses to leave a review.",
    });
  });

  test("the role is checked before the enrollment, so the refusal names the real obstacle", () => {
    // Both gates fail here; the message should be the one a reader can act on
    // first, which is the role, not an enrollment they would still not qualify
    // for.
    expect(instructorReviewEligibility({ ...eligible, role: "admin", tookTheirCourse: false }))
      .toEqual({ eligible: false, reason: "Only learners can review an instructor." });
  });
});
