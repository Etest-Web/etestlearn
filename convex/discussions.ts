import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listThreadsForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("discussionThreads")
      .withIndex("by_course", (q: any) => q.eq("courseId", args.courseId))
      .collect();

    return threads;
  },
});

export const listMessagesForThread = query({
  args: { threadId: v.id("discussionThreads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("discussionMessages")
      .withIndex("by_thread", (q: any) => q.eq("threadId", args.threadId))
      .collect();
  },
});

async function getCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) {
    throw new Error("User record not found");
  }
  return user;
}

export const createThread = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
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
    const now = Date.now();
    return await ctx.db.insert("discussionMessages", {
      threadId: args.threadId,
      userId: user._id,
      body: args.body,
      createdAt: now,
    });
  },
});

