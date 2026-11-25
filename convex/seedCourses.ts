import { internalMutation, internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { copywritingCourse, copywritingCapstone } from "./seedCoursesData";
import { sanitizeMultiline, sanitizeSingleLine, TEXT_LIMITS } from "../lib/sanitize-text";

/**
 * Seeds the "Conversion Copywriting" course. Idempotent by slug: re-running is a
 * no-op once the course exists.
 *
 * Run once:  npx convex run seedCourses:seed
 *
 * Toolkits are `presentation` lessons whose `.md` files are uploaded to storage
 * by the action (the default runtime can `fetch`; the mutation cannot). The
 * action uploads first, then hands the resulting storage ids to the mutation,
 * which inserts course → lessons → quizzes in one transaction.
 */

/** Auth-free upload URL for the seed action (no session in a `convex run`). */
export const generateToolkitUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Inserts the whole course in one transaction. No-ops if the slug is taken. */
export const insertCourse = internalMutation({
  args: {
    // Storage ids for toolkit lessons, in the order the toolkits appear in the spec.
    toolkitStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", copywritingCourse.slug))
      .unique();
    if (existing) return { courseId: existing._id, skipped: true as const };

    const admin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    if (!admin) throw new Error("No admin user found; create an admin before seeding.");

    const now = Date.now();
    const courseId = await ctx.db.insert("courses", {
      title: copywritingCourse.title,
      slug: copywritingCourse.slug,
      description: copywritingCourse.description,
      instructorId: admin._id,
      category: copywritingCourse.category,
      level: copywritingCourse.level,
      published: true,
      price: 0,
      searchText: [copywritingCourse.title, copywritingCourse.description, copywritingCourse.category]
        .filter(Boolean)
        .join(" ")
        .trim(),
      createdAt: now,
      updatedAt: now,
    });

    let toolkitIndex = 0;
    let order = 0;
    for (const l of copywritingCourse.lessons) {
      const title = sanitizeSingleLine(l.title, TEXT_LIMITS.title);
      const section = sanitizeSingleLine(l.section, TEXT_LIMITS.section);
      order += 1;

      const lessonId = await ctx.db.insert("lessons", {
        courseId,
        title,
        contentType: l.contentType,
        order,
        section: section || undefined,
        ...(l.content ? { content: sanitizeMultiline(l.content, TEXT_LIMITS.content), contentFormat: "markdown" as const } : {}),
        ...(l.contentType === "presentation" && l.toolkit
          ? {
              presentationStorageId: args.toolkitStorageIds[toolkitIndex],
              presentationFileName: sanitizeSingleLine(l.toolkit.fileName, TEXT_LIMITS.fileName),
            }
          : {}),
        createdAt: Date.now(),
      });

      if (l.contentType === "presentation" && l.toolkit) toolkitIndex += 1;

      if (l.contentType === "quiz" && l.quiz) {
        const quizId = await ctx.db.insert("quizzes", {
          lessonId,
          title: l.quiz.title,
          passingScore: l.quiz.passingScore,
          createdAt: Date.now(),
        });
        let qOrder = 0;
        for (const question of l.quiz.questions) {
          const questionId = await ctx.db.insert("quizQuestions", {
            quizId,
            prompt: question.prompt,
            order: qOrder,
          });
          qOrder += 1;
          for (const o of question.options) {
            await ctx.db.insert("quizOptions", {
              questionId,
              text: o.text,
              isCorrect: o.isCorrect,
            });
          }
        }
      }
    }

    return { courseId, skipped: false as const };
  },
});

/** Adds the capstone project once. Idempotent by (course, title). */
export const ensureCapstoneProject = internalMutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("courseProjects")
      .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId))
      .collect();
    if (existing.some((p) => p.title === copywritingCapstone.title)) {
      return { projectId: existing.find((p) => p.title === copywritingCapstone.title)!._id, skipped: true as const };
    }
    const nextOrder = existing.reduce((max, p) => Math.max(max, p.order), 0) + 1;
    const now = Date.now();
    const projectId = await ctx.db.insert("courseProjects", {
      courseId: args.courseId,
      title: copywritingCapstone.title,
      description: copywritingCapstone.description,
      techStack: copywritingCapstone.techStack,
      outcome: copywritingCapstone.outcome,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId, skipped: false as const };
  },
});

/** Orchestrates: upload toolkit files, then insert the course. */
export const seed = internalAction({
  args: {},
  handler: async (ctx) => {
    const toolkits = copywritingCourse.lessons
      .filter((l) => l.contentType === "presentation" && l.toolkit)
      .map((l) => l.toolkit!);

    // Self-calls use makeFunctionReference, not `internal.seedCourses.*`: this
    // module is itself in _generated/api, so reaching its own siblings through
    // `internal` makes TypeScript infer the return from a cycle it sits inside
    // and collapse the module to `any` (TS7022/TS7023). That `any` poisons
    // import.meta.glob in the test harness, widening every ctx.db.get() to the
    // all-tables union. Same workaround as emailCampaigns.ts / durable-rate-limit.
    const generateUploadUrl = makeFunctionReference<
      "mutation",
      Record<string, never>,
      string
    >("seedCourses:generateToolkitUploadUrl");
    const insertCourse = makeFunctionReference<
      "mutation",
      { toolkitStorageIds: Id<"_storage">[] },
      { courseId: Id<"courses">; skipped: boolean }
    >("seedCourses:insertCourse");
    const ensureProject = makeFunctionReference<
      "mutation",
      { courseId: Id<"courses"> },
      { projectId: Id<"courseProjects">; skipped: boolean }
    >("seedCourses:ensureCapstoneProject");

    const toolkitStorageIds: Id<"_storage">[] = [];
    for (const t of toolkits) {
      const uploadUrl = await ctx.runMutation(generateUploadUrl, {});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: t.body,
      });
      if (!res.ok) throw new Error(`Toolkit upload failed for ${t.fileName}: ${res.status}`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      toolkitStorageIds.push(storageId);
    }

    const result = await ctx.runMutation(insertCourse, {
      toolkitStorageIds,
    });
    const project = await ctx.runMutation(ensureProject, {
      courseId: result.courseId,
    });
    return { ...result, project };
  },
});