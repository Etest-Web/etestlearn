import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

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
