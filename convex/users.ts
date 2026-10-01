import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Synced from Clerk webhooks (user.created / user.updated). This is the
// source of truth for profile fields, since JWT claims may not carry them.
export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Only include fields that were actually supplied, so a partial event
    // (e.g. an email change) does not blank out name or image.
    const profile: { email?: string; name?: string; imageUrl?: string } = {};
    if (args.email !== undefined) profile.email = args.email;
    if (args.name !== undefined) profile.name = args.name;
    if (args.imageUrl !== undefined) profile.imageUrl = args.imageUrl;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      if (Object.keys(profile).length > 0) {
        await ctx.db.patch(existing._id, profile);
      }
      return;
    }

    await ctx.db.insert("users", {
      clerkId: args.clerkId,
      ...profile,
      role: "student",
      createdAt: Date.now(),
    });
  },
});

/**
 * Remove a user deleted in Clerk. Related records (enrollments, purchases,
 * quiz attempts, certificates) are left in place so financial and academic
 * history remains auditable.
 */
export const deleteFromClerk = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Bulk mirror used by scripts/sync-clerk-users.mjs. Public rather than
 * internal because the backfill runs from outside Convex, and it is a pure
 * upsert keyed on clerkId, so replaying it is safe.
 *
 * Existing rows keep their role (student/instructor/admin); this only fills
 * in the Clerk-owned identity fields.
 */
export const syncFromClerk = mutation({
  args: {
    users: v.array(
      v.object({
        clerkId: v.string(),
        email: v.optional(v.string()),
        name: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let created = 0;
    let updated = 0;

    for (const user of args.users) {
      const profile: { email?: string; name?: string; imageUrl?: string } = {};
      if (user.email !== undefined) profile.email = user.email;
      if (user.name !== undefined) profile.name = user.name;
      if (user.imageUrl !== undefined) profile.imageUrl = user.imageUrl;

      const existing = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", user.clerkId))
        .unique();

      if (existing) {
        if (Object.keys(profile).length > 0) {
          await ctx.db.patch(existing._id, profile);
        }
        updated++;
        continue;
      }

      await ctx.db.insert("users", {
        clerkId: user.clerkId,
        ...profile,
        role: "student",
        createdAt: Date.now(),
      });
      created++;
    }

    return { created, updated, total: args.users.length };
  },
});

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    const now = Date.now();

    if (existing) {
      return existing._id;
    }

    const id = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email,
      name: identity.name,
      imageUrl: identity.pictureUrl,
      role: "student",
      createdAt: now,
    });

    return id;
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

// ─── Admin: user management ──────────────────────────────────────────────

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const admin = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!admin || admin.role !== "admin") {
      throw new Error("Not authorized");
    }

    return await ctx.db.query("users").collect();
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("student"),
      v.literal("instructor"),
      v.literal("admin"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const admin = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!admin || admin.role !== "admin") {
      throw new Error("Not authorized");
    }

    // Safety: an admin cannot demote themselves (avoids lockout).
    if (args.userId === admin._id && args.role !== "admin") {
      throw new Error("You cannot change your own admin role");
    }

    await ctx.db.patch(args.userId, { role: args.role });
  },
});

// ─── Profile settings ────────────────────────────────────────────────────

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User record not found");

    const updates: { name?: string; imageUrl?: string } = {};
    if (args.name !== undefined && args.name.trim().length > 0) {
      updates.name = args.name.trim();
    }
    if (args.imageUrl !== undefined) {
      updates.imageUrl = args.imageUrl;
    }

    await ctx.db.patch(user._id, updates);
  },
});

