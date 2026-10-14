import type { DatabaseWriter } from "../_generated/server";
import { makeFunctionReference, type GenericMutationCtx } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { NotificationType } from "../inbox";

// Named rather than imported from `_generated/api`, which does not list the
// email modules until codegen has run. Same wire name either way.
const sendNotificationEmailRef = makeFunctionReference<"action">(
  "emailCampaigns:sendNotificationEmail",
);

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
  ctx: { db: DatabaseWriter; scheduler: GenericMutationCtx<any>["scheduler"] },
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

  const id = await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title,
    body: args.body?.trim(),
    href,
    actorId: args.actorId,
    createdAt: now,
  });

  // Mirror the notification types worth an email into the delivery pipeline.
  //
  // Scheduled, not sent inline: every caller of this helper is inside a
  // transaction that must not wait on a network round trip, and the scheduled
  // action also re-checks the recipient before it does anything.
  //
  // `course_reminder` is deliberately absent. The email drip owns that cadence,
  // and scheduling one from here as well would mail the same learner twice for
  // the same nudge. The in-app row is still written.
  if (EMAIL_NOTIFICATION_TYPES.has(args.type)) {
    const recipient = await ctx.db.get(args.userId);
    if (recipient?.email && recipient.suspendedAt === undefined) {
      await ctx.scheduler.runAfter(
        0,
        sendNotificationEmailRef,
        { notificationId: id },
      );
    }
  }

  return id;
}

/**
 * Which notification types are worth interrupting someone's inbox for.
 *
 * Read here and in `sendNotificationEmail` rather than inferred, so adding a
 * type here does not silently start emailing.
 */
const EMAIL_NOTIFICATION_TYPES = new Set<NotificationType>([
  "discussion_reply",
]);
