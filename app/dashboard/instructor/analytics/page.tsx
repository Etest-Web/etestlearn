"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EnrollmentFunnelChart,
  ProgressRow,
  StatTile,
} from "@/components/instructor-console";
import { formatNaira } from "@/lib/instructor-earnings";
import { pluralize } from "@/lib/utils";
import {
  ArrowRight,
  Award,
  BarChart3,
  CircleAlert,
  LineChart,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

/**
 * Analytics — what is and is not working, per course.
 *
 * The overview answers "how much money and how many learners"; this page
 * answers "which course is the problem". So it leads with the comparison
 * (enrolled vs completed, side by side, so the drop-off gap is the visual
 * subject) and then gives each course its own row of numbers.
 *
 * Completion rate is the load-bearing column here, and it comes from the same
 * `progressPercent >= 100` definition `lib/certificates.ts` owns — so what an
 * instructor sees in this table is exactly what gates a learner's certificate,
 * rather than a second, drifting definition of "finished".
 */

const TABLE_HEADINGS = [
  "Course",
  "Learners",
  "Active (30d)",
  "Completion",
  "Avg progress",
  "Certs",
  "Sales",
  "Earnings",
] as const;

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

/** The headline cohort numbers, stated once rather than repeated per card. */
function CohortTiles() {
  const pulse = useQuery(api.instructorStats.getInstructorPulse);

  if (pulse === undefined) return null;

  const { learners, quizPerformance, certificates, engagement } = pulse;

  return (
    <section aria-label="Cohort totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Enrolled learners"
        icon={Users}
        value={learners.enrolled}
        sub={`${learners.activeThisWeek} active this week · ${learners.newThisMonth} new this month`}
      />
      <StatTile
        label="Completion rate"
        icon={Target}
        value={`${learners.completionRate}%`}
        sub={`${learners.completed} finished · ${learners.inProgress} still going`}
      />
      <StatTile
        label="Quiz pass rate"
        icon={TrendingUp}
        value={quizPerformance.passRate === null ? "—" : `${quizPerformance.passRate}%`}
        sub={
          quizPerformance.passRate === null
            ? "no quiz attempts yet"
            : `${quizPerformance.passedBy} of ${quizPerformance.attemptedBy} learners passed`
        }
      />
      <StatTile
        label="Certificates earned"
        icon={Award}
        value={certificates.active}
        sub={`${certificates.issuedThisMonth} this month · ${engagement.lessonsCompleted30d} lessons done in 30d`}
      />
    </section>
  );
}

function FunnelCard() {
  const performance = useQuery(api.instructorStats.listInstructorCoursePerformance);

  if (performance === undefined) return <Skeleton className="h-72" />;

  const rows = performance.filter((row) => row.enrollmentCount > 0);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrolled vs completed</CardTitle>
        <CardDescription>
          The gap between the two bars is how many learners started and did not
          finish.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EnrollmentFunnelChart
          data={rows.slice(0, 8).map((row) => ({
            // Truncated for the axis; the table below carries the full title.
            name: row.title.length > 18 ? `${row.title.slice(0, 17)}…` : row.title,
            enrolled: row.enrollmentCount,
            completed: row.completedCount,
          }))}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Where courses are unhealthy.
 *
 * A course with a published listing but no learners is shown too — that is the
 * failure mode revenue never reveals, because zero revenue looks exactly the
 * same as "too new to tell".
 */
function CourseHealth() {
  const performance = useQuery(api.instructorStats.listInstructorCoursePerformance);

  if (performance === undefined) return <Skeleton className="h-64" />;

  const flags: {
    courseId: string;
    title: string;
    href: string;
    badge: string;
    tone: "destructive" | "warning" | "info";
    detail: string;
  }[] = [];

  for (const row of performance) {
    const href = `/dashboard/instructor/courses/${row.courseId}`;

    if (row.published && row.lessons === 0) {
      flags.push({
        courseId: row.courseId,
        title: row.title,
        href,
        badge: "No content",
        tone: "destructive",
        detail:
          "Live in the catalog with no lessons — learners can see it and study nothing.",
      });
      continue;
    }

    if (row.published && row.enrollmentCount === 0) {
      flags.push({
        courseId: row.courseId,
        title: row.title,
        href,
        badge: "No signups",
        tone: "warning",
        detail:
          "Published but nobody has enrolled. Price, thumbnail or description may be the blocker.",
      });
      continue;
    }

    if (row.enrollmentCount >= 5 && row.completionRate < 20) {
      flags.push({
        courseId: row.courseId,
        title: row.title,
        href,
        badge: "Drop-off",
        tone: "warning",
        detail: `Only ${row.completionRate}% finish. Average progress is ${row.averageProgress}%, so learners are leaving early.`,
      });
      continue;
    }

    if (!row.published && row.lessons > 0) {
      flags.push({
        courseId: row.courseId,
        title: row.title,
        href,
        badge: "Draft",
        tone: "info",
        detail: `${pluralize(row.lessons, "lesson")} written but never published.`,
      });
    }
  }

  if (flags.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Course health</CardTitle>
        <CardDescription>
          Courses where something is measurably off, worst first.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-rule">
          {flags.map((flag) => (
            <li key={flag.courseId}>
              <Link
                href={flag.href}
                className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {flag.title}
                    </span>
                    <Badge variant={flag.tone}>{flag.badge}</Badge>
                  </span>
                  <span className="mt-0.5 block text-xs leading-[1.5] text-muted-foreground">
                    {flag.detail}
                  </span>
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The full per-course table: this page's actual deliverable. */
function PerformanceTable() {
  const performance = useQuery(api.instructorStats.listInstructorCoursePerformance);

  if (performance === undefined) return <Skeleton className="h-72" />;

  if (performance.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Per-course performance</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BarChart3}
            tone="brand"
            title="No courses to report on"
            description="Analytics appear here once you have created a course and learners have started enrolling."
            action={
              <Button render={<Link href="/dashboard/instructor/courses/new" />}>
                Create a course
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-course performance</CardTitle>
        <CardDescription>
          Every course you own, with the numbers that decide what to work on next.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-surface-sunken">
              <tr className="border-b border-rule">
                {TABLE_HEADINGS.map((heading, index) => (
                  <th
                    key={heading}
                    scope="col"
                    className={
                      index === 0 || index === TABLE_HEADINGS.length - 1
                        ? "px-5 py-3 text-xs font-medium text-muted-foreground"
                        : "px-3 py-3 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {performance.map((row) => (
                <tr
                  key={row.courseId}
                  className="border-b border-rule last:border-0 transition-colors hover:bg-surface-sunken"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/instructor/courses/${row.courseId}`}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <span className="max-w-56 truncate text-sm font-medium text-foreground link-quiet">
                        {row.title}
                      </span>
                      {row.published ? null : <Badge variant="secondary">Draft</Badge>}
                    </Link>
                    <span className="tabular text-xs text-muted-foreground">
                      {pluralize(row.lessons, "lesson")}
                      {row.price && row.price > 0 ? ` · ${formatNaira(row.price)}` : " · free"}
                    </span>
                  </td>
                  <td className="tabular px-3 py-3 text-sm text-foreground">
                    {row.enrollmentCount}
                  </td>
                  <td className="tabular px-3 py-3 text-sm text-foreground">
                    {row.activeLearners}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      <span className="tabular w-9 text-sm text-foreground">
                        {row.completionRate}%
                      </span>
                      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${row.completionRate}%` }}
                        />
                      </span>
                    </span>
                  </td>
                  <td className="tabular px-3 py-3 text-sm text-muted-foreground">
                    {row.averageProgress}%
                  </td>
                  <td className="tabular px-3 py-3 text-sm text-foreground">
                    {row.certificateCount}
                    {row.revokedCertificateCount > 0 ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({row.revokedCertificateCount} revoked)
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular px-3 py-3 text-sm text-foreground">
                    {row.sales}
                  </td>
                  <td className="tabular px-5 py-3 text-right text-sm font-semibold text-foreground">
                    {formatNaira(row.netEarningsKobo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Quiz outcomes per course — the fastest way to find a badly-pitched quiz. */
function QuizHealth() {
  const pulse = useQuery(api.instructorStats.getInstructorPulse);

  if (pulse === undefined) return null;

  const rows = pulse.quizPerformance.passRateByCourse.filter(
    (row) => row.attemptedBy > 0,
  );
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiz pass rate by course</CardTitle>
        <CardDescription>
          Measured over learners who attempted, not over attempts — a learner
          who retries until they pass is one success, not three failures.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {rows.map((row) => (
          <ProgressRow
            key={row.courseId}
            label={row.courseTitle}
            value={row.passRate ?? 0}
            detail={`${row.passedBy}/${row.attemptedBy}`}
            tone={
              row.passRate !== null && row.passRate < 40
                ? "warning"
                : row.passRate !== null && row.passRate >= 70
                  ? "success"
                  : "default"
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

export default function InstructorAnalyticsPage() {
  const performance = useQuery(api.instructorStats.listInstructorCoursePerformance);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Instructor"
        title="Analytics"
        description="Enrollment, completion and quiz performance for every course you own, side by side."
        actions={
          <Button variant="outline" render={<Link href="/dashboard/instructor/earnings" />}>
            Earnings breakdown
            <ArrowRight className="h-4 w-4" />
          </Button>
        }
      />

      {performance === undefined ? (
        <AnalyticsSkeleton />
      ) : performance.length === 0 ? (
        <EmptyState
          icon={LineChart}
          tone="brand"
          title="No courses to report on"
          description="Analytics appear here once you have created a course and learners have started enrolling."
          action={
            <Button render={<Link href="/dashboard/instructor/courses/new" />}>
              Create a course
            </Button>
          }
        />
      ) : (
        <>
          <CohortTiles />
          <FunnelCard />
          <div className="grid gap-6 lg:grid-cols-2">
            <QuizHealth />
            <CourseHealth />
          </div>
          <PerformanceTable />
        </>
      )}
    </div>
  );
}
