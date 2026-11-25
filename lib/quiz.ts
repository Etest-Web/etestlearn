/** The four question shapes the platform grades. Absent means multiple-choice. */
export type QuestionType =
  | "multiple-choice"
  | "true-false"
  | "multi-select"
  | "fill-blank";

export interface GradeableQuestion {
  id: string;
  type?: QuestionType;
  correctOptionIds: string[];
  /** fill-blank answers, stored normalised. */
  acceptedAnswers?: string[];
}

/** One answer is validated server-side; both fields are optional on the wire. */
export type QuizAnswer = {
  questionId: string;
  optionId?: string;
  text?: string;
};

export interface QuizGrade {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
}

export function normalizeAnswerText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Grades a quiz. Each question is worth one point. Multiple-choice and
 * true-false need one chosen correct option; multi-select needs the exact set
 * of correct options (no missing, no extra, no duplicates); fill-blank compares
 * normalised text against the accepted answers. Unanswered questions score zero.
 */
export function gradeQuiz(
  questions: GradeableQuestion[],
  answers: QuizAnswer[],
  passingScorePercent: number,
): QuizGrade {
  const maxScore = questions.length;
  const answersByQuestion = new Map<string, QuizAnswer[]>();
  for (const answer of answers) {
    const list = answersByQuestion.get(answer.questionId) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.questionId, list);
  }

  let score = 0;
  for (const question of questions) {
    const given = answersByQuestion.get(question.id) ?? [];
    const type = question.type ?? "multiple-choice";

    if (type === "fill-blank") {
      const textAnswer = given.find((a) => a.text !== undefined)?.text;
      if (
        textAnswer !== undefined &&
        question.acceptedAnswers?.some(
          (accepted) => normalizeAnswerText(accepted) === normalizeAnswerText(textAnswer),
        )
      ) {
        score += 1;
      }
      continue;
    }

    const chosen = given.flatMap((a) => (a.optionId === undefined ? [] : [a.optionId]));
    if (type === "multi-select") {
      const correct = new Set(question.correctOptionIds);
      if (
        chosen.length > 0 &&
        chosen.length === correct.size &&
        new Set(chosen).size === chosen.length &&
        chosen.every((id) => correct.has(id))
      ) {
        score += 1;
      }
      continue;
    }

    if (chosen.length === 1 && question.correctOptionIds.includes(chosen[0])) {
      score += 1;
    }
  }

  const percent = maxScore === 0 ? 0 : (score / maxScore) * 100;
  return { score, maxScore, percent, passed: percent >= passingScorePercent };
}
