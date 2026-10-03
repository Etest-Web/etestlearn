import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import type { GenericSchema, SchemaDefinition, DataModelFromSchemaDefinition, GenericMutationCtx } from "convex/server";

// Load every Convex module (function definitions) for the in-memory backend.
const modules = import.meta.glob("../convex/**/*.ts");

// Cast schema to satisfy GenericSchema constraint (defineSchema lacks index signature)
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;

// Extract the DataModel type from the original schema for proper type inference in run() callbacks
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

/** Identity scoped to an existing test world — each test owns one `t`. */
const as = (t: TestConvex<typeof testSchema>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

async function seedWorld(t: any) {
  const now = Date.now();

  const adminId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  const instructorId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const studentId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      role: "student",
      createdAt: now,
    }),
  );

  const courseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Paid Course",
      slug: "paid-course",
      description: "A course that costs money",
      instructorId,
      published: true,
      price: 50000,
      currency: "NGN",
      searchText: "Paid Course A course that costs money",
      createdAt: now,
      updatedAt: now,
    }),
  );

  const freeCourseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Free Course",
      slug: "free-course",
      description: "A free course",
      instructorId,
      published: true,
      searchText: "Free Course A free course",
      createdAt: now,
      updatedAt: now,
    }),
  );

  return { adminId, instructorId, studentId, courseId, freeCourseId };
}

describe("role enforcement", () => {
  test("students cannot list all users", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      const student = await ctx.db.get(studentId);
      expect(student).not.toBeNull();
    });

    const asStudent = t.withIdentity({ subject: "clerk_student", tokenIdentifier: "clerk_student" });
    await expect(asStudent.query(api.users.listAllUsers, {})).rejects.toThrow(
      /Not authorized/,
    );
  });

  test("non-admins cannot change roles", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, instructorId } = await seedWorld(t);

    const asInstructor = t.withIdentity({
      subject: "clerk_instructor",
      tokenIdentifier: "clerk_instructor",
    });
    await expect(
      asInstructor.mutation(api.users.setUserRole, {
        userId: studentId,
        role: "instructor",
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  test("admins can promote a student to instructor", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    const asAdmin = t.withIdentity({
      subject: "clerk_admin",
      tokenIdentifier: "clerk_admin",
    });
    await asAdmin.mutation(api.users.setUserRole, {
      userId: studentId,
      role: "instructor",
    });

    const role = await t.run((ctx) => ctx.db.get(studentId));
    expect(role?.role).toBe("instructor");
  });
});

describe("enrollment gating", () => {
  test("paid courses reject enrollment without a completed purchase", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const asStudent = t.withIdentity({
      subject: "clerk_student",
      tokenIdentifier: "clerk_student",
    });
    await expect(
      asStudent.mutation(api.enrollments.enrollInCourse, { courseId }),
    ).rejects.toThrow(/complete checkout/);
  });

  test("paid courses allow enrollment once the purchase is paid", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      const student = (
        await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_student")).unique()
      )!;
      const now = Date.now();
      await ctx.db.insert("purchases", {
        userId: student._id,
        courseId,
        paystackReference: "ref_test_1",
        amount: 50000,
        currency: "NGN",
        status: "paid",
        paidAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const asStudent = t.withIdentity({
      subject: "clerk_student",
      tokenIdentifier: "clerk_student",
    });
    await expect(
      asStudent.mutation(api.enrollments.enrollInCourse, { courseId }),
    ).resolves.toBeTruthy();
  });

  test("free courses enroll immediately", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);

    const asStudent = t.withIdentity({
      subject: "clerk_student",
      tokenIdentifier: "clerk_student",
    });
    await expect(
      asStudent.mutation(api.enrollments.enrollInCourse, { courseId: freeCourseId }),
    ).resolves.toBeTruthy();
  });
});

describe("lesson progress", () => {
  test("completeLesson rejects callers who are not enrolled", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);

    const lessonId = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId: freeCourseId,
        title: "Lesson 1",
        contentType: "article",
        order: 0,
        content: "# Hello",
        createdAt: Date.now(),
      }),
    );

    const asStudent = t.withIdentity({
      subject: "clerk_student",
      tokenIdentifier: "clerk_student",
    });
    await expect(
      asStudent.mutation(api.enrollments.completeLesson, {
        courseId: freeCourseId,
        lessonId,
      }),
    ).rejects.toThrow(/Not enrolled/);
  });

  test("completing lessons updates progress percent", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);

    const lessonIds = [];
    for (let i = 0; i < 4; i++) {
      lessonIds.push(
        await t.run(async (ctx: TestCtx) =>
          ctx.db.insert("lessons", {
            courseId: freeCourseId,
            title: `Lesson ${i + 1}`,
            contentType: "article",
            order: i,
            content: "content",
            createdAt: Date.now(),
          }),
        ),
      );
    }

    const asStudent = t.withIdentity({
      subject: "clerk_student",
      tokenIdentifier: "clerk_student",
    });
    await asStudent.mutation(api.enrollments.enrollInCourse, {
      courseId: freeCourseId,
    });

    let progress = 0;
    for (const lessonId of lessonIds) {
      progress = await asStudent.mutation(api.enrollments.completeLesson, {
        courseId: freeCourseId,
        lessonId,
      });
    }

    expect(progress).toBe(100);

    const enrollment = await t.run(async (ctx: TestCtx) => {
      const student = (
        await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_student"))
          .unique()
      )!;
      return (
        await ctx.db
          .query("enrollments")
          .withIndex("by_user_course", (q) =>
            q.eq("userId", student._id).eq("courseId", freeCourseId),
          )
          .unique()
      )!;
    });
    expect(enrollment.progressPercent).toBe(100);
    expect(enrollment.completedLessonIds).toHaveLength(4);
  });
});

describe("course slug integrity", () => {
  test("createCourse normalizes the slug and refuses one another course owns", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    // The UI slugifies titles, but the slug field is free text — whatever a
    // client posts is normalized again server-side before it is stored.
    const courseId = await instructor.mutation(api.courses.createCourse, {
      title: "Intro to Web Development",
      slug: "  Intro: Web Dev!!  ",
      description: "Learn the web",
    });

    const created = await t.run((ctx: TestCtx) =>
      ctx.db.get(courseId as Id<"courses">),
    );
    expect(created?.slug).toBe("intro-web-dev");

    // Case and punctuation differences must not produce a second course on the
    // same route: getCourseBySlug reads with .unique(), so one duplicate would
    // make both courses' pages throw.
    await expect(
      instructor.mutation(api.courses.createCourse, {
        title: "Intro to Web Development II",
        slug: "INTRO-WEB-DEV",
        description: "Sequel",
      }),
    ).rejects.toThrow(/already taken/);

    // A seeded course's slug is no more available than a created one.
    await expect(
      instructor.mutation(api.courses.createCourse, {
        title: "Paid Course Copy",
        slug: "paid course",
        description: "Duplicate route",
      }),
    ).rejects.toThrow(/already taken/);

    // Rejected attempts must not leave a row behind.
    const courses = await t.run((ctx: TestCtx) => ctx.db.query("courses").collect());
    expect(courses).toHaveLength(3); // two seeded + the one accepted create
  });

  test("updateCourse cannot take another course's slug, but keeping its own is fine", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    await expect(
      instructor.mutation(api.courses.updateCourse, {
        courseId: freeCourseId,
        slug: "paid-course",
      }),
    ).rejects.toThrow(/already taken/);

    // Re-saving an unchanged slug must not collide with itself — the check
    // excludes the course being edited.
    await instructor.mutation(api.courses.updateCourse, {
      courseId: freeCourseId,
      slug: "Free Course",
    });

    const course = await t.run((ctx: TestCtx) =>
      ctx.db.get(freeCourseId as Id<"courses">),
    );
    expect(course?.slug).toBe("free-course");
    expect(course?.title).toBe("Free Course"); // unrelated fields untouched
  });
});

describe("quiz authoring validation", () => {
  test("passingScore must stay within 0-100 on create and update", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    const lessonId = await instructor.mutation(api.courses.createLesson, {
      courseId: freeCourseId,
      title: "Quiz lesson",
      contentType: "quiz",
      order: 0,
    });

    // Above 100 no score can ever reach the bar, locking learners out of a
    // certificate they earned; below 0 every submission passes for free.
    await expect(
      instructor.mutation(api.quizzes.createQuiz, {
        lessonId,
        title: "Impossible",
        passingScore: 101,
      }),
    ).rejects.toThrow(/between 0 and 100/);

    await expect(
      instructor.mutation(api.quizzes.createQuiz, {
        lessonId,
        title: "Free pass",
        passingScore: -1,
      }),
    ).rejects.toThrow(/between 0 and 100/);

    const quizId = await instructor.mutation(api.quizzes.createQuiz, {
      lessonId,
      title: "Valid",
      passingScore: 50,
    });

    await expect(
      instructor.mutation(api.quizzes.updateQuiz, { quizId, passingScore: 150 }),
    ).rejects.toThrow(/between 0 and 100/);

    // The lower boundary is inclusive, and a rejected update must not patch.
    await instructor.mutation(api.quizzes.updateQuiz, { quizId, passingScore: 0 });

    const quiz = await t.run((ctx: TestCtx) => ctx.db.get(quizId as Id<"quizzes">));
    expect(quiz?.passingScore).toBe(0);
  });

  test("questions with a broken answer key are rejected before anything is written", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    const lessonId = await instructor.mutation(api.courses.createLesson, {
      courseId: freeCourseId,
      title: "Quiz lesson",
      contentType: "quiz",
      order: 0,
    });
    const quizId = await instructor.mutation(api.quizzes.createQuiz, {
      lessonId,
      title: "Quiz",
      passingScore: 50,
    });

    const countQuestions = () =>
      t.run((ctx: TestCtx) => ctx.db.query("quizQuestions").collect());
    expect(await countQuestions()).toHaveLength(0);

    await expect(
      instructor.mutation(api.quizzes.addQuizQuestion, {
        quizId,
        prompt: "Pick one",
        options: [{ text: "Only option", isCorrect: true }],
      }),
    ).rejects.toThrow(/at least two options/);

    // With no correct option the question can never be answered, so nobody in
    // the course can reach the passing score.
    await expect(
      instructor.mutation(api.quizzes.addQuizQuestion, {
        quizId,
        prompt: "Pick one",
        options: [
          { text: "A", isCorrect: false },
          { text: "B", isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/marked correct/);

    await expect(
      instructor.mutation(api.quizzes.addQuizQuestion, {
        quizId,
        prompt: "Pick one",
        options: [
          { text: "   ", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/cannot be empty/);

    // Two spellings of one answer would grade by row order, not by choice.
    await expect(
      instructor.mutation(api.quizzes.addQuizQuestion, {
        quizId,
        prompt: "Pick one",
        options: [
          { text: "Yes", isCorrect: true },
          { text: "  YES ", isCorrect: false },
        ],
      }),
    ).rejects.toThrow(/distinct/);

    expect(await countQuestions()).toHaveLength(0);

    // A well-formed key still goes through.
    await instructor.mutation(api.quizzes.addQuizQuestion, {
      quizId,
      prompt: "Pick one",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: false },
      ],
    });
    expect(await countQuestions()).toHaveLength(1);
  });
});

describe("quiz submission rate limiting", () => {
  test("caps accepted submissions at 10 per user per minute across quizzes", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    // The per-quiz cooldown only throttles repeats against one quiz, so the
    // global budget has to be exercised across distinct quizzes — that
    // fan-out is exactly what the limit exists to stop.
    const lessonIds = [];
    for (let i = 0; i < 12; i++) {
      const lessonId = await instructor.mutation(api.courses.createLesson, {
        courseId: freeCourseId,
        title: `Quiz ${i + 1}`,
        contentType: "quiz",
        order: i,
      });
      await instructor.mutation(api.quizzes.createQuiz, {
        lessonId,
        title: `Quiz ${i + 1}`,
        passingScore: 50,
      });
      lessonIds.push(lessonId);
    }

    for (const lessonId of lessonIds.slice(0, 10)) {
      await instructor.mutation(api.quizzes.submitQuizAttempt, {
        lessonId,
        answers: [],
      });
    }

    // The 11th submission inside the same minute is refused...
    await expect(
      instructor.mutation(api.quizzes.submitQuizAttempt, {
        lessonId: lessonIds[10],
        answers: [],
      }),
    ).rejects.toThrow(/Too many requests/);

    // ...and so is any other quiz from the same caller while the window lasts,
    // proving the bucket is global rather than per quiz.
    await expect(
      instructor.mutation(api.quizzes.submitQuizAttempt, {
        lessonId: lessonIds[11],
        answers: [],
      }),
    ).rejects.toThrow(/Too many requests/);

    const attempts = await t.run((ctx: TestCtx) => ctx.db.query("quizAttempts").collect());
    expect(attempts).toHaveLength(10);

    // Keyed by user: a blocked caller must not be able to starve anyone else.
    await as(t, "clerk_admin").mutation(api.quizzes.submitQuizAttempt, {
      lessonId: lessonIds[11],
      answers: [],
    });
    const afterOtherUser = await t.run((ctx: TestCtx) =>
      ctx.db.query("quizAttempts").collect(),
    );
    expect(afterOtherUser).toHaveLength(11);
  });
});
