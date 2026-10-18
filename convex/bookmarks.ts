import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireUser } from "./helpers/auth";
import { MAX_BOOKMARKS, bookmarkableCourse } from "../lib/bookmarks";

/**
 * Bookmarks — "save this course for later".
 *
 * The smallest feature on the platform, and deliberately so: one row per learner
 * per course, one toggle, one list. There is no rating or note on the row,
 * because a bookmark is a private intent and the moment it carries a star it
 * stops meaning one thing.
 *
 * Uniqueness is enforced by lookup rather than by a constraint, matching the two
 * review tables: `by_user_course` is read before the insert, so a double-tap
 * removes the row it just added instead of leaving a duplicate behind. That is
 * what makes the toggle safe to call from a client that fires twice.
 *
 * One rule worth stating plainly: **bookmarking requires a session.** Unlike a
 * review — which is public content and readable signed out — a bookmark is
 * private to one person, so there is nothing for a signed-out visitor to see
 * and no useful action for them to take.
 */

/**
 * The courses a learner has saved, newest save first.
 *
 * Hand-written projection rather than `...row`: the row carries `userId`, and
 * this list is only ever read by the person it belongs to — but the projection
 * is what stops a future `...row` edit from putting that id into a component
 * that ends up somewhere shared.
 *
 * The course fields here are a snapshot of what the saved page needs to render
 * a card without a second round trip per row.
 */
export const listMyBookmarks = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(MAX_BOOKMARKS);

    return await Promise.all(
      rows.map(async (row) => {
        const course = await ctx.db.get(row.courseId);
        // A course is never hard-deleted today, so this is defensive rather
        // than a real branch — but the saved page must not throw on a bookmark
        // whose course has gone, and a null here renders as a removed card.
        if (!course) return { _id: row._id, createdAt: row.createdAt, course: null };

        const instructor = await ctx.db.get(course.instructorId);
        return {
          _id: row._id,
          createdAt: row.createdAt,
          course: {
            _id: course._id,
            title: course.title,
            slug: course.slug,
            description: course.description,
            thumbnailUrl: course.thumbnailUrl ?? null,
            category: course.category ?? null,
            level: course.level ?? null,
            price: course.price,
            currency: course.currency,
            ratingSum: course.ratingSum,
            ratingCount: course.ratingCount,
            // The name, not the id: a card links to the course, and carrying the
            // instructor's document id past this projection is one careless
            // spread away from exposing it.
            instructorName: instructor?.name ?? null,
          },
        };
      }),
    );
  },
});

/**
 * The caller's bookmarked course ids.
 *
 * Separate from `listMyBookmarks` because the catalog renders fifty cards and
 * the saved page renders zero of them: a heart on every card needs a set of ids,
 * not fifty hydrated course documents. Returned as ids so the answer is small
 * enough to subscribe to cheaply and change on exactly one toggle.
 */
export const listBookmarkedCourseIds = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MAX_BOOKMARKS);

    return rows.map((row) => row.courseId);
  },
});

/**
 * Adds or removes the caller's bookmark for a course.
 *
 * Returns the resulting state so a client can settle its optimistic toggle from
 * the server's answer rather than assuming — which matters because the one case
 * that refuses (your own course) would otherwise leave the heart painted.
 *
 * Not rate-limited: it is one indexed read and one write against a row that is
 * the caller's own, and a learner flipping a heart is not a flood. The
 * alternative — a limit here — would break the exact interaction it guards.
 */
export const toggleBookmark = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    // A missing course above and this check below are the same refusal to a
    // caller; this one exists because the policy needs the document, and
    // "Course not found" is the better message for someone following a dead
    // link rather than a crafted id.
    const eligible = bookmarkableCourse({
      published: course.published,
      isOwnCourse: course.instructorId === user._id,
    });
    if (!eligible.eligible) throw new Error(eligible.reason);

    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { bookmarked: false };
    }

    await ctx.db.insert("bookmarks", {
      userId: user._id,
      courseId: args.courseId,
      createdAt: Date.now(),
    });
    return { bookmarked: true };
  },
});

/**
 * Whether the caller's bookmark for a course is currently set.
 *
 * A single-course read so the course page's heart does not have to subscribe to
 * the caller's entire bookmark list, which would re-render the saved page's data
 * every time any heart on the page is pressed.
 */
export const isBookmarked = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    return existing !== null;
  },
});