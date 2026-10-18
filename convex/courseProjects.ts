import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { canManageCourse, requireUser, type Id } from "./helpers/auth";
import {
  MAX_PROJECTS_PER_COURSE,
  normalizeOptionalText,
  normalizeTechStack,
  projectDraftError,
} from "../lib/course-projects";

/**
 * Course projects — what the learner can *make* by the end.
 *
 * An instructor curates a handful of finished things on the public course page:
 * "by the end you will have built these". It is the part of a sales page that
 * most reliably converts, and the part of a syllabus that says least about it —
 * so it is instructor-authored content, ordered deliberately, and rendered
 * beside the lessons rather than inside them.
 *
 * Display-only, and that is a real boundary rather than a staging post: a
 * learner cannot submit work here. Submissions need their own storage,
 * permissions, review state and dashboard surfaces, and folding them into this
 * table would mean a `status` field that only ever had one legal value.
 *
 * Every write goes through `canManageCourse` — owner *or* admin, never a bare
 * role comparison — so an admin can fix a showcase on an instructor's behalf
 * exactly as they can fix a lesson.
 */

/**
 * The public list.
 *
 * Readable signed out, and ordered by the explicit `order` column rather than by
 * creation time, because an instructor reordering their showcase must not have
 * to rewrite every row they did not touch. `by_course_order` makes the read a
 * straight index walk.
 */
export const listForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("courseProjects")
      .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId))
      .collect();

    return projects.map((project) => ({
      _id: project._id,
      title: project.title,
      description: project.description,
      imageUrl: project.imageUrl ?? null,
      techStack: project.techStack ?? [],
      outcome: project.outcome ?? null,
      order: project.order,
    }));
  },
});

/** Adds a project to the end of the showcase. */
export const createProject = mutation({
  args: {
    courseId: v.id("courses"),
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    techStack: v.optional(v.array(v.string())),
    outcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized — you do not manage this course");
    }

    const draftError = projectDraftError({
      title: args.title,
      description: args.description,
      outcome: args.outcome,
    });
    if (draftError) throw new Error(draftError);

    const existing = await ctx.db
      .query("courseProjects")
      .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId))
      .collect();

    if (existing.length >= MAX_PROJECTS_PER_COURSE) {
      throw new Error(
        `A course can showcase at most ${MAX_PROJECTS_PER_COURSE} projects.`,
      );
    }

    // Append rather than renumber: the new row goes after the current maximum, so
    // adding one project is one write rather than a rewrite of the whole list.
    const nextOrder =
      existing.reduce((max, project) => Math.max(max, project.order), 0) + 1;

    const now = Date.now();
    return await ctx.db.insert("courseProjects", {
      courseId: args.courseId,
      title: args.title.trim(),
      description: args.description.trim(),
      imageUrl: normalizeOptionalText(args.imageUrl),
      techStack: normalizeTechStack(args.techStack),
      outcome: normalizeOptionalText(args.outcome),
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Edits a project in place. The order is not touched — use {@link reorderProjects}. */
export const updateProject = mutation({
  args: {
    projectId: v.id("courseProjects"),
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    techStack: v.optional(v.array(v.string())),
    outcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const course = await ctx.db.get(project.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized — you do not manage this course");
    }

    const draftError = projectDraftError({
      title: args.title,
      description: args.description,
      outcome: args.outcome,
    });
    if (draftError) throw new Error(draftError);

    await ctx.db.patch(args.projectId, {
      title: args.title.trim(),
      description: args.description.trim(),
      // Normalized to `undefined` rather than `""` so clearing the image field
      // in the editor actually removes it instead of storing a blank URL that
      // the card would try to load.
      imageUrl: normalizeOptionalText(args.imageUrl),
      techStack: normalizeTechStack(args.techStack),
      outcome: normalizeOptionalText(args.outcome),
      updatedAt: Date.now(),
    });
  },
});

/** Removes a project. Does not renumber the rest — gaps in `order` are harmless. */
export const deleteProject = mutation({
  args: { projectId: v.id("courseProjects") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const course = await ctx.db.get(project.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized — you do not manage this course");
    }

    await ctx.db.delete(args.projectId);
  },
});

/**
 * Rewrites the whole ordering from the ids the editor sends, in display order.
 *
 * Replaces rather than increments, which is the only sane shape for a drag-to-
 * reorder control: the client knows the final order and sending deltas would let
 * two concurrent drags interleave into an order neither of them chose.
 *
 * Re-verifies ownership for **every** id, not just the first. A caller that
 * passed another course's project id in the middle of its list would otherwise
 * silently renumber a showcase it cannot see.
 */
export const reorderProjects = mutation({
  args: {
    courseId: v.id("courses"),
    projectIds: v.array(v.id("courseProjects")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized — you do not manage this course");
    }

    // De-duplicate before numbering, or a repeated id would make two rows claim
    // the same order and the index walk would return an arbitrary one of them.
    const ordered = [...new Set(args.projectIds)] as Id<"courseProjects">[];
    const now = Date.now();

    for (let index = 0; index < ordered.length; index += 1) {
      const project = await ctx.db.get(ordered[index]);
      if (!project) continue;
      if (project.courseId !== args.courseId) {
        throw new Error("That project belongs to a different course");
      }
      await ctx.db.patch(project._id, { order: index + 1, updatedAt: now });
    }
  },
});