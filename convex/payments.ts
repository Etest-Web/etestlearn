import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { logAudit } from "./helpers/audit";

// ─── Step 1: create a pending purchase record and return its reference ────
export const createPendingPurchase = mutation({
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
    if (!course || !course.published) throw new Error("Course not found");
    if (!course.price || course.price <= 0) {
      throw new Error("This course is free — enroll directly instead");
    }
    if (!identity.email) throw new Error("Your account has no email address");

    // Already enrolled? Nothing to buy.
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();
    if (enrollment) throw new Error("You are already enrolled in this course");

    const now = Date.now();
    const reference = `etest-${now}-${Math.random().toString(36).slice(2, 10)}`;

    await ctx.db.insert("purchases", {
      userId: user._id,
      courseId: args.courseId,
      paystackReference: reference,
      amount: course.price,
      currency: course.currency ?? "NGN",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return { reference };
  },
});

// ─── Client-facing read: does the current user have access? ───────────────

export const hasAccessToCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return false;

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    return !!enrollment;
  },
});

// ─── Internal helpers (used by paystack.ts actions and the webhook) ───────

export const getPurchaseByRef = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .unique();
    if (!purchase) return null;
    const user = await ctx.db.get(purchase.userId);
    return {
      ...purchase,
      clerkId: user?.clerkId ?? "",
      email: user?.email ?? "",
    };
  },
});

export const markPurchasePaid = internalMutation({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .unique();
    if (!purchase) throw new Error("Purchase not found");

    // Idempotent — webhook + verify may both fire.
    if (purchase.status === "paid") return;

    const now = Date.now();
    await ctx.db.patch(purchase._id, {
      status: "paid",
      paidAt: now,
      updatedAt: now,
    });

    // Fulfilment: create the enrollment.
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", purchase.userId).eq("courseId", purchase.courseId),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("enrollments", {
        userId: purchase.userId,
        courseId: purchase.courseId,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// ─── Admin console: payments view + refund annotation ──────────────────────

/** Recent purchases with buyer and course context, for the payments console. */
export const adminListPurchases = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("paid"), v.literal("failed")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const admin = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!admin || admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));

    // `by_course_status` leads with courseId, so a status-only filter cannot
    // use it; the table is small and admin-only, so a bounded newest-first
    // scan is the honest read here.
    const all = await ctx.db.query("purchases").collect();
    const filtered = all
      .filter((p) => (args.status ? p.status === args.status : true))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return await Promise.all(
      filtered.map(async (purchase) => {
        const [buyer, course] = await Promise.all([
          ctx.db.get(purchase.userId),
          ctx.db.get(purchase.courseId),
        ]);
        return {
          _id: purchase._id,
          reference: purchase.paystackReference,
          buyerName: buyer?.name ?? buyer?.email ?? null,
          buyerEmail: buyer?.email ?? null,
          courseTitle: course?.title ?? null,
          amount: purchase.amount / 100, // kobo → naira
          currency: purchase.currency,
          status: purchase.status,
          refundedAt: purchase.refundedAt ?? null,
          refundReason: purchase.refundReason ?? null,
          createdAt: purchase.createdAt,
          paidAt: purchase.paidAt ?? null,
        };
      }),
    );
  },
});

/**
 * Records a refund against a purchase. Deliberately annotation-only: the
 * money movement itself happens in the Paystack dashboard (calling their API
 * here would need an action + secret handling and a partial-refund policy
 * this console does not need yet), and access is NOT revoked automatically —
 * unwinding someone's enrollment after a refund is a separate, deliberate
 * decision so a mistaken annotation never silently deletes course access.
 * Audited like every other money-adjacent admin action.
 */
export const markRefunded = mutation({
  args: {
    purchaseId: v.id("purchases"),
    reason: v.optional(v.string()),
    clearRefund: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const admin = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!admin || admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase) throw new Error("Purchase not found");

    if (args.clearRefund) {
      await ctx.db.patch(purchase._id, {
        refundedAt: undefined,
        refundReason: undefined,
        updatedAt: Date.now(),
      });
      await logAudit(ctx, {
        actorId: admin._id,
        action: "purchase.refund_cleared",
        targetType: "purchase",
        targetId: purchase._id,
        details: { reference: purchase.paystackReference },
      });
      return;
    }

    if (purchase.status !== "paid") {
      throw new Error("Only paid purchases can be marked refunded");
    }
    if (purchase.refundedAt !== undefined) {
      throw new Error("This purchase is already marked refunded");
    }

    await ctx.db.patch(purchase._id, {
      refundedAt: Date.now(),
      refundReason: args.reason?.trim() || undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      actorId: admin._id,
      action: "purchase.refund",
      targetType: "purchase",
      targetId: purchase._id,
      details: {
        reference: purchase.paystackReference,
        amount: purchase.amount / 100,
        reason: args.reason ?? null,
      },
    });
  },
});
