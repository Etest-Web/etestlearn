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
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { HelpCircle } from "lucide-react";

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
        <EmptyState
          icon={HelpCircle}
          title="No quiz for this lesson"
          description="No quiz is configured for this lesson yet."
        />
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
      {/* "Lesson quiz" was already a small uppercase label above the title, so
          it is a real eyebrow here rather than a filler one. */}
      <PageHeader
        eyebrow="Lesson quiz"
        title={quiz.title}
        description={`Answer the questions below. You need at least ${quiz.passingScore}% to pass.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.map(({ question, options }: any, index: number) => (
            <div key={question._id} className="space-y-2">
              <p className="text-sm font-medium">
                <span className="tabular text-muted-foreground">{index + 1}.</span>{" "}
                {question.prompt}
              </p>
              <div className="space-y-1">
                {options.map((opt: any) => {
                  const questionKey = String(question._id);
                  const optionKey = String(opt._id);
                  const checked = selected[questionKey] === optionKey;

                  return (
                    <label
                      key={opt._id}
                      className="flex items-center gap-2 rounded-sm border border-rule px-3 py-1.5 text-sm"
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
            // Tinted by outcome, but the sentence below is what actually says
            // whether the attempt passed — never colour alone.
            <div
              className={`mt-4 rounded-sm border px-3 py-2 text-sm ${
                result.passed
                  ? "border-emerald-200 bg-emerald-500/5"
                  : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <p>
                Score:{" "}
                <span className="tabular font-medium">
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
