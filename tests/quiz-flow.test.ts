import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestCtx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
type TestWorld = TestConvex<typeof testSchema>;

async function seed(t: TestWorld) {
  const now = Date.now();
  const instructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "i@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );
  const studentId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "s@test.com",
      name: "Student",
      role: "student",
      createdAt: now,
    }),
  );
  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Course",
      slug: "course",
      description: "",
      instructorId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const quizLessonId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId,
      title: "Quiz",
      contentType: "quiz",
      order: 0,
      createdAt: now,
    }),
  );
  const quizId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizzes", {
      lessonId: quizLessonId,
      title: "Quiz",
      passingScore: 50,
      createdAt: now,
    }),
  );
  const questionId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizQuestions", { quizId, prompt: "2 + 2?", order: 0 }),
  );
  const optionId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizOptions", {
      questionId,
      text: "4",
      isCorrect: true,
    }),
  );
  return { studentId, courseId, quizLessonId, questionId, optionId };
}

describe("post-quiz flow", () => {
  test("a passing attempt marks its lesson complete", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, courseId, quizLessonId, questionId, optionId } =
      await seed(t);
    const student = t.withIdentity({
      subject: "clerk_student",
      tokenIdentifier: "clerk_student",
    });

    await student.mutation(api.enrollments.enrollInCourse, { courseId });
    const result = await student.mutation(api.quizzes.submitQuizAttempt, {
      lessonId: quizLessonId,
      answers: [{ questionId, optionId }],
    });

    expect(result.passed).toBe(true);
    const enrollment = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("enrollments")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", studentId).eq("courseId", courseId),
        )
        .unique(),
    );
    expect(enrollment?.completedLessonIds).toContain(quizLessonId);
  });

  test("result carries the next lesson href", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, quizLessonId, questionId, optionId } = await seed(t);
    const nextId: Id<"lessons"> = await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId,
        title: "After quiz",
        contentType: "article",
        order: 1,
        createdAt: Date.now(),
      }),
    );
    const student = t.withIdentity({
      subject: "clerk_student",
      tokenIdentifier: "clerk_student",
    });

    await student.mutation(api.enrollments.enrollInCourse, { courseId });
    const result = await student.mutation(api.quizzes.submitQuizAttempt, {
      lessonId: quizLessonId,
      answers: [{ questionId, optionId }],
    });

    expect(result.nextLessonHref).toBe(
      `/dashboard/courses/course/lessons/${nextId}`,
    );
  });
});
