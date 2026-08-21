"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { VideoPlayer } from "@/components/video-player";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  Video as VideoIcon,
} from "lucide-react";

function LessonContent({ contentType, content }: { contentType: string; content?: string }) {
  if (contentType === "quiz") {
    return null;
  }

  if (contentType === "video") {
    if (!content) {
      return (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            The video for this lesson hasn&apos;t been added yet.
          </CardContent>
        </Card>
      );
    }
    return <VideoPlayer src={content} title="Lesson video" />;
  }

  // article
  if (!content) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          The article for this lesson hasn&apos;t been written yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default function LessonPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const lessonId = params.lessonId as Id<"lessons">;

  const data = useQuery(api.courses.getCourseBySlug, slug ? { slug } : "skip");
  const enrollments = useQuery(api.enrollments.getUserEnrollments);
  const completeLesson = useMutation(api.enrollments.completeLesson);
  const [isMarking, setIsMarking] = useState(false);

  if (data === undefined || enrollments === undefined) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <p className="text-sm text-muted-foreground">Loading lesson...</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-4xl py-8 space-y-2">
        <p className="text-sm text-muted-foreground">This course could not be found.</p>
        <Link href="/dashboard/courses" className="text-sm text-primary underline">
          Back to my courses
        </Link>
      </div>
    );
  }

  const { course, lessons } = data;
  const index = lessons.findIndex((l) => l._id === lessonId);
  const lesson = index >= 0 ? lessons[index] : null;
  const enrollment = enrollments.find((e) => e.courseId === course._id);

  if (!lesson) {
    return (
      <div className="mx-auto max-w-4xl py-8 space-y-2">
        <p className="text-sm text-muted-foreground">This lesson could not be found.</p>
        <Link href={`/dashboard/courses/${course.slug}`} className="text-sm text-primary underline">
          Back to course overview
        </Link>
      </div>
    );
  }

  const completed = new Set(enrollment?.completedLessonIds ?? []);
  const isCompleted = completed.has(lesson._id);
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index < lessons.length - 1 ? lessons[index + 1] : null;

  const activeLesson = lesson;
  type LessonDoc = NonNullable<typeof lesson>;

  function lessonHref(l: LessonDoc) {
    return l.contentType === "quiz"
      ? `/dashboard/courses/${course.slug}/lessons/${l._id}/quiz`
      : `/dashboard/courses/${course.slug}/lessons/${l._id}`;
  }

  async function handleComplete() {
    if (isMarking) return;
    setIsMarking(true);
    try {
      await completeLesson({ courseId: course._id, lessonId: activeLesson._id });
      if (next) {
        router.push(lessonHref(next));
      } else {
        toast.success("You've reached the end of this course 🎉");
        router.push(`/dashboard/courses/${course.slug}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update progress");
    } finally {
      setIsMarking(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/dashboard/courses/${course.slug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {course.title}
        </Link>
        <span className="text-xs text-muted-foreground">
          Lesson {index + 1} of {lessons.length}
        </span>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize gap-1">
            {lesson.contentType === "video" && <VideoIcon className="h-3 w-3" />}
            {lesson.contentType === "article" && <FileText className="h-3 w-3" />}
            {lesson.contentType === "quiz" && <HelpCircle className="h-3 w-3" />}
            {lesson.contentType}
          </Badge>
          {isCompleted && (
            <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </Badge>
          )}
          {lesson.durationMinutes != null && (
            <span className="text-xs text-muted-foreground">{lesson.durationMinutes} min</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{lesson.title}</h1>
      </header>

      {!enrollment ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Enroll in this course to access lesson content</p>
            <Button
              size="sm"
              render={<Link href={`/dashboard/courses/${course.slug}`} />}
            >
              Go to course page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {lesson.contentType === "quiz" ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <HelpCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">This lesson is a knowledge check</p>
                <Button
                  size="sm"
                  render={
                    <Link href={`/dashboard/courses/${course.slug}/lessons/${lesson._id}/quiz`} />
                  }
                >
                  Open quiz
                </Button>
              </CardContent>
            </Card>
          ) : (
            <LessonContent contentType={lesson.contentType} content={lesson.content ?? undefined} />
          )}

          <nav aria-label="Lesson navigation" className="flex items-center justify-between gap-3 border-t pt-4">
            {prev ? (
              <Link
                href={lessonHref(prev)}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </Link>
            ) : (
              <span />
            )}

            <Button onClick={handleComplete} disabled={isMarking} variant={isCompleted ? "outline" : "default"}>
              {isMarking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isCompleted ? (
                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
              ) : (
                <Circle className="mr-2 h-4 w-4" />
              )}
              {isCompleted ? "Completed — continue" : "Mark complete & continue"}
            </Button>

            {next ? (
              <Link
                href={lessonHref(next)}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span />
            )}
          </nav>

          <aside className="rounded-xl border bg-muted/30 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Course outline
            </h2>
            <ol className="space-y-1">
              {lessons.map((l, i) => {
                const active = l._id === lesson._id;
                return (
                  <li key={l._id}>
                    <Link
                      href={lessonHref(l)}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        active ? "bg-background font-medium shadow-sm" : "hover:bg-background/60"
                      }`}
                    >
                      {completed.has(l._id) ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className="truncate">
                        {i + 1}. {l.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </aside>
        </>
      )}
    </div>
  );
}
