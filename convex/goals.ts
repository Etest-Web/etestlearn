import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireUser, type Id, type WriteCtx, type ReadCtx } from "./helpers/auth";
import { createNotification } from "./helpers/notifications";

export const createGoal = mutation({
  args: {
    type: v.union(
      v.literal("complete_courses"),
      v.literal("complete_lessons"),
      v.literal("watch_hours"),
      v.literal("earn_certificates"),
      v.literal("pass_quizzes"),
      v.literal("study_streak_days"),
    ),
    target: v.number(),
    period: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("yearly"),
      v.literal("all_time"),
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Check if user already has an active goal of this type and period
    const existing = await ctx.db
      .query("userGoals")
      .withIndex("by_user_type_period", (q) =>
        q.eq("userId", user._id).eq("type", args.type).eq("period", args.period),
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (existing) {
      throw new Error(`You already have an active ${args.period} ${args.type} goal`);
    }

    const now = Date.now();
    const startDate = args.startDate ?? now;
    const endDate = args.endDate ?? calculatePeriodEnd(startDate, args.period);

    if (endDate <= startDate) {
      throw new Error("End date must be after start date");
    }
    if (args.target <= 0) {
      throw new Error("Target must be greater than 0");
    }

    // Get initial current value based on goal type
    const initialCurrent = await calculateCurrentProgress(ctx, user._id, args.type, startDate, endDate);

    return await ctx.db.insert("userGoals", {
      userId: user._id,
      type: args.type,
      target: args.target,
      current: initialCurrent,
      period: args.period,
      startDate,
      endDate,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateGoal = mutation({
  args: {
    goalId: v.id("userGoals"),
    target: v.optional(v.number()),
    endDate: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");
    if (goal.userId !== user._id) throw new Error("Not authorized");

    const updates: any = { updatedAt: Date.now() };
    if (args.target !== undefined) {
      if (args.target <= 0) throw new Error("Target must be greater than 0");
      updates.target = args.target;
    }
    if (args.endDate !== undefined) {
      if (args.endDate <= goal.startDate) throw new Error("End date must be after start date");
      updates.endDate = args.endDate;
    }
    if (args.isActive !== undefined) {
      updates.isActive = args.isActive;
      if (args.isActive === false && goal.completedAt === undefined && goal.current >= goal.target) {
        updates.completedAt = Date.now();
      }
    }

    await ctx.db.patch(args.goalId, updates);
    return { success: true };
  },
});

export const deleteGoal = mutation({
  args: { goalId: v.id("userGoals") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");
    if (goal.userId !== user._id) throw new Error("Not authorized");

    await ctx.db.delete(args.goalId);
    return { success: true };
  },
});

export const getUserGoals = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const goals = await ctx.db
      .query("userGoals")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (args.activeOnly) {
      return goals.filter((g) => g.isActive);
    }
    return goals;
  },
});

export const getGoalProgress = query({
  args: { goalId: v.id("userGoals") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");
    if (goal.userId !== user._id) throw new Error("Not authorized");

    // Calculate current progress (read-only)
    const current = await calculateCurrentProgress(
      ctx,
      user._id,
      goal.type,
      goal.startDate,
      goal.endDate,
    );

    const progressPercent = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
    const isCompleted = current >= goal.target;
    const daysRemaining = goal.endDate ? Math.max(0, Math.ceil((goal.endDate - Date.now()) / (1000 * 60 * 60 * 24))) : null;

    return {
      ...goal,
      current,
      progressPercent,
      isCompleted,
      daysRemaining,
    };
  },
});

export const refreshGoalProgress = mutation({
  args: { goalId: v.id("userGoals") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const goal = await ctx.db.get(args.goalId);
    if (!goal) throw new Error("Goal not found");
    if (goal.userId !== user._id) throw new Error("Not authorized");

    // Calculate current progress
    const current = await calculateCurrentProgress(
      ctx,
      user._id,
      goal.type,
      goal.startDate,
      goal.endDate,
    );

    // Update if changed
    if (current !== goal.current) {
      await ctx.db.patch(goal._id, {
        current,
        updatedAt: Date.now(),
        completedAt: current >= goal.target && !goal.completedAt ? Date.now() : goal.completedAt,
        isActive: current < goal.target, // Reactivate if progress dropped below target
      });
    }

    const progressPercent = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
    const isCompleted = current >= goal.target;
    const daysRemaining = goal.endDate ? Math.max(0, Math.ceil((goal.endDate - Date.now()) / (1000 * 60 * 60 * 24))) : null;

    return {
      ...goal,
      current,
      progressPercent,
      isCompleted,
      daysRemaining,
    };
  },
});

/**
 * Internal function to increment goal progress when user performs learning activities.
 * Called from enrollments.completeLesson, quizzes.submitQuizAttempt, certificates.issueIfEligible, etc.
 */
export const incrementGoalProgress = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("complete_courses"),
      v.literal("complete_lessons"),
      v.literal("watch_hours"),
      v.literal("earn_certificates"),
      v.literal("pass_quizzes"),
      v.literal("study_streak_days"),
    ),
    amount: v.optional(v.number()), // Default 1 for count-based goals
    date: v.optional(v.number()), // For streak tracking
  },
  handler: async (ctx, args) => {
    const now = args.date ?? Date.now();

    // Find all active goals matching this type for the user
    const goals = await ctx.db
      .query("userGoals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .filter((q) => q.eq(q.field("type"), args.type))
      .collect();

    const activeGoals = goals.filter((g) => g.startDate <= now && (g.endDate === undefined || g.endDate >= now));

    for (const goal of activeGoals) {
      const newCurrent = goal.current + (args.amount ?? 1);
      const updates: any = {
        current: newCurrent,
        updatedAt: now,
      };
      if (newCurrent >= goal.target && !goal.completedAt) {
        updates.completedAt = now;
        updates.isActive = false; // Auto-complete the goal
      }
      await ctx.db.patch(goal._id, updates);
    }

    if (args.type === "study_streak_days") {
      const streak = await calculateCurrentStreak(ctx, args.userId, 0, now);
      const milestones = [3, 7, 14, 30, 60, 100, 365];
      if (milestones.includes(streak)) {
        await createNotification(ctx, {
          userId: args.userId,
          type: "streak_milestone",
          title: `${streak}-Day Study Streak!`,
          body: "Keep the momentum going — you're on fire!",
          href: "/dashboard",
        });
      }
    }
  },
});

/**
 * Recalculates progress for all active goals of a user (e.g., after data correction).
 */
export const recalculateAllGoals = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const goals = await ctx.db
      .query("userGoals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const goal of goals) {
      if (goal.startDate > now || (goal.endDate !== undefined && goal.endDate < now)) {
        continue; // Skip goals not in current period
      }

      const current = await calculateCurrentProgress(ctx, args.userId, goal.type, goal.startDate, goal.endDate);
      const updates: any = { current, updatedAt: now };
      if (current >= goal.target && !goal.completedAt) {
        updates.completedAt = now;
        updates.isActive = false;
      }
      await ctx.db.patch(goal._id, updates);
    }
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculatePeriodEnd(startDate: number, period: string): number {
  const start = new Date(startDate);
  switch (period) {
    case "weekly":
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime();
    case "monthly":
      return new Date(start.getFullYear(), start.getMonth() + 1, start.getDate()).getTime();
    case "yearly":
      return new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()).getTime();
    case "all_time":
      return new Date(2100, 0, 1).getTime(); // Far future
    default:
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime();
  }
}

async function calculateCurrentProgress(
  ctx: ReadCtx,
  userId: Id<"users">,
  type: string,
  startDate: number,
  endDate?: number,
): Promise<number> {
  const end = endDate ?? Date.now();

  switch (type) {
    case "complete_courses": {
      const enrollments = await ctx.db
        .query("enrollments")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const courseIds = enrollments.map((e) => e.courseId);
      let count = 0;
      for (const courseId of courseIds) {
        const enrollment = await ctx.db
          .query("enrollments")
          .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
          .unique();
        if (enrollment && enrollment.progressPercent >= 100 && enrollment.updatedAt >= startDate && enrollment.updatedAt <= end) {
          count++;
        }
      }
      return count;
    }
    case "complete_lessons": {
      const activities = await ctx.db
        .query("learningActivities")
        .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", "lesson_completed"))
        .filter((q) => q.and(q.gte(q.field("createdAt"), startDate), q.lte(q.field("createdAt"), end)))
        .collect();
      return activities.length;
    }
    case "watch_hours": {
      const activities = await ctx.db
        .query("learningActivities")
        .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", "lesson_completed"))
        .filter((q) => q.and(q.gte(q.field("createdAt"), startDate), q.lte(q.field("createdAt"), end)))
        .collect();
      let totalMinutes = 0;
      for (const activity of activities) {
        if (activity.metadata?.durationMinutes) {
          totalMinutes += activity.metadata.durationMinutes;
        }
      }
      return Math.round(totalMinutes / 60); // Return hours
    }
    case "earn_certificates": {
      const certificates = await ctx.db
        .query("certificates")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.and(q.gte(q.field("issuedAt"), startDate), q.lte(q.field("issuedAt"), end)))
        .collect();
      return certificates.filter((c) => !c.revokedAt).length;
    }
    case "pass_quizzes": {
      const attempts = await ctx.db
        .query("quizAttempts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.and(q.gte(q.field("createdAt"), startDate), q.lte(q.field("createdAt"), end)))
        .collect();
      return attempts.filter((a) => a.passed).length;
    }
    case "study_streak_days": {
      // Calculate current streak - this is a bit more complex
      return await calculateCurrentStreak(ctx, userId, startDate, end);
    }
    default:
      return 0;
  }
}

async function calculateCurrentStreak(
  ctx: ReadCtx,
  userId: Id<"users">,
  startDate: number,
  endDate: number,
): Promise<number> {
  // Get all learning activities in the period
  const activities = await ctx.db
    .query("learningActivities")
    .withIndex("by_user_created", (q) => q.eq("userId", userId))
    .filter((q) => q.and(q.gte(q.field("createdAt"), startDate), q.lte(q.field("createdAt"), endDate)))
    .collect();

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
      // Today doesn't count if no activity yet, check yesterday
      continue;
    } else {
      break;
    }
  }

  return streak;
}