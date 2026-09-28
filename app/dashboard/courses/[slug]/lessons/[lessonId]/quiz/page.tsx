"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Checkbox,
} from "@/components/ui";

export default function LessonQuizPage() {
  const params = useParams<{ slug: string; lessonId: string }>();
  const lessonId = params.lessonId as string;

  const quizData = useQuery(api.quizzes.getQuizForLesson, {
    lessonId: lessonId as any,
  });
  const [selected, setSelected] = useState<Record<string, string>>({});
  const submitAttempt = useMutation(api.quizzes.submitQuizAttempt);
  const [result, setResult] = useState<{
    score: number;
    maxScore: number;
    percent: number;
    passed: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (quizData === undefined) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <p className="text-sm text-muted-foreground">Loading quiz...</p>
      </div>
    );
  }

  if (quizData === null) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <p className="text-sm text-muted-foreground">
          No quiz is configured for this lesson yet.
        </p>
      </div>
    );
  }

  const { quiz, questions } = quizData;

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const answers = Object.entries(selected).map(([questionId, optionId]) => ({
        questionId: questionId as any,
        optionId: optionId as any,
      }));
      const res = await submitAttempt({
        lessonId: quiz.lessonId,
        answers,
      });
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Lesson quiz
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{quiz.title}</h1>
        <p className="text-sm text-muted-foreground">
          Answer the questions below. You need at least {quiz.passingScore}% to
          pass.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.map(({ question, options }: any, index: number) => (
            <div key={question._id} className="space-y-2">
              <p className="text-sm font-medium">
                {index + 1}. {question.prompt}
              </p>
              <div className="space-y-1">
                {options.map((opt: any) => {
                  const questionKey = String(question._id);
                  const optionKey = String(opt._id);
                  const checked = selected[questionKey] === optionKey;

                  return (
                    <label
                      key={opt._id}
                      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setSelected((prev) => ({
                            ...prev,
                            [questionKey]: optionKey,
                          }))
                        }
                      />
                      <span>{opt.text}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="pt-4">
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit quiz"}
            </Button>
          </div>

          {result && (
            <div className="mt-4 rounded-md border px-3 py-2 text-sm">
              <p>
                Score:{" "}
                <span className="font-medium">
                  {result.score} / {result.maxScore} (
                  {Math.round(result.percent)}%)
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {result.passed
                  ? "You passed this quiz. Great work!"
                  : "You didn&apos;t reach the passing score yet. Review the material and try again."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

