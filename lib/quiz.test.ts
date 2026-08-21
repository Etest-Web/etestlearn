import { describe, expect, it } from "vitest";
import { gradeQuiz } from "./quiz";

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
