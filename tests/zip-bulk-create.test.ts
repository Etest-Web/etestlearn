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

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;
type T = TestConvex<typeof testSchema>;

const as = (t: T, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject, email: `${subject}@test.com` });

async function seedWorld(t: T) {
  const now = Date.now();
  const insertUser = (clerkId: string, role: "student" | "instructor" | "admin") =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("users", { clerkId, email: `${clerkId}@test.com`, name: clerkId, role, createdAt: now }),
    );
  const instructorId = await insertUser("clerk_instr", "instructor");
  const studentId = await insertUser("clerk_student", "student");
  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "C",
      slug: "c",
      description: "d",
      instructorId,
      published: false,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { instructorId, studentId, courseId };
}

describe("bulkCreateLessons", () => {
  test("creates lessons and quiz with questions", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const ids = await as(t, "clerk_instr").mutation(api.courses.bulkCreateLessons, {
      courseId,
      lessons: [
        { title: "Intro", contentType: "article", order: 0, content: "# hi" },
        {
          title: "Quiz 1",
          contentType: "quiz",
          order: 1,
          quiz: {
            title: "Quiz 1",
            passingScore: 70,
            questions: [
              { prompt: "2+2?", options: [{ text: "4", isCorrect: true }, { text: "5", isCorrect: false }] },
            ],
          },
        },
      ],
    });
    expect(ids.length).toBe(2);
    const lessons = await t.run((ctx: TestCtx) =>
      ctx.db.query("lessons").withIndex("by_course_order", (q) => q.eq("courseId", courseId)).collect(),
    );
    expect(lessons.length).toBe(2);
    const quiz = await t.run((ctx: TestCtx) =>
      ctx.db.query("quizzes").withIndex("by_lesson", (q) => q.eq("lessonId", ids[1])).unique(),
    );
    expect(quiz).not.toBeNull();
    const questions = await t.run((ctx: TestCtx) =>
      ctx.db.query("quizQuestions").withIndex("by_quiz_order", (q) => q.eq("quizId", quiz!._id)).collect(),
    );
    expect(questions.length).toBe(1);
  });

  test("rejects non-owner", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await expect(
      as(t, "clerk_student").mutation(api.courses.bulkCreateLessons, {
        courseId,
        lessons: [{ title: "X", contentType: "article", order: 0 }],
      }),
    ).rejects.toThrow();
  });

  test("rejects empty batch? no, allows; rejects >200", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const big = Array.from({ length: 201 }, (_, i) => ({ title: `L${i}`, contentType: "article" as const, order: i }));
    await expect(
      as(t, "clerk_instr").mutation(api.courses.bulkCreateLessons, { courseId, lessons: big }),
    ).rejects.toThrow();
  });
});
