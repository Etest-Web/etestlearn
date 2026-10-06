import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { logAudit } from "./helpers/audit";
import { checkUserInactivityReminders } from "./enrollments";

/**
 * Constant-time string compare. A plain `!==` on a shared secret leaks its
 * contents through response timing, which is enough to recover it byte by byte
 * against an unauthenticated endpoint.
 */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

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
 * Upper bound on users accepted per `syncFromClerk` call.
 *
 * The mutation below is public, so without a cap one call with a valid token
 * could upsert an unbounded number of rows — enough to churn the whole
 * `users` table from a single request. Honest backfills chunk; a caller
 * wanting more than this should paginate rather than smuggle it through.
 */
const MAX_SYNC_BATCH = 500;

/**
 * Shared secret for the one-off backfill in scripts/sync-clerk-users.mjs.
 *
 * This mutation stays `mutation` rather than `internalMutation` because the
 * backfill is invoked from outside Convex, where `ConvexHttpClient` cannot
 * call internal functions. That makes it publicly reachable, so it is gated on
 * a bearer token: previously it had no guard at all, which let anyone with the
 * deployment URL (it ships in NEXT_PUBLIC_CONVEX_URL) insert or overwrite user
 * rows — including the email and name of existing admins. The batch is also
 * capped server-side (MAX_SYNC_BATCH), so a single leaked token cannot
 * rewrite the whole table in one tight loop (chunk instead).
 *
 * Roles are never taken from the payload: existing rows keep theirs, and new
 * rows are always created as "student".
 *
 * Not audited: `auditLogs.actorId` is required, and this path has no Convex
 * identity (it authenticates on a shared secret, not a user) — a fabricated
 * actor would be worse than no row. The Clerk webhook syncs are the same case.
 */
export const syncFromClerk = mutation({
  args: {
    token: v.string(),
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
    // Read inside the handler, not at module scope: a module-level capture
    // would freeze the value at import time and silently ignore later config.
    const syncToken = process.env.CLERK_SYNC_TOKEN;

    if (!syncToken) {
      // Fail closed: an unset token must never mean "no token required".
      throw new Error("syncFromClerk is not configured");
    }
    if (
      args.token.length !== syncToken.length ||
      !timingSafeEqualString(args.token, syncToken)
    ) {
      throw new Error("Not authorized");
    }

    // Checked after the token so probing for the limit also requires the
    // secret. Rejection happens before any write, so an oversized call is
    // fully atomic — nothing is half-synced.
    if (args.users.length > MAX_SYNC_BATCH) {
      throw new Error(`Batch exceeds the limit of ${MAX_SYNC_BATCH} users`);
    }

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
      await checkUserInactivityReminders(ctx, existing._id);
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Mirrors helpers/auth.getCurrentUser: a suspended account reads as
    // signed out everywhere, so this module's inline lookup cannot become
    // the one path that lets a suspended user keep acting.
    if (user?.suspendedAt !== undefined) return null;
    return user;
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

    // `db.patch` on a missing id is a silent no-op, so without this a typo'd
    // user id would report success while changing nothing — and the audit row
    // would claim a role change that never happened.
    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new Error("User not found");
    }
    const oldRole = target.role;

    await ctx.db.patch(args.userId, { role: args.role });

    await logAudit(ctx, {
      actorId: admin._id,
      action: "user.set_role",
      targetType: "user",
      targetId: args.userId,
      details: { oldRole, newRole: args.role },
    });
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
    if (user.suspendedAt !== undefined) throw new Error("Account suspended");

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

