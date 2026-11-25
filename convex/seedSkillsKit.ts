/**
 * Compiler for the skill-course blueprints in seedSkillsData*.ts.
 *
 * One module blueprint becomes four lessons (two articles, two knowledge
 * checks) and one real `assignments` row. Keeping the prose in one compiler
 * means six courses get the same structure without six copies of the same
 * markdown scaffolding; the facts themselves stay topic-specific in the data.
 *
 * Pure data/formatting — no Convex imports — so it can be read by both the
 * seed mutation and a plain node check.
 */

import type {
  CapstoneProject,
  CourseSpec,
  LessonSpec,
  QuizQuestion,
} from "./seedCoursesData";

export type AssignmentSpec = {
  title: string;
  instructions: string;
  maxPoints: number;
  /** Section label of the module this assignment belongs to. */
  section: string;
};

/** prompt, correct answer, then three distractors. */
export type QuizEntry = readonly [
  prompt: string,
  correct: string,
  wrong1: string,
  wrong2: string,
  wrong3: string,
];

/** term, explanation, concrete example. */
export type Concept = readonly [term: string, detail: string, example: string];

export type ModuleBlueprint = {
  title: string;
  concepts: readonly Concept[];
  workflow: readonly string[];
  pitfalls: readonly string[];
  questions: readonly QuizEntry[];
  takeaway: string;
  assignment: Omit<AssignmentSpec, "section">;
};

export type SkillCourseBlueprint = {
  title: string;
  slug: string;
  description: string;
  category: string;
  level: string;
  modules: readonly ModuleBlueprint[];
  toolkit: { fileName: string; body: string };
  capstone: CapstoneProject;
  showcase: CapstoneProject;
};

export type SeedCourse = CourseSpec & {
  assignments: AssignmentSpec[];
  projects: CapstoneProject[];
};

function quizLesson(
  title: string,
  section: string,
  entries: readonly QuizEntry[],
  salt: number,
): LessonSpec {
  const questions: QuizQuestion[] = entries.map(([prompt, correct, ...wrong], i) => {
    // Rotate the correct slot so it is not always the first option. Stable:
    // the same blueprint always produces the same question order.
    const options = [correct, ...wrong];
    const shift = (i + salt) % options.length;
    const rotated = options.map((_, k) => options[(k + shift) % options.length]);
    return {
      prompt,
      options: rotated.map((text) => ({ text, isCorrect: text === correct })),
    };
  });
  return {
    title,
    section,
    contentType: "quiz",
    quiz: { title, passingScore: 70, questions },
  };
}

function conceptsLesson(title: string, section: string, m: ModuleBlueprint): LessonSpec {
  return {
    title,
    section,
    contentType: "article",
    content: [
      `## What this module covers`,
      `${m.title}. Work through the ideas below, then apply them in the workflow lesson that follows.`,
      `## Core concepts`,
      ...m.concepts.map(
        ([term, detail, example]) =>
          `### ${term}\n\n${detail}\n\n**In practice:** ${example}`,
      ),
      `## Takeaway`,
      m.takeaway,
    ].join("\n\n"),
  };
}

function workflowLesson(title: string, section: string, m: ModuleBlueprint): LessonSpec {
  return {
    title,
    section,
    contentType: "article",
    content: [
      `## The workflow`,
      m.workflow.map((step, i) => `${i + 1}. ${step}`).join("\n"),
      `## Common mistakes`,
      m.pitfalls.map((p) => `- ${p}`).join("\n"),
      `## Takeaway`,
      m.takeaway,
    ].join("\n\n"),
  };
}

/** Turns a compact blueprint into the shapes seedSkills.ts inserts. */
export function compileCourse(c: SkillCourseBlueprint): SeedCourse {
  const lessons: LessonSpec[] = [];
  const assignments: AssignmentSpec[] = [];

  c.modules.forEach((m, i) => {
    const n = i + 1;
    const section = `Module ${n}: ${m.title}`;
    lessons.push(conceptsLesson(`${n}.1 Core concepts — ${m.title}`, section, m));
    lessons.push(workflowLesson(`${n}.2 Workflow & pitfalls — ${m.title}`, section, m));
    const half = Math.ceil(m.questions.length / 2);
    lessons.push(quizLesson(`${n}.3 Knowledge check A`, section, m.questions.slice(0, half), i));
    lessons.push(quizLesson(`${n}.4 Knowledge check B`, section, m.questions.slice(half), i + 2));
    assignments.push({ ...m.assignment, section });
  });

  lessons.push({
    title: `Course toolkit — ${c.toolkit.fileName}`,
    section: "Course Toolkits",
    contentType: "presentation",
    toolkit: c.toolkit,
  });

  return {
    title: c.title,
    slug: c.slug,
    description: c.description,
    category: c.category,
    level: c.level,
    lessons,
    assignments,
    projects: [c.capstone, c.showcase],
  };
}
