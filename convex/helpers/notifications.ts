import type { DatabaseWriter } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { NotificationType } from "../inbox";

export interface CreateNotificationArgs {
  userId: Id<"users">;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  actorId?: Id<"users">;
}

/**
 * Creates or updates an in-app notification within an existing mutation.
 *
 * Rules:
 *  - Verifies recipient exists.
 *  - Validates title non-empty and href is internal.
 *  - Deduplicates active direct_message notifications for the same actor to keep
 *    the inbox feed clean instead of redundant message alerts.
 *  - Deduplicates course_reminder within 7 days.
 *  - Deduplicates pending unread friend_request from the same actor.
 */
export async function createNotification(
  ctx: { db: DatabaseWriter },
  args: CreateNotificationArgs,
): Promise<Id<"notifications"> | null> {
  const recipient = await ctx.db.get(args.userId);
  if (!recipient) return null;

  const title = args.title.trim();
  if (title.length === 0) return null;

  let href: string | undefined;
  if (args.href !== undefined) {
    const trimmed = args.href.trim();
    const isInternal =
      trimmed.startsWith("/") &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("/\\");
    if (!isInternal) return null;
    href = trimmed;
  }

  const now = Date.now();

  // Deduplicate direct messages: if there is already an unread DM notification
  // for this recipient from this actor, update its preview and timestamp.
  if (args.type === "direct_message" && args.actorId) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", args.userId).eq("readAt", undefined),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "direct_message"),
          q.eq(q.field("actorId"), args.actorId),
        ),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title,
        body: args.body?.trim(),
        href,
        createdAt: now,
      });
      return existing._id;
    }
  }

  // Deduplicate friend requests: if unread friend request from same actor exists, reuse.
  if (args.type === "friend_request" && args.actorId) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", args.userId).eq("readAt", undefined),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "friend_request"),
          q.eq(q.field("actorId"), args.actorId),
        ),
      )
      .first();

    if (existing) {
      return existing._id;
    }
  }

  // Deduplicate course reminders: avoid sending another reminder for the same course within 7 days.
  if (args.type === "course_reminder" && href) {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", args.userId).gte("createdAt", sevenDaysAgo),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "course_reminder"),
          q.eq(q.field("href"), href),
        ),
      )
      .first();

    if (existing) {
      return existing._id;
    }
  }

  return await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title,
    body: args.body?.trim(),
    href,
    actorId: args.actorId,
    createdAt: now,
  });
}
