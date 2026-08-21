import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listPublishedCourses = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("courses")
      .withIndex("by_published", (q) => q.eq("published", true))
      .collect();
}
});

export const listInstructorCourses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    return await ctx.db
      .query("courses")
      .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
      .collect();
  },
});

export const getCourseBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!course) {
      return null;
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
      .collect();

    return { course, lessons };
  },
});

export const getCourseById = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);

    if (!course) {
      return null;
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
      .collect();

    return { course, lessons };
  },
});

export const createCourse = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    category: v.optional(v.string()),
    level: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    // Kobo; omit or 0 for free courses.
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
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

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized to create courses");
    }

    const now = Date.now();

    return await ctx.db.insert("courses", {
      title: args.title,
      slug: args.slug,
      description: args.description,
      instructorId: user._id,
      category: args.category,
      level: args.level,
      published: false,
      thumbnailUrl: args.thumbnailUrl,
      price: args.price,
      currency: args.currency,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCourse = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    level: v.optional(v.string()),
    published: v.optional(v.boolean()),
    thumbnailUrl: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
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

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    if (course.instructorId !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to update this course");
    }

    const updates: any = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.slug !== undefined) updates.slug = args.slug;
    if (args.description !== undefined) updates.description = args.description;
    if (args.category !== undefined) updates.category = args.category;
    if (args.level !== undefined) updates.level = args.level;
    if (args.published !== undefined) updates.published = args.published;
    if (args.thumbnailUrl !== undefined) updates.thumbnailUrl = args.thumbnailUrl;
    if (args.price !== undefined) updates.price = args.price;
    if (args.currency !== undefined) updates.currency = args.currency;

    updates.updatedAt = Date.now();

    await ctx.db.patch(args.courseId, updates);
  },
});

export const createLesson = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
    contentType: v.union(v.literal("video"), v.literal("article"), v.literal("quiz")),
    order: v.number(),
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

    const course = await ctx.db.get(args.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to add lessons to this course");
    }

    return await ctx.db.insert("lessons", {
      courseId: args.courseId,
      title: args.title,
      contentType: args.contentType,
      order: args.order,
      createdAt: Date.now(),
    });
  },
});

export const updateLesson = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.optional(v.string()),
    contentType: v.optional(v.union(v.literal("video"), v.literal("article"), v.literal("quiz"))),
    order: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    content: v.optional(v.string()),
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
      throw new Error("Not authorized to update lessons in this course");
    }

    const updates: any = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.contentType !== undefined) updates.contentType = args.contentType;
    if (args.order !== undefined) updates.order = args.order;
    if (args.durationMinutes !== undefined) updates.durationMinutes = args.durationMinutes;
    if (args.content !== undefined) updates.content = args.content;

    await ctx.db.patch(args.lessonId, updates);
  },
});

export const deleteLesson = mutation({
  args: { lessonId: v.id("lessons") },
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
      throw new Error("Not authorized to delete lessons in this course");
    }

    // TODO: cleanup related quizzes, attempts
    await ctx.db.delete(args.lessonId);
  },
});


export const getCourseAnalytics = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User record not found");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    if (course.instructorId !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to view analytics for this course");
    }

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const completedCount = enrollments.filter(
      (e) => e.progressPercent >= 100,
    ).length;

    // Average quiz score across all attempts on this course's quizzes.
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId))
      .collect();

    let attemptCount = 0;
    let totalPercent = 0;

    for (const lesson of lessons) {
      const quiz = await ctx.db
        .query("quizzes")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .unique();
      if (!quiz) continue;

      const attempts = await ctx.db
        .query("quizAttempts")
        .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
        .collect();

      for (const attempt of attempts) {
        attemptCount += 1;
        totalPercent +=
          attempt.maxScore === 0
            ? 0
            : (attempt.score / attempt.maxScore) * 100;
      }
    }

    return {
      enrollmentCount: enrollments.length,
      completionRate:
        enrollments.length === 0
          ? 0
          : Math.round((completedCount / enrollments.length) * 100),
      averageQuizScore: attemptCount === 0 ? null : Math.round(totalPercent / attemptCount),
      attemptCount,
    };
  },
});
