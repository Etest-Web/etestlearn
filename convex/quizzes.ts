import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getQuizForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
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
        const options = await ctx.db
          .query("quizOptions")
          .withIndex("by_question", (qq) => qq.eq("questionId", q._id))
          .collect();
        return { question: q, options };
      }),
    );

    return { quiz, questions: questionsWithOptions };
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

    const quiz = await ctx.db
      .query("quizzes")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .unique();

    if (!quiz) {
      throw new Error("Quiz not found for lesson");
    }

    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz_order", (q) => q.eq("quizId", quiz._id))
      .collect();

    const optionsById = new Map(
      (
        await Promise.all(
          questions.map((question) =>
            ctx.db
              .query("quizOptions")
              .withIndex("by_question", (q) => q.eq("questionId", question._id))
              .collect(),
          ),
        )
      )
        .flat()
        .map((opt) => [opt._id, opt] as const),
    );

    let score = 0;
    const maxScore = questions.length;

    for (const question of questions) {
      const answer = args.answers.find(
        (a) => a.questionId === question._id,
      );
      if (!answer) continue;
      const option = optionsById.get(answer.optionId);
      if (option?.isCorrect) {
        score += 1;
      }
    }

    const percent = maxScore === 0 ? 0 : (score / maxScore) * 100;
    const passed = percent >= quiz.passingScore;

    const now = Date.now();
    await ctx.db.insert("quizAttempts", {
      userId: user._id,
      quizId: quiz._id,
      score,
      maxScore,
      passed,
      createdAt: now,
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

