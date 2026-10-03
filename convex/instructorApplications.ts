import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { logAudit, type AuditEntry } from "./helpers/audit";

// ─── Submit an instructor application ───────────────────────────────
export const submitApplication = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    expertise: v.string(),
    bio: v.string(),
    portfolioUrl: v.optional(v.string()),
    motivation: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User record not found");
    }

    // Already an instructor or admin
    if (user.role === "instructor" || user.role === "admin") {
      throw new Error("You are already an instructor or admin");
    }

    // Check for an existing pending application
    const existing = await ctx.db
      .query("instructorApplications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    const hasPending = existing.some((app) => app.status === "pending");
    if (hasPending) {
      throw new Error("You already have a pending application");
    }

    const now = Date.now();
    return await ctx.db.insert("instructorApplications", {
      userId: user._id,
      fullName: args.fullName,
      email: args.email,
      expertise: args.expertise,
      bio: args.bio,
      portfolioUrl: args.portfolioUrl,
      motivation: args.motivation,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Get the current user's application status ──────────────────────
export const getMyApplication = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    const applications = await ctx.db
      .query("instructorApplications")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Return the most recent application
    if (applications.length === 0) return null;
    return applications.sort((a, b) => b.createdAt - a.createdAt)[0];
  },
});

// ─── Admin: list all applications ───────────────────────────────────
export const listApplications = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

    if (args.status) {
      return await ctx.db
        .query("instructorApplications")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect();
    }

    return await ctx.db.query("instructorApplications").collect();
  },
});

// ─── Admin: review (approve or reject) an application ───────────────
export const reviewApplication = mutation({
  args: {
    applicationId: v.id("instructorApplications"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const admin = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!admin || admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      throw new Error("Application not found");
    }

    if (application.status !== "pending") {
      throw new Error("Application has already been reviewed");
    }

    // Update the application
    await ctx.db.patch(args.applicationId, {
      status: args.decision,
      reviewedBy: admin._id,
      reviewNote: args.reviewNote,
      updatedAt: Date.now(),
    });

    const details: NonNullable<AuditEntry["details"]> = {
      decision: args.decision,
    };
    if (args.reviewNote !== undefined) details.note = args.reviewNote;

    // If approved, promote the user to instructor
    if (args.decision === "approved") {
      // Read the old role before the patch so the log records what the
      // applicant actually was — an approval that silently raised an admin
      // (or a stranger) would otherwise be indistinguishable from a normal
      // student promotion.
      const applicant = await ctx.db.get(application.userId);
      await ctx.db.patch(application.userId, {
        role: "instructor",
      });
      details.promotedUserId = application.userId;
      details.oldRole = applicant?.role ?? null;
      details.newRole = "instructor";
    }

    await logAudit(ctx, {
      actorId: admin._id,
      action: "instructor_application.review",
      targetType: "instructorApplication",
      targetId: args.applicationId,
      details,
    });

    return { success: true };
  },
});
