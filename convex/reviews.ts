import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCurrentUser,
  isStaff,
  requireUser,
  type Doc,
  type Id,
  type ReadCtx,
  type UserDoc,
} from "./helpers/auth";
import { requireRateLimit } from "./helpers/rateLimit";
import {
  averageRating,
  normalizeComment,
  ratingPatch,
  reviewDraftError,
  reviewEligibility,
} from "../lib/reviews";

/**
 * Learner reviews.
 *
 * A review is one row per learner per course (`courseReviews.by_user_course`),
 * written only through `upsertReview` below, which also maintains the running
 * `ratingSum` / `ratingCount` pair on the course document in the same
 * transaction. That denormalization is the reason a course page can print an
 * average without reading a single review, and the reason the catalog can print
 * one per card for fifty courses at no extra cost.
 *
 * Who may review, and why, is in `lib/reviews.ts#reviewEligibility` — read that
 * before changing any check here, because the mutation and the query must reach
 * the same verdict or the form will be drawn for someone the write then refuses.
 *
 * Two deliberate omissions:
 *
 * · **No audit rows.** A review is learner self-service, like a discussion post;
 *   `auditLogs.actorId` is for privileged actions, and logging every star would
 *   bury the rows that matter.
 * · **No notification to the instructor.** A bell that fires on every rating is
 *   noise, and a single 3-star needs the same reaction as any other. The
 *   instructor-facing view is `listForInstructor`, read on the analytics page.
 */

/** A course page shows the most recent reviews, not an export of them all. */
const MAX_COURSE_REVIEWS = 50;

/** Per course, when assembling one instructor's whole feedback picture. */
const MAX_REVIEWS_PER_COURSE = 10;

/** The instructor view is a dashboard block, not a moderation queue. */
const MAX_INSTRUCTOR_REVIEWS = 50;

/** An instructor with more courses than this reads the rest per course. */
const MAX_INSTRUCTOR_COURSES = 25;

/**
 * A review as the outside world may see it.
 *
 * Hand-written rather than `...row` for the same reason the public instructor
 * profile is: the row carries `userId`, and a future edit that spreads the
 * document into a card is exactly how a learner's id (or, one field later, their
 * email) ends up on a public page. The author is a name and a face.
 */
export interface PublicReview {
  _id: Id<"courseReviews">;
  rating: number;
  comment: string | null;
  createdAt: number;
  updatedAt: number;
  /** True when the learner came back and changed it after posting. */
  edited: boolean;
  authorName: string;
  authorImageUrl: string | null;
}

/**
 * Projects one review for display.
 *
 * A missing name becomes "A learner" and *not* the email, which is what
 * `discussions.ts` falls back to: that list is only ever read by people already
 * enrolled in the course, while a review is printed on a public page. An avatar
 * is a picture the learner chose; an email address is not a display name.
 */
async function toPublicReview(
  ctx: ReadCtx,
  row: Doc<"courseReviews">,
): Promise<PublicReview> {
  const author = await ctx.db.get(row.userId);
  return {
    _id: row._id,
    rating: row.rating,
    comment: row.comment ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    edited: row.updatedAt > row.createdAt,
    authorName: author?.name ?? "A learner",
    authorImageUrl: author?.imageUrl ?? null,
  };
}

/**
 * The shared eligibility read.
 *
 * Both `getReviewerState` and `upsertReview` go through this so there is one
 * definition of "may this person review this course", and it is the same
 * definition the pure helper tests. Note it takes the *course* rather than its
 * id — the caller has already loaded it, and the owner check needs the document.
 */
async function loadEligibility(
  ctx: ReadCtx,
  course: Doc<"courses"> | null,
  user: UserDoc | null,
) {
  let isEnrolled = false;
  if (course && user) {
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", course._id),
      )
      .unique();
    isEnrolled = enrollment !== null;
  }

  return reviewEligibility({
    signedIn: user !== null,
    role: user?.role,
    isCourseInstructor: Boolean(course && user && course.instructorId === user._id),
    isEnrolled,
  });
}

/**
 * Every review left on a course, newest first.
 *
 * Public: this is the list under the stars on the course page, and it is only
 * worth anything if the person deciding whether to buy can read it. Bounded at
 * {@link MAX_COURSE_REVIEWS} — the course document's `ratingCount` is the exact
 * total, so the UI can say "showing the 50 most recent" without another count.
 */
export const listForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("courseReviews")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      // The index orders by `_creationTime`; descending makes that newest-first.
      .order("desc")
      .take(MAX_COURSE_REVIEWS);

    return await Promise.all(rows.map((row) => toPublicReview(ctx, row)));
  },
});

/**
 * What the signed-in caller may do about this course, and their review if any.
 *
 * One query rather than three because the course page has to decide between
 * "write a review", "you already reviewed this — edit it", and a reason you
 * cannot, and asking separately would draw a different button for each round
 * trip. Signed out, it reports the same "sign in" reason the helper does, so the
 * UI never has to special-case a null.
 */
export const getReviewerState = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const course = await ctx.db.get(args.courseId);
    const eligibility = await loadEligibility(ctx, course, user);

    let review: {
      _id: Id<"courseReviews">;
      rating: number;
      comment: string | null;
      createdAt: number;
      updatedAt: number;
    } | null = null;

    if (user) {
      const mine = await ctx.db
        .query("courseReviews")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", user._id).eq("courseId", args.courseId),
        )
        .unique();
      if (mine) {
        review = {
          _id: mine._id,
          rating: mine.rating,
          comment: mine.comment ?? null,
          createdAt: mine.createdAt,
          updatedAt: mine.updatedAt,
        };
      }
    }

    return {
      signedIn: user !== null,
      canReview: eligibility.eligible,
      reason: eligibility.eligible ? null : eligibility.reason,
      review,
    };
  },
});

/**
 * Creates or replaces the caller's review of a course.
 *
 * Idempotent by construction: the pair `(userId, courseId)` is looked up first,
 * so a double submit edits the existing row rather than leaving two behind, and
 * the course's running total is moved by the *delta* between the old and new
 * rating instead of by the new one.
 *
 * Throwing rather than returning a rejection because both failures here are
 * genuine errors — a client that draws the form draws it from
 * `getReviewerState`, which uses the same eligibility check.
 */
export const upsertReview = mutation({
  args: {
    courseId: v.id("courses"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Before any read: this is user-generated public content, so a flood is
    // throttled ahead of the eligibility lookup it would otherwise hammer.
    await requireRateLimit(ctx, `review:${user._id}`, 10, 60_000);

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    const eligibility = await loadEligibility(ctx, course, user);
    if (!eligibility.eligible) throw new Error(eligibility.reason);

    const draftError = reviewDraftError({
      rating: args.rating,
      comment: args.comment,
    });
    if (draftError) throw new Error(draftError);

    const rating = args.rating;
    const comment = normalizeComment(args.comment);
    const now = Date.now();

    const existing = await ctx.db
      .query("courseReviews")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { rating, comment, updatedAt: now });
      await ctx.db.patch(
        course._id,
        ratingPatch(course, { sum: rating - existing.rating, count: 0 }),
      );
      return existing._id;
    }

    const reviewId = await ctx.db.insert("courseReviews", {
      courseId: args.courseId,
      userId: user._id,
      rating,
      comment,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(course._id, ratingPatch(course, { sum: rating, count: 1 }));
    return reviewId;
  },
});

/**
 * Deletes the caller's review.
 *
 * Deleting is offered rather than only editing because a review written by
 * mistake (or in anger) should not be permanent — and the running total has to
 * lose it too, or the average would keep counting a rating nobody can see.
 */
export const deleteReview = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("courseReviews")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    if (!existing) return false;

    await ctx.db.delete(existing._id);

    // The course may have been deleted since; the review cascade takes its rows,
    // and there is nothing left to adjust.
    const course = await ctx.db.get(args.courseId);
    if (course) {
      await ctx.db.patch(
        course._id,
        ratingPatch(course, { sum: -existing.rating, count: -1 }),
      );
    }

    return true;
  },
});

/**
 * One instructor's feedback picture: the headline average, a row per course, and
 * the most recent comments across all of them.
 *
 * Scoped to the caller's own courses through `by_instructor`, admin or not — the
 * same rule `instructorStats` follows, and for the same reason: an admin who
 * teaches reads their own teaching numbers here, and the platform-wide view is
 * the admin console's job.
 *
 * The headline average is weighted by rating count, not a mean of means: an
 * instructor with one 5-star review on a new course and fifty reviews averaging
 * 4.0 on their main course is not a 4.5 instructor, and reporting that would be
 * a way of making the number prettier than the teaching.
 */
export const listForInstructor = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || !isStaff(user)) {
      return null;
    }

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
      .take(MAX_INSTRUCTOR_COURSES);

    let totalSum = 0;
    let totalCount = 0;
    const courseSummaries: {
      courseId: Id<"courses">;
      title: string;
      slug: string;
      published: boolean;
      average: number | null;
      ratingCount: number;
    }[] = [];
    const recent: (PublicReview & {
      courseId: Id<"courses">;
      courseTitle: string;
      courseSlug: string;
    })[] = [];

    for (const course of courses) {
      const sum = course.ratingSum ?? 0;
      const count = course.ratingCount ?? 0;
      totalSum += sum;
      totalCount += count;

      courseSummaries.push({
        courseId: course._id,
        title: course.title,
        slug: course.slug,
        published: course.published,
        average: averageRating(sum, count),
        ratingCount: count,
      });

      const rows = await ctx.db
        .query("courseReviews")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .order("desc")
        .take(MAX_REVIEWS_PER_COURSE);

      for (const row of rows) {
        recent.push({
          ...(await toPublicReview(ctx, row)),
          courseId: course._id,
          courseTitle: course.title,
          courseSlug: course.slug,
        });
      }
    }

    recent.sort((a, b) => b.createdAt - a.createdAt);

    return {
      average: averageRating(totalSum, totalCount),
      ratingCount: totalCount,
      courseCount: courses.length,
      ratedCourseCount: courseSummaries.filter((c) => c.ratingCount > 0).length,
      // Rated courses first, worst average first: a 3-star course is the one the
      // instructor needs to look at, and burying it under the good ones would
      // make the block decorative.
      courses: courseSummaries.sort((a, b) => {
        if ((a.ratingCount > 0) !== (b.ratingCount > 0)) {
          return a.ratingCount > 0 ? -1 : 1;
        }
        if (a.average === null || b.average === null) return 0;
        return a.average - b.average;
      }),
      recent: recent.slice(0, MAX_INSTRUCTOR_REVIEWS),
    };
  },
});

/**
 * Rebuilds a course's running total from the review rows.
 *
 * Not wired to any UI. It exists so a test can assert that the incremental
 * arithmetic in `upsertReview` / `deleteReview` still lands on exactly the same
 * numbers as counting the table — the one failure mode denormalizing introduces,
 * and the one that would otherwise be invisible: an average that is subtly wrong
 * for a year looks exactly like an average that is right.
 */
export const recomputeCourseRating = internalMutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("courseReviews")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const count = rows.length;
    const sum = rows.reduce((total, row) => total + row.rating, 0);
    const patch =
      count > 0
        ? { ratingSum: sum, ratingCount: count }
        : { ratingSum: undefined, ratingCount: undefined };

    const course = await ctx.db.get(args.courseId);
    if (course) await ctx.db.patch(course._id, patch);

    return patch;
  },
});
