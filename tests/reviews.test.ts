import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import type {
  GenericSchema,
  SchemaDefinition,
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
} from "convex/server";

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;
type T = TestConvex<typeof testSchema>;

/** Impersonates a Clerk identity, the same helper shape the other suites use. */
const as = (
  t: T,
  subject: string,
  email = `${subject.replace("clerk_", "")}@test.com`,
) => t.withIdentity({ subject, tokenIdentifier: subject, email });

/**
 * An instructor with two courses, a rival instructor with one, and five
 * learners spread across them.
 *
 * Enrollments are inserted directly rather than through
 * `enrollments.enrollInCourse`: the review policy reads one thing from an
 * enrollment, that it exists, and going through the real mutation would drag the
 * whole payment path into every test here. The one place where the *creation*
 * path matters — an instructor being exempt from paying — is exercised through
 * the real mutation, in its own test.
 */
async function seedWorld(t: T) {
  const now = Date.now();

  const insertUser = (
    clerkId: string,
    name: string | undefined,
    role: "student" | "instructor" | "admin",
    extra: { suspendedAt?: number } = {},
  ) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@test.com`,
        ...(name === undefined ? {} : { name }),
        role,
        ...extra,
        createdAt: now,
      }),
    );

  const instructorId = await insertUser("clerk_instructor", "Ada Instructor", "instructor");
  const rivalId = await insertUser("clerk_rival", "Rex Rival", "instructor");
  const adminId = await insertUser("clerk_admin", "Amina Admin", "admin");
  const learnerIds = await Promise.all(
    ["s1", "s2", "s3", "s4", "s5"].map((tag) =>
      insertUser(`clerk_${tag}`, `Learner ${tag.toUpperCase()}`, "student"),
    ),
  );
  // No name, but an email: the public list must print "A learner", never the
  // address.
  const namelessId = await insertUser("clerk_nameless", undefined, "student");
  const suspendedId = await insertUser("clerk_suspended", "Sam Suspended", "student", {
    suspendedAt: now,
  });

  const insertCourse = (slug: string, owner: Id<"users">, price?: number) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: slug,
        slug,
        description: `${slug} description`,
        instructorId: owner,
        published: true,
        ...(price === undefined ? {} : { price, currency: "NGN" }),
        createdAt: now,
        updatedAt: now,
      }),
    );

  const courseAId = await insertCourse("course-a", instructorId, 500_000);
  const courseBId = await insertCourse("course-b", instructorId);
  const rivalCourseId = await insertCourse("rival-course", rivalId, 500_000);

  const enroll = (userId: Id<"users">, courseId: Id<"courses">) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId,
        courseId,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

  await enroll(learnerIds[0], courseAId);
  await enroll(learnerIds[1], courseAId);
  await enroll(namelessId, courseAId);
  await enroll(suspendedId, courseAId);
  await enroll(learnerIds[2], courseBId);
  await enroll(learnerIds[3], courseBId);
  await enroll(learnerIds[4], courseBId);
  await enroll(learnerIds[0], rivalCourseId);

  return {
    now,
    instructorId,
    rivalId,
    adminId,
    learnerIds,
    namelessId,
    suspendedId,
    courseAId,
    courseBId,
    rivalCourseId,
  };
}

/** The course document as it stands now — where the running total lives. */
function readCourse(t: T, courseId: Id<"courses">) {
  return t.run((ctx: TestCtx) => ctx.db.get(courseId));
}

/** Every review row for a course, straight from the table. */
function readRows(t: T, courseId: Id<"courses">) {
  return t.run((ctx: TestCtx) =>
    ctx.db
      .query("courseReviews")
      .withIndex("by_course", (q) => q.eq("courseId", courseId))
      .collect(),
  );
}

const reviewAs = (
  t: T,
  subject: string,
  courseId: Id<"courses">,
  rating: number,
  comment?: string,
) =>
  as(t, subject).mutation(api.reviews.upsertReview, {
    courseId,
    rating,
    ...(comment === undefined ? {} : { comment }),
  });

const S1 = "clerk_s1";
const S2 = "clerk_s2";
const S3 = "clerk_s3";
const S4 = "clerk_s4";
const S5 = "clerk_s5";

describe("reviews.upsertReview — who may write", () => {
  test("an enrolled learner's rating lands on the course total", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "Excellent, start to finish.");

    const course = await readCourse(t, courseAId);
    expect(course?.ratingCount).toBe(1);
    expect(course?.ratingSum).toBe(5);
  });

  test("a learner who is not enrolled is refused and nothing is written", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    // s3 is enrolled in course B, not A.
    await expect(reviewAs(t, S3, courseAId, 5)).rejects.toThrow(
      "Enroll in this course to leave a review.",
    );

    expect(await readRows(t, courseAId)).toHaveLength(0);
    expect((await readCourse(t, courseAId))?.ratingCount).toBeUndefined();
  });

  test("the course's own instructor is refused, even though enrolling is free for them", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseAId } = await seedWorld(t);

    // Through the real mutation, to make the point that an enrollment row here
    // proves nothing: instructors are exempt from the paid-course check.
    await as(t, "clerk_instructor").mutation(api.enrollments.enrollInCourse, {
      courseId: courseAId,
    });
    const enrolled = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("enrollments")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", instructorId).eq("courseId", courseAId),
        )
        .unique(),
    );
    expect(enrolled).not.toBeNull();

    await expect(reviewAs(t, "clerk_instructor", courseAId, 5)).rejects.toThrow(
      "You teach this course, so you cannot review it.",
    );
  });

  test("another instructor is refused too — their enrollment is not a purchase", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await as(t, "clerk_rival").mutation(api.enrollments.enrollInCourse, {
      courseId: courseAId,
    });

    await expect(reviewAs(t, "clerk_rival", courseAId, 1)).rejects.toThrow(
      "Only learners can review a course.",
    );
  });

  test("an admin is refused: the gate is the role, not seniority", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await expect(reviewAs(t, "clerk_admin", courseAId, 5)).rejects.toThrow(
      "Only learners can review a course.",
    );
  });

  test("a signed-out caller cannot review", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await expect(
      t.mutation(api.reviews.upsertReview, { courseId: courseAId, rating: 5 }),
    ).rejects.toThrow("Not authenticated");
  });

  test("a suspended learner reads as signed out", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await expect(reviewAs(t, "clerk_suspended", courseAId, 1)).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("reviews.upsertReview — what a rating may be", () => {
  test("every whole star from 1 to 5 is accepted", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    for (const rating of [1, 2, 3, 4, 5]) {
      await reviewAs(t, S1, courseAId, rating);
    }

    // Each submit edited the one row, so the total is the last rating only.
    const course = await readCourse(t, courseAId);
    expect(course?.ratingCount).toBe(1);
    expect(course?.ratingSum).toBe(5);
  });

  test("a rating outside 1–5 is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    for (const rating of [0, 6, -3]) {
      await expect(reviewAs(t, S1, courseAId, rating)).rejects.toThrow(
        "Pick a rating from 1 to 5 stars.",
      );
    }
    expect(await readRows(t, courseAId)).toHaveLength(0);
  });

  test("a fractional rating is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await expect(reviewAs(t, S1, courseAId, 4.5)).rejects.toThrow(
      "Pick a rating from 1 to 5 stars.",
    );
  });

  test("an over-long comment is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await expect(
      reviewAs(t, S1, courseAId, 4, "a".repeat(1001)),
    ).rejects.toThrow("Keep your review under 1000 characters.");
  });

  test("a comment is trimmed, and a blank one is stored as absent", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 4, "  Solid course.  ");
    await reviewAs(t, S2, courseAId, 5, "   ");

    const rows = await readRows(t, courseAId);
    const byComment = new Map(rows.map((row) => [row.comment, row] as const));
    expect(byComment.has("Solid course.")).toBe(true);
    expect(byComment.has(undefined)).toBe(true);
  });

  test("ten submissions a minute are fine and the eleventh is throttled", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    for (let i = 0; i < 10; i += 1) {
      await reviewAs(t, S1, courseAId, 4);
    }
    await expect(reviewAs(t, S1, courseAId, 4)).rejects.toThrow(/Too many requests/);
  });
});

describe("reviews.upsertReview — one row per learner per course", () => {
  test("a second submission edits the same row and moves the total by the delta", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "Loved it.");
    await reviewAs(t, S1, courseAId, 2, "Went back and thought about it differently.");

    const rows = await readRows(t, courseAId);
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(2);
    expect(rows[0].comment).toBe("Went back and thought about it differently.");

    const course = await readCourse(t, courseAId);
    expect(course?.ratingCount).toBe(1);
    expect(course?.ratingSum).toBe(2);
  });

  test("two learners on one course are counted separately", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5);
    await reviewAs(t, S2, courseAId, 3);

    const course = await readCourse(t, courseAId);
    expect(course?.ratingCount).toBe(2);
    expect(course?.ratingSum).toBe(8);
  });

  test("editing a review does not touch another course's total", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId, courseBId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5);
    await reviewAs(t, S3, courseBId, 1);
    await reviewAs(t, S1, courseAId, 3);

    expect((await readCourse(t, courseBId))?.ratingSum).toBe(1);
    expect((await readCourse(t, courseBId))?.ratingCount).toBe(1);
  });
});

describe("reviews.deleteReview", () => {
  test("deleting a review takes its rating out of the total", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 4);
    await reviewAs(t, S2, courseAId, 5);

    const removed = await as(t, S1).mutation(api.reviews.deleteReview, {
      courseId: courseAId,
    });

    expect(removed).toBe(true);
    const course = await readCourse(t, courseAId);
    expect(course?.ratingCount).toBe(1);
    expect(course?.ratingSum).toBe(5);
    expect(await readRows(t, courseAId)).toHaveLength(1);
  });

  test("removing the last review leaves the course looking never-reviewed", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 4);
    await as(t, S1).mutation(api.reviews.deleteReview, { courseId: courseAId });

    const course = await readCourse(t, courseAId);
    // Not `0` and `0`: an unrated course and a course whose reviews were all
    // deleted must be the same document.
    expect(course?.ratingSum).toBeUndefined();
    expect(course?.ratingCount).toBeUndefined();
  });

  test("a learner with no review deletes nothing and gets a false, not an error", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    const removed = await as(t, S1).mutation(api.reviews.deleteReview, {
      courseId: courseAId,
    });

    expect(removed).toBe(false);
    expect((await readCourse(t, courseAId))?.ratingCount).toBeUndefined();
  });

  test("one learner cannot delete another learner's review", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5);
    const removed = await as(t, S2).mutation(api.reviews.deleteReview, {
      courseId: courseAId,
    });

    expect(removed).toBe(false);
    expect(await readRows(t, courseAId)).toHaveLength(1);
    expect((await readCourse(t, courseAId))?.ratingSum).toBe(5);
  });
});

describe("reviews.listForCourse", () => {
  test("is readable signed out — this is the list under the stars", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "Worth every naira.");

    const reviews = await t.query(api.reviews.listForCourse, { courseId: courseAId });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].comment).toBe("Worth every naira.");
    expect(reviews[0].authorName).toBe("Learner S1");
  });

  test("is newest first", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "First");
    await reviewAs(t, S2, courseAId, 3, "Second");

    const reviews = await t.query(api.reviews.listForCourse, { courseId: courseAId });
    expect(reviews.map((r) => r.comment)).toEqual(["Second", "First"]);
  });

  test("carries only the fields a public list may show", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "Nice.");

    const [review] = await t.query(api.reviews.listForCourse, { courseId: courseAId });

    expect(Object.keys(review).sort()).toEqual([
      "_id",
      "authorImageUrl",
      "authorName",
      "comment",
      "createdAt",
      "edited",
      "rating",
      "updatedAt",
    ]);
    // The row holds `userId`; the projection must not, and the author's email
    // must never travel with it.
    const serialized = JSON.stringify(review);
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("@test.com");
  });

  test("a reviewer with no name is 'A learner', not their email address", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, "clerk_nameless", courseAId, 4);

    const [review] = await t.query(api.reviews.listForCourse, { courseId: courseAId });
    expect(review.authorName).toBe("A learner");
    expect(JSON.stringify(review)).not.toContain("clerk_nameless@test.com");
  });

  test("an edited review is marked as edited and carries no comment when there is none", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 3, undefined);
    const [before] = await t.query(api.reviews.listForCourse, { courseId: courseAId });
    expect(before.edited).toBe(false);
    expect(before.comment).toBeNull();

    await reviewAs(t, S1, courseAId, 4, "Changed my mind.");
    const [after] = await t.query(api.reviews.listForCourse, { courseId: courseAId });
    expect(after.edited).toBe(true);
  });

  test("says nothing about other courses", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId, courseBId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "On A");
    await reviewAs(t, S3, courseBId, 1, "On B");

    const reviews = await t.query(api.reviews.listForCourse, { courseId: courseAId });
    expect(reviews.map((r) => r.comment)).toEqual(["On A"]);
  });
});

describe("reviews.getReviewerState", () => {
  test("signed out, it reports the same reason the write would give", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    const state = await t.query(api.reviews.getReviewerState, { courseId: courseAId });

    expect(state).toEqual({
      signedIn: false,
      canReview: false,
      reason: "Sign in to leave a review.",
      review: null,
    });
  });

  test("an enrolled learner is offered the form, with no review yet", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    const state = await as(t, S1).query(api.reviews.getReviewerState, {
      courseId: courseAId,
    });

    expect(state.canReview).toBe(true);
    expect(state.reason).toBeNull();
    expect(state.review).toBeNull();
  });

  test("after reviewing, the state carries the review so the form can edit it", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 4, "Good.");

    const state = await as(t, S1).query(api.reviews.getReviewerState, {
      courseId: courseAId,
    });
    expect(state.review?.rating).toBe(4);
    expect(state.review?.comment).toBe("Good.");
  });

  test("a non-enrolled learner is told to enroll", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    const state = await as(t, S3).query(api.reviews.getReviewerState, {
      courseId: courseAId,
    });
    expect(state.canReview).toBe(false);
    expect(state.reason).toBe("Enroll in this course to leave a review.");
  });

  test("the instructor is told they cannot review their own course", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    const state = await as(t, "clerk_instructor").query(
      api.reviews.getReviewerState,
      { courseId: courseAId },
    );
    expect(state.canReview).toBe(false);
    expect(state.reason).toBe("You teach this course, so you cannot review it.");
  });

  test("the query and the mutation agree: anyone the state admits can actually write", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    for (const subject of [S1, S2, S3, "clerk_instructor", "clerk_rival", "clerk_admin"]) {
      const state = await as(t, subject).query(api.reviews.getReviewerState, {
        courseId: courseAId,
      });
      if (!state.canReview) continue;
      await expect(reviewAs(t, subject, courseAId, 5)).resolves.toBeTruthy();
    }

    // s1 and s2 are the enrolled learners; nobody else got through.
    expect((await readCourse(t, courseAId))?.ratingCount).toBe(2);
  });
});

describe("the denormalized total stays exact", () => {
  test("a run of creates, edits and deletes lands on the same numbers as a full recount", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "Great.");
    await reviewAs(t, S2, courseAId, 2, "Not for me.");
    await reviewAs(t, S1, courseAId, 1, "Downgrading after the update.");
    await as(t, S2).mutation(api.reviews.deleteReview, { courseId: courseAId });
    await reviewAs(t, S1, courseAId, 3, "Fair enough.");
    await as(t, "clerk_nameless").mutation(api.reviews.upsertReview, {
      courseId: courseAId,
      rating: 4,
    });

    const incremental = await readCourse(t, courseAId);
    const recomputed = await t.mutation(internal.reviews.recomputeCourseRating, {
      courseId: courseAId,
    });

    expect(recomputed).toEqual({
      ratingSum: incremental?.ratingSum,
      ratingCount: incremental?.ratingCount,
    });
    // And the arithmetic is what it looks like: 3 + 4 over two reviews.
    expect(recomputed).toEqual({ ratingSum: 7, ratingCount: 2 });
  });

  test("a course whose reviews were all deleted recomputes back to never-reviewed", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5);
    await as(t, S1).mutation(api.reviews.deleteReview, { courseId: courseAId });

    const recomputed = await t.mutation(internal.reviews.recomputeCourseRating, {
      courseId: courseAId,
    });
    expect(recomputed).toEqual({ ratingSum: undefined, ratingCount: undefined });
  });
});

describe("reviews.listForInstructor", () => {
  test("is null for a learner and for a signed-out visitor", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    expect(
      await as(t, S1).query(api.reviews.listForInstructor, {}),
    ).toBeNull();
    expect(await t.query(api.reviews.listForInstructor, {})).toBeNull();
  });

  test("an instructor sees only their own courses", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId, rivalCourseId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5, "Mine.");
    await reviewAs(t, S1, rivalCourseId, 1, "Not mine.");

    const summary = await as(t, "clerk_instructor").query(
      api.reviews.listForInstructor,
      {},
    );

    expect(summary?.courseCount).toBe(2);
    expect(summary?.recent.map((r) => r.comment)).toEqual(["Mine."]);
    expect(summary?.ratingCount).toBe(1);
  });

  test("the headline average is weighted by review count, not a mean of means", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId, courseBId } = await seedWorld(t);

    // One 5-star on course A, three 1-stars on course B.
    await reviewAs(t, S1, courseAId, 5);
    await reviewAs(t, S3, courseBId, 1);
    await reviewAs(t, S4, courseBId, 1);
    await reviewAs(t, S5, courseBId, 1);

    const summary = await as(t, "clerk_instructor").query(
      api.reviews.listForInstructor,
      {},
    );

    // (5 + 1 + 1 + 1) / 4 = 2, not the 3 a mean of the two course averages gives.
    expect(summary?.ratingCount).toBe(4);
    expect(summary?.average).toBeCloseTo(2);
    expect(summary?.ratedCourseCount).toBe(2);
  });

  test("rated courses lead, worst average first, with unrated ones after", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId, courseBId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5);
    await reviewAs(t, S3, courseBId, 1);

    const summary = await as(t, "clerk_instructor").query(
      api.reviews.listForInstructor,
      {},
    );

    expect(summary?.courses.map((c) => c.title)).toEqual(["course-b", "course-a"]);
  });

  test("an unrated instructor gets an empty block rather than a broken one", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const summary = await as(t, "clerk_instructor").query(
      api.reviews.listForInstructor,
      {},
    );

    expect(summary).toMatchObject({
      average: null,
      ratingCount: 0,
      ratedCourseCount: 0,
      recent: [],
    });
    expect(summary?.courses.every((c) => c.average === null)).toBe(true);
  });

  test("recent feedback carries its course title, so one place is enough to read it", async () => {
    const t = convexTest(testSchema, modules);
    const { courseBId } = await seedWorld(t);

    await reviewAs(t, S3, courseBId, 2, "Pacing was off.");

    const summary = await as(t, "clerk_instructor").query(
      api.reviews.listForInstructor,
      {},
    );

    expect(summary?.recent[0].courseTitle).toBe("course-b");
    expect(summary?.recent[0].courseSlug).toBe("course-b");
    expect(summary?.recent[0].comment).toBe("Pacing was off.");
  });

  test("an admin who teaches reads their own courses, not the platform's", async () => {
    const t = convexTest(testSchema, modules);
    const { courseAId } = await seedWorld(t);

    await reviewAs(t, S1, courseAId, 5);

    const summary = await as(t, "clerk_admin").query(
      api.reviews.listForInstructor,
      {},
    );

    // The admin owns nothing in this world.
    expect(summary?.courseCount).toBe(0);
    expect(summary?.ratingCount).toBe(0);
  });
});
