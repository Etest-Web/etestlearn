import { internalQuery, internalMutation } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { EmailTemplateId } from "../lib/emails/types";
import { DRIP_CADENCE } from "../lib/emails/drip";

/**
 * The reads `convex/emailCampaigns.ts` needs, split out because a `"use node"`
 * module may only export actions. Every function here is `internal`, so nothing
 * is reachable from the client.
 *
 * The return shapes below are exported so the caller in `emailCampaigns.ts` can
 * name them on a `makeFunctionReference`. Without that the action's inferred
 * return type depends on this module, which depends on `_generated/api`, which
 * depends on the action — a cycle TypeScript resolves to `any` for the whole
 * file (TS7022).
 */

export type DripFacts = {
  userId: Id<"users">;
  email: string | null;
  name: string | null;
  courseTitle: string;
  courseSlug: string;
  instructorName: string | null;
  enrolledAt: number;
  lastActivityAt: number;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  totalMinutes: number;
  firstLessonTitle: string | null;
  hasCertificate: boolean;
  idleDays: number;
  enrolledDaysAgo: number;
  now: number;
};

export type EnrollmentEmailContext = {
  userId: Id<"users">;
  email: string | null;
  name: string | null;
  courseTitle: string;
  courseSlug: string;
  instructorName: string;
  lessonCount: number;
  totalMinutes: number;
  isPaid: boolean;
};

export type NotificationEmailContext = {
  email: string | null;
  name: string | null;
  userId: Id<"users">;
  templateId: EmailTemplateId;
  data: Record<string, unknown>;
};

export type CourseDigestItem = {
  title: string;
  slug: string;
  description: string;
  category: string | undefined;
  level: string | undefined;
  instructorName: string;
  priceKobo: number | undefined;
};

export type BroadcastRecipient = {
  userId: Id<"users">;
  email: string;
  name: string | null;
};

/**
 * The drip action, named rather than imported.
 *
 * `scheduleDrip` lives in this module and `runDripStep` lives in
 * `emailCampaigns.ts`, which imports types from here. Reaching for
 * `_generated/api` inside `ctx.scheduler.runAfter` would close that loop and
 * TypeScript would give up on the whole call.
 */
const runDripStepReference = makeFunctionReference<
  "action",
  { enrollmentId: Id<"enrollments">; stepId: string },
  unknown
>("emailCampaigns:runDripStep");

/** Read a user by id, or null. Used by senders that only hold an id. */
export const getUserForEmail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    return {
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  },
});

/**
 * Whether this learner should receive nudge and broadcast mail.
 *
 * Default is allowed. The stored preference is `marketingEmails?: boolean`, and
 * only an explicit `false` opts out, so a user who has never opened settings is
 * still reachable.
 */
export const allowsMarketing = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    if (user.suspendedAt !== undefined) return false;
    return user.preferences?.marketingEmails !== false;
  },
});

/**
 * Everything a drip step decides on, gathered in one place so the action does
 * not need four round trips and, more importantly, so the decision is made
 * against a consistent read.
 */
export const dripFacts = internalQuery({
  args: { enrollmentId: v.id("enrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) return null;

    const [user, course, lessons] = await Promise.all([
      ctx.db.get(enrollment.userId),
      ctx.db.get(enrollment.courseId),
      ctx.db
        .query("lessons")
        .withIndex("by_course_order", (q) =>
          q.eq("courseId", enrollment.courseId),
        )
        .collect(),
    ]);

    if (!user || !course) return null;

    const now = Date.now();

    // Activity is the newest of the enrollment row and any lesson, quiz or
    // certificate event. The enrollment's own `updatedAt` is the floor, since a
    // learner who reopens a course counts as active.
    let lastActivityAt = enrollment.updatedAt;
    const activities = await ctx.db
      .query("learningActivities")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", enrollment.userId).eq("courseId", enrollment.courseId),
      )
      .collect();

    for (const activity of activities) {
      if (activity.createdAt > lastActivityAt) lastActivityAt = activity.createdAt;
    }

    const hasCertificate = await ctx.db
      .query("certificates")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", enrollment.userId).eq("courseId", enrollment.courseId),
      )
      .unique();

    const instructor = course.instructorId
      ? await ctx.db.get(course.instructorId)
      : null;

    const firstLesson = lessons.length > 0 ? lessons[0] : null;
    const totalMinutes = lessons.reduce(
      (sum, lesson) => sum + (lesson.durationMinutes ?? 0),
      0,
    );

    return {
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      courseTitle: course.title,
      courseSlug: course.slug,
      instructorName: instructor?.name?.trim() || null,
      enrolledAt: enrollment.createdAt,
      lastActivityAt,
      progressPercent: enrollment.progressPercent,
      completedLessons: enrollment.completedLessonIds?.length ?? 0,
      totalLessons: lessons.length,
      totalMinutes,
      firstLessonTitle: firstLesson?.title ?? null,
      hasCertificate: hasCertificate !== null,
      idleDays: Math.floor((now - lastActivityAt) / 86_400_000),
      enrolledDaysAgo: Math.floor(
        (now - enrollment.createdAt) / 86_400_000,
      ),
      now,
    };
  },
});

/**
 * Everything the enrollment confirmation needs, read at send time.
 *
 * A course with no lessons is still worth confirming, so `lessonCount: 0`
 * passes through and the template writes around it.
 */
export const enrollmentEmailContext = internalQuery({
  args: { enrollmentId: v.id("enrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) return null;

    const [user, course] = await Promise.all([
      ctx.db.get(enrollment.userId),
      ctx.db.get(enrollment.courseId),
    ]);

    if (!user || !course) return null;

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", enrollment.courseId))
      .collect();

    const instructor = course.instructorId
      ? await ctx.db.get(course.instructorId)
      : null;

    return {
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      courseTitle: course.title,
      courseSlug: course.slug,
      instructorName: instructor?.name?.trim() || "your instructor",
      lessonCount: lessons.length,
      totalMinutes: lessons.reduce(
        (sum, lesson) => sum + (lesson.durationMinutes ?? 0),
        0,
      ),
      isPaid: Boolean(course.price && course.price > 0),
    };
  },
});

/** Summary of a course used by the enrollment confirmation. */
export const courseForEmail = internalQuery({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) return null;

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId))
      .collect();

    const instructor = course.instructorId
      ? await ctx.db.get(course.instructorId)
      : null;

    return {
      title: course.title,
      slug: course.slug,
      instructorName: instructor?.name?.trim() || "your instructor",
      lessonCount: lessons.length,
      totalMinutes: lessons.reduce(
        (sum, lesson) => sum + (lesson.durationMinutes ?? 0),
        0,
      ),
      isPaid: Boolean(course.price && course.price > 0),
    };
  },
});

/**
 * Translate an in-app notification into the email it should produce.
 *
 * Reads the notification back rather than receiving the context from the
 * caller, so the email cannot describe something different from the row the
 * reader will see in their inbox.
 *
 * Returns null for types with no email equivalent. That set is deliberately
 * narrower than the union: most notifications are better left in the app.
 */
export const notificationEmailContext = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;

    const recipient = await ctx.db.get(notification.userId);
    if (!recipient) return null;

    const base = {
      email: recipient.email ?? null,
      name: recipient.name ?? null,
      userId: recipient._id,
    };

    switch (notification.type) {
      case "discussion_reply": {
        const actor = notification.actorId
          ? await ctx.db.get(notification.actorId)
          : null;
        if (!actor) return null;

        // The thread is reached through the href the notifier stored.
        if (!notification.href) return null;

        return {
          ...base,
          templateId: "discussionReply" as const,
          data: {
            name: recipient.name ?? "",
            threadTitle: notification.title,
            courseTitle: notification.body ?? "your course",
            replierName: actor.name?.trim() || "Someone",
            // The stored body is a one-line preview, which is what an email
            // excerpt should be anyway.
            excerpt: notification.body ?? "",
            threadUrl: notification.href,
          },
        };
      }

      default:
        // Everything else returns null on purpose.
        //
        // `course_reminder`: the drip owns that cadence, and mirroring it here
        //   would mail the same learner twice for the same nudge.
        // `certificate_earned`: `emailCampaigns.sendCertificateIssued` is
        //   scheduled by the issuing mutation, which has the real serial and
        //   issue date. Deriving them from the notification's title and body
        //   would mean parsing prose, and the two emails could disagree.
        return null;
    }
  },
});

/** The thread a discussion message belongs to, for the reply notification. */
export const threadForEmail = internalQuery({
  args: { messageId: v.id("discussionMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    const thread = await ctx.db.get(message.threadId);
    if (!thread) return null;

    const course = await ctx.db.get(thread.courseId);
    const replier = await ctx.db.get(message.userId);

    return {
      threadTitle: thread.title,
      courseTitle: course?.title ?? "your course",
      courseSlug: course?.slug ?? "",
      replierName: replier?.name?.trim() || "Someone",
    };
  },
});

/**
 * Recipients for a broadcast.
 *
 * Paged rather than collected in one go: a `.collect()` over `users` is a full
 * table scan that would fail outright on a large deployment.
 */
export const broadcastRecipients = internalQuery({
  args: {
    onlyUsers: v.optional(v.array(v.id("users"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 500, 2000);
    const out: BroadcastRecipient[] = [];

    const users = args.onlyUsers
      ? await Promise.all(args.onlyUsers.map((id) => ctx.db.get(id)))
      : await ctx.db.query("users").take(limit);

    for (const user of users) {
      if (!user) continue;
      if (!user.email) continue;
      if (user.suspendedAt !== undefined) continue;
      if (user.preferences?.marketingEmails === false) continue;
      out.push({
        userId: user._id,
        email: user.email,
        name: user.name ?? null,
      });
    }

    return out;
  },
});

/** Recently published courses for the digest. */
export const recentPublishedCourses = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 6, 12);

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_published", (q) => q.eq("published", true))
      .order("desc")
      .take(limit);

    const out: Array<{
      title: string;
      slug: string;
      description: string;
      category: string | undefined;
      level: string | undefined;
      instructorName: string;
      priceKobo: number | undefined;
    }> = [];

    for (const course of courses) {
      const instructor = course.instructorId
        ? await ctx.db.get(course.instructorId)
        : null;

      out.push({
        title: course.title,
        slug: course.slug,
        description: course.description.slice(0, 180),
        category: course.category,
        level: course.level,
        instructorName: instructor?.name?.trim() || "Glypha Learn",
        priceKobo: course.price,
      });
    }

    return out;
  },
});

/**
 * Queue the whole drip for one enrollment.
 *
 * Scheduled from the enrolling mutation, which cannot call an action, so this
 * runs one step into the future and does the scheduling itself.
 */
/**
 * Queue the drip for an enrollment.
 *
 * Guarded by `by_dedupe_key` rather than by checking for scheduled work,
 * because Convex offers no way to read pending scheduler entries. The key is
 * written when the first step is queued, so a retried enrolling mutation cannot
 * double the cadence.
 */
export const scheduleDrip = internalMutation({
  args: { enrollmentId: v.id("enrollments") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_dedupe_key", (q) =>
        q.eq("dedupeKey", `dripScheduled:${args.enrollmentId}`),
      )
      .unique();

    if (existing) return 0;

    const enrollment = await ctx.db.get(args.enrollmentId);
    if (!enrollment) return 0;

    for (const step of DRIP_CADENCE) {
      await ctx.scheduler.runAfter(
        // Floor of a minute, so an enrollment made while the drift is changed
        // to a sub-day offset still schedules rather than firing instantly.
        Math.max(step.dayOffset * 86_400_000, 60_000),
        runDripStepReference,
        { enrollmentId: args.enrollmentId, stepId: step.id },
      );
    }

    await ctx.db.insert("emailDeliveries", {
      dedupeKey: `dripScheduled:${args.enrollmentId}`,
      templateId: "dripScheduled",
      group: "courses",
      category: "nudge",
      status: "skipped",
      reason: "drip scheduled",
      recipient: "",
      userId: enrollment.userId,
      claimedAt: Date.now(),
    });

    return DRIP_CADENCE.length;
  },
});