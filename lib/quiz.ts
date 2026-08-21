export interface GradeableQuestion {
  id: string;
  correctOptionIds: string[];
}

export interface QuizAnswer {
  questionId: string;
  optionId: string;
}

export interface QuizGrade {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
}

/**
 * Grades a multiple-choice quiz. Each question is worth one point and only a
 * correct option earns it; unanswered questions score zero.
 */
export function gradeQuiz(
  questions: GradeableQuestion[],
  answers: QuizAnswer[],
  passingScorePercent: number,
): QuizGrade {
  const maxScore = questions.length;
  const answerByQuestion = new Map(
    answers.map((a) => [a.questionId, a.optionId] as const),
  );

  let score = 0;
  for (const question of questions) {
    const chosen = answerByQuestion.get(question.id);
    if (chosen !== undefined && question.correctOptionIds.includes(chosen)) {
      score += 1;
    }
  }

  const percent = maxScore === 0 ? 0 : (score / maxScore) * 100;
  return { score, maxScore, percent, passed: percent >= passingScorePercent };
}
