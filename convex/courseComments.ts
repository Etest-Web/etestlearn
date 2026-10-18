import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  canManageCourse,
  getCurrentUser,
  requireUser,
  type Doc,
  type Id,
  type ReadCtx,
} from "./helpers/auth";
import { evaluateForLearner } from "./helpers/completion";
import { requireRateLimit } from "./helpers/rateLimit";
import { createNotification } from "./helpers/notifications";
import {
  MAX_REPLIES_PER_POST,
  MAX_TOP_LEVEL_POSTS,
  classCommentDraftError,
  classCommentEligibility,
  classCommentReplyEligibility,
  normalizeCommentBody,
  replyDepth,
} from "../lib/class-discussion";

/**
 * Class discussion — "how did this course actually go?", from people who finished it.
 *
 * The third learner-voice surface on the platform, and the one that earns its
 * keep on a *public* page: `courseReviews` (star + comment, enrolled, tied to a
 * rating) cannot hold a reply, and `discussionThreads` (lesson Q&A) is dashboard-only
 * and about being stuck rather than about how the course turned out. Neither can
 * answer "the teacher replied to a learner, and the reply convinced me" — which is
 * the thing a prospective buyer is actually reading for.
 *
 * Three decisions that are load-bearing:
 *
 * · **The gate is certificate-grade completion.** `evaluateCertificateCompletion` —
 *   every lesson *and* every quiz — not `progressPercent === 100`, which is
 *   lessons only. This is the platform's existing single definition of "completed",
 *   so "finished the course" means one thing here rather than two. It is resolved
 *   through the shared `helpers/completion.ts` so this module does not restate it.
 *   See `lib/class-discussion.ts#classCommentEligibility` for why the ordering of
 *   the refusals matters.
 * · **Depth is stored, not walked.** Each row carries the `depth` it was written at,
 *   copied from its parent, so "may this reply be written?" is one field read
 *   rather than a climb to the root. Unbounded depth is still a product fact —
 *   replies to replies are replies — it is only storage and display that are
 *   bounded, by `MAX_COMMENT_DEPTH`.
 * · **Removal is soft.** A removed post keeps its row and loses its text, because
 *   the thread *is* the structure: hard-deleting a parent would orphan every reply
 *   beneath it and leave a conversation with a hole in the middle of it.
 *
 * Notifications, deliberately minimal: the instructor is told about a new
 * top-level post, the post's author is told about a reply, and nothing inside a
 * thread notifies. Neither of these sends email — `emailCampaignsData.ts` mirrors
 * only `discussion_reply` into email, and a learner post is not a message to
 * somebody who asked for one.
 */

/** Total rows read to assemble one page of the tree. The read is bounded by this. */
const MAX_ROWS_READ = 500;

/**
 * How deep the reply forest is read.
 *
 * Rows are fetched flat and assembled in memory, so this is a *rendering* bound
 * rather than a storage one — a reply at depth 9 simply is not sent to the
 * browser, while its row continues to exist and to count toward the row read.
 */
const MAX_RENDERED_DEPTH = 5;

/** Posts a single learner may write on one course. One. See the schema comment. */

/** Per-course budgets, mirroring the `createThread` / `postMessage` split. */
const RATE_POSTS = { max: 3, windowMs: 24 * 60 * 60 * 1000 };
const RATE_REPLIES = { max: 20, windowMs: 60 * 60 * 1000 };

/**
 * One post, as the outside world may see it.
 *
 * Hand-written rather than `...row`: the row carries `userId`, and this list is
 * public. `replies` is nested and flattened alike — `buildTree` returns the same
 * shape at every level, so a reply renders with the same component as a post.
 */
export interface PublicComment {
  _id: Id<"courseComments">;
  /** null once the post has been removed. */
  body: string | null;
  deleted: boolean;
  depth: number;
  createdAt: number;
  authorName: string;
  authorImageUrl: string | null;
  /** True when the author is the course's instructor — the reply badge. */
  isInstructor: boolean;
  replies: PublicComment[];
}

/**
 * Whether the viewer is the course's instructor.
 *
 * Read once per course rather than per comment: the badge is the only thing that
 * needs it, and asking the same question fifty times to label fifty rows is how a
 * list becomes fifty reads.
 */
async function resolveInstructorId(
  ctx: ReadCtx,
  courseId: Id<"courses">,
): Promise<Id<"users"> | null> {
  const course = await ctx.db.get(courseId);
  return course?.instructorId ?? null;
}

/** Name and face, never an email — this list is public. */
async function authorSummary(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<{ authorName: string; authorImageUrl: string | null }> {
  const author = await ctx.db.get(userId);
  return {
    authorName: author?.name ?? "A learner",
    authorImageUrl: author?.imageUrl ?? null,
  };
}

/**
 * Assembles the reply forest from a flat, already-read set of rows.
 *
 * Built in memory on purpose: the read is a single bounded walk of the course's
 * rows, and recursing with a `by_parent` query per node would make the number of
 * reads proportional to the size of the thread — which is precisely the cost an
 * arbitrarily deep thread is supposed to avoid.
 *
 * Orphans (a reply whose parent fell outside the read window) are dropped rather
 * than promoted to top-level: a reply with no visible parent would read as a
 * stranger's post about the course, which is exactly the confusion soft deletion
 * exists to prevent.
 */
function buildTree(
  rows: Doc<"courseComments">[],
  instructorId: Id<"users"> | null,
  authors: Map<Id<"users">, { authorName: string; authorImageUrl: string | null }>,
): PublicComment[] {
  // `parentId` is kept on a side map rather than on the node, because it is
  // scaffolding for the assembly and has no business reaching the browser.
  const parents = new Map<Id<"courseComments">, Id<"courseComments"> | null>();
  const nodes = new Map<Id<"courseComments">, PublicComment>();

  for (const row of rows) {
    const author = authors.get(row.userId);
    parents.set(row._id, row.parentId ?? null);
    nodes.set(row._id, {
      _id: row._id,
      body: row.deletedAt === undefined ? row.body : null,
      deleted: row.deletedAt !== undefined,
      depth: row.depth,
      createdAt: row.createdAt,
      authorName: author?.authorName ?? "A learner",
      authorImageUrl: author?.authorImageUrl ?? null,
      isInstructor: row.userId === instructorId,
      replies: [],
    });
  }

  const roots: PublicComment[] = [];
  for (const node of nodes.values()) {
    const parentId = parents.get(node._id) ?? null;
    const parent = parentId === null ? undefined : nodes.get(parentId);
    if (parentId === null) {
      roots.push(node);
    } else if (parent) {
      parent.replies.push(node);
    }
    // else: orphan — its parent is outside the read window; drop it rather than
    // promote it, since a reply with no visible parent reads as a stranger's
    // top-level post about the course.
  }

  // Newest-first within a level, which is what makes "reply to the comment above"
  // mean anything when a post has twenty answers.
  const order = (list: PublicComment[]) => {
    list.sort((a, b) => b.createdAt - a.createdAt);
    list.forEach((child) => order(child.replies));
  };
  order(roots);

  return roots;
}

/**
 * The public discussion for a course.
 *
 * Readable signed out — this is the section a prospective buyer reads — and
 * bounded twice over: the row walk is capped, and only the newest
 * `MAX_TOP_LEVEL_POSTS` posts are returned, so one very long thread cannot push
 * every other learner's experience off the page.
 */
export const listForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const instructorId = await resolveInstructorId(ctx, args.courseId);

    const rows = await ctx.db
      .query("courseComments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      // The index orders by `_creationTime`; descending makes that newest-first,
      // so the read window keeps the recent conversation rather than the first
      // one ever written.
      .order("desc")
      .take(MAX_ROWS_READ);

    if (rows.length === 0) {
      return { posts: [], truncated: false, totalTopLevel: 0 };
    }

    // One pass over the distinct authors rather than one `db.get` per comment:
    // a thread of fifty posts by twelve people is twelve reads, not fifty.
    const authorIds = [...new Set(rows.map((row) => row.userId))];
    const authors = new Map(
      await Promise.all(
        authorIds.map(async (id) => [id, await authorSummary(ctx, id)] as const),
      ),
    );

    const posts = buildTree(rows, instructorId, authors).slice(0, MAX_TOP_LEVEL_POSTS);

    // Prune past the rendered depth *after* assembly, so a deep branch is cut
    // whole rather than leaving its top half visible and its bottom half missing.
    const prune = (list: PublicComment[], depth: number) => {
      for (const node of list) {
        if (depth >= MAX_RENDERED_DEPTH) node.replies = [];
        else prune(node.replies, depth + 1);
      }
    };
    prune(posts, 1);

    return {
      posts,
      // "Showing the most recent N" needs the real total, which the read window
      // cannot give — so it is counted from the same walk rather than guessed.
      totalTopLevel: rows.filter((row) => row.depth === 0).length,
      truncated: rows.length === MAX_ROWS_READ,
    };
  },
});

/**
 * What the signed-in viewer may do here, and their own post if they have one.
 *
 * One query rather than three, mirroring `reviews.getReviewerState`: the section
 * has to choose between "write", "you already posted — edit or delete", and a
 * reason it cannot, and asking separately draws a different button per round trip.
 *
 * This is the *only* expensive read in the page — completion walks the lessons,
 * the course's quizzes and the learner's attempts — so it is skipped entirely for
 * signed-out visitors and for anyone with no enrollment, neither of whom could be
 * eligible anyway.
 */
export const getViewerState = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const course = await ctx.db.get(args.courseId);

    if (!user) {
      return {
        signedIn: false,
        canPost: false,
        canReply: false,
        reason: "Sign in to share your experience." as string | null,
        myPostId: null as Id<"courseComments"> | null,
      };
    }

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    // Gated on the cheap checks first: completion is several index walks and is
    // pointless for somebody who is not even enrolled.
    let completedCourse = false;
    if (enrollment) {
      const completion = await evaluateForLearner(
        ctx,
        args.courseId,
        user._id,
        enrollment.completedLessonIds,
      );
      completedCourse = completion.eligible;
    }

    const isCourseInstructor = course?.instructorId === user._id;
    const eligibility = classCommentEligibility({
      signedIn: true,
      isCourseInstructor,
      enrolled: enrollment !== null,
      completedCourse,
    });

    const mine = await ctx.db
      .query("courseComments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    return {
      signedIn: true,
      canPost: eligibility.eligible && mine === null,
      // The instructor can always answer, which is why the reply gate is not the
      // posting gate. See classCommentReplyEligibility.
      canReply: true,
      reason: eligibility.eligible ? null : eligibility.reason,
      myPostId: mine?._id ?? null,
    };
  },
});

/**
 * Writes a top-level post about a course the caller finished.
 *
 * One per learner per course, enforced by looking the pair up first — the same
 * mechanism as the review tables. A second attempt returns the first post's id
 * rather than throwing, because a double-submit is a UI bug, not a rule the
 * learner broke, and refusing it loudly would be a worse outcome than the
 * duplicate the lookup already prevented.
 */
export const postComment = mutation({
  args: { courseId: v.id("courses"), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Before any read: this is public content, so a flood is throttled ahead of
    // the completion evaluation it would otherwise trigger on every attempt.
    await requireRateLimit(ctx, `classComment:${user._id}`, RATE_POSTS.max, RATE_POSTS.windowMs);

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();
    if (!enrollment) {
      throw new Error("Only people who took this course can post about it.");
    }

    if (course.instructorId === user._id) {
      throw new Error("You teach this course — you can reply, but not post a review of it.");
    }

    const completion = await evaluateForLearner(
      ctx,
      args.courseId,
      user._id,
      enrollment.completedLessonIds,
    );
    if (!completion.eligible) {
      throw new Error("Finish every lesson and pass the quizzes to share your experience.");
    }

    const existing = await ctx.db
      .query("courseComments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();
    if (existing) return { commentId: existing._id, created: false };

    const draftError = classCommentDraftError({ body: args.body });
    if (draftError) throw new Error(draftError);

    const body = normalizeCommentBody(args.body)!;
    const now = Date.now();

    const commentId = await ctx.db.insert("courseComments", {
      courseId: args.courseId,
      userId: user._id,
      depth: 0,
      body,
      createdAt: now,
      updatedAt: now,
    });

    // The one bell: a learner saying how their class went is directed at the
    // person who taught it, and not telling them would leave the section stale.
    await createNotification(ctx, {
      userId: course.instructorId,
      type: "class_comment",
      title: `New class discussion post on ${course.title}`,
      body: `${user.name?.trim() || "A learner"}: ${body.slice(0, 100)}`,
      href: `/courses/${course.slug}`,
      actorId: user._id,
    });

    return { commentId, created: true };
  },
});

/**
 * Replies to a post.
 *
 * Looser than posting: any signed-in viewer who can see the discussion may join
 * it, including a learner still working through the course. The instructor's
 * answer is the part worth replying to, and most of the people replying to it
 * have not reached the last quiz yet.
 *
 * `parent.depth` is read straight off the row rather than recomputed by climbing
 * the thread — see the module comment.
 */
export const replyToComment = mutation({
  args: { parentId: v.id("courseComments"), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    await requireRateLimit(ctx, `classReply:${user._id}`, RATE_REPLIES.max, RATE_REPLIES.windowMs);

    const parent = await ctx.db.get(args.parentId);
    if (!parent) throw new Error("Comment not found");

    const eligibility = classCommentReplyEligibility({
      signedIn: true,
      parentDepth: parent.depth,
    });
    if (!eligibility.eligible) throw new Error(eligibility.reason);

    const draftError = classCommentDraftError({ body: args.body });
    if (draftError) throw new Error(draftError);

    // Reply volume is capped per post so one popular thread cannot absorb the
    // whole rate budget and crowd the page.
    const replies = await ctx.db
      .query("courseComments")
      .withIndex("by_course", (q) => q.eq("courseId", parent.courseId))
      .filter((q) => q.eq(q.field("parentId"), parent._id))
      .take(MAX_REPLIES_PER_POST + 1);
    if (replies.length > MAX_REPLIES_PER_POST) {
      throw new Error("This thread has all the replies it can hold.");
    }

    const body = normalizeCommentBody(args.body)!;
    const now = Date.now();

    const commentId = await ctx.db.insert("courseComments", {
      courseId: parent.courseId,
      userId: user._id,
      parentId: parent._id,
      depth: replyDepth(parent.depth),
      body,
      createdAt: now,
      updatedAt: now,
    });

    // Notify the person being answered, unless they are answering themselves.
    if (parent.userId !== user._id) {
      const course = await ctx.db.get(parent.courseId);
      await createNotification(ctx, {
        userId: parent.userId,
        type: "class_comment_reply",
        title: "New reply on your class discussion post",
        body: `${user.name?.trim() || "Someone"}: ${body.slice(0, 100)}`,
        href: course ? `/courses/${course.slug}` : "/dashboard",
        actorId: user._id,
      });
    }

    return commentId;
  },
});

/**
 * Removes a post, by its author, the course instructor, or an admin.
 *
 * **Soft**, because the thread is the structure: the row keeps its place and its
 * replies, and only the text goes. A hard delete would leave every answer beneath
 * it parentless, and the visible result would be a conversation with a hole in
 * the middle of it.
 *
 * Editing is deliberately not offered. A retrospective that is edited after the
 * instructor has answered it is a different statement, and the reply would read
 * as though it answered something the author no longer believes.
 */
export const deleteComment = mutation({
  args: { commentId: v.id("courseComments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (comment.deletedAt !== undefined) return false;

    const course = await ctx.db.get(comment.courseId);
    const mayRemove =
      comment.userId === user._id ||
      (course !== null && (await canManageCourse(ctx, user, course)));

    if (!mayRemove) {
      throw new Error("Not authorized — you cannot remove this comment");
    }

    await ctx.db.patch(args.commentId, {
      // The text goes, the row stays. `body` is a required field, so it becomes
      // empty rather than undefined.
      body: "",
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * The course's whole discussion, for the instructor's own view.
 *
 * Not the public read: this one is scoped to courses the caller manages and
 * carries the author id, so the instructor can act on a post (remove it) and see
 * who wrote it. `listForCourse` deliberately will not.
 */
export const listForManagedCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized — you do not manage this course");
    }

    const rows = await ctx.db
      .query("courseComments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .order("desc")
      .take(MAX_ROWS_READ);

    return rows.map((row) => ({
      _id: row._id,
      body: row.deletedAt === undefined ? row.body : null,
      deleted: row.deletedAt !== undefined,
      depth: row.depth,
      createdAt: row.createdAt,
      userId: row.userId,
      isInstructor: row.userId === course.instructorId,
    }));
  },
});