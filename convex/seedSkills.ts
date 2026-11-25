import { internalMutation, internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { skillCoursesA } from "./seedSkillsDataA";
import { skillCoursesB } from "./seedSkillsDataB";
import { skillCoursesC } from "./seedSkillsDataC";
import type { SeedCourse } from "./seedSkillsKit";
import { sanitizeMultiline, sanitizeSingleLine, TEXT_LIMITS } from "../lib/sanitize-text";

/**
 * Seeds six digital-skill courses. Idempotent by slug: re-running is a no-op
 * for courses that already exist.
 *
 * Run once:  npx convex run seedSkills:seed
 *
 * Each course compiles to 8 modules = 32 lessons (16 articles, 16 quizzes),
 * 8 real `assignments` rows, a toolkit `.md`, a capstone and a showcase
 * project. All are published and free. The action uploads the toolkit files
 * first (the default runtime can `fetch`; the mutation cannot), then passes
 * the storage ids to a single transaction that inserts everything.
 */

const ALL_COURSES: SeedCourse[] = [...skillCoursesA, ...skillCoursesB, ...skillCoursesC];

/** Auth-free upload URL for the seed action (no session in a `convex run`). */
export const generateToolkitUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Inserts one whole course in a transaction. No-ops if the slug is taken. */
export const insertCourse = internalMutation({
  args: {
    slug: v.string(),
    toolkitStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const course = ALL_COURSES.find((c) => c.slug === args.slug);
    if (!course) throw new Error(`Unknown skill course slug: ${args.slug}`);

    const existing = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", course.slug))
      .unique();
    if (existing) return { courseId: existing._id, skipped: true as const };

    // An admin owns the seeds; fall back to an instructor so a fresh
    // deployment with no admin can still be seeded, but refuse an empty user
    // table — a course with no valid owner is worse than a failed seed.
    const admin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    const instructor = admin
      ? null
      : await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "instructor"))
          .first();
    const owner = admin ?? instructor;
    if (!owner) throw new Error("No admin or instructor found; create a user before seeding.");

    const now = Date.now();
    const courseId = await ctx.db.insert("courses", {
      title: sanitizeSingleLine(course.title, TEXT_LIMITS.title),
      slug: course.slug,
      description: sanitizeMultiline(course.description, TEXT_LIMITS.description),
      instructorId: owner._id,
      category: sanitizeSingleLine(course.category, TEXT_LIMITS.category),
      level: sanitizeSingleLine(course.level, TEXT_LIMITS.level),
      published: true,
      price: 0,
      searchText: [course.title, course.description, course.category].filter(Boolean).join(" ").trim(),
      createdAt: now,
      updatedAt: now,
    });

    // First lesson of each module becomes the anchor for that module's
    // assignment, so an assignment points at the lesson it follows.
    const sectionAnchor = new Map<string, Id<"lessons">>();
    let toolkitIndex = 0;
    let order = 0;
    for (const l of course.lessons) {
      const title = sanitizeSingleLine(l.title, TEXT_LIMITS.title);
      const section = sanitizeSingleLine(l.section, TEXT_LIMITS.section);
      order += 1;

      const lessonId = await ctx.db.insert("lessons", {
        courseId,
        title,
        contentType: l.contentType,
        order,
        section: section || undefined,
        ...(l.content
          ? {
              content: sanitizeMultiline(l.content, TEXT_LIMITS.content),
              contentFormat: "markdown" as const,
            }
          : {}),
        ...(l.contentType === "presentation" && l.toolkit
          ? {
              presentationStorageId: args.toolkitStorageIds[toolkitIndex],
              presentationFileName: sanitizeSingleLine(l.toolkit.fileName, TEXT_LIMITS.fileName),
            }
          : {}),
        createdAt: Date.now(),
      });

      if (l.contentType === "presentation" && l.toolkit) toolkitIndex += 1;
      if (section && !sectionAnchor.has(section)) sectionAnchor.set(section, lessonId);

      if (l.contentType === "quiz" && l.quiz) {
        const quizId = await ctx.db.insert("quizzes", {
          lessonId,
          title: sanitizeSingleLine(l.quiz.title, TEXT_LIMITS.title),
          passingScore: l.quiz.passingScore,
          createdAt: Date.now(),
        });
        let qOrder = 0;
        for (const question of l.quiz.questions) {
          const questionId = await ctx.db.insert("quizQuestions", {
            quizId,
            prompt: sanitizeMultiline(question.prompt, TEXT_LIMITS.content),
            order: qOrder,
          });
          qOrder += 1;
          for (const o of question.options) {
            await ctx.db.insert("quizOptions", {
              questionId,
              text: sanitizeMultiline(o.text, TEXT_LIMITS.content),
              isCorrect: o.isCorrect,
            });
          }
        }
      }
    }

    for (const a of course.assignments) {
      await ctx.db.insert("assignments", {
        courseId,
        ...(sectionAnchor.has(a.section) ? { lessonId: sectionAnchor.get(a.section) } : {}),
        title: sanitizeSingleLine(a.title, TEXT_LIMITS.title),
        instructions: sanitizeMultiline(a.instructions, TEXT_LIMITS.description),
        createdBy: owner._id,
        maxPoints: a.maxPoints,
        status: "open",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    let projectOrder = 0;
    for (const p of course.projects) {
      projectOrder += 1;
      await ctx.db.insert("courseProjects", {
        courseId,
        title: sanitizeSingleLine(p.title, TEXT_LIMITS.title),
        description: sanitizeMultiline(p.description, TEXT_LIMITS.description),
        techStack: p.techStack,
        outcome: sanitizeMultiline(p.outcome, TEXT_LIMITS.description),
        order: projectOrder,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return { courseId, skipped: false as const };
  },
});

/** Orchestrates: upload each toolkit, then insert that course. */
export const seed = internalAction({
  args: {},
  handler: async (ctx) => {
    // Self-calls use makeFunctionReference, not `internal.seedSkills.*`: this
    // module is itself in _generated/api, so reaching its own siblings through
    // `internal` makes TypeScript infer the return from a cycle it sits inside
    // and collapse the module to `any` (TS7022/TS7023). Same workaround as
    // seedCourses.ts / emailCampaigns.ts / durable-rate-limit.ts.
    const generateUploadUrl = makeFunctionReference<"mutation", Record<string, never>, string>(
      "seedSkills:generateToolkitUploadUrl",
    );
    const insertCourse = makeFunctionReference<
      "mutation",
      { slug: string; toolkitStorageIds: Id<"_storage">[] },
      { courseId: Id<"courses">; skipped: boolean }
    >("seedSkills:insertCourse");

    const results: { slug: string; courseId: Id<"courses">; skipped: boolean }[] = [];
    for (const course of ALL_COURSES) {
      const toolkits = course.lessons
        .filter((l) => l.contentType === "presentation" && l.toolkit)
        .map((l) => l.toolkit!);

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
        slug: course.slug,
        toolkitStorageIds,
      });
      results.push({ slug: course.slug, ...result });
    }
    return results;
  },
});
