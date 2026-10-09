import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireUser, type AnyCtx } from "./helpers/auth";
import { logAudit } from "./helpers/audit";

const MAX_NAME = 60;

/** Signed-in read: for filtering and tagging courses. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("skills").collect();
    return rows.sort((a, b) => {
      // Sort: those with categoryId first, then by name within same category level
      const aHasCat = !!a.categoryId;
      const bHasCat = !!b.categoryId;
      if (aHasCat !== bHasCat) return aHasCat ? -1 : 1;
      const aSort = a.sortOrder ?? 0;
      const bSort = b.sortOrder ?? 0;
      if (aSort !== bSort) return aSort - bSort;
      return a.name.localeCompare(b.name);
    });
  },
});

/** Admin-only: add, rename, delete skill tags. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const name = args.name.trim();
    if (!name || name.length > MAX_NAME) {
      throw new Error(`Name is required and must be at most ${MAX_NAME} characters`);
    }

    const clash = await ctx.db
      .query("skills")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (clash) throw new Error("That skill already exists");

    return await ctx.db.insert("skills", {
      name,
      slug: args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      categoryId: undefined,
      sortOrder: Date.now(), // rough ordering; admin can re-sort later
      createdAt: Date.now(),
    });
  },
});

export const rename = mutation({
  args: { skillId: v.id("skills"), name: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const name = args.name.trim();
    if (!name || name.length > MAX_NAME) {
      throw new Error(`Name is required and must be at most ${MAX_NAME} characters`);
    }

    const row = await ctx.db.get(args.skillId);
    if (!row) throw new Error("Skill not found");

    const clash = await ctx.db
      .query("skills")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (clash && clash._id !== args.skillId) {
      throw new Error("That skill already exists");
    }

    await ctx.db.patch(args.skillId, { name });
    await logAudit(ctx, {
      actorId: admin._id,
      action: "skill.rename",
      targetType: "skill",
      targetId: args.skillId,
      details: { oldName: row.name, newName: name },
    });
  },
});

export const remove = mutation({
  args: { skillId: v.id("skills") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const row = await ctx.db.get(args.skillId);
    if (!row) throw new Error("Skill not found");

    // Check if any course still uses this skill (in memory check)
    const courses = await ctx.db.query("courses").collect();
    const actuallyInUse = courses.some(course =>
      course.skillIds?.some(id => id === args.skillId)
    );
    if (actuallyInUse) {
      throw new Error(
        "This skill is still used by courses — remove it from those courses first",
      );
    }

    await ctx.db.delete(args.skillId);
    await logAudit(ctx, {
      actorId: admin._id,
      action: "skill.delete",
      targetType: "skill",
      targetId: args.skillId,
      details: { name: row.name },
    });
  },
});

async function requireAdmin(ctx: AnyCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Not authorized — admin access required");
  }
  return user;
}

/** Internal: seed default tech skills if the table is empty. */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    // Check if already seeded
    const count = await ctx.db.query("skills").collect();
    if (count.length > 0) {
      return; // Already seeded
    }

    const now = Date.now();

    // Map of category name to categoryId (we'll need to look these up)
    const categoryMap = new Map<string, Id<"categories">>();
    const categories = await ctx.db.query("categories").collect();
    for (const cat of categories) {
      categoryMap.set(cat.name, cat._id);
    }

    const defaultSkills = [
      // Web Development
      { name: "HTML5", category: "Frontend Development" },
      { name: "CSS3", category: "Frontend Development" },
      { name: "JavaScript", category: "Frontend Development" },
      { name: "TypeScript", category: "Frontend Development" },
      { name: "React", category: "Frontend Development" },
      { name: "Vue.js", category: "Frontend Development" },
      { name: "Angular", category: "Frontend Development" },
      { name: "Sass", category: "Frontend Development" },
      { name: "Bootstrap", category: "Frontend Development" },
      { name: "Tailwind CSS", category: "Frontend Development" },
      { name: "Node.js", category: "Backend Development" },
      { name: "Express.js", category: "Backend Development" },
      { name: "Python", category: "Backend Development" },
      { name: "Django", category: "Backend Development" },
      { name: "Flask", category: "Backend Development" },
      { name: "Ruby on Rails", category: "Backend Development" },
      { name: "Java Spring", category: "Backend Development" },
      { name: "Go", category: "Backend Development" },
      { name: "PostgreSQL", category: "Backend Development" },
      { name: "MySQL", category: "Backend Development" },
      { name: "MongoDB", category: "Backend Development" },
      { name: "Redis", category: "Backend Development" },
      { name: "GraphQL", category: "Backend Development" },
      { name: "REST APIs", category: "Backend Development" },
      { name: "Docker", category: "DevOps" },
      { name: "Kubernetes", category: "DevOps" },
      { name: "AWS", category: "Cloud Computing" },
      { name: "Azure", category: "Cloud Computing" },
      { name: "Google Cloud", category: "Cloud Computing" },
      { name: "Linux", category: "Operations" },
      { name: "Git", category: "Operations" },
      { name: "GitHub", category: "Operations" },
      { name: "CI/CD", category: "DevOps" },
      // Data Science & AI
      { name: "Python", category: "Data Analysis" }, // Duplicate name but different context
      { name: "R", category: "Data Analysis" },
      { name: "Pandas", category: "Data Analysis" },
      { name: "NumPy", category: "Data Analysis" },
      { name: "Machine Learning", category: "Machine Learning" },
      { name: "TensorFlow", category: "Deep Learning" },
      { name: "PyTorch", category: "Deep Learning" },
      { name: "Scikit-learn", category: "Machine Learning" },
      { name: "Data Visualization", category: "Data Visualization" },
      { name: "Tableau", category: "Data Visualization" },
      { name: "Power BI", category: "Data Visualization" },
      { name: "D3.js", category: "Data Visualization" },
      { name: "Statistics", category: "Statistics" },
      { name: "Excel", category: "Data Analysis" },
      // Design
      { name: "Figma", category: "UI/UX Design" },
      { name: "Adobe XD", category: "UI/UX Design" },
      { name: "Photoshop", category: "Graphic Design" },
      { name: "Illustrator", category: "Graphic Design" },
      { name: "InDesign", category: "Graphic Design" },
      { name: "Canva", category: "Graphic Design" },
      { name: "UI Design", category: "UI/UX Design" },
      { name: "UX Research", category: "UI/UX Design" },
      { name: "Wireframing", category: "UI/UX Design" },
      { name: "Prototyping", category: "UI/UX Design" },
      // Business
      { name: "Project Management", category: "Project Management" },
      { name: "Agile", category: "Project Management" },
      { name: "Scrum", category: "Project Management" },
      { name: "Jira", category: "Project Management" },
      { name: "Product Management", category: "Product Management" },
      { name: "Business Analysis", category: "Product Management" },
      { name: "Financial Modeling", category: "Finance" },
      { name: "Accounting", category: "Finance" },
      { name: "Marketing", category: "Marketing" },
      { name: "Digital Marketing", category: "Marketing" },
      { name: "SEO", category: "Marketing" },
      { name: "Content Marketing", category: "Marketing" },
      // Cybersecurity
      { name: "Network Security", category: "Network Security" },
      { name: "Ethical Hacking", category: "Ethical Hacking" },
      { name: "Penetration Testing", category: "Ethical Hacking" },
      { name: "Cybersecurity Fundamentals", category: "Cybersecurity" },
      { name: "Information Security", category: "Cybersecurity" },
    ];

    for (const skill of defaultSkills) {
      // Derive slug from name
      const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      // Look up categoryId by name
      let category_id: Id<"categories"> | undefined = undefined;
      if (skill.category) {
        const catId = categoryMap.get(skill.category);
        if (catId) {
          category_id = catId;
        }
      }

      await ctx.db.insert("skills", {
        name: skill.name,
        slug,
        categoryId: category_id,
        sortOrder: 0, // will be re-sorted later if needed
        description: undefined,
        icon: undefined,
        createdAt: now,
      });
    }
  },
});