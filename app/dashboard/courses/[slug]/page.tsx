"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui";
import { useRouter } from "next/navigation";

interface DashboardCoursePageProps {
  params: { slug: string };
}

export default function DashboardCoursePage({ params }: DashboardCoursePageProps) {
  const router = useRouter();
  const data = useQuery(api.courses.getCourseBySlug, { slug: params.slug });
  const enrollments = useQuery(api.enrollments.getUserEnrollments) ?? [];
  const enrollMutation = useMutation(api.enrollments.enrollInCourse);
  const issueCertificate = useMutation(api.certificates.issueCertificate);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);

  if (data === undefined) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <p className="text-sm text-muted-foreground">Loading course...</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <p className="text-sm text-muted-foreground">
          This course could not be found.
        </p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-primary underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { course, lessons } = data;
  const enrollment = enrollments.find((e: any) => e.courseId === course._id);
  const progress = enrollment?.progressPercent ?? 0;

  async function handleEnroll() {
    if (!course?._id || isEnrolling) return;
    try {
      setIsEnrolling(true);
      await enrollMutation({ courseId: course._id });
      // Refresh Convex queries / UI will automatically re-run; we can optionally refresh route.
      router.refresh();
    } finally {
      setIsEnrolling(false);
    }
  }

  async function handleIssueCertificate() {
    if (!course?._id || isIssuing) return;
    try {
      setIsIssuing(true);
      await issueCertificate({ courseId: course._id });
      router.refresh();
    } finally {
      setIsIssuing(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {course.category && <Badge variant="secondary">{course.category}</Badge>}
            {course.level && (
              <Badge variant="outline" className="text-xs">
                {course.level}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {course.title}
          </h1>
          <p className="text-sm text-muted-foreground">{course.description}</p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {enrollment ? (
              <>
                <Button size="sm">Continue learning</Button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Progress</span>
                  <Progress value={progress} className="w-32" />
                  <span>{Math.round(progress)}%</span>
                </div>
                {progress >= 80 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleIssueCertificate}
                    disabled={isIssuing}
                  >
                    {isIssuing ? "Generating..." : "Get certificate"}
                  </Button>
                )}
              </>
            ) : (
              <Button size="sm" onClick={handleEnroll} disabled={isEnrolling}>
                {isEnrolling ? "Enrolling..." : "Enroll in this course"}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Course info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Lessons: <span className="font-medium text-foreground">{lessons.length}</span>
            </p>
            <p className="text-xs">
              A focused learning space where you&apos;ll eventually see notes,
              discussions, and assessments tied to each lesson.
            </p>
            <p className="text-xs">
              Join{" "}
              <Link
                href={`/dashboard/courses/${course.slug}/discussions`}
                className="text-primary underline"
              >
                course discussions
              </Link>{" "}
              to ask questions and share insights.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Lesson outline</h2>
        {lessons.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Lessons for this course haven&apos;t been added yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y px-0">
              {lessons.map((lesson: any, index: number) => (
                <div
                  key={lesson._id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {index + 1}.{" "}
                      {lesson.contentType === "quiz" ? (
                        <Link
                          href={`/dashboard/courses/${course.slug}/lessons/${lesson._id}/quiz`}
                          className="text-primary hover:underline"
                        >
                          {lesson.title}
                        </Link>
                      ) : (
                        lesson.title
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {lesson.contentType}
                    </p>
                  </div>
                  {lesson.durationMinutes && (
                    <span className="text-xs text-muted-foreground">
                      {lesson.durationMinutes} min
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

