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

const as = (t: T, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject, email: `${subject}@test.com` });

/**
 * One instructor with two courses, a rival with one, and learners spread across
 * all of them.
 *
 * Enrollments are inserted directly: the instructor-review gate reads exactly
 * one thing from an enrollment — that it exists — and going through
 * `enrollments.enrollInCourse` would drag the payment path into every test here.
 * The one behaviour that genuinely depends on the *creation* path (staff being
 * exempt from paying, which is why an instructor cannot rate a competitor) is
 * asserted separately, from the role gate.
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

  const instructorId = await insertUser("clerk_ada", "Ada Instructor", "instructor");
  const rivalId = await insertUser("clerk_rex", "Rex Rival", "instructor");
  const adminId = await insertUser("clerk_admin", "Amina Admin", "admin");

  // Took one of Ada's courses.
  const studentId = await insertUser("clerk_student", "Lee Learner", "student");
  // Signed in, but has only ever taken Rex's.
  const strangerId = await insertUser("clerk_stranger", "Noa Stranger", "student");
  // No name, but an email: the public list must print "A student".
  const namelessId = await insertUser("clerk_nameless", undefined, "student");
  const suspendedId = await insertUser("clerk_suspended", "Sam Suspended", "student", {
    suspendedAt: now,
  });
  // A second student who took Ada's, so a per-reviewer check is provable.
  const student2Id = await insertUser("clerk_student2", "Kim Second", "student");

  const insertCourse = (slug: string, owner: Id<"users">, published = true) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: slug,
        slug,
        description: `${slug} description`,
        instructorId: owner,
        published,
        createdAt: now,
        updatedAt: now,
      }),
    );

  const courseAId = await insertCourse("course-a", instructorId);
  const courseBId = await insertCourse("course-b", instructorId);
  const rivalCourseId = await insertCourse("rival-course", rivalId);

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

  await enroll(studentId, courseAId);
  await enroll(student2Id, courseBId);
  await enroll(namelessId, courseAId);
  await enroll(suspendedId, courseAId);
  await enroll(strangerId, rivalCourseId);

  return {
    now,
    instructorId,
    rivalId,
    adminId,
    studentId,
    student2Id,
    strangerId,
    namelessId,
    suspendedId,
    courseAId,
    courseBId,
    rivalCourseId,
  };
}

/** The user document as it stands — where the running total lives. */
function readUser(t: T, userId: Id<"users">) {
  return t.run((ctx: TestCtx) => ctx.db.get(userId));
}

/** Every review row for an instructor, straight from the table. */
function readRows(t: T, instructorId: Id<"users">) {
  return t.run((ctx: TestCtx) =>
    ctx.db
      .query("instructorReviews")
      .withIndex("by_instructor", (q) => q.eq("instructorId", instructorId))
      .collect(),
  );
}

const rateAs = (
  t: T,
  subject: string,
  instructorId: Id<"users">,
  rating: number,
  comment?: string,
) =>
  as(t, subject).mutation(api.instructorReviews.upsertInstructorReview, {
    instructorId,
    rating,
    ...(comment === undefined ? {} : { comment }),
  });

describe("instructorReviews.upsertInstructorReview — who may write", () => {
  test("a student who took one of their courses lands on the instructor total", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);

    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBe(5);
    expect(instructor?.instructorRatingCount).toBe(1);
  });

  test("being taught on ANY of their courses is enough, not a specific one", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    // student2 is enrolled on course-b only, never course-a.
    await rateAs(t, "clerk_student2", w.instructorId, 4);

    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBe(4);
  });

  test("a signed-in student who took a rival's course is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(rateAs(t, "clerk_stranger", w.instructorId, 1)).rejects.toThrow(
      /Enroll in one of this instructor's courses/,
    );

    expect(await readRows(t, w.instructorId)).toHaveLength(0);
    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBeUndefined();
  });

  test("an instructor cannot review themselves", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(rateAs(t, "clerk_ada", w.instructorId, 5)).rejects.toThrow(
      /cannot review yourself/,
    );
    expect(await readRows(t, w.instructorId)).toHaveLength(0);
  });

  test("a rival instructor is refused: they never bought anything either", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    // Enrolled or not, the role gate refuses before the intersection is even
    // computed — the same reason an instructor cannot review a competitor's
    // course.
    await expect(rateAs(t, "clerk_rex", w.instructorId, 1)).rejects.toThrow(
      /Only learners can review an instructor/,
    );
  });

  test("an admin is refused: the gate is the role, not seniority", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(rateAs(t, "clerk_admin", w.instructorId, 5)).rejects.toThrow(
      /Only learners can review an instructor/,
    );
  });

  test("a signed-out caller cannot rate", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(
      t.mutation(api.instructorReviews.upsertInstructorReview, {
        instructorId: w.instructorId,
        rating: 5,
      }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("a suspended learner reads as signed out", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(rateAs(t, "clerk_suspended", w.instructorId, 5)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  test("a nonexistent instructor is refused rather than creating a dangling review", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const ghostId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_ghost",
        role: "instructor",
        createdAt: w.now,
      }),
    );
    await t.run((ctx: TestCtx) => ctx.db.delete(ghostId));

    await expect(rateAs(t, "clerk_student", ghostId, 5)).rejects.toThrow(
      /Instructor not found/,
    );
  });
});

describe("instructorReviews.upsertInstructorReview — what a rating may be", () => {
  test("every whole star from 1 to 5 is accepted", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    // One learner, five submissions: each replaces the last, so the surviving
    // row is the final value. That the loop completes at all is the assertion —
    // a rejected star would throw before the second read.
    for (const rating of [1, 2, 3, 4, 5]) {
      await rateAs(t, "clerk_student", w.instructorId, rating);
    }

    const rows = await readRows(t, w.instructorId);
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(5);

    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBe(5);
    expect(instructor?.instructorRatingCount).toBe(1);
  });

  test("a rating outside 1–5 is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(rateAs(t, "clerk_student", w.instructorId, 6)).rejects.toThrow(
      /1 to 5 stars/,
    );
    await expect(rateAs(t, "clerk_student", w.instructorId, 0)).rejects.toThrow(
      /1 to 5 stars/,
    );
  });

  test("a fractional rating is refused — the same rule the course gate uses", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(rateAs(t, "clerk_student", w.instructorId, 4.5)).rejects.toThrow(
      /1 to 5 stars/,
    );
  });

  test("a comment is trimmed, and a blank one is stored as absent", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5, "  Clear and patient  ");
    await rateAs(t, "clerk_student2", w.instructorId, 4, "   ");

    const rows = await readRows(t, w.instructorId);
    expect(rows.find((r) => r.userId === w.studentId)?.comment).toBe("Clear and patient");
    expect(rows.find((r) => r.userId === w.student2Id)?.comment).toBeUndefined();
  });

  test("ten submissions a minute are fine and the eleventh is throttled", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    for (let i = 0; i < 10; i += 1) {
      await rateAs(t, "clerk_student", w.instructorId, 5);
    }
    await expect(rateAs(t, "clerk_student", w.instructorId, 5)).rejects.toThrow(
      /Too many|rate limit/i,
    );
  });
});

describe("instructorReviews — one row per learner per instructor", () => {
  test("a second submission edits the same row and moves the total by the delta", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await rateAs(t, "clerk_student", w.instructorId, 2);

    const rows = await readRows(t, w.instructorId);
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(2);

    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBe(2);
    expect(instructor?.instructorRatingCount).toBe(1);
  });

  test("two learners on different courses are counted separately", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await rateAs(t, "clerk_student2", w.instructorId, 3);

    expect(await readRows(t, w.instructorId)).toHaveLength(2);
    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBe(8);
    expect(instructor?.instructorRatingCount).toBe(2);
  });

  test("rating a rival does not touch this instructor's total", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await rateAs(t, "clerk_stranger", w.rivalId, 1);

    const ada = await readUser(t, w.instructorId);
    const rex = await readUser(t, w.rivalId);
    expect(ada?.instructorRatingCount).toBe(1);
    expect(rex?.instructorRatingCount).toBe(1);
    expect(rex?.instructorRatingSum).toBe(1);
  });
});

describe("instructorReviews.deleteInstructorReview", () => {
  test("deleting takes the rating out of the total", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await rateAs(t, "clerk_student2", w.instructorId, 3);

    const deleted = await as(t, "clerk_student").mutation(
      api.instructorReviews.deleteInstructorReview,
      { instructorId: w.instructorId },
    );
    expect(deleted).toBe(true);

    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBe(3);
    expect(instructor?.instructorRatingCount).toBe(1);
  });

  test("removing the last review leaves the instructor looking never-rated", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await as(t, "clerk_student").mutation(
      api.instructorReviews.deleteInstructorReview,
      { instructorId: w.instructorId },
    );

    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBeUndefined();
    expect(instructor?.instructorRatingCount).toBeUndefined();
  });

  test("a learner with no review deletes nothing and gets a false, not an error", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const deleted = await as(t, "clerk_student").mutation(
      api.instructorReviews.deleteInstructorReview,
      { instructorId: w.instructorId },
    );
    expect(deleted).toBe(false);
  });

  test("one learner cannot delete another's review", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await as(t, "clerk_student2").mutation(
      api.instructorReviews.deleteInstructorReview,
      { instructorId: w.instructorId },
    );

    expect(await readRows(t, w.instructorId)).toHaveLength(1);
    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingCount).toBe(1);
  });
});

describe("instructorReviews.listForInstructor — the public read", () => {
  test("is readable signed out — it is the list under the stars on a profile", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await rateAs(t, "clerk_student", w.instructorId, 5, "Great");

    const data = await t.query(api.instructorReviews.listForInstructor, {
      instructorId: w.instructorId,
    });
    expect(data?.average).toBe(5);
    expect(data?.ratingCount).toBe(1);
    expect(data?.reviews[0].comment).toBe("Great");
  });

  test("carries no author id — the author is a name and a face", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await rateAs(t, "clerk_student", w.instructorId, 5);

    const data = await t.query(api.instructorReviews.listForInstructor, {
      instructorId: w.instructorId,
    });
    const review = data?.reviews[0];
    expect(review).not.toHaveProperty("userId");
    expect(review?.authorName).toBe("Lee Learner");
    // The row's own instructor id never survives the projection — the caller
    // already has it as an argument, and printing it would only invite a spread.
    expect(Object.keys(review ?? {})).not.toContain("instructorId");
  });

  test("a reviewer with no name is 'A student', not their email address", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await rateAs(t, "clerk_nameless", w.instructorId, 5);

    const data = await t.query(api.instructorReviews.listForInstructor, {
      instructorId: w.instructorId,
    });
    expect(data?.reviews[0].authorName).toBe("A student");
    expect(JSON.stringify(data)).not.toContain("@test.com");
  });

  test("an unrated instructor reads as null rather than as zero stars", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const data = await t.query(api.instructorReviews.listForInstructor, {
      instructorId: w.instructorId,
    });
    expect(data?.average).toBeNull();
    expect(data?.ratingCount).toBe(0);
    expect(data?.reviews).toEqual([]);
  });

  test("a learner id is not a publishable profile and returns null", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const data = await t.query(api.instructorReviews.listForInstructor, {
      instructorId: w.studentId,
    });
    expect(data).toBeNull();
  });

  test("a suspended instructor's profile disappears along with its reviews", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await rateAs(t, "clerk_student", w.instructorId, 5);

    await t.run((ctx: TestCtx) =>
      ctx.db.patch(w.instructorId, { suspendedAt: w.now }),
    );

    const data = await t.query(api.instructorReviews.listForInstructor, {
      instructorId: w.instructorId,
    });
    expect(data).toBeNull();
  });
});

describe("instructorReviews.getReviewerState", () => {
  test("reports the same refusal the write would give", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const stranger = await as(t, "clerk_stranger").query(
      api.instructorReviews.getReviewerState,
      { instructorId: w.instructorId },
    );
    expect(stranger?.canReview).toBe(false);
    expect(stranger?.reason).toMatch(/Enroll in one of this instructor's courses/);

    const student = await as(t, "clerk_student").query(
      api.instructorReviews.getReviewerState,
      { instructorId: w.instructorId },
    );
    expect(student?.canReview).toBe(true);
    expect(student?.reason).toBeNull();
  });

  test("a signed-out caller is offered a sign-in, not a null", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const state = await t.query(api.instructorReviews.getReviewerState, {
      instructorId: w.instructorId,
    });
    expect(state?.signedIn).toBe(false);
    expect(state?.canReview).toBe(false);
    expect(state?.reason).toMatch(/Sign in/);
  });

  test("hands back the caller's own review so the form can open on it", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await rateAs(t, "clerk_student", w.instructorId, 4, "Solid");

    const state = await as(t, "clerk_student").query(
      api.instructorReviews.getReviewerState,
      { instructorId: w.instructorId },
    );
    expect(state?.review?.rating).toBe(4);
    expect(state?.review?.comment).toBe("Solid");
  });
});

describe("instructorReviews.listForSelf", () => {
  test("returns only the caller's own reviews", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await rateAs(t, "clerk_student", w.instructorId, 5);
    await rateAs(t, "clerk_stranger", w.rivalId, 3);

    const mine = await as(t, "clerk_student").query(api.instructorReviews.listForSelf, {});
    expect(mine).toHaveLength(1);
    expect(mine?.[0].instructorName).toBe("Ada Instructor");
  });

  test("is null signed out rather than an empty list, so the UI can tell them apart", async () => {
    const t = convexTest(testSchema, modules);
    expect(await t.query(api.instructorReviews.listForSelf, {})).toBeNull();
  });
});

describe("the denormalized total stays honest", () => {
  test("incremental writes land on exactly what a recount of the table says", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await rateAs(t, "clerk_student2", w.instructorId, 2);
    await rateAs(t, "clerk_student", w.instructorId, 4);
    await as(t, "clerk_student2").mutation(
      api.instructorReviews.deleteInstructorReview,
      { instructorId: w.instructorId },
    );
    await rateAs(t, "clerk_nameless", w.instructorId, 3);

    const incremental = await readUser(t, w.instructorId);
    // The point of the exercise: recount the table, not the running total.
    const recomputed = await t.mutation(
      internal.instructorReviews.recomputeInstructorRating,
      { instructorId: w.instructorId },
    );

    expect(recomputed).toEqual({
      instructorRatingSum: incremental?.instructorRatingSum,
      instructorRatingCount: incremental?.instructorRatingCount,
    });
    // And the arithmetic is what it looks like: one 4 plus one 3.
    expect(recomputed).toEqual({ instructorRatingSum: 7, instructorRatingCount: 2 });
  });

  test("recomputeInstructorRating restores the total from the rows", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await rateAs(t, "clerk_student2", w.instructorId, 4);

    // Corrupt it on purpose, the way a bad migration would.
    await t.run((ctx: TestCtx) =>
      ctx.db.patch(w.instructorId, {
        instructorRatingSum: 999,
        instructorRatingCount: 42,
      }),
    );

    await t.mutation(internal.instructorReviews.recomputeInstructorRating, {
      instructorId: w.instructorId,
    });

    const instructor = await readUser(t, w.instructorId);
    expect(instructor?.instructorRatingSum).toBe(9);
    expect(instructor?.instructorRatingCount).toBe(2);
  });

  test("an instructor whose reviews are all gone recomputes back to never-rated", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await rateAs(t, "clerk_student", w.instructorId, 5);
    await as(t, "clerk_student").mutation(
      api.instructorReviews.deleteInstructorReview,
      { instructorId: w.instructorId },
    );

    const recomputed = await t.mutation(
      internal.instructorReviews.recomputeInstructorRating,
      { instructorId: w.instructorId },
    );
    expect(recomputed).toEqual({
      instructorRatingSum: undefined,
      instructorRatingCount: undefined,
    });
  });
});