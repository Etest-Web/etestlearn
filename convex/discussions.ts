import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRateLimit } from "./helpers/rateLimit";
import { logAudit } from "./helpers/audit";
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

    const messages = await ctx.db
      .query("discussionMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    return await Promise.all(
      messages.map(async (m) => {
        const author = await ctx.db.get(m.userId);
        return {
          ...m,
          authorName: author?.name ?? author?.email ?? null,
        };
      }),
    );
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
  // Mirrors helpers/auth.getCurrentUser: suspended reads as signed out.
  if (user.suspendedAt !== undefined) {
    throw new Error("Account suspended");
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

    // A moderation lock stops new posts but leaves history readable — the
    // point is to end a pile-on, not to erase the evidence of one.
    if (thread.locked) {
      throw new Error("This thread has been locked by a moderator");
    }

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


// ─── Moderation (admin console) ─────────────────────────────────────────────

async function requireDiscussionAdmin(ctx: AnyCtx): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Not authorized — admin access required");
  }
  return user;
}

/** Recent threads across every course, for the moderation queue. */
export const adminListThreads = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireDiscussionAdmin(ctx);

    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 50)));
    const threads = await ctx.db
      .query("discussionThreads")
      .withIndex("by_course")
      .order("desc")
      .take(limit);

    return await Promise.all(
      threads.map(async (thread) => {
        const [course, author, messages] = await Promise.all([
          ctx.db.get(thread.courseId),
          ctx.db.get(thread.createdBy),
          ctx.db
            .query("discussionMessages")
            .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
            .collect(),
        ]);
        return {
          _id: thread._id,
          title: thread.title,
          locked: thread.locked ?? false,
          createdAt: thread.createdAt,
          courseTitle: course?.title ?? null,
          courseId: thread.courseId,
          authorName: author?.name ?? author?.email ?? null,
          messageCount: messages.length,
          lastMessageAt: messages.length
            ? Math.max(...messages.map((m) => m.createdAt))
            : thread.createdAt,
        };
      }),
    );
  },
});

export const adminListThreadMessages = query({
  args: { threadId: v.id("discussionThreads") },
  handler: async (ctx, args) => {
    await requireDiscussionAdmin(ctx);

    const messages = await ctx.db
      .query("discussionMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    return await Promise.all(
      messages.map(async (message) => {
        const author = await ctx.db.get(message.userId);
        return {
          _id: message._id,
          body: message.body,
          createdAt: message.createdAt,
          authorName: author?.name ?? author?.email ?? null,
        };
      }),
    );
  },
});

/** Lock/unlock. Locked threads refuse new posts but keep their history. */
export const adminSetThreadLocked = mutation({
  args: { threadId: v.id("discussionThreads"), locked: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireDiscussionAdmin(ctx);

    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    await ctx.db.patch(args.threadId, { locked: args.locked });
    await logAudit(ctx, {
      actorId: admin._id,
      action: "discussion.set_locked",
      targetType: "discussionThread",
      targetId: args.threadId,
      details: { locked: args.locked, title: thread.title },
    });
  },
});

/** Removes a thread and every message in it. Audited with the title so the
 *  removal is reconstructible even though the rows are gone. */
export const adminDeleteThread = mutation({
  args: { threadId: v.id("discussionThreads") },
  handler: async (ctx, args) => {
    const admin = await requireDiscussionAdmin(ctx);

    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const messages = await ctx.db
      .query("discussionMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    await ctx.db.delete(args.threadId);

    await logAudit(ctx, {
      actorId: admin._id,
      action: "discussion.delete_thread",
      targetType: "discussionThread",
      targetId: args.threadId,
      details: {
        title: thread.title,
        courseId: thread.courseId,
        messageCount: messages.length,
      },
    });
  },
});

export const adminDeleteMessage = mutation({
  args: { messageId: v.id("discussionMessages") },
  handler: async (ctx, args) => {
    const admin = await requireDiscussionAdmin(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    await ctx.db.delete(args.messageId);
    await logAudit(ctx, {
      actorId: admin._id,
      action: "discussion.delete_message",
      targetType: "discussionMessage",
      targetId: args.messageId,
      details: { threadId: message.threadId, excerpt: message.body.slice(0, 120) },
    });
  },
});
