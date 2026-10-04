import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./helpers/auth";
import { logAudit } from "./helpers/audit";

const MAX_TITLE = 120;
const MAX_BODY = 2000;

/** Newest active announcement, for the dashboard banner. Any signed-in user. */
export const getActiveAnnouncement = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);

    const rows = await ctx.db
      .query("announcements")
      .withIndex("by_active", (q) => q.eq("active", true))
      .order("desc")
      .take(1);

    const row = rows[0];
    if (!row) return null;
    return {
      _id: row._id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
    };
  },
});

/** Full list for the admin console, newest first. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }
    return await ctx.db.query("announcements").order("desc").take(100);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    activate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

    const title = args.title.trim();
    const body = args.body.trim();
    if (!title || title.length > MAX_TITLE) {
      throw new Error(`Title is required and must be at most ${MAX_TITLE} characters`);
    }
    if (!body || body.length > MAX_BODY) {
      throw new Error(`Body is required and must be at most ${MAX_BODY} characters`);
    }

    const now = Date.now();
    const id = await ctx.db.insert("announcements", {
      title,
      body,
      active: args.activate ?? false,
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
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

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

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const admin = await requireUser(ctx);
    if (admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

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
