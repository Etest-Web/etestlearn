import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

