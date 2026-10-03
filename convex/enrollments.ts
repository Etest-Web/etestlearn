import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { computeProgress } from "../lib/progress";

export const enrollInCourse = mutation({
  args: { courseId: v.id("courses") },
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

    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    const now = Date.now();

    if (existing) {
      return existing._id;
    }

    // Paid courses require a completed purchase (instructors/admins exempt).
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    if (course.price && course.price > 0 && user.role === "student") {
      const purchase = await ctx.db
        .query("purchases")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", user._id).eq("courseId", args.courseId),
        )
        .filter((q) => q.eq(q.field("status"), "paid"))
        .first();

      if (!purchase) {
        throw new Error(
          "This is a paid course — complete checkout with Paystack to enroll",
        );
      }
    }

    const id = await ctx.db.insert("enrollments", {
      userId: user._id,
      courseId: args.courseId,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Log enrollment activity
    await ctx.db.insert("learningActivities", {
      userId: user._id,
      type: "course_enrolled",
      courseId: args.courseId,
      createdAt: now,
    });

    // Increment course enrollment goals
    await ctx.runMutation(internal.goals.incrementGoalProgress, {
      userId: user._id,
      type: "complete_courses",
      amount: 1,
      date: now,
    });

    return id;
  },
});

export const getUserEnrollments = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    return await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const completeLesson = mutation({
  args: {
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    durationMinutes: v.optional(v.number()), // Time spent on lesson
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User record not found");

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();
    if (!enrollment) throw new Error("Not enrolled in this course");

    const completed = new Set(enrollment.completedLessonIds ?? []);
    const isNewCompletion = !completed.has(args.lessonId);
    if (isNewCompletion) {
      completed.add(args.lessonId);
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId))
      .collect();

    const progressPercent = computeProgress(completed.size, lessons.length);

    const now = Date.now();
    await ctx.db.patch(enrollment._id, {
      completedLessonIds: [...completed],
      progressPercent,
      updatedAt: now,
    });

    if (isNewCompletion) {
      // Get lesson details for logging
      const lesson = await ctx.db.get(args.lessonId);

      // Log lesson completion activity
      await ctx.db.insert("learningActivities", {
        userId: user._id,
        type: "lesson_completed",
        courseId: args.courseId,
        lessonId: args.lessonId,
        metadata: {
          durationMinutes: args.durationMinutes ?? lesson?.durationMinutes ?? 0,
          lessonTitle: lesson?.title,
        },
        createdAt: now,
      });

      // Increment lesson completion goals
      await ctx.runMutation(internal.goals.incrementGoalProgress, {
        userId: user._id,
        type: "complete_lessons",
        amount: 1,
        date: now,
      });

      // Increment watch hours goals if duration provided
      const durationMinutes = args.durationMinutes ?? lesson?.durationMinutes ?? 0;
      if (durationMinutes > 0) {
        await ctx.runMutation(internal.goals.incrementGoalProgress, {
          userId: user._id,
          type: "watch_hours",
          amount: durationMinutes, // Goals module converts to hours
          date: now,
        });
      }

      // Check for study streak (daily activity)
      await ctx.runMutation(internal.goals.incrementGoalProgress, {
        userId: user._id,
        type: "study_streak_days",
        amount: 1,
        date: now,
      });
    }

    // Issues the certificate automatically if this was the last outstanding
    // requirement. No-ops until the learner actually qualifies.
    await ctx.runMutation(internal.certificates.issueIfEligible, {
      userId: user._id,
      courseId: args.courseId,
    });

    return progressPercent;
  },
});

