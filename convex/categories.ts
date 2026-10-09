import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, type AnyCtx } from "./helpers/auth";
import { logAudit } from "./helpers/audit";

const MAX_NAME = 60;

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("categories").collect();
    return rows.sort((a, b) => {
      // Sort: parents first (no parentId), then by name within same parent level.
      const aIsRoot = !a.parentId;
      const bIsRoot = !b.parentId;
      if (aIsRoot !== bIsRoot) return aIsRoot ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },
});

/** Return a nested tree: { name, children: [...] } sorted by sortOrder then name. */
export const listTree = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const all = await ctx.db.query("categories").collect();
    // Build a map id → row
    const byId = new Map(all.map((r) => [r._id, r]));
    // Find roots (no parentId)
    const roots = all.filter((r) => !r.parentId);
    // Recursive builder
    function buildNode(row: typeof all[0]): {
      _id: string;
      name: string;
      slug: string;
      description?: string;
      sortOrder: number;
      icon?: string;
      children: ReturnType<typeof buildNode>[];
    } {
      const children = all.filter((r) => r.parentId === row._id);
      return {
        _id: row._id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        sortOrder: row.sortOrder,
        icon: row.icon,
        children: children.sort((a, b) => {
          const aS = a.sortOrder ?? 0;
          const bS = b.sortOrder ?? 0;
          if (aS !== bS) return aS - bS;
          return a.name.localeCompare(b.name);
        }).map(buildNode),
      };
    }
    return roots.map(buildNode);
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

    // If a parentId is provided, ensure it exists
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent category not found");
    }

    return await ctx.db.insert("categories", {
      name,
      parentId: args.parentId || undefined,
      slug: args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      sortOrder: Date.now(), // rough ordering; admin can re-sort later
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

    // Don't allow renaming to a name that already exists as a sibling or parent
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
 * Also refuses if the category has children (non-leaf).
 */
export const remove = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.categoryId);
    if (!row) throw new Error("Category not found");

    // Refuse if it has children
    const hasChildren = await ctx.db
      .query("categories")
      .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
      .first();
    if (hasChildren) {
      throw new Error(
        "This category has subcategories — rename them first or reparent them",
      );
    }

    // Refuse if any published course still uses the name
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

/** Internal: seed default tech-skill taxonomy if the table is empty. */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    // Check if already seeded
    const count = await ctx.db.query("categories").collect();
    if (count.length > 0) {
      return; // Already seeded
    }

    const now = Date.now();

    const defaultCategories = [
      // Programming
      { name: "Programming", parentId: null },
      { name: "Web Development", parentId: "Programming" },
      { name: "Frontend Development", parentId: "Web Development" },
      { name: "React", parentId: "Frontend Development" },
      { name: "Vue", parentId: "Frontend Development" },
      { name: "Angular", parentId: "Frontend Development" },
      { name: "Backend Development", parentId: "Web Development" },
      { name: "Node.js", parentId: "Backend Development" },
      { name: "Python", parentId: "Backend Development" },
      { name: "Java", parentId: "Backend Development" },
      { name: "Go", parentId: "Backend Development" },
      { name: "Mobile Development", parentId: "Programming" },
      { name: "iOS Development", parentId: "Mobile Development" },
      { name: "Android Development", parentId: "Mobile Development" },
      { name: "Flutter", parentId: "Mobile Development" },
      // Data Science & AI
      { name: "Data Science & AI", parentId: null },
      { name: "Data Analysis", parentId: "Data Science & AI" },
      { name: "Machine Learning", parentId: "Data Science & AI" },
      { name: "Deep Learning", parentId: "Machine Learning" },
      { name: "Data Visualization", parentId: "Data Science & AI" },
      { name: "Statistics", parentId: "Data Science & AI" },
      // Design
      { name: "Design", parentId: null },
      { name: "UI/UX Design", parentId: "Design" },
      { name: "Figma", parentId: "UI/UX Design" },
      { name: "Adobe XD", parentId: "UI/UX Design" },
      { name: "Graphic Design", parentId: "Design" },
      { name: "Brand Identity", parentId: "Graphic Design" },
      // Business
      { name: "Business", parentId: null },
      { name: "Project Management", parentId: "Business" },
      { name: "Product Management", parentId: "Business" },
      { name: "Finance", parentId: "Business" },
      { name: "Marketing", parentId: "Business" },
      // Operations
      { name: "Operations", parentId: null },
      { name: "DevOps", parentId: "Operations" },
      { name: "Cloud Computing", parentId: "DevOps" },
      { name: "Docker", parentId: "Cloud Computing" },
      { name: "Kubernetes", parentId: "Cloud Computing" },
      { name: "Cybersecurity", parentId: null },
      { name: "Network Security", parentId: "Cybersecurity" },
      { name: "Ethical Hacking", parentId: "Cybersecurity" },
    ];

    for (const cat of defaultCategories) {
      // Derive slug from name
      const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      // If parentId is a string, it's a name lookup; resolve the id
      let parent_id = cat.parentId;
      if (parent_id && typeof parent_id === "string") {
        const parentRow = await ctx.db
          .query("categories")
          .withIndex("by_name", (q) => q.eq("name", parent_id))
          .first();
        parent_id = parentRow ? parentRow._id : null;
      }

      await ctx.db.insert("categories", {
        name: cat.name,
        parentId: parent_id,
        slug,
        sortOrder: 0, // will be re-sorted later if needed
        description: undefined,
        icon: undefined,
        createdBy: admin._id,
        createdAt: now,
      });
    }
  },
});