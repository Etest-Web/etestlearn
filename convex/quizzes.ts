import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { gradeQuiz } from "../lib/quiz";
import { requireRateLimit } from "./helpers/rateLimit";

/**
 * Convex has no range validator — `v.number()` exposes only `.optional()`,
 * never `.min()`/`.max()` — so the 0–100 contract for `passingScore` has to
 * be enforced here, before the value is stored. The bounds are not cosmetic:
 * a negative score makes `percent >= passingScore` true for every attempt,
 * so anyone could earn a certificate without answering anything, while a
 * score above 100 makes passing impossible and locks learners out of theirs.
 * NaN is rejected explicitly because it fails every comparison and would
 * silently mean "never passes".
 */
function assertPassingScoreInRange(passingScore: number): void {
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
    throw new Error("passingScore must be a number between 0 and 100");
  }
}

export const getQuizForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    // SECURITY: quiz data (including which options are correct) must never be
    // readable by unauthenticated or unenrolled callers.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User record not found");

    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) return null;

    const course = await ctx.db.get(lesson.courseId);
    if (!course) return null;

    const isOwnerOrAdmin =
      user.role === "admin" || course.instructorId === user._id;

    let hasFullAccess = isOwnerOrAdmin;

    if (!hasFullAccess) {
      const enrollment = await ctx.db
        .query("enrollments")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", user._id).eq("courseId", course._id),
        )
        .unique();
      if (!enrollment) {
        throw new Error("You must be enrolled in this course to view this quiz");
      }
    }

    const quiz = await ctx.db
      .query("quizzes")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .unique();

    if (!quiz) return null;

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz_order", (q) => q.eq("quizId", quiz._id))
      .collect();

    const questionsWithOptions = await Promise.all(
      questions.map(async (q) => {
        const rawOptions = await ctx.db
          .query("quizOptions")
          .withIndex("by_question", (qq) => qq.eq("questionId", q._id))
          .collect();
        // Nobody gets the answer key from this query — instructors use
        // getQuizAnswerKey instead. Students only ever see option text.
        const options = rawOptions.map(({ isCorrect: _isCorrect, ...rest }) => rest);
        return { question: q, options };
      }),
    );

    return { quiz, questions: questionsWithOptions };
  },
});

export const getQuizAnswerKey = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User record not found");

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) throw new Error("Quiz not found");

    const lesson = await ctx.db.get(quiz.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course) throw new Error("Course not found");

    // Owner-instructor or admin only.
    if (course.instructorId !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to view the answer key");
    }

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz_order", (q) => q.eq("quizId", args.quizId))
      .collect();

    const result = [];
    for (const question of questions) {
      const options = await ctx.db
        .query("quizOptions")
        .withIndex("by_question", (q) => q.eq("questionId", question._id))
        .collect();
      result.push({
        questionId: question._id,
        correctOptionIds: options.filter((o) => o.isCorrect).map((o) => o._id),
      });
    }
    return result;
  },
});

export const submitQuizAttempt = mutation({
  args: {
    lessonId: v.id("lessons"),
    answers: v.array(
      v.object({
        questionId: v.id("quizQuestions"),
        optionId: v.id("quizOptions"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User record not found");
    }

    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const quiz = await ctx.db
      .query("quizzes")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .unique();
    if (!quiz) {
      throw new Error("Quiz not found for lesson");
    }

    // SECURITY: only enrolled students (or the course owner/admin) may submit.
    const course = await ctx.db.get(lesson.courseId);
    if (!course) throw new Error("Course not found");

    const isOwnerOrAdmin =
      user.role === "admin" || course.instructorId === user._id;

    if (!isOwnerOrAdmin) {
      const enrollment = await ctx.db
        .query("enrollments")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", user._id).eq("courseId", course._id),
        )
        .unique();
      if (!enrollment) {
        throw new Error("You must be enrolled in this course to take this quiz");
      }
    }

    // Rate limit: max one attempt per 30 seconds per user per quiz.
    const recentAttempts = await ctx.db
      .query("quizAttempts")
      .withIndex("by_user_quiz", (q) =>
        q.eq("userId", user._id).eq("quizId", quiz._id),
      )
      .order("desc")
      .take(1);

    const lastAttempt = recentAttempts[0];
    if (lastAttempt && Date.now() - lastAttempt.createdAt < 30_000) {
      throw new Error("Please wait 30 seconds before trying again");
    }

    // Global cap: 10 accepted submissions per user per minute, on top of the
    // per-quiz cooldown above. The cooldown only throttles repeats against one
    // quiz, so a caller can otherwise fan out over every lesson and keep the
    // grading path — plus the certificate issuance it can trigger — running
    // back to back without pause. Keyed by user id so one caller can never
    // exhaust another caller's bucket.
    //
    // Placed after the enrollment and cooldown guards on purpose: Convex
    // mutations are transactions, so any later throw rolls back everything
    // including this increment. Rejected attempts can therefore never burn
    // budget, and every counted slot is an attempt that actually reached
    // grading — which is exactly the work this limit exists to bound.
    await requireRateLimit(ctx, `submitQuizAttempt:${user._id}`, 10, 60_000);

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz_order", (q) => q.eq("quizId", quiz._id))
      .collect();

    const optionLists = await Promise.all(
      questions.map((question) =>
        ctx.db
          .query("quizOptions")
          .withIndex("by_question", (q) => q.eq("questionId", question._id))
          .collect(),
      ),
    );

    const optionsByQuestion = new Map<string, string[]>();
    for (const [question, opts] of questions.map((question, i) => [
      question,
      optionLists[i],
    ] as const)) {
      optionsByQuestion.set(
        question._id,
        opts.filter((o) => o.isCorrect).map((o) => o._id),
      );
    }

    const grade = gradeQuiz(
      [...optionsByQuestion].map(([id, correctOptionIds]) => ({
        id,
        correctOptionIds,
      })),
      args.answers,
      quiz.passingScore,
    );
    const { score, maxScore, percent, passed } = grade;

    const now = Date.now();
    await ctx.db.insert("quizAttempts", {
      userId: user._id,
      quizId: quiz._id,
      score,
      maxScore,
      passed,
      createdAt: now,
    });

    // Log quiz attempt activity
    await ctx.db.insert("learningActivities", {
      userId: user._id,
      type: passed ? "quiz_passed" : "quiz_attempted",
      courseId: course._id,
      lessonId: lesson._id,
      quizId: quiz._id,
      metadata: {
        score,
        maxScore,
        percent,
        passed,
        quizTitle: quiz.title,
      },
      createdAt: now,
    });

    // Increment quiz goals
    await ctx.runMutation(internal.goals.incrementGoalProgress, {
      userId: user._id,
      type: passed ? "pass_quizzes" : "complete_lessons", // quiz attempt counts as lesson engagement
      amount: 1,
      date: now,
    });

    // Also increment study streak for quiz activity
    await ctx.runMutation(internal.goals.incrementGoalProgress, {
      userId: user._id,
      type: "study_streak_days",
      amount: 1,
      date: now,
    });

    // Passing a quiz can be the last thing standing between the learner and
    // their certificate, so re-check eligibility here too.
    await ctx.runMutation(internal.certificates.issueIfEligible, {
      userId: user._id,
      courseId: course._id,
    });

    return { score, maxScore, percent, passed };
  },
});

export const createQuiz = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.string(),
    passingScore: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to manage quizzes for this course");
    }

    const existingQuiz = await ctx.db
      .query("quizzes")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .unique();

    if (existingQuiz) {
      throw new Error("Quiz already exists for this lesson");
    }

    assertPassingScoreInRange(args.passingScore);

    const quizId = await ctx.db.insert("quizzes", {
      lessonId: args.lessonId,
      title: args.title,
      passingScore: args.passingScore,
      createdAt: Date.now(),
    });

    return quizId;
  },
});

export const updateQuiz = mutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.optional(v.string()),
    passingScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) throw new Error("Quiz not found");

    const lesson = await ctx.db.get(quiz.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to update this quiz");
    }

    const updates: any = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.passingScore !== undefined) {
      // Same 0–100 rule as creation: tightening the bar must not be able to
      // push it out of range either.
      assertPassingScoreInRange(args.passingScore);
      updates.passingScore = args.passingScore;
    }

    await ctx.db.patch(args.quizId, updates);
  },
});

export const addQuizQuestion = mutation({
  args: {
    quizId: v.id("quizzes"),
    prompt: v.string(),
    options: v.array(
      v.object({
        text: v.string(),
        isCorrect: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) throw new Error("Quiz not found");

    const lesson = await ctx.db.get(quiz.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to modify this quiz");
    }

    // Validate the whole answer key before the first insert. The instructor UI
    // checks these too, but it is client-side code anyone can bypass by calling
    // this mutation directly, and a broken key is a real attack on learners:
    // with zero correct options a question can never be answered, which blocks
    // everyone in that course from the passing score — and therefore from their
    // certificate. Empty or repeated texts make the key ambiguous, so two
    // identical choices grade differently depending on which row the grader
    // reads first.
    if (args.options.length < 2) {
      throw new Error("A question needs at least two options");
    }
    const texts = args.options.map((option) => option.text.trim());
    if (texts.some((text) => text.length === 0)) {
      throw new Error("Option text cannot be empty");
    }
    if (new Set(texts.map((text) => text.toLowerCase())).size !== texts.length) {
      throw new Error("Options must be distinct");
    }
    if (!args.options.some((option) => option.isCorrect)) {
      throw new Error("At least one option must be marked correct");
    }

    const existingQuestions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz_order", (q) => q.eq("quizId", args.quizId))
      .collect();

    const order = existingQuestions.length;

    const questionId = await ctx.db.insert("quizQuestions", {
      quizId: args.quizId,
      prompt: args.prompt,
      order,
    });

    for (const option of args.options) {
      await ctx.db.insert("quizOptions", {
        questionId,
        text: option.text,
        isCorrect: option.isCorrect,
      });
    }

    return questionId;
  },
});

export const deleteQuizQuestion = mutation({
  args: {
    questionId: v.id("quizQuestions"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const quiz = await ctx.db.get(question.quizId);
    if (!quiz) throw new Error("Quiz not found");

    const lesson = await ctx.db.get(quiz.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to modify this quiz");
    }

    // Delete options first
    const options = await ctx.db
      .query("quizOptions")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();

    for (const opt of options) {
      await ctx.db.delete(opt._id);
    }

    await ctx.db.delete(args.questionId);
  },
});

