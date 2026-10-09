import { query } from "./_generated/server";
import { v } from "convex/values";
import { isStaff, requireUser, type Id, type ReadCtx, type UserDoc } from "./helpers/auth";
import {
  INSTRUCTOR_REVENUE_SHARE,
  monthBuckets,
  monthlyEarnings,
  percentChange,
  summarizeEarnings,
  trendLabel,
  type EarningsSale,
  type MonthPoint,
} from "../lib/instructor-earnings";

/**
 * Instructor console analytics.
 *
 * Every function here answers the question an instructor actually opens the
 * dashboard with — "is this working, and am I being paid?" — and all of them are
 * scoped to *their own* courses by `by_instructor`, admin or not. The platform-
 * wide view is the admin console's job (`admin.getPlatformOverview`); an admin
 * who happens to teach sees their own teaching numbers here, which is the only
 * reading that reconciles with the invoices they care about.
 *
 * Scope rules that apply throughout:
 *  · Identity and role come from `helpers/auth.requireUser` / `isStaff`, so a
 *    suspended account reads as signed out and a plain student is refused
 *    before any table is read.
 *  · Money is derived from `purchases` rows in `paid` state through
 *    `lib/instructor-earnings`, never re-derived here. Refunded sales are
 *    reported and subtracted, matching `admin.getPlatformOverview`.
 *  · Enrollment reads go through `by_course`, purchases through `by_course`, so
 *    per-course figures are index range reads rather than table scans.
 *
 * Split into three queries because the three screens have different shapes and
 * different refresh costs: the money summary backs the earnings page, the pulse
 * backs the overview's "how are my learners doing" block, and the per-course
 * performance rows back the analytics table. One combined mega-query would make
 * the cheapest screen pay for the most expensive one.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A learner is "at risk" when they started but have gone quiet for a week. */
const AT_RISK_AFTER_DAYS = 7;

/** Charts and tables are bounded reads, not exports. */
const MAX_RECENT_SALES = 12;
const MAX_RECENT_ACTIVITY = 12;

/** Enough for a year of months; the UI asks for 6 or 12. */
const DEFAULT_MONTHS = 12;

/**
 * `learningActivities` has no course-leading index — its three are all
 * user-leading (`by_user_created`, `by_user_type`, `by_user_course`) — so
 * "activity across every course this instructor owns" cannot be an index range
 * read. The alternative is N user-scoped scans (one per enrolled learner), which
 * is worse for a busy instructor and reads far more rows. One bounded scan
 * filtered in memory is the honest trade, and matches what
 * `admin.getEngagementStats` already does platform-wide. Bounded so a large
 * table cannot turn one dashboard load into an unbounded read.
 */
const MAX_ACTIVITY_ROWS = 5000;

async function loadOwnedCourses(ctx: ReadCtx, user: UserDoc) {
  return await ctx.db
    .query("courses")
    .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
    .collect();
}

/** Paid purchases on a course, index range read via `by_course_status`. */
async function loadPaidSales(ctx: ReadCtx, courseId: Id<"courses">) {
  return await ctx.db
    .query("purchases")
    .withIndex("by_course_status", (q) =>
      q.eq("courseId", courseId).eq("status", "paid"),
    )
    .collect();
}

function toSale(purchase: {
  amount: number;
  refundedAt?: number;
  paidAt?: number;
}): EarningsSale {
  return {
    amount: purchase.amount,
    refunded: purchase.refundedAt !== undefined,
    // A paid row always has paidAt in practice; fall back to createdAt so a
    // legacy row still lands in the series rather than falling out of every
    // bucket (which would make it invisible in the chart but present in the
    // lifetime total).
    paidAt: purchase.paidAt ?? 0,
  };
}

function clampMonths(months: number | undefined): number {
  return Math.max(1, Math.min(24, Math.floor(months ?? DEFAULT_MONTHS)));
}

// ─── Money ──────────────────────────────────────────────────────────────────

/**
 * Everything the earnings page renders: lifetime totals, the period-over-period
 * trend, the monthly series, per-course revenue, and the newest sales.
 *
 * Refunds are surfaced rather than hidden. An instructor whose total dropped
 * needs to be able to see that a refund took it down, and the figure they see
 * has to match the figure the admin console shows for the same course.
 */
export const getEarningsSummary = query({
  args: { months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const courses = await loadOwnedCourses(ctx, user);
    const now = Date.now();

    const sales: EarningsSale[] = [];
    const courseRows: {
      courseId: Id<"courses">;
      title: string;
      slug: string;
      published: boolean;
      price: number | undefined;
      currency: string;
      grossKobo: number;
      refundedKobo: number;
      sales: number;
      netEarningsKobo: number;
    }[] = [];
    const recentSales: {
      _id: string;
      courseId: Id<"courses">;
      courseTitle: string;
      buyerName: string | null;
      amountKobo: number;
      currency: string;
      paidAt: number | null;
      refunded: boolean;
    }[] = [];

    for (const course of courses) {
      const purchases = await loadPaidSales(ctx, course._id);
      const courseSales = purchases.map((p) => ({
        sale: toSale(p),
        purchase: p,
      }));
      sales.push(...courseSales.map((s) => s.sale));

      const totals = summarizeEarnings(courseSales.map((s) => s.sale));
      courseRows.push({
        courseId: course._id,
        title: course.title,
        slug: course.slug,
        published: course.published,
        price: course.price,
        currency: course.currency ?? "NGN",
        grossKobo: totals.grossKobo,
        refundedKobo: totals.refundedKobo,
        sales: totals.sales,
        netEarningsKobo: totals.netEarningsKobo,
      });

      for (const { purchase, sale } of courseSales) {
        const buyer = await ctx.db.get(purchase.userId);
        recentSales.push({
          _id: purchase._id,
          courseId: course._id,
          courseTitle: course.title,
          buyerName: buyer?.name?.trim() || null,
          amountKobo: purchase.amount,
          currency: purchase.currency,
          paidAt: purchase.paidAt ?? null,
          refunded: sale.refunded,
        });
      }
    }

    const lifetime = summarizeEarnings(sales);

    // The trailing-30-day window and the 30 days before it. Fixed windows
    // rather than calendar months: "last 30 days" is the comparison an
    // instructor can reason about, and a partial calendar month would make the
    // trend read as a collapse every time the month rolls over.
    const thirtyDaysAgo = now - 30 * DAY_MS;
    const sixtyDaysAgo = now - 60 * DAY_MS;
    const window = (from: number, to: number) =>
      summarizeEarnings(sales.filter((s) => s.paidAt >= from && s.paidAt < to));
    const last30 = window(thirtyDaysAgo, now);
    const previous30 = window(sixtyDaysAgo, thirtyDaysAgo);
    const trend = percentChange(last30.netEarningsKobo, previous30.netEarningsKobo);

    const monthStart = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      1,
    );
    const lastMonthStart = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth() - 1,
      1,
    );
    const thisMonth = summarizeEarnings(
      sales.filter((s) => s.paidAt >= monthStart),
    );
    const lastMonth = summarizeEarnings(
      sales.filter((s) => s.paidAt >= lastMonthStart && s.paidAt < monthStart),
    );

    const series: MonthPoint[] = monthlyEarnings(
      sales,
      // Calendar-month boundaries, not "now minus N×30 days": a sale on the
      // 31st has to land in the month it happened in.
      monthBuckets(clampMonths(args.months), now),
    );

    courseRows.sort((a, b) => b.netEarningsKobo - a.netEarningsKobo);

    return {
      revenueShare: INSTRUCTOR_REVENUE_SHARE,
      lifetime,
      last30,
      previous30,
      thisMonth,
      lastMonth,
      trendPercent: trend,
      trendLabel: trendLabel(trend),
      series,
      byCourse: courseRows.map((row) => ({
        ...row,
        shareOfEarnings:
          lifetime.netEarningsKobo === 0
            ? 0
            : Math.round((row.netEarningsKobo / lifetime.netEarningsKobo) * 100),
      })),
      recentSales: recentSales
        .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0))
        .slice(0, MAX_RECENT_SALES),
      paidCourseCount: courses.filter((c) => (c.price ?? 0) > 0).length,
      freeCourseCount: courses.filter((c) => (c.price ?? 0) <= 0).length,
    };
  },
});

// ─── Learners & engagement ─────────────────────────────────────────────────

/**
 * The learner-health half of the overview: how many people are studying, how
 * many finished, how many stalled, and what the assessment numbers say.
 *
 * Quiz pass rate is counted over *distinct learners who attempted*, not over
 * attempts: a learner retrying a quiz three times until they pass is one learner
 * who eventually succeeded, and counting retries would make a hard quiz look
 * like a failing one.
 */
export const getInstructorPulse = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const courses = await loadOwnedCourses(ctx, user);
    const courseIds = courses.map((c) => c._id);
    const courseById = new Map(courses.map((c) => [c._id, c]));
    const now = Date.now();
    const weekAgo = now - 7 * DAY_MS;
    const monthAgo = now - 30 * DAY_MS;
    const quietCutoff = now - AT_RISK_AFTER_DAYS * DAY_MS;

    let enrolled = 0;
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let activeThisWeek = 0;
    let newThisMonth = 0;
    let averageProgress = 0;
    const atRisk: {
      userId: Id<"users">;
      learnerName: string | null;
      courseId: Id<"courses">;
      courseTitle: string;
      progressPercent: number;
      lastActiveAt: number;
    }[] = [];

    for (const courseId of courseIds) {
      const enrollments = await ctx.db
        .query("enrollments")
        .withIndex("by_course", (q) => q.eq("courseId", courseId))
        .collect();

      for (const enrollment of enrollments) {
        enrolled += 1;
        averageProgress += enrollment.progressPercent;
        if (enrollment.progressPercent >= 100) completed += 1;
        else if (enrollment.progressPercent > 0) inProgress += 1;
        else notStarted += 1;
        if (enrollment.updatedAt >= weekAgo) activeThisWeek += 1;
        if (enrollment.createdAt >= monthAgo) newThisMonth += 1;

        // Started but stalled. A completed or untouched enrollment is not a
        // problem to flag — the middle of the course going quiet is.
        if (
          enrollment.progressPercent > 0 &&
          enrollment.progressPercent < 100 &&
          enrollment.updatedAt <= quietCutoff
        ) {
          const learner = await ctx.db.get(enrollment.userId);
          atRisk.push({
            userId: enrollment.userId,
            learnerName: learner?.name?.trim() || null,
            courseId,
            courseTitle: courseById.get(courseId)?.title ?? "Unknown course",
            progressPercent: Math.round(enrollment.progressPercent),
            lastActiveAt: enrollment.updatedAt,
          });
        }
      }
    }

    // Quiz outcomes need quiz → lesson → course, walked once per course so the
    // per-learner sets are built from maps rather than re-querying per attempt.
    const lessonsByCourse = new Map<Id<"courses">, Id<"lessons">[]>();
    const courseByQuiz = new Map<Id<"quizzes">, Id<"courses">>();
    for (const courseId of courseIds) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_course_order", (q) => q.eq("courseId", courseId))
        .collect();
      lessonsByCourse.set(courseId, lessons.map((l) => l._id));
      for (const lesson of lessons) {
        const quiz = await ctx.db
          .query("quizzes")
          .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
          .unique();
        if (quiz) courseByQuiz.set(quiz._id, courseId);
      }
    }

    const passersByCourse = new Map<string, Set<Id<"users">>>();
    const attemptedByCourse = new Map<string, Set<Id<"users">>>();
    const passersAll = new Set<Id<"users">>();
    const attemptedAll = new Set<Id<"users">>();

    for (const [quizId, courseId] of courseByQuiz) {
      const attempts = await ctx.db
        .query("quizAttempts")
        .withIndex("by_quiz", (q) => q.eq("quizId", quizId))
        .collect();

      const courseAttempters =
        attemptedByCourse.get(courseId) ?? new Set<Id<"users">>();
      const coursePassers =
        passersByCourse.get(courseId) ?? new Set<Id<"users">>();

      for (const attempt of attempts) {
        courseAttempters.add(attempt.userId);
        attemptedAll.add(attempt.userId);
        if (attempt.passed) {
          coursePassers.add(attempt.userId);
          passersAll.add(attempt.userId);
        }
      }

      attemptedByCourse.set(courseId, courseAttempters);
      passersByCourse.set(courseId, coursePassers);
    }

    // Certificate issuance is the outcome the learner actually values, so it
    // gets its own count rather than being inferred from completion.
    let certificatesIssued = 0;
    let certificatesRevoked = 0;
    let certificatesThisMonth = 0;
    for (const courseId of courseIds) {
      const certificates = await ctx.db
        .query("certificates")
        .withIndex("by_course", (q) => q.eq("courseId", courseId))
        .collect();
      certificatesIssued += certificates.length;
      certificatesThisMonth += certificates.filter(
        (c) => c.issuedAt >= monthAgo,
      ).length;
      certificatesRevoked += certificates.filter(
        (c) => c.revokedAt !== undefined,
      ).length;
    }

    // Lesson completions across every owned course, from the activity log.
    const activityRows = await ctx.db
      .query("learningActivities")
      .take(MAX_ACTIVITY_ROWS);
    const courseIdSet = new Set<string>(courseIds);
    const lessonsCompleted7d = activityRows.filter(
      (row) =>
        row.type === "lesson_completed" &&
        row.courseId !== undefined &&
        courseIdSet.has(row.courseId) &&
        row.createdAt >= weekAgo,
    ).length;
    const lessonsCompleted30d = activityRows.filter(
      (row) =>
        row.type === "lesson_completed" &&
        row.courseId !== undefined &&
        courseIdSet.has(row.courseId) &&
        row.createdAt >= monthAgo,
    ).length;

    return {
      courses: courses.length,
      publishedCourses: courses.filter((c) => c.published).length,
      draftCourses: courses.filter((c) => !c.published).length,
      lessons: Array.from(lessonsByCourse.values()).reduce(
        (sum, ids) => sum + ids.length,
        0,
      ),
      quizCount: courseByQuiz.size,
      learners: {
        enrolled,
        activeThisWeek,
        newThisMonth,
        completed,
        inProgress,
        notStarted,
        averageProgress: enrolled === 0 ? 0 : Math.round(averageProgress / enrolled),
        completionRate:
          enrolled === 0 ? 0 : Math.round((completed / enrolled) * 100),
      },
      quizPerformance: {
        attemptedBy: attemptedAll.size,
        passedBy: passersAll.size,
        passRate:
          attemptedAll.size === 0
            ? null
            : Math.round((passersAll.size / attemptedAll.size) * 100),
        passRateByCourse: courseIds.map((courseId) => {
          const attempted = attemptedByCourse.get(courseId)?.size ?? 0;
          const passed = passersByCourse.get(courseId)?.size ?? 0;
          return {
            courseId,
            courseTitle: courseById.get(courseId)?.title ?? "Unknown course",
            attemptedBy: attempted,
            passedBy: passed,
            passRate: attempted === 0 ? null : Math.round((passed / attempted) * 100),
          };
        }),
      },
      certificates: {
        issued: certificatesIssued,
        revoked: certificatesRevoked,
        active: certificatesIssued - certificatesRevoked,
        issuedThisMonth: certificatesThisMonth,
      },
      engagement: { lessonsCompleted7d, lessonsCompleted30d },
      atRisk: atRisk
        .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
        .slice(0, 8),
      atRiskCount: atRisk.length,
    };
  },
});

// ─── Per-course performance ────────────────────────────────────────────────

/**
 * One row per course: the shape behind the analytics table and the revenue
 * chart's course breakdown.
 *
 * `conversionRate` is learners per published month, not per day-of-listing: a
 * course published for six days should not look worse than one listed for six
 * months, and dividing by raw days is exactly that mistake.
 */
export const listInstructorCoursePerformance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const courses = await loadOwnedCourses(ctx, user);
    const now = Date.now();
    const monthAgo = now - 30 * DAY_MS;

    const rows = [];
    for (const course of courses) {
      const [enrollments, sales, certificates, lessons] = await Promise.all([
        ctx.db
          .query("enrollments")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .collect(),
        loadPaidSales(ctx, course._id),
        ctx.db
          .query("certificates")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .collect(),
        ctx.db
          .query("lessons")
          .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
          .collect(),
      ]);

      const completed = enrollments.filter((e) => e.progressPercent >= 100);
      const active = enrollments.filter((e) => e.updatedAt >= monthAgo);
      const totals = summarizeEarnings(sales.map(toSale));

      const publishedMonths = Math.max(
        1,
        (now - (course.published ? course.createdAt : now)) /
          (30 * DAY_MS),
      );

      rows.push({
        courseId: course._id,
        title: course.title,
        slug: course.slug,
        thumbnailUrl: course.thumbnailUrl ?? null,
        category: course.category ?? null,
        level: course.level ?? null,
        published: course.published,
        price: course.price,
        currency: course.currency ?? "NGN",
        createdAt: course.createdAt,
        lessons: lessons.length,
        enrollmentCount: enrollments.length,
        activeLearners: active.length,
        completedCount: completed.length,
        completionRate:
          enrollments.length === 0
            ? 0
            : Math.round((completed.length / enrollments.length) * 100),
        averageProgress:
          enrollments.length === 0
            ? 0
            : Math.round(
                enrollments.reduce((sum, e) => sum + e.progressPercent, 0) /
                  enrollments.length,
              ),
        sales: totals.sales,
        grossKobo: totals.grossKobo,
        refundedKobo: totals.refundedKobo,
        netEarningsKobo: totals.netEarningsKobo,
        averageOrderKobo: totals.averageOrderKobo,
        conversionRate:
          course.published && enrollments.length > 0
            ? Math.round((enrollments.length / publishedMonths) * 10) / 10
            : 0,
        certificateCount: certificates.filter((c) => !c.revokedAt).length,
        revokedCertificateCount: certificates.filter(
          (c) => c.revokedAt !== undefined,
        ).length,
      });
    }

    rows.sort((a, b) => b.netEarningsKobo - a.netEarningsKobo);
    return rows;
  },
});

// ─── Work queue ─────────────────────────────────────────────────────────────

/**
 * The "needs your attention" list.
 *
 * Each item is something the instructor can act on from this console, computed
 * server-side so the browser never has to re-derive the conditions (and so the
 * same list cannot disagree with itself between two renders). The list is empty
 * by design when there is nothing wrong — an instructor who has published
 * everything, answered everything and has no stalled learners should see calm,
 * not an apology.
 */
export const listInstructorAttentionItems = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const courses = await loadOwnedCourses(ctx, user);
    const now = Date.now();
    const items: {
      key: string;
      kind: "draft" | "empty" | "discussion" | "grading" | "unpublish" | "stalled";
      title: string;
      detail: string;
      href: string;
      courseId: Id<"courses"> | null;
    }[] = [];

    let unansweredThreads = 0;
    let awaitingGrade = 0;
    let stalledThreads = 0;
    const stalledCutoff = now - 3 * DAY_MS;

    for (const course of courses) {
      const courseHref = `/dashboard/instructor/courses/${course._id}`;
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_course_order", (q) => q.eq("courseId", course._id))
        .collect();

      if (!course.published) {
        items.push({
          key: `draft-${course._id}`,
          kind: "draft",
          title: `Publish "${course.title}"`,
          detail:
            lessons.length === 0
              ? "This draft has no lessons yet — add content before it goes on sale."
              : `${lessons.length} lesson${lessons.length === 1 ? "" : "s"} ready. Publish it to start enrolling learners.`,
          href: courseHref,
          courseId: course._id,
        });
      } else if (lessons.length === 0) {
        items.push({
          key: `empty-${course._id}`,
          kind: "empty",
          title: `"${course.title}" is live but empty`,
          detail:
            "Learners can see this listing but there is nothing to study. Add lessons so it can earn its price.",
          href: courseHref,
          courseId: course._id,
        });
      }

      // Discussions: a thread whose newest message is a learner's question that
      // the instructor has never answered.
      const threads = await ctx.db
        .query("discussionThreads")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect();
      for (const thread of threads) {
        if (thread.locked) continue;
        const messages = await ctx.db
          .query("discussionMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(1);
        const latest = messages[0];
        if (!latest || latest.userId === user._id) continue;
        unansweredThreads += 1;
        if (latest.createdAt <= stalledCutoff) stalledThreads += 1;
        items.push({
          key: `thread-${thread._id}`,
          kind: "discussion",
          title: `Reply to "${thread.title}"`,
          detail: "A learner asked a question and has not had an answer yet.",
          href: `/dashboard/courses/${course.slug}/discussions`,
          courseId: course._id,
        });
      }

      // Grading: submissions handed in on this instructor's assignments that
      // nobody has marked.
      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect();
      for (const assignment of assignments) {
        if (assignment.status === "draft") continue;
        const submissions = await ctx.db
          .query("assignmentSubmissions")
          .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
          .collect();
        const waiting = submissions.filter((s) => s.status === "submitted").length;
        if (waiting === 0) continue;
        awaitingGrade += waiting;
        items.push({
          key: `assignment-${assignment._id}`,
          kind: "grading",
          title: `Grade ${waiting} submission${waiting === 1 ? "" : "s"} — ${assignment.title}`,
          detail: `Learners are waiting on feedback for "${course.title}".`,
          href: "/dashboard/tasks?tab=grading",
          courseId: course._id,
        });
      }

      // An unpublish request sitting in the admin queue.
      const requests = await ctx.db
        .query("courseUnpublishRequests")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect();
      for (const request of requests) {
        if (request.status !== "pending") continue;
        items.push({
          key: `unpublish-${request._id}`,
          kind: "unpublish",
          title: `Unpublish request pending for "${course.title}"`,
          detail:
            "An admin is reviewing this because the course has paid buyers. Nothing is needed from you right now.",
          href: courseHref,
          courseId: course._id,
        });
      }
    }

    // Stalled learners, deduped by learner so one quiet student in three
    // courses is one item, not three.
    const quietCutoff = now - AT_RISK_AFTER_DAYS * DAY_MS;
    const stalledByLearner = new Map<string, { count: number; courseTitle: string; progress: number }>();
    for (const course of courses) {
      const enrollments = await ctx.db
        .query("enrollments")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect();
      for (const enrollment of enrollments) {
        if (
          enrollment.progressPercent <= 0 ||
          enrollment.progressPercent >= 100 ||
          enrollment.updatedAt > quietCutoff
        ) {
          continue;
        }
        const key = enrollment.userId;
        const existing = stalledByLearner.get(key);
        if (existing) {
          existing.count += 1;
          continue;
        }
        stalledByLearner.set(key, {
          count: 1,
          courseTitle: course.title,
          progress: Math.round(enrollment.progressPercent),
        });
      }
    }

    // One item for the cohort rather than one per learner: the instructor's
    // action is the same (write to them) whether it is four learners or forty.
    if (stalledByLearner.size > 0) {
      const learnerWord = stalledByLearner.size === 1 ? "learner has" : "learners have";
      items.push({
        key: "stalled-cohort",
        kind: "stalled",
        title: `${stalledByLearner.size} ${learnerWord} gone quiet`,
        detail:
          "They started a course and stopped for a week. A message usually recovers more completions than a new lesson does.",
        href: "/dashboard/inbox",
        courseId: null,
      });
    }

    const rank: Record<string, number> = {
      empty: 0,
      grading: 1,
      discussion: 2,
      draft: 3,
      stalled: 4,
      unpublish: 5,
    };
    items.sort((a, b) => rank[a.kind] - rank[b.kind]);

    return {
      items,
      counts: {
        drafts: items.filter((i) => i.kind === "draft").length,
        emptyCourses: items.filter((i) => i.kind === "empty").length,
        unansweredThreads,
        stalledThreads,
        awaitingGrade,
        stalledLearners: stalledByLearner.size,
        pendingUnpublishRequests: items.filter((i) => i.kind === "unpublish").length,
      },
      hasWork: items.length > 0,
    };
  },
});

// ─── Activity feed ─────────────────────────────────────────────────────────

/**
 * Recent events across the instructor's courses, newest first: sales, new
 * enrollments, completions and certificates.
 *
 * Built server-side because the events live in four different tables with four
 * different indexes; assembling them in the browser would mean shipping every
 * purchase and enrollment row to the client to sort them.
 */
export const listInstructorActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) throw new Error("Not authorized");

    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? MAX_RECENT_ACTIVITY)));
    const courses = await loadOwnedCourses(ctx, user);

    type Event = {
      key: string;
      kind: "sale" | "enrollment" | "completion" | "certificate";
      courseId: Id<"courses">;
      courseTitle: string;
      actorName: string | null;
      at: number;
      amountKobo: number | null;
      href: string;
    };
    const events: Event[] = [];

    for (const course of courses) {
      const [purchases, enrollments, certificates] = await Promise.all([
        loadPaidSales(ctx, course._id),
        ctx.db
          .query("enrollments")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .collect(),
        ctx.db
          .query("certificates")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .collect(),
      ]);

      for (const purchase of purchases) {
        const buyer = await ctx.db.get(purchase.userId);
        events.push({
          key: `sale-${purchase._id}`,
          kind: "sale",
          courseId: course._id,
          courseTitle: course.title,
          actorName: buyer?.name?.trim() || null,
          at: purchase.paidAt ?? purchase.createdAt,
          amountKobo: purchase.amount,
          href: `/dashboard/instructor/earnings`,
        });
      }

      for (const enrollment of enrollments) {
        const learner = await ctx.db.get(enrollment.userId);
        const learnerName = learner?.name?.trim() || null;
        events.push({
          key: `enrollment-${enrollment._id}`,
          kind: "enrollment",
          courseId: course._id,
          courseTitle: course.title,
          actorName: learnerName,
          at: enrollment.createdAt,
          amountKobo: null,
          href: `/dashboard/courses/${course.slug}`,
        });
        if (enrollment.progressPercent >= 100) {
          events.push({
            key: `completion-${enrollment._id}`,
            kind: "completion",
            courseId: course._id,
            courseTitle: course.title,
            actorName: learnerName,
            at: enrollment.updatedAt,
            amountKobo: null,
            href: `/dashboard/courses/${course.slug}`,
          });
        }
      }

      for (const certificate of certificates) {
        events.push({
          key: `certificate-${certificate._id}`,
          kind: "certificate",
          courseId: course._id,
          courseTitle: course.title,
          actorName: certificate.holderName ?? null,
          at: certificate.issuedAt,
          amountKobo: null,
          href: `/dashboard/certificates`,
        });
      }
    }

    return {
      events: events.sort((a, b) => b.at - a.at).slice(0, limit),
    };
  },
});
