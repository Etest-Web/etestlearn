import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, type AnyCtx } from "./helpers/auth";
import { logAudit } from "./helpers/audit";

const MAX_NAME = 60;

/**
 * The curated category list. `courses.category` remains a free string —
 * migrating every course to a foreign-key id would rewrite course rows and
 * search text for a convenience — so this table is the menu the course form
 * offers and the catalog groups by, while historical free-typed values keep
 * working alongside it.
 */

/** Signed-in read: the course form and catalog both call this. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("categories").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

async function requireAdmin(ctx: AnyCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Not authorized — admin access required");
  }
  return user;
}

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const name = args.name.trim();
    if (!name || name.length > MAX_NAME) {
      throw new Error(`Name is required and must be at most ${MAX_NAME} characters`);
    }

    const clash = await ctx.db
      .query("categories")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (clash) throw new Error("That category already exists");

    return await ctx.db.insert("categories", {
      name,
      createdBy: admin._id,
      createdAt: Date.now(),
    });
  },
});

export const rename = mutation({
  args: { categoryId: v.id("categories"), name: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const name = args.name.trim();
    if (!name || name.length > MAX_NAME) {
      throw new Error(`Name is required and must be at most ${MAX_NAME} characters`);
    }

    const row = await ctx.db.get(args.categoryId);
    if (!row) throw new Error("Category not found");

    const clash = await ctx.db
      .query("categories")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (clash && clash._id !== args.categoryId) {
      throw new Error("That category already exists");
    }

    await ctx.db.patch(args.categoryId, { name });
    await logAudit(ctx, {
      actorId: admin._id,
      action: "category.rename",
      targetType: "category",
      targetId: args.categoryId,
      details: { oldName: row.name, newName: name },
    });
  },
});

/**
 * Deleting is refused while any course still uses the name — a category that
 * vanishes under a course would leave an orphaned label in the catalog and
 * search text with no owner. Retire a category by renaming it instead.
 */
export const remove = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.categoryId);
    if (!row) throw new Error("Category not found");

    const inUse = await ctx.db
      .query("courses")
      .withIndex("by_published", (q) => q.eq("published", true))
      .filter((q) => q.eq(q.field("category"), row.name))
      .first();
    if (inUse) {
      throw new Error(
        "This category is still used by published courses — rename it instead",
      );
    }

    await ctx.db.delete(args.categoryId);
    await logAudit(ctx, {
      actorId: admin._id,
      action: "category.delete",
      targetType: "category",
      targetId: args.categoryId,
      details: { name: row.name },
    });
  },
});
