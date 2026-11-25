import { describe, expect, it } from "vitest";
import { paidCoursesD } from "../convex/seedSkillsDataD";
import { paidCoursesE } from "../convex/seedSkillsDataE";
import { paidCoursesF } from "../convex/seedSkillsDataF";
import type { SeedCourse } from "../convex/seedSkillsKit";
import type { QuestionType } from "../convex/seedCoursesData";

const all: SeedCourse[] = [...paidCoursesD, ...paidCoursesE, ...paidCoursesF];
const TYPES: QuestionType[] = [
  "multiple-choice",
  "true-false",
  "multi-select",
  "fill-blank",
];

describe("paid skill course blueprints", () => {
  it("has six courses with unique slugs, none shared with the free set", () => {
    expect(all).toHaveLength(6);
    expect(new Set(all.map((c) => c.slug)).size).toBe(6);
    for (const slug of [
      "prompt-engineering",
      "spreadsheets-for-work",
      "cybersecurity-basics",
      "email-marketing",
      "notion-systems",
      "ai-video-content",
    ]) {
      expect(all.some((c) => c.slug === slug)).toBe(true);
    }
  });

  const seenTypes = new Set<QuestionType>();

  for (const course of all) {
    describe(course.slug, () => {
      it("compiles to 41 lessons: 16 articles, 16 quizzes, 8 slides, 1 toolkit", () => {
        expect(course.lessons).toHaveLength(41);
        expect(course.lessons.filter((l) => l.contentType === "article")).toHaveLength(16);
        expect(course.lessons.filter((l) => l.contentType === "quiz")).toHaveLength(16);
        expect(course.lessons.filter((l) => l.contentType === "slides")).toHaveLength(8);
        expect(course.lessons.filter((l) => l.contentType === "presentation")).toHaveLength(1);
        expect(course.assignments).toHaveLength(8);
        expect(course.projects).toHaveLength(2);
        expect(new Set(course.lessons.map((l) => l.section)).size).toBe(9);
      });

      it("ships a reveal-step deck per module", () => {
        const decks = course.lessons.filter((l) => l.contentType === "slides");
        for (const deck of decks) {
          expect(deck.slides).toBeDefined();
          expect(deck.slides!.length).toBeGreaterThanOrEqual(3);
          for (const s of deck.slides!) {
            expect(s.heading.length).toBeGreaterThan(0);
            expect(s.body.length).toBeGreaterThan(10);
            expect(s.reveals.length).toBeGreaterThan(0);
          }
        }
      });

      it("has 16 well-formed quizzes across all four question types", () => {
        const quizzes = course.lessons.filter((l) => l.contentType === "quiz");
        expect(quizzes).toHaveLength(16);
        let count = 0;
        for (const lesson of quizzes) {
          expect(lesson.quiz).toBeDefined();
          expect(lesson.quiz!.questions).toHaveLength(3);
          for (const q of lesson.quiz!.questions) {
            count += 1;
            const type = q.type ?? "multiple-choice";
            expect(TYPES).toContain(type);
            seenTypes.add(type);
            expect(q.prompt.length).toBeGreaterThan(0);
            if (type === "fill-blank") {
              expect(q.options).toHaveLength(0);
              expect(q.acceptedAnswers?.length).toBeGreaterThan(0);
              for (const a of q.acceptedAnswers!) expect(a).toBe(a.trim().toLowerCase());
            } else if (type === "true-false") {
              expect(q.options).toHaveLength(2);
              expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
            } else if (type === "multi-select") {
              expect(q.options.length).toBeGreaterThanOrEqual(5);
              expect(q.options.filter((o) => o.isCorrect).length).toBeGreaterThanOrEqual(2);
              expect(q.options.filter((o) => !o.isCorrect).length).toBeGreaterThanOrEqual(2);
            } else {
              expect(q.options).toHaveLength(4);
              expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
            }
          }
        }
        expect(count).toBe(48);
      });

      it("has substantive articles, toolkit, assignments and projects", () => {
        for (const lesson of course.lessons.filter((l) => l.contentType === "article")) {
          expect(lesson.content!.length).toBeGreaterThan(100);
        }
        const toolkit = course.lessons.find((l) => l.contentType === "presentation");
        expect(toolkit?.toolkit?.body.length).toBeGreaterThan(100);
        for (const a of course.assignments) {
          expect(a.instructions.length).toBeGreaterThan(20);
          expect(a.maxPoints).toBeGreaterThan(0);
          expect(a.section).toMatch(/^Module \d:/);
        }
        for (const p of course.projects) {
          expect(p.description.length).toBeGreaterThan(20);
          expect(p.techStack.length).toBeGreaterThan(0);
        }
      });
    });
  }

  it("uses all four question types across the set", () => {
    expect([...seenTypes].sort()).toEqual([...TYPES].sort());
  });
});
