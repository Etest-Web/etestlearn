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

  test("getUserEnrollments returns empty array when unauthenticated", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const enrollments = await t.query(api.enrollments.getUserEnrollments, {});
    expect(enrollments).toEqual([]);
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

/**
 * H-2 regression: getCourseBySlug/getCourseById used to hand every caller the
 * draft syllabus and full lesson content, and left the paywall to a client-side
 * flag. These pin the two gates — draft invisibility and content stripping.
 */
describe("course content gating", () => {
  /** A draft course owned by the seeded instructor, with two lessons. */
  async function seedDraft(t: any) {
    const now = Date.now();
    const { instructorId } = await seedWorld(t);
    const draftId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: "Unreleased Course",
        slug: "unreleased-course",
        description: "Still being written",
        instructorId,
        published: false,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const lessonId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId: draftId,
        title: "Secret lesson",
        contentType: "article",
        order: 0,
        content: "# unpublished text",
        createdAt: now,
      }),
    );
    return { draftId, lessonId };
  }

  test("a draft is invisible to anonymous and non-owner callers", async () => {
    const t = convexTest(testSchema, modules);
    const { draftId } = await seedDraft(t);

    // Anonymous: null, not an empty shell — a guessed slug must not confirm
    // that an unpublished course exists.
    await expect(
      t.query(api.courses.getCourseBySlug, { slug: "unreleased-course" }),
    ).resolves.toBeNull();
    await expect(t.query(api.courses.getCourseById, { courseId: draftId })).resolves.toBeNull();

    // A different signed-in instructor is not the owner either.
    const otherInstructor = await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_other_instructor",
        email: "other@test.com",
        name: "Other Instructor",
        role: "instructor",
        createdAt: Date.now(),
      }),
    );
    expect(otherInstructor).toBeTruthy();
    await expect(
      as(t, "clerk_other_instructor").query(api.courses.getCourseBySlug, {
        slug: "unreleased-course",
      }),
    ).resolves.toBeNull();
    await expect(
      as(t, "clerk_other_instructor").query(api.courses.getCourseById, { courseId: draftId }),
    ).resolves.toBeNull();

    // A student can read neither surface.
    await expect(
      as(t, "clerk_student").query(api.courses.getCourseBySlug, { slug: "unreleased-course" }),
    ).resolves.toBeNull();
    await expect(
      as(t, "clerk_student").query(api.courses.getCourseById, { courseId: draftId }),
    ).resolves.toBeNull();
  });

  test("a draft stays readable by its own instructor and by admins", async () => {
    const t = convexTest(testSchema, modules);
    const { draftId } = await seedDraft(t);

    const owner = await as(t, "clerk_instructor").query(api.courses.getCourseBySlug, {
      slug: "unreleased-course",
    });
    expect(owner?.course.published).toBe(false);
    expect(owner?.lessons[0].content).toBe("# unpublished text");

    const admin = await as(t, "clerk_admin").query(api.courses.getCourseById, {
      courseId: draftId,
    });
    expect(admin?.lessons).toHaveLength(1);
  });

  test("getCourseById is owner/admin only, even for a published course", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    // The editor's endpoint: any holder of a course id used to get full
    // lessons back. Published does not mean editable.
    await expect(
      as(t, "clerk_student").query(api.courses.getCourseById, { courseId }),
    ).resolves.toBeNull();
    await expect(t.query(api.courses.getCourseById, { courseId })).resolves.toBeNull();

    const owner = await as(t, "clerk_instructor").query(api.courses.getCourseById, { courseId });
    expect(owner?.course._id).toBe(courseId);
    const admin = await as(t, "clerk_admin").query(api.courses.getCourseById, { courseId });
    expect(admin?.course._id).toBe(courseId);
  });

  test("paid lesson content is stripped unless entitled; preview lesson excepted", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, studentId } = await seedWorld(t);
    const now = Date.now();

    // order 0 = paid content, order 1 = the public preview (isPreviewLesson).
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("lessons", {
        courseId,
        title: "Paid lesson",
        contentType: "article",
        order: 0,
        content: "# the goods",
        createdAt: now,
      });
      await ctx.db.insert("lessons", {
        courseId,
        title: "Preview lesson",
        contentType: "article",
        order: 1,
        content: "# free sample",
        createdAt: now,
      });
    });

    const anon = await t.query(api.courses.getCourseBySlug, { slug: "paid-course" });
    expect(anon).not.toBeNull();
    const byOrder = new Map(anon!.lessons.map((l) => [l.order, l]));
    // The paying lesson's text must not travel over the wire...
    expect(byOrder.get(0)!.content).toBeUndefined();
    expect(byOrder.get(0)!.videoAssetId).toBeUndefined();
    // ...while the lesson the course page already shows everyone keeps its text.
    expect(byOrder.get(1)!.content).toBe("# free sample");

    // Signed in but not enrolled: same gate, no identity bypass.
    const signedIn = await as(t, "clerk_student").query(api.courses.getCourseBySlug, {
      slug: "paid-course",
    });
    expect(signedIn!.lessons.find((l) => l.order === 0)!.content).toBeUndefined();

    // Enrolled: full content.
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId: studentId,
        courseId,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const enrolled = await as(t, "clerk_student").query(api.courses.getCourseBySlug, {
      slug: "paid-course",
    });
    expect(enrolled!.lessons.find((l) => l.order === 0)!.content).toBe("# the goods");

    // Suspended: getCurrentUser returns null, so entitlement must lapse even
    // though the enrollment row is still there. (Asserting the row survives
    // proves the strip below came from the identity gate, not from a missing
    // enrollment.)
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(studentId, { suspendedAt: now });
      const stillEnrolled = await ctx.db
        .query("enrollments")
        .withIndex("by_user_course", (q) => q.eq("userId", studentId).eq("courseId", courseId))
        .unique();
      expect(stillEnrolled).not.toBeNull();
    });
    const suspended = await as(t, "clerk_student").query(api.courses.getCourseBySlug, {
      slug: "paid-course",
    });
    expect(suspended!.lessons.find((l) => l.order === 0)!.content).toBeUndefined();
  });

  test("a free course keeps its syllabus public while its lessons stay gated", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId, studentId } = await seedWorld(t);
    const now = Date.now();
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId: freeCourseId,
        title: "Open lesson",
        contentType: "article",
        order: 0,
        content: "# free for all",
        createdAt: now,
      }),
    );

    // The storefront must not over-block: title, description and lesson list
    // are what a prospective learner is shopping with, and they are public.
    const anon = await t.query(api.courses.getCourseBySlug, { slug: "free-course" });
    expect(anon).not.toBeNull();
    expect(anon!.course.title).toBe("Free Course");
    expect(anon!.lessons).toHaveLength(1);
    expect(anon!.lessons[0].title).toBe("Open lesson");

    // Lesson *text*, though, follows the same rule as the client's
    // `isLessonUnlocked` (enrolled || order === 1) — which gates free courses
    // identically: one click to enroll, then the text is there. Without that
    // enrollment the server and the page would disagree about what is open.
    expect(anon!.lessons[0].content).toBeUndefined();

    await t.run((ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId: studentId,
        courseId: freeCourseId,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const enrolled = await as(t, "clerk_student").query(api.courses.getCourseBySlug, {
      slug: "free-course",
    });
    expect(enrolled!.lessons[0].content).toBe("# free for all");
  });
});
