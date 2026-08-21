import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const issueCertificate = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User record not found");
    }

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    if (!enrollment) {
      throw new Error("You are not enrolled in this course");
    }

    // Simple completion rule for now: 80%+ progress.
    if (enrollment.progressPercent < 80) {
      throw new Error("You must reach at least 80% progress to get a certificate");
    }

    const existing = await ctx.db
      .query("certificates")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("certificates", {
      userId: user._id,
      courseId: args.courseId,
      issuedAt: now,
    });
  },
});

export const listMyCertificates = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    return await ctx.db
      .query("certificates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});


// Public, read-only certificate verification — intentionally unauthenticated
// so employers can verify a certificate from its link. Exposes only the
// recipient's name, course title, and issue date.
export const getCertificateForVerification = query({
  args: { certificateId: v.id("certificates") },
  handler: async (ctx, args) => {
    const cert = await ctx.db.get(args.certificateId);
    if (!cert) return null;

    const [holder, course] = await Promise.all([
      ctx.db.get(cert.userId),
      ctx.db.get(cert.courseId),
    ]);

    return {
      holderName: holder?.name ?? "Unknown",
      courseTitle: course?.title ?? "Unknown course",
      issuedAt: cert.issuedAt,
      valid: true,
    };
  },
});
