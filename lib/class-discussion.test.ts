import { describe, expect, test } from "vitest";
import {
  CLASS_COMMENT_BODY_MAX_LENGTH,
  MAX_COMMENT_DEPTH,
  classCommentDraftError,
  classCommentEligibility,
  classCommentReplyEligibility,
  normalizeCommentBody,
  replyDepth,
} from "./class-discussion";

describe("classCommentEligibility — who may post", () => {
  const finished = {
    signedIn: true,
    isCourseInstructor: false,
    enrolled: true,
    completedCourse: true,
  };

  test("a learner who finished the course may post", () => {
    expect(classCommentEligibility(finished)).toEqual({ eligible: true });
  });

  test("a signed-out visitor is offered a sign-in, and learns nothing else", () => {
    // The signed-out branch is first precisely so an anonymous visitor cannot
    // distinguish "not enrolled" from "not finished" by the message.
    expect(
      classCommentEligibility({ ...finished, signedIn: false, enrolled: false }),
    ).toEqual({ eligible: false, reason: "Sign in to share your experience." });
  });

  test("the instructor is told they may reply rather than post", () => {
    // The instructor is the one person who must always be able to answer, so the
    // refusal has to name the thing they *can* do.
    const result = classCommentEligibility({ ...finished, isCourseInstructor: true });
    expect(result).toEqual({
      eligible: false,
      reason: "You teach this course — you can reply, but not post a review of it.",
    });
  });

  test("an enrolled learner who has not finished is told why", () => {
    expect(classCommentEligibility({ ...finished, completedCourse: false })).toEqual({
      eligible: false,
      reason: "Finish every lesson and pass the quizzes to share your experience.",
    });
  });

  test("someone who never enrolled is told that, not that they have not finished", () => {
    // Both gates fail here; the one they can act on is enrolment.
    expect(
      classCommentEligibility({ ...finished, enrolled: false, completedCourse: false }),
    ).toEqual({
      eligible: false,
      reason: "Only people who took this course can post about it.",
    });
  });

  test("self-reporting the instructor wins over a missing enrollment", () => {
    expect(
      classCommentEligibility({
        signedIn: true,
        isCourseInstructor: true,
        enrolled: false,
        completedCourse: false,
      }).eligible,
    ).toBe(false);
  });
});

describe("classCommentReplyEligibility — who may reply", () => {
  test("a signed-in viewer may reply to a top-level post", () => {
    expect(classCommentReplyEligibility({ signedIn: true, parentDepth: 0 })).toEqual({
      eligible: true,
    });
  });

  test("replying is NOT gated on having finished the course", () => {
    // There is no completion input here at all, and that is deliberate: a thread
    // only the certified-finished may enter is a testimonial wall, and the
    // people most likely to reply to a teacher's answer are still working
    // through it. Asserted by the signature rather than by a case.
    expect(classCommentReplyEligibility({ signedIn: true, parentDepth: 2 })).toEqual({
      eligible: true,
    });
  });

  test("a signed-out visitor is offered a sign-in", () => {
    expect(classCommentReplyEligibility({ signedIn: false, parentDepth: 0 })).toEqual({
      eligible: false,
      reason: "Sign in to join the conversation.",
    });
  });

  test("the last allowed depth refuses and points up the thread", () => {
    const result = classCommentReplyEligibility({
      signedIn: true,
      parentDepth: MAX_COMMENT_DEPTH,
    });
    expect(result.eligible).toBe(false);
    expect(result).toEqual({
      eligible: false,
      reason: "This thread is as deep as it goes — reply to the comment above instead.",
    });
  });

  test("one below the cap is still allowed", () => {
    expect(
      classCommentReplyEligibility({ signedIn: true, parentDepth: MAX_COMMENT_DEPTH - 1 })
        .eligible,
    ).toBe(true);
  });
});

describe("normalizeCommentBody", () => {
  test("trims", () => {
    expect(normalizeCommentBody("  a real post ")).toBe("a real post");
  });

  test("whitespace-only is absent", () => {
    expect(normalizeCommentBody("   \n\t ")).toBeUndefined();
    expect(normalizeCommentBody("")).toBeUndefined();
    expect(normalizeCommentBody(null)).toBeUndefined();
  });
});

describe("classCommentDraftError", () => {
  test("accepts a real post", () => {
    expect(classCommentDraftError({ body: "The final project took me two weeks." })).toBeNull();
  });

  test("a blank post is refused", () => {
    expect(classCommentDraftError({ body: "   " })).toBe("Write something before posting.");
  });

  test("a one-word post is fine — a real experience can be short", () => {
    // Refusing a one-word retrospective would be the platform editing somebody's
    // account of their own time.
    expect(classCommentDraftError({ body: "Great" })).toBeNull();
  });

  test("exactly at the cap is fine; one over is not", () => {
    expect(classCommentDraftError({ body: "x".repeat(CLASS_COMMENT_BODY_MAX_LENGTH) })).toBeNull();
    expect(
      classCommentDraftError({ body: "x".repeat(CLASS_COMMENT_BODY_MAX_LENGTH + 1) }),
    ).toBe(`Keep your post under ${CLASS_COMMENT_BODY_MAX_LENGTH} characters.`);
  });

  test("length is measured after trimming, so padding does not buy room", () => {
    expect(
      classCommentDraftError({
        body: `  ${"x".repeat(CLASS_COMMENT_BODY_MAX_LENGTH)}  `,
      }),
    ).toBeNull();
  });
});

describe("replyDepth", () => {
  test("a top-level post is depth 0, so its reply is depth 1", () => {
    expect(replyDepth(0)).toBe(1);
  });

  test("is exactly one deeper than its parent", () => {
    for (const parent of [0, 1, 2, 3, 4]) {
      expect(replyDepth(parent)).toBe(parent + 1);
    }
  });

  test("the cap is reachable from the top: depth 5 can be written, 6 cannot", () => {
    // Guards the two ends agreeing — `MAX_COMMENT_DEPTH` is compared against a
    // parent's depth in the eligibility check, and produced here.
    expect(classCommentReplyEligibility({ signedIn: true, parentDepth: MAX_COMMENT_DEPTH - 1 }).eligible).toBe(true);
    expect(classCommentReplyEligibility({ signedIn: true, parentDepth: MAX_COMMENT_DEPTH }).eligible).toBe(false);
  });
});