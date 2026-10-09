import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, type AnyCtx, type Id } from "./helpers/auth";
import { logAudit } from "./helpers/audit";

/**
 * Admin console backend: platform analytics, user operations, and the flat
 * exports the console's CSV buttons download.
 *
 * Every function here re-checks `role === "admin"` server-side; the client
 * role gate (`dbUser?.role === "admin"` in the layout) is UX only. Suspension
 * is enforced for free: `helpers/auth.getCurrentUser` reads a suspended
 * account as signed out, so a suspended admin loses the console too — which
 * is the correct semantics for a privilege level, not a bug.
 */

async function requireAdmin(ctx: AnyCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Not authorized — admin access required");
  }
  return user;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Buckets timestamps into the last `count` weeks, oldest first. */
function weeklyBuckets(timestamps: number[], count: number, now: number) {
  const currentWeekStart = Math.floor(now / WEEK_MS) * WEEK_MS;
  const buckets = Array.from({ length: count }, (_, i) => ({
    label: `W-${count - 1 - i}`,
    start: currentWeekStart - (count - 1 - i) * WEEK_MS,
    end: currentWeekStart - (count - 1 - i) * WEEK_MS + WEEK_MS,
    count: 0,
  }));
  for (const ts of timestamps) {
    const bucket = buckets.find((b) => ts >= b.start && ts < b.end);
    if (bucket) bucket.count++;
  }
  return buckets.map(({ label, count }) => ({ week: label, count }));
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export const getPlatformOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const now = Date.now();
    const [users, courses, enrollments, purchases, certificates] =
      await Promise.all([
        ctx.db.query("users").collect(),
        ctx.db.query("courses").collect(),
        ctx.db.query("enrollments").collect(),
        ctx.db.query("purchases").collect(),
        ctx.db.query("certificates").collect(),
      ]);

    const paidPurchases = purchases.filter((p) => p.status === "paid");
    // Refunds are annotations, not deletions: a refunded purchase stays in the
    // revenue total's denominator as a subtraction, keeping the ledger honest.
    const refunded = paidPurchases.filter((p) => p.refundedAt !== undefined);
    // `listAmount` is the pre-discount price, so a referral discount does not
    // shrink platform revenue — the platform funds the discount itself, and its
    // own cut comes out of the list price. Summing the stored `platformFeeKobo`
    // would additionally be correct for snapshotted rows; `listAmount` is used
    // so legacy rows without a snapshot are counted identically.
    const revenueKobo = paidPurchases.reduce(
      (sum, p) => sum + (p.refundedAt === undefined ? (p.listAmount ?? p.amount) : 0),
      0,
    );

    return {
      totals: {
        users: users.length,
        students: users.filter((u) => u.role === "student").length,
        instructors: users.filter((u) => u.role === "instructor").length,
        suspendedUsers: users.filter((u) => u.suspendedAt !== undefined).length,
        courses: courses.length,
        publishedCourses: courses.filter((c) => c.published).length,
        featuredCourses: courses.filter((c) => c.featured).length,
        enrollments: enrollments.length,
        completedEnrollments: enrollments.filter((e) => e.progressPercent >= 100).length,
        purchases: paidPurchases.length,
        refundedPurchases: refunded.length,
        revenue: revenueKobo / 100, // kobo → naira
        certificatesIssued: certificates.length,
        certificatesActive: certificates.filter((c) => c.revokedAt === undefined).length,
      },
      series: {
        users: weeklyBuckets(users.map((u) => u.createdAt), 8, now),
        enrollments: weeklyBuckets(enrollments.map((e) => e.createdAt), 8, now),
        purchases: weeklyBuckets(paidPurchases.map((p) => p.createdAt), 8, now),
      },
    };
  },
});

export const getEngagementStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const now = Date.now();
    const [courses, enrollments, lessons, quizzes, quizAttempts, activities] =
      await Promise.all([
        ctx.db.query("courses").collect(),
        ctx.db.query("enrollments").collect(),
        ctx.db.query("lessons").collect(),
        ctx.db.query("quizzes").collect(),
        ctx.db.query("quizAttempts").collect(),
        ctx.db.query("learningActivities").collect(),
      ]);

    // quizAttempts only know their quiz; walk quiz → lesson → course once so
    // per-course pass rates are maps instead of N×M index reads.
    const courseByLesson = new Map(lessons.map((l) => [l._id, l.courseId]));
    const courseByQuiz = new Map(
      quizzes
        .map((q) => {
          const lesson = courseByLesson.get(q.lessonId);
          return lesson ? [q._id, lesson] : null;
        })
        .filter((row): row is [Id<"quizzes">, Id<"courses">] => row !== null),
    );

    const attemptsByCourse = new Map<string, { attempts: number; passed: number }>();
    for (const attempt of quizAttempts) {
      const courseId = courseByQuiz.get(attempt.quizId);
      if (!courseId) continue;
      const entry = attemptsByCourse.get(courseId) ?? { attempts: 0, passed: 0 };
      entry.attempts++;
      if (attempt.passed) entry.passed++;
      attemptsByCourse.set(courseId, entry);
    }

    const publishedCourses = courses.filter((c) => c.published);
    const perCourse = publishedCourses
      .map((course) => {
        const enrolled = enrollments.filter((e) => e.courseId === course._id);
        const completed = enrolled.filter((e) => e.progressPercent >= 100);
        const attempts = attemptsByCourse.get(course._id);
        return {
          courseId: course._id,
          title: course.title,
          enrolled: enrolled.length,
          completed: completed.length,
          completionRate:
            enrolled.length === 0
              ? 0
              : Math.round((completed.length / enrolled.length) * 100),
          avgProgress:
            enrolled.length === 0
              ? 0
              : Math.round(
                  enrolled.reduce((sum, e) => sum + e.progressPercent, 0) /
                    enrolled.length,
                ),
          quizAttempts: attempts?.attempts ?? 0,
          quizPassRate:
            !attempts || attempts.attempts === 0
              ? 0
              : Math.round((attempts.passed / attempts.attempts) * 100),
        };
      })
      .sort((a, b) => b.enrolled - a.enrolled);

    const weekAgo = now - WEEK_MS;
    const activeUserIds = new Set(
      activities
        .filter((a) => a.createdAt >= weekAgo)
        .map((a) => a.userId),
    );

    return {
      weeklyActiveLearners: activeUserIds.size,
      totalQuizAttempts: quizAttempts.length,
      overallQuizPassRate:
        quizAttempts.length === 0
          ? 0
          : Math.round(
              (quizAttempts.filter((a) => a.passed).length /
                quizAttempts.length) *
                100,
            ),
      perCourse,
    };
  },
});

// ─── Exports (CSV download source data, capped) ─────────────────────────────

const EXPORT_CAP = 5000;

export const exportUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(EXPORT_CAP);
    return users.map((u) => ({
      clerkId: u.clerkId,
      email: u.email ?? "",
      name: u.name ?? "",
      role: u.role,
      suspended: u.suspendedAt !== undefined,
      createdAt: new Date(u.createdAt).toISOString(),
    }));
  },
});

export const exportEnrollments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [enrollments, users, courses] = await Promise.all([
      ctx.db.query("enrollments").take(EXPORT_CAP),
      ctx.db.query("users").collect(),
      ctx.db.query("courses").collect(),
    ]);
    const userById = new Map(users.map((u) => [u._id, u]));
    const courseById = new Map(courses.map((c) => [c._id, c]));
    return enrollments.map((e) => ({
      user: userById.get(e.userId)?.email ?? e.userId,
      course: courseById.get(e.courseId)?.title ?? e.courseId,
      progressPercent: e.progressPercent,
      lessonsCompleted: e.completedLessonIds?.length ?? 0,
      createdAt: new Date(e.createdAt).toISOString(),
    }));
  },
});

export const exportPurchases = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [purchases, users, courses] = await Promise.all([
      ctx.db.query("purchases").take(EXPORT_CAP),
      ctx.db.query("users").collect(),
      ctx.db.query("courses").collect(),
    ]);
    const userById = new Map(users.map((u) => [u._id, u]));
    const courseById = new Map(courses.map((c) => [c._id, c]));
    return purchases.map((p) => ({
      reference: p.paystackReference,
      user: userById.get(p.userId)?.email ?? p.userId,
      course: courseById.get(p.courseId)?.title ?? p.courseId,
      amount: p.amount / 100, // kobo → naira
      currency: p.currency,
      status: p.status,
      refunded: p.refundedAt !== undefined,
      createdAt: new Date(p.createdAt).toISOString(),
    }));
  },
});

// ─── User operations ────────────────────────────────────────────────────────

export const suspendUser = mutation({
  args: { userId: v.id("users"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    if (args.userId === admin._id) {
      throw new Error("You cannot suspend your own account");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    if (target.suspendedAt !== undefined) {
      throw new Error("User is already suspended");
    }
    // An admin demoting/suspending another admin is allowed (fraud response),
    // but it is exactly the action the audit trail exists for.

    await ctx.db.patch(args.userId, { suspendedAt: Date.now() });

    await logAudit(ctx, {
      actorId: admin._id,
      action: "user.suspend",
      targetType: "user",
      targetId: args.userId,
      details: { reason: args.reason ?? null },
    });
  },
});

export const unsuspendUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    if (target.suspendedAt === undefined) {
      throw new Error("User is not suspended");
    }

    await ctx.db.patch(args.userId, { suspendedAt: undefined });

    await logAudit(ctx, {
      actorId: admin._id,
      action: "user.unsuspend",
      targetType: "user",
      targetId: args.userId,
    });
  },
});

/**
 * Applies one role to many users in a single mutation. Each changed row gets
 * its own audit entry (same `user.set_role` action the single-change path
 * writes), so per-user history stays greppable after a bulk operation.
 */
export const bulkSetRoles = mutation({
  args: {
    assignments: v.array(
      v.object({
        userId: v.id("users"),
        role: v.union(
          v.literal("student"),
          v.literal("instructor"),
          v.literal("admin"),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.assignments.length === 0) return { changed: 0 };

    // 500 keeps one transaction's read/write set bounded, same ceiling as the
    // Clerk backfill sync.
    if (args.assignments.length > 500) {
      throw new Error("Bulk role change is limited to 500 users per call");
    }

    let changed = 0;
    for (const { userId, role } of args.assignments) {
      if (userId === admin._id && role !== "admin") {
        // Skip rather than throw mid-batch: the admin's own row must not roll
        // back 400 legitimate changes because it was included by accident.
        continue;
      }
      const target = await ctx.db.get(userId);
      if (!target || target.role === role) continue;

      await ctx.db.patch(userId, { role });
      await logAudit(ctx, {
        actorId: admin._id,
        action: "user.set_role",
        targetType: "user",
        targetId: userId,
        details: { oldRole: target.role, newRole: role, bulk: true },
      });
      changed++;
    }
    return { changed };
  },
});

/** One user's full footprint, for the console's detail drawer. */
export const getUserDetail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const [enrollments, purchases, certificates, quizAttempts] =
      await Promise.all([
        ctx.db
          .query("enrollments")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect(),
        ctx.db
          .query("purchases")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect(),
        ctx.db
          .query("certificates")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect(),
        ctx.db
          .query("quizAttempts")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect(),
      ]);

    const courseIds = [
      ...new Set([
        ...enrollments.map((e) => e.courseId),
        ...purchases.map((p) => p.courseId),
        ...certificates.map((c) => c.courseId),
      ]),
    ];
    const courses = await Promise.all(courseIds.map((id) => ctx.db.get(id)));
    const titleOf = (id: Id<"courses">) =>
      courses.find((c) => c?._id === id)?.title ?? null;

    return {
      user: {
        _id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        imageUrl: user.imageUrl ?? null,
        role: user.role,
        suspendedAt: user.suspendedAt ?? null,
        createdAt: user.createdAt,
      },
      enrollments: enrollments.map((e) => ({
        courseId: e.courseId,
        courseTitle: titleOf(e.courseId),
        progressPercent: e.progressPercent,
        createdAt: e.createdAt,
      })),
      purchases: purchases.map((p) => ({
        reference: p.paystackReference,
        courseTitle: titleOf(p.courseId),
        amount: p.amount / 100,
        status: p.status,
        refundedAt: p.refundedAt ?? null,
        createdAt: p.createdAt,
      })),
      certificates: certificates.map((c) => ({
        serial: c.serial ?? null,
        courseTitle: titleOf(c.courseId),
        revokedAt: c.revokedAt ?? null,
        issuedAt: c.issuedAt,
      })),
      quizAttempts: {
        total: quizAttempts.length,
        passed: quizAttempts.filter((a) => a.passed).length,
      },
    };
  },
});
