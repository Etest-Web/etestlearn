import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// Load every Convex module (function definitions) for the in-memory backend.
const modules = import.meta.glob("../convex/**/*.ts");

async function seedWorld(t: ReturnType<typeof convexTest<typeof schema>>) {
  const now = Date.now();

  const adminId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  const instructorId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const studentId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      role: "student",
      createdAt: now,
    }),
  );

  const courseId = await t.run(async (ctx) =>
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

  const freeCourseId = await t.run(async (ctx) =>
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
    const t = convexTest(schema, modules);
    const { studentId } = await seedWorld(t);

    await t.run(async (ctx) => {
      const student = await ctx.db.get(studentId);
      expect(student).not.toBeNull();
    });

    const asStudent = t.withIdentity({ subject: "clerk_student", tokenIdentifier: "clerk_student" });
    await expect(asStudent.query(api.users.listAllUsers, {})).rejects.toThrow(
      /Not authorized/,
    );
  });

  test("non-admins cannot change roles", async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
    const { courseId } = await seedWorld(t);

    await t.run(async (ctx) => {
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
    const { freeCourseId } = await seedWorld(t);

    const lessonId = await t.run(async (ctx) =>
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
    const t = convexTest(schema, modules);
    const { freeCourseId } = await seedWorld(t);

    const lessonIds = [];
    for (let i = 0; i < 4; i++) {
      lessonIds.push(
        await t.run(async (ctx) =>
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

    const enrollment = await t.run(async (ctx) => {
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
