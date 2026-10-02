/**
 * Course-completion evaluation shared by certificate issuance, the learner UI
 * and instructor analytics, so all three agree on what "completed" means.
 */
import {
  evaluateCertificateCompletion,
  type CertificateCompletion,
} from "../../lib/certificates";
import type { Id, ReadCtx } from "./auth";

/**
 * Lesson ids and quiz ids for a course, plus the quiz ids the learner has
 * passed. Quizzes are only counted when they hang off a lesson of this course,
 * so a quiz can never leak into another course's requirements.
 */
export async function loadCourseCompletionInputs(
  ctx: ReadCtx,
  courseId: Id<"courses">,
  userId: Id<"users">,
): Promise<{
  lessonIds: string[];
  quizIds: string[];
  passedQuizIds: string[];
}> {
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
    .collect();

  const lessonIds = lessons.map((l) => l._id);
  const quizIds: Id<"quizzes">[] = [];

  for (const lesson of lessons) {
    const quiz = await ctx.db
      .query("quizzes")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
      .unique();
    if (quiz) quizIds.push(quiz._id);
  }

  const attempts = await ctx.db
    .query("quizAttempts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const courseQuizIds = new Set(quizIds);
  const passedQuizIds = new Set<Id<"quizzes">>();
  for (const attempt of attempts) {
    if (attempt.passed && courseQuizIds.has(attempt.quizId)) {
      passedQuizIds.add(attempt.quizId);
    }
  }

  return { lessonIds, quizIds, passedQuizIds: [...passedQuizIds] };
}

/** Evaluate whether `userId` has met the bar for a certificate on `courseId`. */
export async function evaluateForLearner(
  ctx: ReadCtx,
  courseId: Id<"courses">,
  userId: Id<"users">,
  completedLessonIds: string[] | undefined,
): Promise<CertificateCompletion> {
  const { lessonIds, quizIds, passedQuizIds } = await loadCourseCompletionInputs(
    ctx,
    courseId,
    userId,
  );

  return evaluateCertificateCompletion({
    lessonIds,
    completedLessonIds: completedLessonIds ?? [],
    quizIds,
    passedQuizIds,
  });
}