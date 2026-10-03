import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, type Id, type ReadCtx } from "./helpers/auth";
import { evaluateForLearner } from "./helpers/completion";

export const getUserStatistics = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    // Get all enrollments
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const courseIds = enrollments.map((e) => e.courseId);

    // Courses stats
    const totalCoursesEnrolled = enrollments.length;
    const completedCourses = enrollments.filter((e) => e.progressPercent >= 100).length;
    const inProgressCourses = enrollments.filter((e) => e.progressPercent > 0 && e.progressPercent < 100).length;

    // Lessons stats
    let totalLessonsCompleted = 0;
    let totalLessonsInEnrolledCourses = 0;
    for (const enrollment of enrollments) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_course_order", (q) => q.eq("courseId", enrollment.courseId))
        .collect();
      totalLessonsInEnrolledCourses += lessons.length;
      if (enrollment.completedLessonIds) {
        totalLessonsCompleted += enrollment.completedLessonIds.length;
      }
    }

    // Quizzes stats
    const quizAttempts = await ctx.db
      .query("quizAttempts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const totalQuizzesAttempted = quizAttempts.length;
    const totalQuizzesPassed = quizAttempts.filter((a) => a.passed).length;
    const averageQuizScore = totalQuizzesAttempted > 0
      ? Math.round(quizAttempts.reduce((sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0), 0) / totalQuizzesAttempted)
      : 0;

    // Certificates stats
    const certificates = await ctx.db
      .query("certificates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const totalCertificatesEarned = certificates.filter((c) => !c.revokedAt).length;
    const totalCertificatesRevoked = certificates.filter((c) => c.revokedAt).length;

    // Study time (from learning activities)
    const lessonActivities = await ctx.db
      .query("learningActivities")
      .withIndex("by_user_type", (q) => q.eq("userId", user._id).eq("type", "lesson_completed"))
      .collect();
    let totalStudyMinutes = 0;
    for (const activity of lessonActivities) {
      if (activity.metadata?.durationMinutes) {
        totalStudyMinutes += activity.metadata.durationMinutes;
      }
    }
    const totalStudyHours = Math.round(totalStudyMinutes / 60 * 10) / 10; // 1 decimal

    // Current streak
    const currentStreak = await calculateCurrentStreak(ctx, user._id);

    // Longest streak
    const longestStreak = await calculateLongestStreak(ctx, user._id);

    // This week's activity
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeekActivities = await ctx.db
      .query("learningActivities")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("createdAt"), weekAgo))
      .collect();
    const lessonsThisWeek = thisWeekActivities.filter((a) => a.type === "lesson_completed").length;
    const quizzesThisWeek = thisWeekActivities.filter((a) => a.type === "quiz_passed").length;
    const studyMinutesThisWeek = thisWeekActivities
      .filter((a) => a.type === "lesson_completed" && a.metadata?.durationMinutes)
      .reduce((sum, a) => sum + (a.metadata.durationMinutes || 0), 0);

    // This month's activity
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const thisMonthActivities = await ctx.db
      .query("learningActivities")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("createdAt"), monthAgo))
      .collect();
    const lessonsThisMonth = thisMonthActivities.filter((a) => a.type === "lesson_completed").length;
    const quizzesThisMonth = thisMonthActivities.filter((a) => a.type === "quiz_passed").length;
    const studyMinutesThisMonth = thisMonthActivities
      .filter((a) => a.type === "lesson_completed" && a.metadata?.durationMinutes)
      .reduce((sum, a) => sum + (a.metadata.durationMinutes || 0), 0);

    // Average progress across enrolled courses
    const avgProgress = totalCoursesEnrolled > 0
      ? Math.round(enrollments.reduce((sum, e) => sum + e.progressPercent, 0) / totalCoursesEnrolled)
      : 0;

    // Next milestone (next certificate eligible)
    let nextCertificateCourse: { courseId: Id<"courses">; courseTitle: string; progressPercent: number; blockers: string[] } | null = null;
    for (const enrollment of enrollments) {
      if (enrollment.progressPercent < 100) {
        const completion = await evaluateForLearner(
          ctx,
          enrollment.courseId,
          user._id,
          enrollment.completedLessonIds,
        );
        if (!completion.eligible) {
          const course = await ctx.db.get(enrollment.courseId);
          if (course) {
            nextCertificateCourse = {
              courseId: enrollment.courseId,
              courseTitle: course.title,
              progressPercent: completion.progressPercent,
              blockers: completion.blockers,
            };
            break; // Return the first one (could sort by closest to completion)
          }
        }
      }
    }

    // Active goals summary
    const activeGoals = await ctx.db
      .query("userGoals")
      .withIndex("by_user_active", (q) => q.eq("userId", user._id).eq("isActive", true))
      .collect();
    const goalsSummary = activeGoals.map((g) => ({
      _id: g._id,
      type: g.type,
      target: g.target,
      current: g.current,
      progressPercent: g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0,
      period: g.period,
      daysRemaining: g.endDate ? Math.max(0, Math.ceil((g.endDate - Date.now()) / (1000 * 60 * 60 * 24))) : null,
    }));

    return {
      // Course stats
      totalCoursesEnrolled,
      completedCourses,
      inProgressCourses,
      avgProgress,

      // Lesson stats
      totalLessonsCompleted,
      totalLessonsInEnrolledCourses,

      // Quiz stats
      totalQuizzesAttempted,
      totalQuizzesPassed,
      averageQuizScore,

      // Certificate stats
      totalCertificatesEarned,
      totalCertificatesRevoked,

      // Time stats
      totalStudyHours,
      totalStudyMinutes,

      // Streak stats
      currentStreak,
      longestStreak,

      // Weekly stats
      lessonsThisWeek,
      quizzesThisWeek,
      studyHoursThisWeek: Math.round(studyMinutesThisWeek / 60 * 10) / 10,

      // Monthly stats
      lessonsThisMonth,
      quizzesThisMonth,
      studyHoursThisMonth: Math.round(studyMinutesThisMonth / 60 * 10) / 10,

      // Next milestone
      nextCertificateCourse,

      // Goals summary
      activeGoalsCount: activeGoals.length,
      goalsSummary,
    };
  },
});

export const getUserLearningHistory = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    type: v.optional(v.union(
      v.literal("lesson_completed"),
      v.literal("quiz_passed"),
      v.literal("quiz_attempted"),
      v.literal("certificate_earned"),
      v.literal("course_enrolled"),
      v.literal("course_completed"),
    )),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // First get the activities without order, then sort in memory
    const allActivities = await ctx.db
      .query("learningActivities")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .collect();

    // Sort by createdAt descending
    const sortedActivities = allActivities.sort((a, b) => b.createdAt - a.createdAt);

    const startIndex = args.offset ?? 0;
    const endIndex = startIndex + (args.limit ?? 50);
    let filtered = sortedActivities.slice(startIndex, endIndex);
    if (args.type) {
      filtered = filtered.filter((a) => a.type === args.type);
    }

    // Enrich with related data
    return await Promise.all(
      filtered.map(async (activity) => {
        let courseTitle = null;
        let lessonTitle = null;

        if (activity.courseId) {
          const course = await ctx.db.get(activity.courseId);
          courseTitle = course?.title ?? null;
        }
        if (activity.lessonId) {
          const lesson = await ctx.db.get(activity.lessonId);
          lessonTitle = lesson?.title ?? null;
        }

        return {
          ...activity,
          courseTitle,
          lessonTitle,
        };
      }),
    );
  },
});

export const getWeeklyActivityChart = query({
  args: { weeks: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const weeks = args.weeks ?? 12;
    const now = Date.now();

    const data = [];

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() - i * 7);
      weekStart.setUTCHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      weekEnd.setUTCHours(23, 59, 59, 999);

      const activities = await ctx.db
        .query("learningActivities")
        .withIndex("by_user_created", (q) => q.eq("userId", user._id))
        .filter((q) => q.and(q.gte(q.field("createdAt"), weekStart.getTime()), q.lte(q.field("createdAt"), weekEnd.getTime())))
        .collect();

      const lessonsCompleted = activities.filter((a) => a.type === "lesson_completed").length;
      const quizzesPassed = activities.filter((a) => a.type === "quiz_passed").length;
      const studyMinutes = activities
        .filter((a) => a.type === "lesson_completed" && a.metadata?.durationMinutes)
        .reduce((sum, a) => sum + (a.metadata.durationMinutes || 0), 0);

      data.push({
        week: `${weekStart.getUTCMonth() + 1}/${weekStart.getUTCDate()}`,
        weekStart: weekStart.getTime(),
        weekEnd: weekEnd.getTime(),
        lessonsCompleted,
        quizzesPassed,
        studyHours: Math.round(studyMinutes / 60 * 10) / 10,
        activeDays: new Set(
          activities.map((a) => {
            const d = new Date(a.createdAt);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
          }),
        ).size,
      });
    }

    return data;
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function calculateCurrentStreak(ctx: ReadCtx, userId: Id<"users">): Promise<number> {
  // Get all learning activities, most recent first
  const activities = await ctx.db
    .query("learningActivities")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("desc")
    .take(500); // Reasonable limit - returns array directly

  if (activities.length === 0) return 0;

  // Group by date (UTC)
  const activeDates = new Set<string>();
  for (const activity of activities) {
    const date = new Date(activity.createdAt);
    const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    activeDates.add(dateStr);
  }

  // Calculate streak from today backwards
  let streak = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setUTCDate(today.getUTCDate() - i);
    const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, "0")}-${String(checkDate.getUTCDate()).padStart(2, "0")}`;
    if (activeDates.has(dateStr)) {
      streak++;
    } else if (i === 0) {
      // If no activity today, check if there was activity yesterday (streak continues if yesterday was active)
      const yesterday = new Date(today);
      yesterday.setUTCDate(today.getUTCDate() - 1);
      const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterday.getUTCDate()).padStart(2, "0")}`;
      if (!activeDates.has(yesterdayStr)) {
        break;
      }
      // If yesterday was active but today isn't yet, don't count today but continue checking
    } else {
      break;
    }
  }

  return streak;
}

async function calculateLongestStreak(ctx: ReadCtx, userId: Id<"users">): Promise<number> {
  const activities = await ctx.db
    .query("learningActivities")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .order("asc")
    .collect();

  if (activities.length === 0) return 0;

  const activeDates = new Set<string>();
  for (const activity of activities) {
    const date = new Date(activity.createdAt);
    const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    activeDates.add(dateStr);
  }

  const sortedDates = Array.from(activeDates).sort();
  let longest = 0;
  let current = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sortedDates) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (prevDate) {
      const diffDays = Math.round((date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        current++;
      } else {
        longest = Math.max(longest, current);
        current = 1;
      }
    } else {
      current = 1;
    }
    prevDate = date;
  }

  return Math.max(longest, current);
}