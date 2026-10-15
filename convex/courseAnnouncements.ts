import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  canManageCourse,
  requireUser,
  type AnyCtx,
  type ReadCtx,
  type UserDoc,
} from "./helpers/auth";
import type { Id } from "./_generated/dataModel";
import { cleanAnnouncementText } from "../lib/announcements";

/**
 * Course announcements — a notice an instructor posts to one cohort.
 *
 * These are deliberately a separate table from the platform `announcements`
 * (which are admin-authored and rendered as a site-wide banner). Sharing one
 * table would mean every reader branching on "is this row a platform notice or
 * a course notice", and `announcements.listAll` — an admin console view — would
 * start leaking other people's drafts. Two tables keep authorship and audience
 * unambiguous: the platform table is admin-only, this one is owner-or-admin.
 *
 * Nothing here is audited. Posting to a course is ordinary self-service for its
 * owner, like creating a lesson or opening a discussion thread — neither of
 * which is audited either — and `auditLogs.actorId` is required, so logging
 * every notice would bury the privileged rows the log exists for.
 *
 * Publishing does not fan out a notification. A notice is read on the course
 * page; turning one click into one write per enrolled learner would make a
 * large cohort a transaction-size problem, and emailing the cohort would turn
 * it into a spam problem. This is the same reasoning `checkUserInactivityReminders`
 * records for not double-emailing learners.
 */

/** Read bound for both announcement lists; a course's notices are few. */
const MAX_ROWS = 100;

/**
 * Owner-or-admin gate. Returns the caller so the caller does not resolve
 * identity twice.
 */
async function requireCourseManager(
  ctx: AnyCtx,
  courseId: Id<"courses">,
): Promise<{ user: UserDoc; courseId: Id<"courses"> }> {
  const user = await requireUser(ctx);
  const course = await ctx.db.get(courseId);
  if (!course) throw new Error("Course not found");
  if (!(await canManageCourse(ctx, user, course))) {
    throw new Error(
      "Not authorized — only the course owner can manage its announcements",
    );
  }
  return { user, courseId };
}

/**
 * Read access for a course's announcements: staff who own it, or an enrolled
 * learner. Mirrors `discussions.verifyAccess`, including the admin bypass, so
 * "can I read this course" has one answer platform-wide.
 */
async function requireCourseAccess(
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
    throw new Error(
      "You must be enrolled in this course to see its announcements",
    );
  }
}

/** Author console: every notice for a course, drafts included, newest first. */
export const listForAuthor = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    await requireCourseManager(ctx, args.courseId);
    return await ctx.db
      .query("courseAnnouncements")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .order("desc")
      .take(MAX_ROWS);
  },
});

/** Learner view: published notices only, newest first, with the author's name. */
export const listForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireCourseAccess(ctx, user, args.courseId);

    const rows = await ctx.db
      .query("courseAnnouncements")
      .withIndex("by_course_published", (q) =>
        q.eq("courseId", args.courseId).eq("published", true),
      )
      .order("desc")
      .take(MAX_ROWS);

    // One read per distinct author rather than one per row: a cohort's notices
    // are usually written by the same person, so the naive loop would re-read
    // that user for every row against the deployment's read budget.
    const authorIds = [...new Set(rows.map((row) => row.authorId))];
    const authors = new Map(
      await Promise.all(
        authorIds.map(async (id) => [id, await ctx.db.get(id)] as const),
      ),
    );

    return rows.map((row) => {
      const author = authors.get(row.authorId);
      return {
        _id: row._id,
        title: row.title,
        body: row.body,
        publishedAt: row.publishedAt ?? row.createdAt,
        authorName: author?.name ?? author?.email ?? "Course instructor",
      };
    });
  },
});

export const create = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
    body: v.string(),
    // Draft by default: writing a notice and broadcasting it in one click is
    // the mistake this default exists to prevent.
    publish: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user, courseId } = await requireCourseManager(ctx, args.courseId);

    const { title, body, error } = cleanAnnouncementText({
      title: args.title,
      body: args.body,
    });
    if (error) throw new Error(error);

    const now = Date.now();
    const publish = args.publish ?? false;
    return await ctx.db.insert("courseAnnouncements", {
      courseId,
      authorId: user._id,
      title,
      body,
      published: publish,
      publishedAt: publish ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    announcementId: v.id("courseAnnouncements"),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.announcementId);
    if (!row) throw new Error("Announcement not found");
    await requireCourseManager(ctx, row.courseId);

    const { title, body, error } = cleanAnnouncementText({
      title: args.title,
      body: args.body,
    });
    if (error) throw new Error(error);

    // `publishedAt` is untouched: an edit corrects the wording, it does not
    // republish, and staling the learner-facing order for a typo would be worse
    // than leaving the original date on it.
    await ctx.db.patch(args.announcementId, {
      title,
      body,
      updatedAt: Date.now(),
    });
  },
});

/** Draft ↔ published. Unpublishing keeps the text and clears `publishedAt`. */
export const setPublished = mutation({
  args: {
    announcementId: v.id("courseAnnouncements"),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.announcementId);
    if (!row) throw new Error("Announcement not found");
    await requireCourseManager(ctx, row.courseId);

    if (row.published === args.published) return;

    const now = Date.now();
    await ctx.db.patch(args.announcementId, {
      published: args.published,
      publishedAt: args.published ? now : undefined,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { announcementId: v.id("courseAnnouncements") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.announcementId);
    if (!row) throw new Error("Announcement not found");
    await requireCourseManager(ctx, row.courseId);
    await ctx.db.delete(args.announcementId);
  },
});
