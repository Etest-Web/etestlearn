import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_SERIAL_PREFIX,
  evaluateCertificateCompletion,
  formatCertificateDate,
  generateCertificateSerial,
  isCertificateRevoked,
} from "./certificates";

const lessons = ["l1", "l2", "l3"];

describe("evaluateCertificateCompletion", () => {
  it("requires every lesson to be complete", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: lessons,
      completedLessonIds: ["l1", "l2"],
      quizIds: [],
      passedQuizIds: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.lessonsDone).toBe(2);
    expect(result.lessonsTotal).toBe(3);
    expect(result.blockers[0]).toMatch(/all 3 lessons/i);
  });

  it("requires every quiz to be passed", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: lessons,
      completedLessonIds: lessons,
      quizIds: ["q1", "q2"],
      passedQuizIds: ["q1"],
    });

    expect(result.eligible).toBe(false);
    expect(result.quizzesPassed).toBe(1);
    expect(result.blockers[0]).toMatch(/all 2 quizzes/i);
  });

  it("is eligible with all lessons done and no quizzes in the course", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: lessons,
      completedLessonIds: lessons,
      quizIds: [],
      passedQuizIds: [],
    });

    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.progressPercent).toBe(100);
  });

  it("is eligible when lessons and quizzes are all satisfied", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: lessons,
      completedLessonIds: lessons,
      quizIds: ["q1", "q2"],
      passedQuizIds: ["q1", "q2"],
    });

    expect(result.eligible).toBe(true);
  });

  it("ignores completions for lessons that no longer belong to the course", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: ["l1", "l2"],
      completedLessonIds: ["l1", "l2", "deleted-lesson"],
      quizIds: [],
      passedQuizIds: [],
    });

    expect(result.eligible).toBe(true);
    expect(result.lessonsDone).toBe(2);
  });

  it("ignores passed quizzes that belong to another course", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: lessons,
      completedLessonIds: lessons,
      quizIds: ["q1"],
      passedQuizIds: [],
    });

    expect(result.eligible).toBe(false);
  });

  it("never issues a certificate for a course with no lessons", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: [],
      completedLessonIds: [],
      quizIds: [],
      passedQuizIds: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.progressPercent).toBe(0);
    expect(result.blockers[0]).toMatch(/no lessons/i);
  });

  it("counts duplicate completion ids once", () => {
    const result = evaluateCertificateCompletion({
      lessonIds: ["l1", "l2"],
      completedLessonIds: ["l1", "l1", "l2"],
      quizIds: [],
      passedQuizIds: [],
    });

    expect(result.lessonsDone).toBe(2);
    expect(result.eligible).toBe(true);
  });
});

describe("generateCertificateSerial", () => {
  it("uses the prefix, issue year and sanitised entropy", () => {
    const issuedAt = Date.UTC(2026, 0, 15);
    expect(generateCertificateSerial(issuedAt, "3f9a1c77")).toBe(
      `${CERTIFICATE_SERIAL_PREFIX}-2026-3F9A1C77`,
    );
  });

  it("strips separators from UUID entropy", () => {
    const issuedAt = Date.UTC(2026, 5, 1);
    expect(generateCertificateSerial(issuedAt, "a1b2-c3d4-e5f6-0718")).toBe(
      "GL-2026-A1B2C3D4",
    );
  });

  it("pads short entropy to a fixed width", () => {
    const issuedAt = Date.UTC(2026, 5, 1);
    expect(generateCertificateSerial(issuedAt, "AB")).toBe("GL-2026-ABABABAB");
  });

  it("never emits more than 8 entropy characters", () => {
    const issuedAt = Date.UTC(2026, 5, 1);
    const serial = generateCertificateSerial(issuedAt, "0123456789ABCDEF");
    expect(serial).toBe("GL-2026-01234567");
  });
});

describe("isCertificateRevoked", () => {
  it("is false without a revocation timestamp", () => {
    expect(isCertificateRevoked({})).toBe(false);
    expect(isCertificateRevoked(null)).toBe(false);
  });

  it("is true once revoked", () => {
    expect(isCertificateRevoked({ revokedAt: 1 })).toBe(true);
  });
});

describe("formatCertificateDate", () => {
  it("formats a timestamp as a long UTC date", () => {
    expect(formatCertificateDate(Date.UTC(2026, 2, 9))).toBe("9 March 2026");
  });
});