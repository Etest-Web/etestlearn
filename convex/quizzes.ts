import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { gradeQuiz } from "../lib/quiz";

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
    if (args.passingScore !== undefined) updates.passingScore = args.passingScore;

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

