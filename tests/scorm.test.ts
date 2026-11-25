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

const insertUser = (
  t: T,
  clerkId: string,
  role: "student" | "instructor" | "admin"
) =>
  t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId,
      email: `${clerkId}@test.com`,
      role,
      createdAt: Date.now(),
    })
  );

const insertCourse = (t: T, slug: string, instructorId: Id<"users">) =>
  t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: slug,
      slug,
      description: `${slug} description`,
      instructorId,
      published: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );

const insertLesson = (
  t: T,
  courseId: Id<"courses">,
  title: string,
  order = 1
) =>
  t.run((ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId,
      title,
      order,
      contentType: "scorm",
      createdAt: Date.now(),
    })
  );

describe("SCORM Package Management and Gating", () => {
  test("creates package record and stores files", async () => {
    const t = convexTest(testSchema, modules);
    const instructorId = await insertUser(t, "ins_1", "instructor");
    const courseId = await insertCourse(t, "scorm-course", instructorId);

    const packageId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("scormPackages", {
        courseId,
        title: "Introduction to SCORM",
        version: "1.2",
        entryPoint: "index.html",
        storagePrefix: `scorm/${courseId}/1`,
        packageSize: 5000,
        createdAt: Date.now(),
      })
    );

    expect(packageId).toBeDefined();

    const dummyStorageId = await t.run((ctx: TestCtx) =>
      ctx.storage.store(new Blob(["hello html"], { type: "text/html" }))
    );

    await t.mutation(internal.scorm.savePackageFileBatch, {
      packageId,
      files: [
        {
          path: "index.html",
          storageId: dummyStorageId,
          contentType: "text/html",
          sizeBytes: 10,
        },
      ],
    });

    const file = await t.query(internal.scorm.getPackageFile, {
      packageId,
      path: "index.html",
    });
    expect(file).not.toBeNull();
    expect(file?.contentType).toBe("text/html");
  });

  test("links package to lesson and enforces instructor access", async () => {
    const t = convexTest(testSchema, modules);
    const instructorId = await insertUser(t, "ins_1", "instructor");
    await insertUser(t, "ins_other", "instructor");
    const courseId = await insertCourse(t, "scorm-course-2", instructorId);
    const lessonId = await insertLesson(t, courseId, "SCORM Lesson 1");

    const packageId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("scormPackages", {
        courseId,
        title: "SCORM Module",
        version: "2004_4th",
        entryPoint: "launch.html",
        storagePrefix: `scorm/${courseId}/2`,
        packageSize: 10000,
        createdAt: Date.now(),
      })
    );

    // Other instructor cannot link package
    await expect(
      as(t, "ins_other").mutation(api.scorm.linkScormPackageToLesson, {
        packageId,
        lessonId,
      })
    ).rejects.toThrow();

    // Owner instructor can link package
    await as(t, "ins_1").mutation(api.scorm.linkScormPackageToLesson, {
      packageId,
      lessonId,
      durationMinutes: 45,
    });

    const updatedLesson = await t.run((ctx: TestCtx) => ctx.db.get(lessonId));
    expect(updatedLesson?.scormPackageId).toEqual(packageId);
    expect(updatedLesson?.contentType).toBe("scorm");
    expect(updatedLesson?.durationMinutes).toBe(45);
  });

  test("issueScormToken enforces enrollment and preview permissions", async () => {
    const t = convexTest(testSchema, modules);
    const instructorId = await insertUser(t, "ins_1", "instructor");
    const studentId = await insertUser(t, "stu_1", "student");
    await insertUser(t, "stu_2", "student");

    const courseId = await insertCourse(t, "scorm-access-test", instructorId);
    const lessonId = await insertLesson(t, courseId, "SCORM Lesson", 2);

    const packageId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("scormPackages", {
        courseId,
        lessonId,
        title: "SCORM Gated",
        version: "1.2",
        entryPoint: "start.html",
        storagePrefix: `scorm/${courseId}/3`,
        packageSize: 8000,
        createdAt: Date.now(),
      })
    );

    // Enroll stu_1
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId: studentId,
        courseId,
        progressPercent: 0,
        completedLessonIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    // Enrolled student can get token
    const tokenResult = await as(t, "stu_1").mutation(api.scorm.issueScormToken, {
      packageId,
    });
    expect(tokenResult.token).toBeDefined();
    expect(tokenResult.entryPoint).toBe("start.html");

    // Unenrolled student is rejected
    await expect(
      as(t, "stu_2").mutation(api.scorm.issueScormToken, { packageId })
    ).rejects.toThrow("Not authorized");

    // Instructor can access
    const insToken = await as(t, "ins_1").mutation(api.scorm.issueScormToken, {
      packageId,
    });
    expect(insToken.token).toBeDefined();
  });
});
