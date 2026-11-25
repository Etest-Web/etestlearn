import { describe, expect, it } from "vitest";
import { gradeQuiz, normalizeAnswerText } from "./quiz";

const QUESTIONS = [
  { id: "q1", correctOptionIds: ["q1-a"] },
  { id: "q2", correctOptionIds: ["q2-b"] },
  { id: "q3", correctOptionIds: ["q3-c"] },
];

describe("gradeQuiz", () => {
  it("scores a perfect attempt as passed", () => {
    const grade = gradeQuiz(
      QUESTIONS,
      [
        { questionId: "q1", optionId: "q1-a" },
        { questionId: "q2", optionId: "q2-b" },
        { questionId: "q3", optionId: "q3-c" },
      ],
      80,
    );
    expect(grade).toEqual({ score: 3, maxScore: 3, percent: 100, passed: true });
  });

  it("counts only answers matching a correct option", () => {
    const grade = gradeQuiz(
      QUESTIONS,
      [
        { questionId: "q1", optionId: "q1-wrong" },
        { questionId: "q2", optionId: "q2-b" },
        { questionId: "q3", optionId: "q3-c" },
      ],
      80,
    );
    expect(grade.score).toBe(2);
    expect(grade.percent).toBeCloseTo(66.67);
    expect(grade.passed).toBe(false);
  });

  it("treats unanswered questions as zero", () => {
    const grade = gradeQuiz(
      QUESTIONS,
      [{ questionId: "q1", optionId: "q1-a" }],
      30,
    );
    expect(grade).toEqual({
      score: 1,
      maxScore: 3,
      percent: (1 / 3) * 100,
      passed: true,
    });
  });

  it("respects the passing score threshold", () => {
    const halfAttempt = [
      { questionId: "q1", optionId: "q1-a" },
      { questionId: "q2", optionId: "q2-x" },
      { questionId: "q3", optionId: "q3-y" },
    ];
    expect(gradeQuiz(QUESTIONS, halfAttempt, 33).passed).toBe(true);
    expect(gradeQuiz(QUESTIONS, halfAttempt, 34).passed).toBe(false);
  });

  it("never passes an empty quiz", () => {
    const grade = gradeQuiz([], [], 80);
    expect(grade).toEqual({ score: 0, maxScore: 0, percent: 0, passed: false });
  });

  it("ignores answers for questions that do not exist", () => {
    const grade = gradeQuiz(
      QUESTIONS,
      [{ questionId: "ghost", optionId: "whatever" }],
      80,
    );
    expect(grade).toEqual({ score: 0, maxScore: 3, percent: 0, passed: false });
  });
});

describe("normalizeAnswerText", () => {
  it("trims, lowercases and collapses whitespace", () => {
    expect(normalizeAnswerText("  Live   LINK!  ")).toBe("live link!");
    expect(normalizeAnswerText("\t\n")).toBe("");
  });
});

describe("gradeQuiz answer types", () => {
  const mixed = [
    { id: "mc", correctOptionIds: ["mc-b"] },
    { id: "tf", type: "true-false" as const, correctOptionIds: ["tf-false"] },
    {
      id: "multi",
      type: "multi-select" as const,
      correctOptionIds: ["m-a", "m-c", "m-d"],
    },
    {
      id: "blank",
      type: "fill-blank" as const,
      correctOptionIds: [],
      acceptedAnswers: ["live link", "preview before sending"],
    },
  ];

  it("grades multiple-choice with exactly one option", () => {
    expect(gradeQuiz([mixed[0]], [{ questionId: "mc", optionId: "mc-b" }], 100).score).toBe(1);
    expect(gradeQuiz([mixed[0]], [{ questionId: "mc", optionId: "mc-a" }], 100).score).toBe(0);
    expect(
      gradeQuiz(
        [mixed[0]],
        [
          { questionId: "mc", optionId: "mc-b" },
          { questionId: "mc", optionId: "mc-a" },
        ],
        100,
      ).score,
    ).toBe(0);
  });

  it("grades true-false with exactly one option", () => {
    expect(gradeQuiz([mixed[1]], [{ questionId: "tf", optionId: "tf-false" }], 100).score).toBe(1);
    expect(gradeQuiz([mixed[1]], [{ questionId: "tf", optionId: "tf-true" }], 100).score).toBe(0);
  });

  it("grades multi-select only on the exact set", () => {
    const all = [
      { questionId: "multi", optionId: "m-a" },
      { questionId: "multi", optionId: "m-c" },
      { questionId: "multi", optionId: "m-d" },
    ];
    expect(gradeQuiz([mixed[2]], all, 100).score).toBe(1);
    expect(gradeQuiz([mixed[2]], all.slice(0, 2), 100).score).toBe(0);
    expect(
      gradeQuiz(
        [mixed[2]],
        [...all, { questionId: "multi", optionId: "m-b" }],
        100,
      ).score,
    ).toBe(0);
    expect(
      gradeQuiz(
        [mixed[2]],
        [...all, { questionId: "multi", optionId: "m-a" }],
        100,
      ).score,
    ).toBe(0);
  });

  it("grades fill-blank on normalised text and ignores option answers", () => {
    expect(gradeQuiz([mixed[3]], [{ questionId: "blank", text: "  Live   LINK! " }], 100).score).toBe(0);
    expect(gradeQuiz([mixed[3]], [{ questionId: "blank", text: "  Live   LINK  " }], 100).score).toBe(1);
    expect(
      gradeQuiz([mixed[3]], [{ questionId: "blank", text: "PREVIEW  BEFORE sending" }], 100).score,
    ).toBe(1);
    expect(gradeQuiz([mixed[3]], [{ questionId: "blank", text: "nope" }], 100).score).toBe(0);
    expect(gradeQuiz([mixed[3]], [{ questionId: "blank", optionId: "live link" }], 100).score).toBe(0);
  });

  it("grades all four together and keeps maxScore at question count", () => {
    const attempt = [
      { questionId: "mc", optionId: "mc-b" },
      { questionId: "tf", optionId: "tf-false" },
      { questionId: "multi", optionId: "m-a" },
      { questionId: "blank", text: "Live Link" },
    ];
    expect(gradeQuiz(mixed, attempt, 100)).toEqual({
      score: 3,
      maxScore: 4,
      percent: 75,
      passed: false,
    });
  });
});
