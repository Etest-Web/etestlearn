import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { slugify } from "../lib/slug";
import {
  unpublishBlockedMessage,
  unpublishNotGatedMessage,
  unpublishPolicy,
} from "../lib/publishing";
import { logAudit, type AuditEntry } from "./helpers/audit";
import {
  AnyCtx,
  canManageCourse,
  isStaff,
  requireUser,
  type Id,
  type ReadCtx,
  type WriteCtx,
} from "./helpers/auth";

function buildSearchText(title: string, description: string, category?: string) {
  return [title, description, category].filter(Boolean).join(" ").trim();
}

/**
 * Normalizes a requested slug and refuses one already claimed by another
 * course.
 *
 * Why this exists: `courses.by_slug` is a plain index, not a unique one (the
 * schema is shared foundation and off-limits here), so the database itself
 * never rejects a duplicate. Without this check two courses could share a
 * slug, after which `getCourseBySlug`'s `.unique()` throws on *every* read of
 * either course — one bad write would take the public course page down for
 * everyone. The lookup therefore uses `.first()`, not `.unique()`: if dirty
 * data already contains duplicates we must report "taken" rather than crash.
 *
 * Known limitation (documented, not solved): this is check-then-insert in
 * application code rather than a DB constraint. Convex mutations are
 * serializable transactions, so two concurrent creates of the same slug
 * cannot both pass this read — the loser retries against committed state and
 * sees the winner — but any future write path that bypasses
 * `createCourse`/`updateCourse` could still introduce a duplicate. The real
 * guarantee would be a `.unique()` index on `slug`, which needs a schema
 * change plus a dedupe backfill of existing rows.
 */
async function requireAvailableSlug(
  ctx: WriteCtx,
  rawSlug: string,
  opts: { excludeCourseId?: Id<"courses"> } = {},
): Promise<string> {
  // Same normalization the UI applies, re-run server-side: clients can post
  // anything, and "Paid Course" vs "paid-course" must not be two different
  // routes to the same course.
  const slug = slugify(rawSlug.trim());
  if (!slug) {
    throw new Error("A URL slug is required");
  }

  const existing = await ctx.db
    .query("courses")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();

  if (existing && existing._id !== opts.excludeCourseId) {
    throw new Error("That slug is already taken");
  }

  return slug;
}

export const listPublishedCourses = query({
  args: {},
  handler: async (ctx) => {
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_published", (q) => q.eq("published", true))
      .collect();

    // Featured first, then newest — the admin featured picker curates what
    // leads the catalog without anyone hand-editing insertion order.
    return courses.sort((a, b) => {
      const fa = a.featured ? 1 : 0;
      const fb = b.featured ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b.createdAt - a.createdAt;
    });
  },
});

export const listInstructorCourses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    return await ctx.db
      .query("courses")
      .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
      .collect();
  },
});

export const searchCourses = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    if (!q) return [];

    return await ctx.db
      .query("courses")
      .withSearchIndex("search", (s) =>
        s.search("searchText", q).eq("published", true),
      )
      .take(24);
  },
});

export const getCourseBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!course) {
      return null;
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
      .collect();

    return { course, lessons };
  },
});

export const getCourseById = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);

    if (!course) {
      return null;
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
      .collect();

    return { course, lessons };
  },
});

export const createCourse = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    category: v.optional(v.string()),
    level: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    // Kobo; omit or 0 for free courses.
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized to create courses");
    }

    const slug = await requireAvailableSlug(ctx, args.slug);

    const now = Date.now();

    return await ctx.db.insert("courses", {
      title: args.title,
      slug,
      description: args.description,
      instructorId: user._id,
      category: args.category,
      level: args.level,
      published: false,
      thumbnailUrl: args.thumbnailUrl,
      price: args.price,
      currency: args.currency,
      searchText: buildSearchText(args.title, args.description, args.category),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Edits course metadata. Deliberately has **no** `published` argument.
 *
 * Visibility is an operation, not a field: it goes through `publishCourse` /
 * `unpublishCourse` / `requestUnpublish` below, which is what lets those rules
 * be enforced. Leaving `published` here as a plain optional boolean would hand
 * every future caller a one-argument path around the unpublish gate.
 */
export const updateCourse = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    level: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    if (course.instructorId !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to update this course");
    }

    const updates: any = {};
    if (args.title !== undefined) updates.title = args.title;
    // Excluding this course lets an edit keep its own slug; every other
    // course's slug stays off-limits, same rule as creation.
    if (args.slug !== undefined) {
      updates.slug = await requireAvailableSlug(ctx, args.slug, {
        excludeCourseId: args.courseId,
      });
    }
    if (args.description !== undefined) updates.description = args.description;
    if (args.category !== undefined) updates.category = args.category;
    if (args.level !== undefined) updates.level = args.level;
    if (args.thumbnailUrl !== undefined) updates.thumbnailUrl = args.thumbnailUrl;
    if (args.price !== undefined) updates.price = args.price;
    if (args.currency !== undefined) updates.currency = args.currency;

    if (
      args.title !== undefined ||
      args.description !== undefined ||
      args.category !== undefined
    ) {
      const title = args.title ?? course.title;
      const description = args.description ?? course.description;
      const category = "category" in args ? args.category : course.category;
      updates.searchText = buildSearchText(title, description, category);
    }

    updates.updatedAt = Date.now();

    await ctx.db.patch(args.courseId, updates);
  },
});

export const createLesson = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
    contentType: v.union(v.literal("video"), v.literal("article"), v.literal("quiz")),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const course = await ctx.db.get(args.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to add lessons to this course");
    }

    return await ctx.db.insert("lessons", {
      courseId: args.courseId,
      title: args.title,
      contentType: args.contentType,
      order: args.order,
      createdAt: Date.now(),
    });
  },
});

export const updateLesson = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.optional(v.string()),
    contentType: v.optional(v.union(v.literal("video"), v.literal("article"), v.literal("quiz"))),
    order: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to update lessons in this course");
    }

    const updates: any = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.contentType !== undefined) updates.contentType = args.contentType;
    if (args.order !== undefined) updates.order = args.order;
    if (args.durationMinutes !== undefined) updates.durationMinutes = args.durationMinutes;
    if (args.content !== undefined) updates.content = args.content;

    await ctx.db.patch(args.lessonId, updates);
  },
});

export const deleteLesson = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || (user.role !== "instructor" && user.role !== "admin")) {
      throw new Error("Not authorized");
    }

    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course || (course.instructorId !== user._id && user.role !== "admin")) {
      throw new Error("Not authorized to delete lessons in this course");
    }

    // Retire an attached video asset with the lesson: its ladder blobs and key
    // must not linger in storage once the lesson is gone. The UploadThing
    // source goes through the node deleter; the ladder blobs delete inline.
    if (lesson.videoAssetId) {
      const asset = await ctx.db.get(lesson.videoAssetId);
      if (asset) {
        const blobs = [
          asset.masterManifestStorageId,
          ...(asset.variantManifestStorageIds ?? []),
          ...(asset.segments ?? []).map((s) => s.storageId),
          asset.keyStorageId,
        ];
        for (const id of blobs) {
          if (id) await ctx.storage.delete(id).catch(() => {});
        }
        await ctx.scheduler.runAfter(0, internal.videoTranscode.deleteUploadthingFiles, {
          fileKeys: [asset.sourceFileKey],
        });
        await ctx.db.delete(asset._id);
      }
    }

    // TODO: cleanup related quizzes, attempts
    await ctx.db.delete(args.lessonId);
  },
});


export const getCourseAnalytics = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User record not found");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    if (course.instructorId !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to view analytics for this course");
    }

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    // Completion now means the same thing it means for certificates: every
    // lesson finished. Quiz requirements are counted separately below so the
    // two definitions cannot drift apart again.
    const completedCount = enrollments.filter(
      (e) => e.progressPercent >= 100,
    ).length;

    // Average quiz score across all attempts on this course's quizzes.
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId))
      .collect();

    let attemptCount = 0;
    let totalPercent = 0;

    for (const lesson of lessons) {
      const quiz = await ctx.db
        .query("quizzes")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .unique();
      if (!quiz) continue;

      const attempts = await ctx.db
        .query("quizAttempts")
        .withIndex("by_quiz", (q) => q.eq("quizId", quiz._id))
        .collect();

      for (const attempt of attempts) {
        attemptCount += 1;
        totalPercent +=
          attempt.maxScore === 0
            ? 0
            : (attempt.score / attempt.maxScore) * 100;
      }
    }

    const certificates = await ctx.db
      .query("certificates")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    return {
      enrollmentCount: enrollments.length,
      completionRate:
        enrollments.length === 0
          ? 0
          : Math.round((completedCount / enrollments.length) * 100),
      averageQuizScore: attemptCount === 0 ? null : Math.round(totalPercent / attemptCount),
      attemptCount,
      certificateCount: certificates.filter((c) => c.revokedAt === undefined).length,
      revokedCertificateCount: certificates.filter((c) => c.revokedAt !== undefined).length,
    };
  },
});

// ─── Publishing ─────────────────────────────────────────────────────────────
//
// An instructor may list a paid course and pull an unsold or free one at will.
// What they may not do is quietly vanish a course that people have paid for,
// which is why unpublishing a sold course is an admin decision made through a
// request. The rule itself lives in `lib/publishing.ts`; this section is only
// the enforcement and the request workflow around it.

/** Completed purchases on a course. Pending checkouts do not count. */
async function countPaidSales(
  ctx: ReadCtx,
  courseId: Id<"courses">,
): Promise<number> {
  const paid = await ctx.db
    .query("purchases")
    .withIndex("by_course_status", (q) =>
      q.eq("courseId", courseId).eq("status", "paid"),
    )
    .collect();
  return paid.length;
}

/** The same question asked with `.first()` — stops at the first paid row. */
async function hasPaidSales(
  ctx: ReadCtx,
  courseId: Id<"courses">,
): Promise<boolean> {
  const paid = await ctx.db
    .query("purchases")
    .withIndex("by_course_status", (q) =>
      q.eq("courseId", courseId).eq("status", "paid"),
    )
    .first();
  return paid !== null;
}

/** The course's live unpublish request, if any. */
async function getPendingRequest(
  ctx: ReadCtx,
  courseId: Id<"courses">,
) {
  const requests = await ctx.db
    .query("courseUnpublishRequests")
    .withIndex("by_course", (q) => q.eq("courseId", courseId))
    .collect();
  return (
    requests
      .filter((r) => r.status === "pending")
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

/**
 * Everything the instructor UI needs to render the right publishing controls,
 * so the browser never has to re-derive the policy and risk disagreeing with
 * the server about who is allowed to do what.
 */
export const getCoursePublishingState = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized to manage this course");
    }

    const paidSales = await countPaidSales(ctx, course._id);
    const pending = await getPendingRequest(ctx, course._id);

    return {
      published: course.published,
      paidSales,
      policy: unpublishPolicy({ price: course.price, paidSales }),
      isAdmin: user.role === "admin",
      pendingRequest: pending
        ? {
            _id: pending._id,
            reason: pending.reason ?? null,
            createdAt: pending.createdAt,
          }
        : null,
    };
  },
});

/**
 * Puts a course on sale. Never gated — publishing is what instructors need to
 * be able to do without asking anyone, and it cannot retroactively take
 * anything away from a buyer.
 *
 * Republishing while an unpublish request is pending resolves that request:
 * the ask was "take this down" and the answer is now "it is up", so leaving it
 * in the admin queue would only produce a review of a decision already made.
 */
export const publishCourse = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized to publish this course");
    }

    if (!course.published) {
      await ctx.db.patch(course._id, {
        published: true,
        updatedAt: Date.now(),
      });
    }

    const pending = await getPendingRequest(ctx, course._id);
    if (pending) {
      await ctx.db.patch(pending._id, {
        status: "rejected",
        reviewNote: "Resolved automatically — the course was republished.",
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Takes a course off sale.
 *
 * Refused for the owning instructor when `lib/publishing.ts` classifies the
 * course as `needs_approval` — that path is `requestUnpublish` instead. An
 * admin may always unpublish directly: pulling down a fraudulent or
 * rights-violating course should never wait on a request queue.
 */
export const unpublishCourse = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized to unpublish this course");
    }

    const isAdmin = user.role === "admin";
    if (!isAdmin && (await hasPaidSales(ctx, course._id))) {
      throw new Error(unpublishBlockedMessage(await countPaidSales(ctx, course._id)));
    }

    if (course.published) {
      await ctx.db.patch(course._id, {
        published: false,
        updatedAt: Date.now(),
      });
    }

    // Only the gated path is an audited action: unpublishing a free course is
    // ordinary self-service, and auditing every draft toggle would bury the
    // rows that matter.
    if (isAdmin && (await hasPaidSales(ctx, course._id))) {
      const paidSales = await countPaidSales(ctx, course._id);
      await logAudit(ctx, {
        actorId: user._id,
        action: "course.unpublish",
        targetType: "course",
        targetId: course._id,
        details: {
          paidSales,
          price: course.price ?? 0,
          direct: true,
        },
      });
    }

    return { success: true };
  },
});

/**
 * Asks an admin to unpublish a course that has already sold. Refuses the
 * request outright when the course is not actually gated, so the instructor
 * gets told to just press the button instead of waiting on a pointless review.
 */
export const requestUnpublish = mutation({
  args: {
    courseId: v.id("courses"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized to request unpublishing this course");
    }

    if (!course.published) {
      throw new Error("This course is already unpublished");
    }

    const paidSales = await countPaidSales(ctx, course._id);
    if (unpublishPolicy({ price: course.price, paidSales }) !== "needs_approval") {
      throw new Error(unpublishNotGatedMessage());
    }

    if (await getPendingRequest(ctx, course._id)) {
      throw new Error("You already have a pending request for this course");
    }

    const now = Date.now();
    return await ctx.db.insert("courseUnpublishRequests", {
      courseId: course._id,
      requestedBy: user._id,
      reason: args.reason?.trim() || undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Lets the instructor take a pending request back down. */
export const withdrawUnpublishRequest = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized for this course");
    }

    const pending = await getPendingRequest(ctx, course._id);
    if (!pending) {
      throw new Error("There is no pending request for this course");
    }

    await ctx.db.patch(pending._id, {
      status: "rejected",
      reviewNote: "Withdrawn by the instructor.",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Admin review queue. Admin only, and joined rather than returned raw so the
 * reviewer can judge the request (what the course is, who asked, how many
 * people are affected) without a second round trip per row.
 */
export const listUnpublishRequests = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

    // Bounded so a long history cannot turn one admin page load into an
    // unbounded read; the queue is a work list, not an export.
    const MAX_REQUESTS = 100;
    const rows = await (args.status
      ? ctx.db
          .query("courseUnpublishRequests")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
      : ctx.db.query("courseUnpublishRequests"))
      .take(MAX_REQUESTS);

    return await Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (row) => {
          // A course or user row can be missing (deleted account, bad data);
          // surface that rather than throwing and blanking the whole queue.
          const [course, requester, paidSales] = await Promise.all([
            ctx.db.get(row.courseId),
            ctx.db.get(row.requestedBy),
            countPaidSales(ctx, row.courseId),
          ]);

          return {
            _id: row._id,
            status: row.status,
            reason: row.reason ?? null,
            reviewNote: row.reviewNote ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            paidSales,
            course: course
              ? {
                  _id: course._id,
                  title: course.title,
                  slug: course.slug,
                  published: course.published,
                  price: course.price ?? 0,
                  currency: course.currency ?? "NGN",
                }
              : null,
            requester: requester
              ? {
                  _id: requester._id,
                  name: requester.name ?? null,
                  email: requester.email ?? null,
                }
              : null,
          };
        }),
    );
  },
});

/**
 * Admin decision on an unpublish request. Approving is what actually takes the
 * course down — the instructor's request never touched `published`, so there is
 * no window where a sold course is silently off sale.
 */
export const reviewUnpublishRequest = mutation({
  args: {
    requestId: v.id("courseUnpublishRequests"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") {
      throw new Error("This request has already been reviewed");
    }

    const now = Date.now();

    if (args.decision === "approved") {
      const course = await ctx.db.get(request.courseId);
      if (!course) throw new Error("Course not found");
      if (course.published) {
        await ctx.db.patch(course._id, {
          published: false,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(request._id, {
      status: args.decision,
      reviewedBy: admin._id,
      reviewNote: args.reviewNote?.trim() || undefined,
      updatedAt: now,
    });

    // One row records the whole exchange — who asked, on what, and what the
    // admin decided — so a rejected request still leaves evidence that the
    // instructor escalated rather than quietly pulling the course.
    const course = await ctx.db.get(request.courseId);
    const details: NonNullable<AuditEntry["details"]> = {
      decision: args.decision,
      courseId: request.courseId,
      requestedBy: request.requestedBy,
      paidSales: await countPaidSales(ctx, request.courseId),
    };
    if (course) details.courseTitle = course.title;
    if (args.reviewNote !== undefined) details.note = args.reviewNote;

    await logAudit(ctx, {
      actorId: admin._id,
      action: "course_unpublish_request.review",
      targetType: "courseUnpublishRequest",
      targetId: request._id,
      details,
    });

    return { success: true };
  },
});

// ─── Admin console ──────────────────────────────────────────────────────────
//
// Moderation surface for the admin console: the full course table, bulk
// publish/unpublish, the featured picker, and the opt-in pre-publication
// review queue. None of these change `publishCourse`'s no-gate contract —
// review here is something an instructor asks for, not something imposed.

async function requireCourseAdmin(ctx: AnyCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Not authorized — admin access required");
  }
  return user;
}

/** Every course with its instructor name and paid-sales count, newest first. */
export const adminListCourses = query({
  args: {},
  handler: async (ctx) => {
    await requireCourseAdmin(ctx);

    const [courses, users] = await Promise.all([
      ctx.db.query("courses").collect(),
      ctx.db.query("users").collect(),
    ]);
    const nameOf = new Map(users.map((u) => [u._id, u.name ?? u.email ?? null]));

    const rows = await Promise.all(
      courses
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (course) => ({
          _id: course._id,
          title: course.title,
          slug: course.slug,
          category: course.category ?? null,
          level: course.level ?? null,
          price: course.price ?? 0,
          published: course.published,
          featured: course.featured ?? false,
          instructor: nameOf.get(course.instructorId) ?? null,
          paidSales: await countPaidSales(ctx, course._id),
          updatedAt: course.updatedAt,
        })),
    );
    return rows;
  },
});

/**
 * Bulk publish/unpublish from the console's course table. Publishing is
 * ungated; unpublishing as an admin is always allowed (see unpublishCourse)
 * and every applied change is audited — a bulk action that rewrote N listings
 * with no trail would be worse than the gate it bypasses.
 */
export const bulkSetPublished = mutation({
  args: {
    courseIds: v.array(v.id("courses")),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireCourseAdmin(ctx);
    if (args.courseIds.length === 0) return { changed: 0 };
    if (args.courseIds.length > 100) {
      throw new Error("Bulk publish is limited to 100 courses per call");
    }

    let changed = 0;
    for (const courseId of args.courseIds) {
      const course = await ctx.db.get(courseId);
      if (!course || course.published === args.published) continue;

      await ctx.db.patch(courseId, {
        published: args.published,
        updatedAt: Date.now(),
      });
      changed++;

      if (!args.published) {
        await logAudit(ctx, {
          actorId: admin._id,
          action: "course.unpublish",
          targetType: "course",
          targetId: courseId,
          details: {
            paidSales: await countPaidSales(ctx, courseId),
            price: course.price ?? 0,
            direct: true,
            bulk: true,
          },
        });
      }
    }
    return { changed };
  },
});

/** Featured flag for the public catalog's featured-first ordering. */
export const setFeatured = mutation({
  args: { courseId: v.id("courses"), featured: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireCourseAdmin(ctx);

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    await ctx.db.patch(args.courseId, { featured: args.featured });
    await logAudit(ctx, {
      actorId: admin._id,
      action: "course.featured",
      targetType: "course",
      targetId: args.courseId,
      details: { featured: args.featured, title: course.title },
    });
  },
});

// ─── Opt-in pre-publication review queue ────────────────────────────────────

/** An instructor asks for admin sign-off before their course goes live. */
export const requestPublishReview = mutation({
  args: {
    courseId: v.id("courses"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized to request review for this course");
    }
    if (course.published) {
      throw new Error("This course is already published");
    }

    const requests = await ctx.db
      .query("courseReviewRequests")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    if (requests.some((r) => r.status === "pending")) {
      throw new Error("A review is already pending for this course");
    }

    const now = Date.now();
    return await ctx.db.insert("courseReviewRequests", {
      courseId: args.courseId,
      requestedBy: user._id,
      note: args.note?.trim() || undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** The console's review queue: pending requests with course context. */
export const listPublishReviewRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireCourseAdmin(ctx);

    const requests = await ctx.db
      .query("courseReviewRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(100);

    return await Promise.all(
      requests.map(async (request) => {
        const [course, requester] = await Promise.all([
          ctx.db.get(request.courseId),
          ctx.db.get(request.requestedBy),
        ]);
        return {
          _id: request._id,
          courseId: request.courseId,
          courseTitle: course?.title ?? null,
          coursePublished: course?.published ?? false,
          requesterName: requester?.name ?? requester?.email ?? null,
          note: request.note ?? null,
          createdAt: request.createdAt,
        };
      }),
    );
  },
});

/**
 * Approve publishes the course immediately (the ask was "may I go live", so
 * yes means yes); reject leaves it as a draft with a note back to the
 * instructor. Audited either way, mirroring reviewUnpublishRequest.
 */
export const reviewPublishRequest = mutation({
  args: {
    requestId: v.id("courseReviewRequests"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireCourseAdmin(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Review request not found");
    if (request.status !== "pending") {
      throw new Error("This request has already been reviewed");
    }

    const now = Date.now();
    if (args.decision === "approved") {
      const course = await ctx.db.get(request.courseId);
      if (course && !course.published) {
        await ctx.db.patch(course._id, {
          published: true,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.requestId, {
      status: args.decision,
      reviewedBy: admin._id,
      reviewNote: args.reviewNote?.trim() || undefined,
      updatedAt: now,
    });

    const course = await ctx.db.get(request.courseId);
    const details: NonNullable<AuditEntry["details"]> = {
      decision: args.decision,
      courseId: request.courseId,
      requestedBy: request.requestedBy,
    };
    if (course) details.courseTitle = course.title;
    if (args.reviewNote !== undefined) details.note = args.reviewNote;

    await logAudit(ctx, {
      actorId: admin._id,
      action: "course_publish_request.review",
      targetType: "courseReviewRequest",
      targetId: request._id,
      details,
    });

    return { success: true };
  },
});
