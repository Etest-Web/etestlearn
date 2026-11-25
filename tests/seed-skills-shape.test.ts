import { describe, expect, it } from "vitest";
import { skillCoursesA } from "../convex/seedSkillsDataA";
import { skillCoursesB } from "../convex/seedSkillsDataB";
import { skillCoursesC } from "../convex/seedSkillsDataC";
import type { SeedCourse } from "../convex/seedSkillsKit";

const all: SeedCourse[] = [...skillCoursesA, ...skillCoursesB, ...skillCoursesC];

describe("skill course blueprints", () => {
  it("has all six courses with unique slugs", () => {
    expect(all).toHaveLength(6);
    expect(new Set(all.map((c) => c.slug)).size).toBe(6);
  });

  for (const course of all) {
    describe(course.slug, () => {
      it("compiles to 8 modules, 16 articles, 16 quizzes, 8 assignments, 2 projects", () => {
        const modules = new Set(course.lessons.map((l) => l.section));
        modules.delete("Course Toolkits");
        expect(modules.size).toBe(8);
        expect(course.lessons.filter((l) => l.contentType === "article")).toHaveLength(16);
        expect(course.lessons.filter((l) => l.contentType === "quiz")).toHaveLength(16);
        expect(course.lessons.filter((l) => l.contentType === "presentation")).toHaveLength(1);
        expect(course.assignments).toHaveLength(8);
        expect(course.projects).toHaveLength(2);
      });

      it("has well-formed quizzes: 4 options, exactly one correct answer", () => {
        for (const lesson of course.lessons.filter((l) => l.contentType === "quiz")) {
          expect(lesson.quiz).toBeDefined();
          expect(lesson.quiz!.questions.length).toBeGreaterThan(0);
          for (const q of lesson.quiz!.questions) {
            expect(q.prompt.length).toBeGreaterThan(0);
            expect(q.options).toHaveLength(4);
            expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
          }
        }
      });

      it("has substantive article content and a toolkit body", () => {
        for (const lesson of course.lessons.filter((l) => l.contentType === "article")) {
          expect(lesson.content!.length).toBeGreaterThan(100);
        }
        const toolkit = course.lessons.find((l) => l.contentType === "presentation");
        expect(toolkit?.toolkit?.body.length).toBeGreaterThan(50);
      });

      it("has assignments with instructions and sensible point values", () => {
        for (const a of course.assignments) {
          expect(a.title.length).toBeGreaterThan(0);
          expect(a.instructions.length).toBeGreaterThan(20);
          expect(a.maxPoints).toBeGreaterThan(0);
          expect(a.section).toMatch(/^Module \d:/);
        }
      });
    });
  }
});
