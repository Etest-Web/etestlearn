import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRateLimit } from "./helpers/rateLimit";
import type { AnyCtx, Id, ReadCtx, UserDoc } from "./helpers/auth";

export const listThreadsForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyAccess(ctx, user, args.courseId);

    const threads = await ctx.db
      .query("discussionThreads")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    return threads;
  },
});

export const listMessagesForThread = query({
  args: { threadId: v.id("discussionThreads") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const thread = await ctx.db.get(args.threadId);
    if (!thread) return [];

    await verifyAccess(ctx, user, thread.courseId);

    return await ctx.db
      .query("discussionMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

async function getCurrentUser(ctx: AnyCtx): Promise<UserDoc> {
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
  return user;
}

async function verifyAccess(
  ctx: ReadCtx,
  user: UserDoc,
  courseId: Id<"courses">,
): Promise<void> {
  if (user.role === "admin") return;
  const course = await ctx.db.get(courseId);
  if (course && course.instructorId === user._id) return;

  const enrollment = await ctx.db
    .query("enrollments")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", user._id).eq("courseId", courseId),
    )
    .unique();

  if (!enrollment) {
    throw new Error("You must be enrolled in this course to participate in discussions");
  }
}

export const createThread = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyAccess(ctx, user, args.courseId);

    // Opening threads is far rarer than replying in one, so the budget is
    // tighter than postMessage's: a runaway client that ignored the cooldown
    // below could otherwise bury a course under empty threads. Durable
    // (DB-backed) so it survives cold starts, unlike an in-process counter.
    await requireRateLimit(ctx, `createThread:${user._id}`, 5, 60 * 60 * 1000);

    const now = Date.now();
    return await ctx.db.insert("discussionThreads", {
      courseId: args.courseId,
      title: args.title,
      createdBy: user._id,
      createdAt: now,
    });
  },
});

export const postMessage = mutation({
  args: {
    threadId: v.id("discussionThreads"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }
    
    await verifyAccess(ctx, user, thread.courseId);

    // Global per-user budget, in addition to the per-thread cooldown below.
    // The cooldown alone only slows someone down *within one thread*; it does
    // nothing about a client walking through every thread — or every course —
    // and posting once in each, which is exactly the shape of a spam flood.
    // Placed after the cooldown because both run in the same transaction: a
    // throw rolls the increment back, so a rejected attempt never burns quota.
    await requireRateLimit(ctx, `postMessage:${user._id}`, 10, 60 * 1000);

    // Rate limit: max one message per 10 seconds per user per thread.
    const recent = await ctx.db
      .query("discussionMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(20);
    const lastMine = recent.find((m) => m.userId === user._id);
    if (lastMine && Date.now() - lastMine.createdAt < 10_000) {
      throw new Error("You're posting too quickly — please wait a moment");
    }

    const now = Date.now();
    return await ctx.db.insert("discussionMessages", {
      threadId: args.threadId,
      userId: user._id,
      body: args.body,
      createdAt: now,
    });
  },
});

