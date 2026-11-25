import { internalMutation, internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { paidCoursesD } from "./seedSkillsDataD";
import { paidCoursesE } from "./seedSkillsDataE";
import { paidCoursesF } from "./seedSkillsDataF";
import type { SeedCourse } from "./seedSkillsKit";
import { sanitizeMultiline, sanitizeSingleLine, TEXT_LIMITS } from "../lib/sanitize-text";

/**
 * Second set: six paid courses with slide decks and four quiz question types.
 * Idempotent by slug, same as seedSkills.ts — re-running skips existing slugs.
 *
 * Price is stored in kobo. One uniform price keeps the set comparable:
 * ₦4,500 = 450000 kobo.
 *
 * Run once:  npx convex run seedPaidSkills:seed
 */

const PAID_PRICE_KOBO = 450_000;
const ALL_COURSES: SeedCourse[] = [...paidCoursesD, ...paidCoursesE, ...paidCoursesF];

export const generateToolkitUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/** Inserts one whole course in a transaction. No-ops if the slug is taken. */
export const insertCourse = internalMutation({
  args: {
    slug: v.string(),
    toolkitStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const course = ALL_COURSES.find((c) => c.slug === args.slug);
    if (!course) throw new Error(`Unknown paid skill course slug: ${args.slug}`);

    const existing = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", course.slug))
      .unique();
    if (existing) return { courseId: existing._id, skipped: true as const };

    const owner =
      (await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .first()) ??
      (await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "instructor"))
        .first());
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
      price: PAID_PRICE_KOBO,
      currency: "NGN",
      searchText: [course.title, course.description, course.category].filter(Boolean).join(" ").trim(),
      createdAt: now,
      updatedAt: now,
    });

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
        ...(l.slides
          ? {
              slides: l.slides.map((s) => ({
                heading: sanitizeSingleLine(s.heading, TEXT_LIMITS.title),
                body: sanitizeMultiline(s.body, TEXT_LIMITS.content),
                reveals: s.reveals.map((r) => sanitizeMultiline(r, TEXT_LIMITS.content)),
              })),
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
            type: question.type ?? "multiple-choice",
            ...(question.acceptedAnswers
              ? { acceptedAnswers: question.acceptedAnswers }
              : {}),
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
    // Self-calls use makeFunctionReference, not `internal.seedPaidSkills.*`:
    // importing `internal` here collapses this module to `any` (TS7022).
    const generateUploadUrl = makeFunctionReference<"mutation", Record<string, never>, string>(
      "seedPaidSkills:generateToolkitUploadUrl",
    );
    const insertCourse = makeFunctionReference<
      "mutation",
      { slug: string; toolkitStorageIds: Id<"_storage">[] },
      { courseId: Id<"courses">; skipped: boolean }
    >("seedPaidSkills:insertCourse");

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
