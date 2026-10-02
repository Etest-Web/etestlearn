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
type TestCtx = GenericMutationCtx<
  DataModelFromSchemaDefinition<typeof schema>
>;
type TestWorld = TestConvex<typeof testSchema>;

/** Identity scoped to an existing test world — each test owns one `t`. */
const as = (t: TestWorld, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

async function seedWorld(t: TestWorld) {
  const now = Date.now();

  const adminId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );
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
  const outsiderId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_outsider",
      email: "other@test.com",
      name: "Other Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  // One course with a quiz lesson, one with only articles.
  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Course With Quiz",
      slug: "course-with-quiz",
      description: "One lesson and one quiz",
      instructorId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const articleCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Articles Only",
      slug: "articles-only",
      description: "No quizzes here",
      instructorId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const lessonId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId,
      title: "Lesson 1",
      contentType: "article",
      order: 0,
      createdAt: now,
    }),
  );
  const quizLessonId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId,
      title: "Quiz 1",
      contentType: "quiz",
      order: 1,
      createdAt: now,
    }),
  );
  const articleLessonId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId: articleCourseId,
      title: "Only Lesson",
      contentType: "article",
      order: 0,
      createdAt: now,
    }),
  );

  const quizId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizzes", {
      lessonId: quizLessonId,
      title: "Final quiz",
      passingScore: 50,
      createdAt: now,
    }),
  );
  const questionId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizQuestions", { quizId, prompt: "2 + 2?", order: 0 }),
  );
  const correctOptionId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("quizOptions", {
      questionId,
      text: "4",
      isCorrect: true,
    }),
  );

  return {
    adminId,
    instructorId,
    studentId,
    outsiderId,
    courseId,
    articleCourseId,
    lessonId,
    quizLessonId,
    articleLessonId,
    quizId,
    questionId,
    correctOptionId,
  };
}

/** Enroll the student and mark every lesson of the course complete. */
async function completeAllLessons(t: TestWorld, courseId: Id<"courses">) {
  const student = as(t, "clerk_student");
  await student.mutation(api.enrollments.enrollInCourse, { courseId });

  const lessons = await t.run((ctx: TestCtx) =>
    ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
      .collect(),
  );

  for (const lesson of lessons) {
    await student.mutation(api.enrollments.completeLesson, {
      courseId,
      lessonId: lesson._id,
    });
  }

  return student;
}

describe("certificate issuance", () => {
  test("is blocked until every quiz is passed", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const student = await completeAllLessons(t, ids.courseId);

    // completeLesson already tried to auto-issue; nothing should exist yet.
    const after = await t.run((ctx: TestCtx) => ctx.db.query("certificates").collect());
    expect(after).toHaveLength(0);

    await expect(
      student.mutation(api.certificates.issueCertificate, {
        courseId: ids.courseId,
      }),
    ).rejects.toThrow(/quizzes/i);
  });

  test("is issued automatically once the quiz is passed", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const student = await completeAllLessons(t, ids.courseId);

    await student.mutation(api.quizzes.submitQuizAttempt, {
      lessonId: ids.quizLessonId,
      answers: [{ questionId: ids.questionId, optionId: ids.correctOptionId }],
    });

    const certs = await student.query(api.certificates.listMyCertificates, {});
    expect(certs).toHaveLength(1);
    expect(certs[0].serial).toMatch(/^GL-\d{4}-[0-9A-Z]{8}$/);
    expect(certs[0].holderName).toBe("Student");
    expect(certs[0].courseTitle).toBe("Course With Quiz");
    expect(certs[0].revokedAt).toBeNull();
  });

  test("issues for a course with no quizzes once lessons are done", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const student = await completeAllLessons(t, ids.articleCourseId);

    const certs = await student.query(api.certificates.listMyCertificates, {});
    expect(certs).toHaveLength(1);
    expect(certs[0].courseTitle).toBe("Articles Only");
  });

  test("is idempotent and returns the same certificate", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = await completeAllLessons(t, ids.articleCourseId);

    const first = await student.mutation(api.certificates.issueCertificate, {
      courseId: ids.articleCourseId,
    });
    const second = await student.mutation(api.certificates.issueCertificate, {
      courseId: ids.articleCourseId,
    });

    expect(second).toBe(first);
    const all = await t.run((ctx: TestCtx) => ctx.db.query("certificates").collect());
    expect(all).toHaveLength(1);
  });

  test("records the active template on the certificate", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = await completeAllLessons(t, ids.articleCourseId);

    // No template active yet.
    await student.mutation(api.certificates.issueCertificate, {
      courseId: ids.articleCourseId,
    });
    const [plain] = await t.run((ctx: TestCtx) =>
      ctx.db.query("certificates").collect(),
    );
    expect(plain?.templateId).toBeUndefined();

    // With one active, a later certificate records it.
    const templateId = await as(t, "clerk_admin").mutation(
      api.certificateTemplates.createTemplate,
      {
        name: "Brand",
        pdfStorageId: await t.run((ctx) =>
          ctx.storage.store(new Blob(["%PDF-1.7"], { type: "application/pdf" })),
        ),
        pageWidth: 841.89,
        pageHeight: 595.28,
        activate: true,
      },
    );

    await completeAllLessons(t, ids.courseId);
    await as(t, "clerk_student").mutation(api.quizzes.submitQuizAttempt, {
      lessonId: ids.quizLessonId,
      answers: [{ questionId: ids.questionId, optionId: ids.correctOptionId }],
    });

    const all = await t.run((ctx: TestCtx) =>
      ctx.db.query("certificates").collect(),
    );
    const templated = all.find((c) => c.courseId === ids.courseId);
    expect(templated?.templateId).toBe(templateId);
  });

  test("refuses learners who are not enrolled", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      as(t, "clerk_student").mutation(api.certificates.issueCertificate, {
        courseId: ids.articleCourseId,
      }),
    ).rejects.toThrow(/not enrolled/i);
  });

  test("completion status explains what is still missing", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const student = as(t, "clerk_student");
    await student.mutation(api.enrollments.enrollInCourse, {
      courseId: ids.courseId,
    });

    const status = await student.query(
      api.certificates.getCourseCertificateStatus,
      { courseId: ids.courseId },
    );

    expect(status.enrolled).toBe(true);
    expect(status.certificate).toBeNull();
    expect(status.completion?.eligible).toBe(false);
    expect(status.completion?.lessonsTotal).toBe(2);
    expect(status.completion?.quizzesTotal).toBe(1);
  });
});

describe("certificate access control", () => {
  test("learners cannot read another learner's certificate", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    await completeAllLessons(t, ids.articleCourseId);

    await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_student_two",
        email: "two@test.com",
        name: "Student Two",
        role: "student",
        createdAt: Date.now(),
      }),
    );

    const [cert] = await t.run((ctx: TestCtx) => ctx.db.query("certificates").collect());

    await expect(
      as(t, "clerk_student_two").query(api.certificates.getMyCertificate, {
        certificateId: cert._id,
      }),
    ).resolves.toBeNull();
  });

  test("an unrelated instructor cannot list or issue certificates", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const outsider = as(t, "clerk_outsider");
    await expect(
      outsider.query(api.certificates.listCourseCertificates, {
        courseId: ids.articleCourseId,
      }),
    ).rejects.toThrow(/Not authorized/);

    await expect(
      outsider.mutation(api.certificates.issueCertificateForLearner, {
        userId: ids.studentId,
        courseId: ids.articleCourseId,
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  test("the owning instructor can issue manually, revoke, and reinstate", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const instructor = as(t, "clerk_instructor");
    await as(t, "clerk_student").mutation(api.enrollments.enrollInCourse, {
      courseId: ids.articleCourseId,
    });

    await instructor.mutation(api.certificates.issueCertificateForLearner, {
      userId: ids.studentId,
      courseId: ids.articleCourseId,
    });

    const [cert] = await t.run((ctx: TestCtx) => ctx.db.query("certificates").collect());

    await instructor.mutation(api.certificates.revokeCertificate, {
      certificateId: cert._id,
      reason: "Issued in error",
    });

    const revoked = await t.run((ctx: TestCtx) => ctx.db.get(cert._id));
    expect(revoked?.revokedAt).toBeTypeOf("number");
    expect(revoked?.revocationReason).toBe("Issued in error");

    await instructor.mutation(api.certificates.reinstateCertificate, {
      certificateId: cert._id,
    });
    const reinstated = await t.run((ctx: TestCtx) => ctx.db.get(cert._id));
    expect(reinstated?.revokedAt).toBeUndefined();
  });

  test("a learner cannot revoke their own certificate", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = await completeAllLessons(t, ids.articleCourseId);

    const [cert] = await t.run((ctx: TestCtx) => ctx.db.query("certificates").collect());

    await expect(
      student.mutation(api.certificates.revokeCertificate, {
        certificateId: cert._id,
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  test("manual issue requires an enrollment", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      as(t, "clerk_instructor").mutation(
        api.certificates.issueCertificateForLearner,
        { userId: ids.studentId, courseId: ids.articleCourseId },
      ),
    ).rejects.toThrow(/not enrolled/i);
  });

  test("students and instructors cannot list all certificates", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_student").query(api.certificates.listAllCertificates, {}),
    ).rejects.toThrow(/Not authorized/);

    await expect(
      as(t, "clerk_instructor").query(api.certificates.listAllCertificates, {}),
    ).rejects.toThrow(/Not authorized/);
  });

  test("admins can list all certificates", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    await completeAllLessons(t, ids.articleCourseId);

    const all = await as(t, "clerk_admin").query(
      api.certificates.listAllCertificates,
      {},
    );
    expect(all).toHaveLength(1);
    expect(all[0].holderName).toBe("Student");
  });
});

describe("public verification", () => {
  test("resolves a serial and reports revocation", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    await completeAllLessons(t, ids.articleCourseId);

    const [cert] = await t.run((ctx: TestCtx) => ctx.db.query("certificates").collect());
    expect(cert?.serial).toBeTruthy();

    // `t` carries no identity unless withIdentity is called, so this is the
    // unauthenticated path an employer would hit.
    const verified = await t.query(
      api.certificates.getCertificateForVerification,
      { ref: cert.serial! },
    );
    expect(verified?.valid).toBe(true);
    expect(verified?.holderName).toBe("Student");
    expect(verified?.courseTitle).toBe("Articles Only");

    await as(t, "clerk_instructor").mutation(api.certificates.revokeCertificate, {
      certificateId: cert._id,
      reason: "Fraud",
    });

    const afterRevoke = await t.query(
      api.certificates.getCertificateForVerification,
      { ref: cert.serial! },
    );
    expect(afterRevoke?.valid).toBe(false);
    expect(afterRevoke?.revocationReason).toBe("Fraud");
  });

  test("returns null for an unknown reference", async () => {
    const t = convexTest(testSchema, modules);

    await expect(
      t.query(api.certificates.getCertificateForVerification, {
        ref: "GL-2026-NOPE",
      }),
    ).resolves.toBeNull();
  });
});