"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Progress } from "@/components/ui";
import { useRouter, useParams } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { CourseAnnouncementsList } from "@/components/course-announcements-list";
import { getErrorMessage } from "@/lib/errors";

export default function DashboardCoursePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const data = useQuery(api.courses.getCourseBySlug, slug ? { slug } : "skip");
  // `getUserEnrollments` answers [] when there is no Convex `users` row, so it
  // needs no gate. `getCourseCertificateStatus` `requireUser`s, and that throws
  // "Not authenticated" until the row exists — it is created by the Clerk
  // webhook, or by `EnsureCurrentUser` a beat after first paint — so gating on
  // `dbUser` is what keeps a first load from logging that error. Skipping is
  // also correct for a suspended account, which reads as signed out everywhere.
  const dbUser = useQuery(api.users.getCurrentUser);
  const enrollments = useQuery(api.enrollments.getUserEnrollments) ?? [];
  const enrollMutation = useMutation(api.enrollments.enrollInCourse);
  const issueCertificate = useMutation(api.certificates.issueCertificate);
  const certStatus = useQuery(
    api.certificates.getCourseCertificateStatus,
    dbUser && data?.course._id ? { courseId: data.course._id } : "skip",
  );
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

  function continueHref() {
    if (!enrollment || lessons.length === 0) return undefined;
    const completed = new Set<string>(enrollment.completedLessonIds ?? []);
    const target =
      lessons.find((l: any) => !completed.has(l._id)) ?? lessons[0];
    return lessonHref(target);
  }

  function lessonHref(lesson: { _id: string; contentType: string }) {
    return lesson.contentType === "quiz"
      ? `/dashboard/courses/${course.slug}/lessons/${lesson._id}/quiz`
      : `/dashboard/courses/${course.slug}/lessons/${lesson._id}`;
  }

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
      toast.success("Your certificate is ready");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not issue certificate"));
    } finally {
      setIsIssuing(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/*
        Two columns: the course itself on the left, the summary card on the
        right. Three things here are deliberate.

        · Both tracks are `minmax(0, …)`, never a bare `fr`. A `fr` track has an
          automatic minimum of min-content, so one wide child widens the track
          past the viewport — the same reason AGENTS.md rule 13 insists on a
          named base column count.
        · The split starts at `lg`. Below it the sidebar is gone but the
          content column is still narrow enough that two columns would crush
          the title.
        · `items-start` keeps the short info card hugging its content instead
          of stretching to the height of the outline beside it.
      */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {course.category && <Badge variant="secondary">{course.category}</Badge>}
              {course.level && (
                <Badge variant="outline">
                  {course.level}
                </Badge>
              )}
            </div>

            {/* The enrolment controls are *not* passed as `actions`: that slot
                sits beside the title, and a button + progress meter +
                certificate action is wide enough to squeeze the heading into
                one word per line. They get their own wrapping row underneath,
                which is also where a reader looks for them. */}
            <PageHeader title={course.title} description={course.description} />

            {enrollment ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  {continueHref() ? (
                    <Button size="sm" render={<Link href={continueHref()!} />}>
                      Continue learning
                    </Button>
                  ) : null}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Progress</span>
                    <Progress value={progress} className="w-32" />
                    <span className="tabular">{Math.round(progress)}%</span>
                  </div>
                  {certStatus?.certificate ? (
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/dashboard/certificates/${certStatus.certificate._id}`} />}
                    >
                      {certStatus.certificate.revokedAt
                        ? "View revoked certificate"
                        : "View certificate"}
                    </Button>
                  ) : certStatus?.completion?.eligible ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleIssueCertificate}
                      disabled={isIssuing}
                    >
                      {isIssuing ? "Generating..." : "Get certificate"}
                    </Button>
                  ) : null}
                </div>
                {/* Its own line rather than a fourth item in the row: it is a
                    sentence, and a sentence that wraps mid-button-row reads as
                    a broken control. */}
                {certStatus?.completion && !certStatus.completion.eligible && !certStatus.certificate ? (
                  <p className="text-xs text-muted-foreground">
                    To earn your certificate:{" "}
                    {certStatus.completion.blockers.join(" ")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <Button size="sm" onClick={handleEnroll} disabled={isEnrolling}>
                  {isEnrolling ? "Enrolling..." : "Enroll in this course"}
                </Button>
              </div>
            )}
          </div>

          {/* Gated on enrollment: the query requires course access, and a
              visitor deciding whether to enroll should not be shown a notice
              meant for the cohort. */}
          {enrollment ? <CourseAnnouncementsList courseId={course._id} /> : null}

          <section className="space-y-3">
            <h2 className="rule-heading eyebrow">Lesson outline</h2>
            {lessons.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No lessons yet"
                description="Lessons for this course haven't been added yet."
              />
            ) : (
              <Card>
                <CardContent className="divide-y divide-rule px-0">
                  {lessons.map((lesson: any, index: number) => {
                    const href =
                      lesson.contentType === "quiz"
                        ? `/dashboard/courses/${course.slug}/lessons/${lesson._id}/quiz`
                        : `/dashboard/courses/${course.slug}/lessons/${lesson._id}`;
                    return (
                      <div
                        key={lesson._id}
                        className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            <span className="tabular text-muted-foreground">{index + 1}.</span>{" "}
                            <Link href={href} className="text-primary hover:underline">
                              {lesson.title}
                            </Link>
                          </p>
                          <p className="eyebrow">{lesson.contentType}</p>
                        </div>
                        {lesson.durationMinutes && (
                          <span className="tabular shrink-0 text-xs text-muted-foreground">
                            {lesson.durationMinutes} min
                          </span>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </section>
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              Course info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Lessons: <span className="tabular font-medium text-foreground">{lessons.length}</span>
            </p>
            <p className="text-xs">
              A focused learning space where you&apos;ll eventually see notes,
              discussions, and assessments tied to each lesson.
            </p>
            <p className="text-xs">
              Join{" "}
              <Link
                href={`/dashboard/courses/${course.slug}/discussions`}
                className="link-quiet text-primary"
              >
                course discussions
              </Link>{" "}
              to ask questions and share insights.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

