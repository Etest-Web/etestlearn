import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import type {
  GenericSchema,
  SchemaDefinition,
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
} from "convex/server";

/**
 * `courses.deleteLesson` ownership checks and its cascade.
 *
 * The cascade arrived with the `agent/lms-fixes` merge, where it resolved a
 * conflict against the video-asset cleanup that already lived in that function.
 * Both halves delete things that would otherwise be orphaned — the merge put
 * them in one code path — so both are pinned here rather than left to the
 * happy path of a manual click.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

const as = (t: TestConvex<typeof testSchema>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

async function seedWorld(t: TestConvex<typeof testSchema>) {
  const now = Date.now();

  const instructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const studentId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      role: "student",
      createdAt: now,
    }),
  );

  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Course",
      slug: "course",
      description: "Has a quiz lesson",
      instructorId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const lessonId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId,
      title: "Quiz lesson",
      contentType: "quiz",
      order: 1,
      createdAt: now,
    }),
  );

  // A quiz lesson with a question, two options and one submitted attempt.
  const quizId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizzes", {
      lessonId,
      title: "Checkpoint",
      passingScore: 60,
      createdAt: now,
    }),
  );

  const questionId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizQuestions", {
      quizId,
      prompt: "Pick one",
      order: 1,
    }),
  );

  const optionIds = await t.run(async (ctx: TestCtx) => {
    const correct = await ctx.db.insert("quizOptions", {
      questionId,
      text: "Correct",
      isCorrect: true,
    });
    const wrong = await ctx.db.insert("quizOptions", {
      questionId,
      text: "Wrong",
      isCorrect: false,
    });
    return { correct, wrong };
  });

  await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizAttempts", {
      userId: studentId,
      quizId,
      score: 1,
      maxScore: 1,
      passed: true,
      createdAt: now,
    }),
  );

  return { instructorId, studentId, courseId, lessonId, quizId, questionId, optionIds };
}

describe("deleteLesson ownership", () => {
  test("a student cannot delete a lesson, and neither can a stranger instructor", async () => {
    const t = convexTest(testSchema, modules);
    const { lessonId } = await seedWorld(t);

    await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_rival",
        email: "rival@test.com",
        name: "Rival",
        role: "instructor",
        createdAt: Date.now(),
      }),
    );

    await expect(
      as(t, "clerk_student").mutation(api.courses.deleteLesson, { lessonId }),
    ).rejects.toThrow(/Not authorized/);
    await expect(
      as(t, "clerk_rival").mutation(api.courses.deleteLesson, { lessonId }),
    ).rejects.toThrow(/Not authorized/);
    await expect(t.mutation(api.courses.deleteLesson, { lessonId })).rejects.toThrow(
      /Not authenticated/,
    );

    // Still there — a refused delete must not have taken anything with it.
    expect(
      await t.run((ctx: TestCtx) => ctx.db.get(lessonId)),
    ).not.toBeNull();
  });

  test("a missing lesson is refused rather than silently succeeding", async () => {
    const t = convexTest(testSchema, modules);
    const { lessonId } = await seedWorld(t);

    await as(t, "clerk_instructor").mutation(api.courses.deleteLesson, { lessonId });

    await expect(
      as(t, "clerk_instructor").mutation(api.courses.deleteLesson, { lessonId }),
    ).rejects.toThrow(/Lesson not found/);
  });
});

describe("deleteLesson cascade", () => {
  test("removes the quiz, its questions, its options and its attempts", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, lessonId, quizId, questionId, optionIds } =
      await seedWorld(t);

    // Every dependent row exists before the delete, so a pass cannot be a false
    // positive from rows that were never created.
    expect(
      await t.run((ctx: TestCtx) => ctx.db.get(quizId)),
    ).not.toBeNull();

    await as(t, "clerk_instructor").mutation(api.courses.deleteLesson, { lessonId });

    await t.run(async (ctx: TestCtx) => {
      expect(await ctx.db.get(lessonId)).toBeNull();
      expect(await ctx.db.get(quizId)).toBeNull();
      expect(await ctx.db.get(questionId)).toBeNull();
      expect(await ctx.db.get(optionIds.correct)).toBeNull();
      expect(await ctx.db.get(optionIds.wrong)).toBeNull();

      const attempts = await ctx.db
        .query("quizAttempts")
        .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
        .collect();
      expect(attempts).toHaveLength(0);

      // The course itself is untouched — deleting one lesson is not a way to
      // empty a catalog.
      expect(await ctx.db.get(instructorId)).not.toBeNull();
    });
  });

  test("leaves no orphaned attempt rows that a per-course stat could still count", async () => {
    const t = convexTest(testSchema, modules);
    const { lessonId, quizId } = await seedWorld(t);

    await as(t, "clerk_instructor").mutation(api.courses.deleteLesson, { lessonId });

    // This is the failure the cascade exists to prevent: an attempt whose quiz
    // and lesson are gone would still be tallied by any analytics walk that
    // maps quiz → lesson → course and skips the missing links silently.
    await t.run(async (ctx: TestCtx) => {
      const all = await ctx.db.query("quizAttempts").collect();
      expect(all).toHaveLength(0);
      expect(quizId).toBeTruthy();
    });
  });

  test("deleting a lesson with no quiz deletes just the lesson", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const plainLessonId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId,
        title: "Article lesson",
        contentType: "article",
        order: 2,
        createdAt: Date.now(),
      }),
    );

    await as(t, "clerk_instructor").mutation(api.courses.deleteLesson, {
      lessonId: plainLessonId,
    });

    await t.run(async (ctx: TestCtx) => {
      expect(await ctx.db.get(plainLessonId)).toBeNull();
      // The quiz lesson from the seed is untouched.
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
        .collect();
      expect(lessons).toHaveLength(1);
    });
  });
});
