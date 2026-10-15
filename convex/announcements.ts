import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, requireUser } from "./helpers/auth";
import { logAudit } from "./helpers/audit";
import {
  audienceMatchesRole,
  cleanAnnouncementText,
  normalizeAudience,
} from "../lib/announcements";

/**
 * Platform announcements — admin-authored notices rendered as a dismissible
 * banner on the dashboards.
 *
 * Each notice carries an `audience`, which is what lets an instructor-facing
 * notice reach teaching staff without also landing in front of every learner
 * (#10 in the instructor roadmap). The rule itself lives in `lib/announcements.ts`.
 */

/** Rows examined when picking the newest announcement the caller may see. */
const ACTIVE_SCAN_CAP = 50;

/** The audience union, shared by the two write paths that accept one. */
const audienceValidator = v.union(
  v.literal("everyone"),
  v.literal("instructors"),
  v.literal("students"),
);

/**
 * Newest active announcement addressed to the caller, for the dashboard banner.
 *
 * The read is a bounded scan rather than an audience-indexed lookup: `audience`
 * is optional on rows written before audiences existed, and those notices went
 * to everyone, so an indexed equal-match on the column would silently hide
 * them. The set of *active* announcements is a handful in practice, and
 * `ACTIVE_SCAN_CAP` is the bound that keeps that from becoming a table walk.
 */
export const getActiveAnnouncement = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const rows = await ctx.db
      .query("announcements")
      .withIndex("by_active", (q) => q.eq("active", true))
      .order("desc")
      .take(ACTIVE_SCAN_CAP);

    const row = rows.find((candidate) =>
      audienceMatchesRole(candidate.audience, user.role),
    );
    if (!row) return null;
    return {
      _id: row._id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      audience: normalizeAudience(row.audience),
    };
  },
});

/** Full list for the admin console, newest first. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("announcements").order("desc").take(100);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    activate: v.optional(v.boolean()),
    audience: v.optional(audienceValidator),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const { title, body, error } = cleanAnnouncementText({
      title: args.title,
      body: args.body,
    });
    if (error) throw new Error(error);

    const now = Date.now();
    const id = await ctx.db.insert("announcements", {
      title,
      body,
      active: args.activate ?? false,
      audience: normalizeAudience(args.audience),
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    if (args.activate) {
      await logAudit(ctx, {
        actorId: admin._id,
        action: "announcement.publish",
        targetType: "announcement",
        targetId: id,
      });
    }
    return id;
  },
});

/** Activate/deactivate. Activating one announcement does not deactivate
 *  others: several can run at once and the banner shows the newest. */
export const setActive = mutation({
  args: { announcementId: v.id("announcements"), active: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.announcementId);
    if (!row) throw new Error("Announcement not found");

    await ctx.db.patch(args.announcementId, {
      active: args.active,
      updatedAt: Date.now(),
    });

    if (args.active) {
      await logAudit(ctx, {
        actorId: admin._id,
        action: "announcement.publish",
        targetType: "announcement",
        targetId: args.announcementId,
      });
    }
  },
});

/**
 * Re-target an existing notice.
 *
 * A single-purpose audited mutation rather than a general edit: the audience is
 * the one field that decides who gets reached, so changing it is worth a trace
 * even though deactivating and recreating would leave none.
 */
export const setAudience = mutation({
  args: {
    announcementId: v.id("announcements"),
    audience: audienceValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.announcementId);
    if (!row) throw new Error("Announcement not found");
    if (normalizeAudience(row.audience) === args.audience) return;

    await ctx.db.patch(args.announcementId, {
      audience: args.audience,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      actorId: admin._id,
      action: "announcement.retarget",
      targetType: "announcement",
      targetId: args.announcementId,
      details: { audience: args.audience },
    });
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.announcementId);
    if (!row) throw new Error("Announcement not found");

    await ctx.db.delete(args.announcementId);
    await logAudit(ctx, {
      actorId: admin._id,
      action: "announcement.delete",
      targetType: "announcement",
      targetId: args.announcementId,
      details: { title: row.title },
    });
  },
});
