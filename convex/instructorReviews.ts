import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCurrentUser,
  requireUser,
  type Doc,
  type Id,
  type ReadCtx,
  type UserDoc,
} from "./helpers/auth";
import { requireRateLimit } from "./helpers/rateLimit";
import {
  averageRating,
  instructorReviewEligibility,
  normalizeComment,
  ratingPatchOf,
  reviewDraftError,
} from "../lib/reviews";

/**
 * The field names of the running total on `users`.
 *
 * Passed to `ratingPatchOf` rather than defaulted there, so the three writes
 * below cannot disagree about which pair they are maintaining.
 */
const TOTAL = { sum: "instructorRatingSum", count: "instructorRatingCount" } as const;

/**
 * Instructor reviews — a star for the person, not the course.
 *
 * Structurally a mirror of `convex/reviews.ts` on purpose: one row per learner
 * per instructor (`instructorReviews.by_user_instructor`), an optional comment,
 * and a running `instructorRatingSum` / `instructorRatingCount` pair maintained
 * on the `users` row in the same transaction that writes the review. Every
 * arithmetic and projection decision in that module applies here unchanged, so
 * this file reads as a short file rather than a second dialect of review code.
 *
 * What differs is the gate, and it is the whole reason this is a separate table
 * rather than a rollup of `courseReviews`: who is allowed to rate an instructor
 * is a question about *history*, not about one course. See
 * `lib/reviews.ts#instructorReviewEligibility`.
 *
 * Two deliberate omissions, both inherited from the course side:
 *
 * · **No audit rows.** A rating is learner self-service. `auditLogs.actorId` is
 *   for privileged actions, and logging every star would bury the rows that
 *   matter.
 * · **No notification to the instructor.** A bell on every rating is noise, and
 *   a single 3-star deserves the same reaction as any other. The
 *   instructor-facing view is `listForSelf`, read on the analytics page.
 */

/** A public profile shows the most recent reviews, not an export of them. */
const MAX_PUBLIC_REVIEWS = 50;

/** The instructor's own dashboard block, not a moderation queue. */
const MAX_SELF_REVIEWS = 50;

/**
 * How many enrollments of the caller's are examined when answering "did this
 * person take one of their courses?".
 *
 * A learner with more enrollments than this has a platform-sized history, and
 * the check degrades to "no" rather than reading forever — the same bounded
 * read `instructors.ts#MAX_PROFILE_COURSES` already makes on the other side of
 * the intersection. The two sets are capped independently on purpose: neither
 * walk may be made unbounded by the size of the other table.
 */
const MAX_ENROLLMENTS_SCANNED = 200;

/**
 * A review as the outside world may see it.
 *
 * Hand-written rather than `...row` for the same reason `PublicReview` is: the
 * row carries `userId`, and the author on a public profile is a name and a face.
 */
export interface PublicInstructorReview {
  _id: Id<"instructorReviews">;
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
 * Projects a review for display.
 *
 * A missing name becomes "A student" and *not* the email, mirroring
 * `reviews.ts#toPublicReview`. An email address is not a display name, and this
 * list is public.
 */
async function toPublicInstructorReview(
  ctx: ReadCtx,
  row: Doc<"instructorReviews">,
): Promise<PublicInstructorReview> {
  const author = await ctx.db.get(row.userId);
  return {
    _id: row._id,
    rating: row.rating,
    comment: row.comment ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    edited: row.updatedAt > row.createdAt,
    authorName: author?.name ?? "A student",
    authorImageUrl: author?.imageUrl ?? null,
  };
}

/**
 * Has this learner been taught by this instructor?
 *
 * The intersection of two capped index walks rather than a join, because
 * Convex has no join and the alternative — denormalizing `instructorId` onto
 * every `enrollments` row — would put a second source of truth for "who teaches
 * what" next to the course itself, where changing a course's instructor would
 * have to remember to update the historical rows too.
 *
 * Both sides are loaded whole before intersecting because `Set` membership is
 * what makes the second walk O(1) per course; walking the enrollments and
 * issuing a `courses.get` per row would be a read per enrollment instead.
 */
async function hasTakenTheirCourse(
  ctx: ReadCtx,
  user: UserDoc,
  instructor: UserDoc,
): Promise<boolean> {
  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(MAX_ENROLLMENTS_SCANNED);

  if (enrollments.length === 0) return false;

  const coursesTaught = await ctx.db
    .query("courses")
    .withIndex("by_instructor", (q) => q.eq("instructorId", instructor._id))
    .take(MAX_ENROLLMENTS_SCANNED);

  const taughtIds = new Set(coursesTaught.map((course) => course._id));
  return enrollments.some((enrollment) => taughtIds.has(enrollment.courseId));
}

/**
 * The shared eligibility read.
 *
 * Both `getReviewerState` and `upsertInstructorReview` go through this, so there
 * is one definition of "may this person review this instructor" and it is the
 * same definition the pure helper tests. It takes the *documents* rather than
 * their ids because the gate needs both the caller's role and the taught-course
 * intersection, and both callers have already loaded the instructor.
 */
async function loadInstructorEligibility(
  ctx: ReadCtx,
  instructor: Doc<"users"> | null,
  user: UserDoc | null,
) {
  const isSelf = Boolean(instructor && user && instructor._id === user._id);

  // The intersection is only worth computing when the cheaper gates have
  // already passed: it is two index walks, and a signed-out or self-reviewing
  // caller is refused before it.
  let tookTheirCourse = false;
  if (user && instructor && !isSelf && user.role === "student") {
    tookTheirCourse = await hasTakenTheirCourse(ctx, user, instructor);
  }

  return instructorReviewEligibility({
    signedIn: user !== null,
    role: user?.role,
    isSelf,
    tookTheirCourse,
  });
}

/**
 * The headline numbers for a profile, plus the reviews behind them.
 *
 * Public by design — it is the list under the stars on `/instructors/<id>`, and
 * it is only worth anything if the person deciding whether to buy can read it.
 * Returns `null` for anyone who may not have a public profile at all, using the
 * same role gate as `instructors.loadPublicInstructor` rather than inventing a
 * second definition of who is publishable.
 */
export const listForInstructor = query({
  args: { instructorId: v.id("users") },
  handler: async (ctx, args) => {
    const instructor = await ctx.db.get(args.instructorId);
    if (!instructor || instructor.suspendedAt !== undefined) return null;
    if (instructor.role !== "instructor" && instructor.role !== "admin") {
      return null;
    }

    const rows = await ctx.db
      .query("instructorReviews")
      .withIndex("by_instructor", (q) => q.eq("instructorId", args.instructorId))
      // The index orders by `_creationTime`; descending makes that newest-first.
      .order("desc")
      .take(MAX_PUBLIC_REVIEWS);

    const sum = instructor.instructorRatingSum ?? 0;
    const count = instructor.instructorRatingCount ?? 0;

    return {
      average: averageRating(sum, count),
      ratingCount: count,
      reviews: await Promise.all(rows.map((row) => toPublicInstructorReview(ctx, row))),
    };
  },
});

/**
 * What the signed-in caller may do about this instructor, and their review if any.
 *
 * One query rather than three, mirroring `reviews.getReviewerState`: the
 * component has to choose between "write a review", "you already reviewed this —
 * edit it", and a reason it cannot, and asking separately draws a different
 * button on each round trip.
 */
export const getReviewerState = query({
  args: { instructorId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const instructor = await ctx.db.get(args.instructorId);
    const eligibility = await loadInstructorEligibility(ctx, instructor, user);

    let review: {
      _id: Id<"instructorReviews">;
      rating: number;
      comment: string | null;
      createdAt: number;
      updatedAt: number;
    } | null = null;

    if (user) {
      const mine = await ctx.db
        .query("instructorReviews")
        .withIndex("by_user_instructor", (q) =>
          q.eq("userId", user._id).eq("instructorId", args.instructorId),
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
 * Creates or replaces the caller's review of an instructor.
 *
 * Idempotent by construction, exactly as `reviews.upsertReview` is: the pair is
 * looked up first, so a double submit edits the existing row rather than leaving
 * two behind, and the instructor's running total moves by the *delta* between
 * the old and new rating rather than by the new one.
 */
export const upsertInstructorReview = mutation({
  args: {
    instructorId: v.id("users"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Before any read: this is user-generated public content, so a flood is
    // throttled ahead of the eligibility lookup it would otherwise hammer — and
    // that lookup is two index walks.
    await requireRateLimit(ctx, `instructorReview:${user._id}`, 10, 60_000);

    const instructor = await ctx.db.get(args.instructorId);
    if (!instructor) throw new Error("Instructor not found");

    const eligibility = await loadInstructorEligibility(ctx, instructor, user);
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
      .query("instructorReviews")
      .withIndex("by_user_instructor", (q) =>
        q.eq("userId", user._id).eq("instructorId", args.instructorId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { rating, comment, updatedAt: now });
      await ctx.db.patch(
        instructor._id,
        ratingPatchOf(
          instructor,
          { sum: rating - existing.rating, count: 0 },
          TOTAL,
        ),
      );
      return existing._id;
    }

    const reviewId = await ctx.db.insert("instructorReviews", {
      instructorId: args.instructorId,
      userId: user._id,
      rating,
      comment,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(
      instructor._id,
      ratingPatchOf(instructor, { sum: rating, count: 1 }, TOTAL),
    );
    return reviewId;
  },
});

/**
 * Deletes the caller's review.
 *
 * Offered rather than only edited because a review written in anger should not
 * be permanent — and the running total has to lose it too, or the average would
 * keep counting a rating nobody can see.
 */
export const deleteInstructorReview = mutation({
  args: { instructorId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("instructorReviews")
      .withIndex("by_user_instructor", (q) =>
        q.eq("userId", user._id).eq("instructorId", args.instructorId),
      )
      .unique();

    if (!existing) return false;

    await ctx.db.delete(existing._id);

    // The instructor may have been deleted or demoted since; the review cascade
    // takes its rows, and there is nothing left to adjust.
    const instructor = await ctx.db.get(args.instructorId);
    if (instructor) {
      await ctx.db.patch(
        instructor._id,
        ratingPatchOf(instructor, { sum: -existing.rating, count: -1 }, TOTAL),
      );
    }

    return true;
  },
});

/**
 * The rating the caller has left on the instructors they have taken courses from.
 *
 * Scoped to the caller's own reviews, which is the question "have I rated this
 * teacher yet" on a profile page — the block a learner uses to find the one
 * instructor they have not yet reviewed. Distinct from `listForInstructor`,
 * which is the public read of *someone else's* reviews.
 */
export const listForSelf = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const rows = await ctx.db
      .query("instructorReviews")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(MAX_SELF_REVIEWS);

    const reviewed = await Promise.all(
      rows.map(async (row) => {
        const instructor = await ctx.db.get(row.instructorId);
        return {
          _id: row._id,
          rating: row.rating,
          comment: row.comment ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          // A deleted or demoted account leaves the review orphaned (there is no
          // cascade on user rows), so the name is optional rather than assumed.
          instructorName: instructor?.name ?? null,
        };
      }),
    );

    return reviewed;
  },
});

/**
 * Rebuilds an instructor's running total from the review rows.
 *
 * Not wired to any UI. It exists so a test can assert that the incremental
 * arithmetic in `upsertInstructorReview` / `deleteInstructorReview` still lands
 * on exactly the same numbers as counting the table — the one failure mode
 * denormalizing introduces, and the one that would otherwise be invisible: an
 * average that is subtly wrong for a year looks exactly like an average that is
 * right.
 */
export const recomputeInstructorRating = internalMutation({
  args: { instructorId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("instructorReviews")
      .withIndex("by_instructor", (q) => q.eq("instructorId", args.instructorId))
      .collect();

    const count = rows.length;
    const sum = rows.reduce((total, row) => total + row.rating, 0);
    const patch =
      count > 0
        ? { instructorRatingSum: sum, instructorRatingCount: count }
        : { instructorRatingSum: undefined, instructorRatingCount: undefined };

    const instructor = await ctx.db.get(args.instructorId);
    if (instructor) await ctx.db.patch(instructor._id, patch);

    return patch;
  },
});