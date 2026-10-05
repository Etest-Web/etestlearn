"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { VideoPlayer } from "@/components/video-player";
import { EncryptedVideoPlayer } from "@/components/encrypted-video-player";
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

function LessonContent({
  contentType,
  content,
  lessonId,
  isCompleted,
  onWatchedEnough,
}: {
  contentType: string;
  content?: string;
  lessonId: Id<"lessons">;
  isCompleted: boolean;
  onWatchedEnough: () => void;
}) {
  const assetState = useQuery(
    api.videoAssets.getAssetStatus,
    contentType === "video" ? { lessonId } : "skip",
  );

  if (contentType === "quiz") {
    return null;
  }

  if (contentType === "video") {
    if (assetState === undefined) {
      return <p className="text-sm text-muted-foreground">Loading video...</p>;
    }
    if (assetState && assetState.asset.status === "ready") {
      // Managers preview through the same encrypted player; only students
      // accrue the 90%-watched auto-complete.
      const isStudent = assetState.role === "student";
      return (
        <EncryptedVideoPlayer
          assetId={assetState.asset._id}
          title="Lesson video"
          onProgress={(p) => {
            if (isStudent && p.percent >= 90 && !isCompleted) onWatchedEnough();
          }}
        />
      );
    }
    if (assetState && assetState.role === "manager") {
      const status = assetState.asset.status;
      if (status === "pending" || status === "processing") {
        return (
          <EmptyState
            icon={VideoIcon}
            title="Video is being prepared"
            description="The upload is being transcoded into streamable quality levels. Check back soon."
          />
        );
      }
      if (status === "failed") {
        return (
          <EmptyState
            icon={VideoIcon}
            title="Video failed to process"
            description={assetState.asset.errorMessage ?? "The upload could not be transcoded. Try re-uploading."}
          />
        );
      }
    }
    if (!content) {
      return (
        <EmptyState
          icon={VideoIcon}
          title="No video yet"
          description="The video for this lesson hasn't been added yet."
        />
      );
    }
    return <VideoPlayer src={content} title="Lesson video" />;
  }

  // article
  if (!content) {
    return (
      <EmptyState
        icon={FileText}
        title="No article yet"
        description="The article for this lesson hasn't been written yet."
      />
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
        <span className="tabular text-xs text-muted-foreground">
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
            <Badge variant="outline" className="gap-1 border-emerald-200 text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Completed
            </Badge>
          )}
          {lesson.durationMinutes != null && (
            <span className="tabular text-xs text-muted-foreground">{lesson.durationMinutes} min</span>
          )}
        </div>
        <PageHeader title={lesson.title} />
      </header>

      {!enrollment ? (
        <EmptyState
          icon={Lock}
          title="This lesson is locked"
          description="Enroll in this course to access lesson content."
          action={
            <Button render={<Link href={`/dashboard/courses/${course.slug}`} />}>
              Go to course page
            </Button>
          }
        />
      ) : (
        <>
          {lesson.contentType === "quiz" ? (
            <EmptyState
              icon={HelpCircle}
              title="This lesson is a knowledge check"
              description="Answer a short set of questions to record your grade for this lesson."
              action={
                <Button
                  render={
                    <Link href={`/dashboard/courses/${course.slug}/lessons/${lesson._id}/quiz`} />
                  }
                >
                  Open quiz
                </Button>
              }
            />
          ) : (
            <LessonContent
              contentType={lesson.contentType}
              content={lesson.content ?? undefined}
              lessonId={lesson._id}
              isCompleted={isCompleted}
              onWatchedEnough={() => {
                // 90% watched counts as done — no navigation, just the toast + progress.
                completeLesson({ courseId: course._id, lessonId: lesson._id }).then(
                  () => toast.success("Lesson completed"),
                  (err) => toast.error(err instanceof Error ? err.message : "Failed to update progress"),
                );
              }}
            />
          )}

          {/* Prev + CTA + Next needs ~411px. Stack below sm so the primary action is
              always reachable, then go back to a single row. */}
          <nav aria-label="Lesson navigation" className="flex flex-col-reverse items-stretch gap-3 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
            {prev ? (
              <Button
                variant="outline"
                render={<Link href={lessonHref(prev)} />}
                className="w-full touch-target sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}

            <Button className="w-full sm:w-auto" onClick={handleComplete} disabled={isMarking} variant={isCompleted ? "outline" : "default"}>
              {isMarking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              {isCompleted ? "Completed — continue" : "Mark complete & continue"}
            </Button>

            {next ? (
              <Button
                variant="outline"
                render={<Link href={lessonHref(next)} />}
                className="w-full touch-target sm:w-auto"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
          </nav>

          {/* A sunken well, which is what the Card `sunken` variant is for — the
              outline is secondary to the lesson itself. */}
          <Card variant="sunken" size="sm" className="gap-3">
            <h2 className="eyebrow">
              Course outline
            </h2>
            <ol className="space-y-1">
              {lessons.map((l, i) => {
                const active = l._id === lesson._id;
                return (
                  <li key={l._id}>
                    <Link
                      href={lessonHref(l)}
                      className={`relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
                        active
                          ? "font-semibold text-foreground after:absolute after:inset-y-1.5 after:left-0 after:w-0.5 after:bg-brand"
                          : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground"
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
          </Card>
        </>
      )}
    </div>
  );
}
