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
  QuizOption,
  QuizQuestion,
  SlideSpec,
} from "./seedCoursesData";
import { normalizeAnswerText } from "../lib/quiz";

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

/** prompt, two-or-more correct answers, then distractors (authored inline). */
export type MultiEntry = readonly [
  prompt: string,
  correct: readonly string[],
  ...wrong: string[],
];

/** heading, markdown body, then one or more reveal steps. */
export type SlideEntry = readonly [heading: string, body: string, ...reveals: string[]];

/**
 * Compact constructors for the three question shapes beyond multiple-choice.
 * Kept as helpers so a blueprint reads like content, not storage syntax.
 */
export type TypedQuestion =
  | { type: "true-false"; prompt: string; correct: boolean }
  | { type: "multi-select"; prompt: string; options: QuizOption[] }
  | { type: "fill-blank"; prompt: string; answers: readonly string[] };

export function tf(prompt: string, correct: boolean): TypedQuestion {
  return { type: "true-false", prompt, correct };
}
export function multi(prompt: string, correct: readonly string[], ...wrong: string[]): TypedQuestion {
  return {
    type: "multi-select",
    prompt,
    options: [
      ...correct.map((text) => ({ text, isCorrect: true })),
      ...wrong.map((text) => ({ text, isCorrect: false })),
    ],
  };
}
export function blank(prompt: string, ...answers: string[]): TypedQuestion {
  return { type: "fill-blank", prompt, answers };
}

export type QuestionInput = QuizEntry | MultiEntry | TypedQuestion;

/** term, explanation, concrete example. */
export type Concept = readonly [term: string, detail: string, example: string];

export type ModuleBlueprint = {
  title: string;
  concepts: readonly Concept[];
  workflow: readonly string[];
  pitfalls: readonly string[];
  questions: readonly QuestionInput[];
  /** Present on the paid set; absent on the original free set. */
  slides?: readonly SlideEntry[];
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
  /** Paid set ships an authored-from-blueprint click-through deck per module. */
  interactiveSlides?: boolean;
  toolkit: { fileName: string; body: string };
  capstone: CapstoneProject;
  showcase: CapstoneProject;
};

export type SeedCourse = CourseSpec & {
  assignments: AssignmentSpec[];
  projects: CapstoneProject[];
};

function toQuestion(entry: QuestionInput, i: number, salt: number): QuizQuestion {
  // Array.isArray does not narrow readonly tuples, so discriminate on `length`.
  if (!("length" in entry)) {
    if (entry.type === "true-false") {
      return {
        prompt: entry.prompt,
        type: "true-false",
        options: [
          { text: "True", isCorrect: entry.correct },
          { text: "False", isCorrect: !entry.correct },
        ],
      };
    }
    if (entry.type === "multi-select") {
      return { prompt: entry.prompt, type: "multi-select", options: entry.options };
    }
    return {
      prompt: entry.prompt,
      type: "fill-blank",
      options: [],
      acceptedAnswers: entry.answers.map(normalizeAnswerText),
    };
  }

  const [prompt, correct, ...wrong] = entry;
  if (typeof correct !== "string") {
    return {
      prompt,
      type: "multi-select",
      options: [
        ...correct.map((text) => ({ text, isCorrect: true })),
        ...wrong.map((text) => ({ text, isCorrect: false })),
      ],
    };
  }
  // Rotate the correct slot so it is not always the first option. Stable:
  // the same blueprint always produces the same question order.
  const options = [correct, ...wrong];
  const shift = (i + salt) % options.length;
  const rotated = options.map((_, k) => options[(k + shift) % options.length]);
  return {
    prompt,
    options: rotated.map((text) => ({ text, isCorrect: text === correct })),
  };
}

function quizLesson(
  title: string,
  section: string,
  entries: readonly QuestionInput[],
  salt: number,
): LessonSpec {
  const questions: QuizQuestion[] = entries.map((entry, i) =>
    toQuestion(entry, i, salt),
  );
  return {
    title,
    section,
    contentType: "quiz",
    quiz: { title, passingScore: 70, questions },
  };
}

/** Three slides per module, derived from authored module notes. */
function autoSlides(m: ModuleBlueprint): SlideEntry[] {
  return [
    [
      m.title,
      m.concepts[0]?.[1] ?? "",
      ...m.concepts.slice(1).map(
        ([term, detail, example]) => `**${term}** — ${detail} Example: ${example}`,
      ),
    ],
    ["The workflow", m.workflow[0] ?? "", ...m.workflow.slice(1)],
    [
      "Common mistakes",
      m.pitfalls[0] ?? "",
      ...m.pitfalls.slice(1),
      `**Takeaway:** ${m.takeaway}`,
    ],
  ];
}

function slidesLesson(title: string, section: string, m: ModuleBlueprint): LessonSpec {
  const slides: SlideSpec[] = (m.slides ?? autoSlides(m)).map(
    ([heading, body, ...reveals]) => ({ heading, body, reveals }),
  );
  return { title, section, contentType: "slides", slides };
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
    if (c.interactiveSlides) {
      lessons.push(slidesLesson(`${n}.3 Interactive walkthrough — ${m.title}`, section, m));
    }
    const half = Math.ceil(m.questions.length / 2);
    const q = c.interactiveSlides ? 4 : 3;
    lessons.push(quizLesson(`${n}.${q} Knowledge check A`, section, m.questions.slice(0, half), i));
    lessons.push(quizLesson(`${n}.${q + 1} Knowledge check B`, section, m.questions.slice(half), i + 2));
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
