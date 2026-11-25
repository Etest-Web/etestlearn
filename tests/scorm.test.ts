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

  test("initializeSession creates tracking record and enforces authorization", async () => {
    const t = convexTest(testSchema, modules);
    const instructorId = await insertUser(t, "ins_init", "instructor");
    const studentId = await insertUser(t, "stu_init", "student");
    const unenrolledId = await insertUser(t, "stu_uninit", "student");

    const courseId = await insertCourse(t, "scorm-init-test", instructorId);
    const lessonId = await insertLesson(t, courseId, "SCORM Init Lesson", 1);

    const packageId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("scormPackages", {
        courseId,
        lessonId,
        title: "Init Package",
        version: "1.2",
        entryPoint: "index.html",
        storagePrefix: `scorm/${courseId}/4`,
        packageSize: 1000,
        createdAt: Date.now(),
      })
    );

    await t.run((ctx: TestCtx) =>
      ctx.db.patch(lessonId, { scormPackageId: packageId })
    );

    // Enroll student
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

    // Unenrolled student fails
    await expect(
      as(t, "stu_uninit").mutation(api.scorm.initializeSession, {
        lessonId,
        packageId,
      })
    ).rejects.toThrow("Not enrolled");

    // Enrolled student succeeds and initializes default state
    const initState = await as(t, "stu_init").mutation(api.scorm.initializeSession, {
      lessonId,
      packageId,
    });

    expect(initState.lessonStatus).toBe("not_attempted");
    expect(initState.totalTimeSeconds).toBe(0);
    expect(initState.suspendData).toBeNull();

    // Verify scormTracking row in db
    const tracking = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("scormTracking")
        .withIndex("by_user_lesson", (q) =>
          q.eq("userId", studentId).eq("lessonId", lessonId)
        )
        .unique()
    );
    expect(tracking).not.toBeNull();
    expect(tracking?.lessonStatus).toBe("not_attempted");

    // Instructor can also initialize
    const insState = await as(t, "ins_init").mutation(api.scorm.initializeSession, {
      lessonId,
      packageId,
    });
    expect(insState.lessonStatus).toBe("not_attempted");
  });

  test("commitSession updates tracking and triggers completion cascade", async () => {
    const t = convexTest(testSchema, modules);
    const instructorId = await insertUser(t, "ins_cascade", "instructor");
    const studentId = await insertUser(t, "stu_cascade", "student");

    const courseId = await insertCourse(t, "scorm-cascade-test", instructorId);
    const lesson1Id = await insertLesson(t, courseId, "SCORM Lesson 1", 1);
    const lesson2Id = await insertLesson(t, courseId, "SCORM Lesson 2", 2);

    const packageId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("scormPackages", {
        courseId,
        lessonId: lesson1Id,
        title: "Cascade Package",
        version: "1.2",
        entryPoint: "index.html",
        storagePrefix: `scorm/${courseId}/5`,
        packageSize: 1000,
        createdAt: Date.now(),
      })
    );

    await t.run((ctx: TestCtx) =>
      ctx.db.patch(lesson1Id, { scormPackageId: packageId })
    );

    // Enroll student
    const enrollmentId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId: studentId,
        courseId,
        progressPercent: 0,
        completedLessonIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    // 1. Initialize session
    await as(t, "stu_cascade").mutation(api.scorm.initializeSession, {
      lessonId: lesson1Id,
      packageId,
    });

    // 2. Commit in-progress state (incomplete, 50% score, suspendData)
    await as(t, "stu_cascade").mutation(api.scorm.commitSession, {
      lessonId: lesson1Id,
      lessonStatus: "incomplete",
      location: "slide_3",
      suspendData: "state_bookmark_data_here",
      rawScore: 50,
      minScore: 0,
      maxScore: 100,
      totalTimeSeconds: 120,
    });

    // Check tracking updated
    let tracking = await as(t, "stu_cascade").query(api.scorm.getScormTracking, {
      lessonId: lesson1Id,
    });
    expect(tracking?.lessonStatus).toBe("incomplete");
    expect(tracking?.location).toBe("slide_3");
    expect(tracking?.suspendData).toBe("state_bookmark_data_here");
    expect(tracking?.rawScore).toBe(50);
    expect(tracking?.totalTimeSeconds).toBe(120);

    // Verify enrollment has NOT marked lesson completed yet
    let enrollment = await t.run((ctx: TestCtx) => ctx.db.get(enrollmentId));
    expect(enrollment?.completedLessonIds).not.toContain(lesson1Id);
    expect(enrollment?.progressPercent).toBe(0);

    // 3. Commit completed state ("passed")
    await as(t, "stu_cascade").mutation(api.scorm.commitSession, {
      lessonId: lesson1Id,
      lessonStatus: "passed",
      rawScore: 90,
      totalTimeSeconds: 300,
    });

    // Verify tracking updated to passed
    tracking = await as(t, "stu_cascade").query(api.scorm.getScormTracking, {
      lessonId: lesson1Id,
    });
    expect(tracking?.lessonStatus).toBe("passed");
    expect(tracking?.completedAt).toBeDefined();

    // Verify enrollment cascaded! 1 of 2 lessons = 50%
    enrollment = await t.run((ctx: TestCtx) => ctx.db.get(enrollmentId));
    expect(enrollment?.completedLessonIds).toContain(lesson1Id);
    expect(enrollment?.progressPercent).toBe(50);

    // Verify learning activity logged
    const activity = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("learningActivities")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", studentId).eq("type", "lesson_completed")
        )
        .first()
    );
    expect(activity).not.toBeNull();
    expect(activity?.lessonId).toEqual(lesson1Id);
  });
});
