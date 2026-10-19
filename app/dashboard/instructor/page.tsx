"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { BankInfoBanner } from "@/components/bank-info-banner";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ActivityFeed,
  EarningsChart,
  ProgressRow,
  StatTile,
} from "@/components/instructor-console";
import { formatNaira } from "@/lib/instructor-earnings";
import { formatRelativeTime, pluralize } from "@/lib/utils";
import {
  ArrowRight,
  Award,
  Banknote,
  BookOpen,
  CircleAlert,
  ExternalLink,
  GraduationCap,
  LifeBuoy,
  PlusCircle,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

/**
 * Instructor overview — the page an instructor lands on and reads first.
 *
 * Ordered by the questions they actually arrive with: how much did I earn (the
 * brand plate), is it growing (the delta and the chart), are my learners
 * finishing (the learner block), and what is broken (the attention list).
 * Everything below that is the supporting evidence for those four answers,
 * which is why the course list is deliberately last: it is a management
 * surface, not a summary.
 *
 * **Every grid on this page declares its base column count.**
 * `grid` alone gives the page an implicit `auto` track, and an `auto` track
 * is floored at its content's min-content width — so a single wide child
 * (a truncated activity row, a long unbroken title) widens the track past the
 * viewport and the whole dashboard scrolls sideways. `grid-cols-1` is
 * `minmax(0, 1fr)`, which cannot be pushed open. The rest of the console
 * already does this; these grids were the ones that did not.
 */

const ATTENTION_ICON = {
  draft: BookOpen,
  empty: CircleAlert,
  discussion: LifeBuoy,
  grading: Award,
  unpublish: CircleAlert,
  stalled: Users,
} as const;

function OverviewSkeleton() {
  return (
    <PageShell>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-72" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </PageShell>
  );
}

function EarningsPlate() {
  const earnings = useQuery(api.instructorStats.getEarningsSummary, { months: 6 });

  if (earnings === undefined) return <Skeleton className="h-32" />;

  const { lifetime, last30, trendPercent } = earnings;

  return (
    <StatTile
      tone="brand"
      label="Your earnings — last 30 days"
      icon={Wallet}
      value={formatNaira(last30.netEarningsKobo)}
      delta={{ percent: trendPercent, comparison: "vs previous 30 days" }}
      sub={`${formatNaira(lifetime.netEarningsKobo)} all time · ${pluralize(lifetime.sales, "sale")}`}
    />
  );
}

function LearnerBlock() {
  const pulse = useQuery(api.instructorStats.getInstructorPulse);

  if (pulse === undefined) return <Skeleton className="h-64" />;

  const { learners, certificates, engagement, quizPerformance } = pulse;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your learners</CardTitle>
        <CardDescription>
          {learners.enrolled === 0
            ? "No enrollments yet."
            : `${pluralize(learners.activeThisWeek, "learner")} active in the last 7 days of ${learners.enrolled} enrolled.`}
        </CardDescription>
      </CardHeader>
      {/* A query container, because the four counters below have to know how
          wide THIS card is, not how wide the window is. The card sits in a
          two-column grid, so at 1024px it is 340px wide and four columns of
          85px would wrap every label to three lines. The container query
          reads the card's own width and keeps it at two columns until there
          is room for four. */}
      <CardContent className="@container flex flex-col gap-5">
        <ProgressRow
          label="Completed every lesson"
          value={learners.completionRate}
          detail={`${learners.completed} of ${learners.enrolled}`}
          tone={learners.completionRate >= 60 ? "success" : "default"}
        />
        <ProgressRow
          label="Average progress"
          value={learners.averageProgress}
          detail={`${learners.averageProgress}%`}
        />
        <ProgressRow
          label="Passed a quiz"
          value={quizPerformance.passRate ?? 0}
          detail={
            quizPerformance.passRate === null
              ? "No attempts yet"
              : `${quizPerformance.passedBy} of ${quizPerformance.attemptedBy} learners`
          }
          tone={
            quizPerformance.passRate !== null && quizPerformance.passRate < 40
              ? "warning"
              : "default"
          }
        />

        {/* Hairline-divided row: the rules do the separating, which is why
            these can be set large and tabular without reading as four cards.

            The rule follows the shape of the grid, and so does the number of
            columns. `divide-x` draws a rule on every child but the last,
            which is right for four columns of one row and wrong for two
            columns of two rows — the third child, which starts the second
            row, would carry a rule hanging off the left edge. So below the
            container's `xl` the rule runs across the rows instead, and from
            `xl` up it runs down the columns, which is also where the four
            counters fit side by side. */}
        <dl className="grid grid-cols-2 divide-y divide-rule border-y border-rule @xl:grid-cols-4 @xl:divide-y-0 @xl:divide-x">
          {[
            { label: "New this month", value: learners.newThisMonth },
            { label: "Still going", value: learners.inProgress },
            { label: "Lessons done (30d)", value: engagement.lessonsCompleted30d },
            { label: "Certificates", value: certificates.active },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-1 px-3 py-3">
              <dt className="eyebrow">{item.label}</dt>
              <dd className="tabular text-xl font-semibold text-foreground">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        {certificates.issuedThisMonth > 0 ? (
          <p className="text-xs text-muted-foreground">
            {pluralize(certificates.issuedThisMonth, "certificate")} issued in the
            last 30 days
            {certificates.revoked > 0 ? ` · ${certificates.revoked} revoked` : ""}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AttentionBlock() {
  const attention = useQuery(api.instructorStats.listInstructorAttentionItems);

  if (attention === undefined) return <Skeleton className="h-64" />;

  const { items, counts } = attention;

  // Counters first, so a glance says whether anything is wrong before any of
  // the detail text is read.
  const summary = [
    { label: "Drafts", value: counts.drafts },
    { label: "Unanswered threads", value: counts.unansweredThreads },
    { label: "Awaiting grade", value: counts.awaitingGrade },
    { label: "Learners gone quiet", value: counts.stalledLearners },
  ].filter((entry) => entry.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
        <CardDescription>
          {items.length === 0
            ? "Nothing outstanding. Courses are published, questions are answered and submissions are graded."
            : `${pluralize(items.length, "item")} worth a look today.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {summary.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {summary.map((entry) => (
              <Badge key={entry.label} variant="outline" className="tabular">
                {entry.value} {entry.label}
              </Badge>
            ))}
          </div>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            tone="brand"
            title="You're all caught up"
            description="This list fills itself: drafts waiting to be published, questions without a reply, submissions without a grade."
          />
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {items.slice(0, 6).map((item) => {
              const Icon = ATTENTION_ICON[item.kind];
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="block text-xs leading-[1.5] text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {counts.pendingUnpublishRequests > 0 ? (
          <p className="text-xs text-muted-foreground">
            A course with paid buyers cannot be taken down without admin approval —
            that is deliberate, and it is waiting in the review queue.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TopCourses() {
  const performance = useQuery(api.instructorStats.listInstructorCoursePerformance);

  if (performance === undefined) return <Skeleton className="h-64" />;

  // Courses with revenue first — that is the ranking an instructor wants. A
  // catalog where nothing has sold yet still gets shown, or the table would read
  // as "no courses" when the truth is "no sales".
  const rows = [
    ...performance.filter((row) => row.sales > 0),
    ...performance.filter((row) => row.sales === 0),
  ].slice(0, 5);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Course performance</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BookOpen}
            tone="brand"
            title="No courses yet"
            description="Publish a course and this becomes a revenue and completion breakdown per course."
            action={
              <Button render={<Link href="/dashboard/instructor/courses/new" />}>
                Create your first course
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
        <CardTitle>Course performance</CardTitle>
        <CardDescription>
          Ranked by what you have earned from each course.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead className="bg-surface-sunken">
              <tr className="border-b border-rule">
                <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Course</th>
                <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Learners</th>
                <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Completion</th>
                <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.courseId}
                  className="border-b border-rule last:border-0 transition-colors hover:bg-surface-sunken"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/instructor/courses/${row.courseId}`}
                      className="flex min-w-0 flex-col"
                    >
                      <span className="truncate text-sm font-medium text-foreground link-quiet">
                        {row.title}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {row.published ? null : <Badge variant="secondary">Draft</Badge>}
                        {row.price && row.price > 0 ? formatNaira(row.price) : "Free"}
                      </span>
                    </Link>
                  </td>
                  <td className="tabular px-5 py-3 text-sm text-foreground">
                    {row.enrollmentCount}
                    {row.activeLearners > 0 ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({row.activeLearners} active)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className="tabular w-10 text-sm text-foreground">
                        {row.completionRate}%
                      </span>
                      <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${row.completionRate}%` }}
                        />
                      </span>
                    </span>
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

function RecentActivity() {
  const activity = useQuery(api.instructorStats.listInstructorActivity, { limit: 8 });

  if (activity === undefined) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>
          Sales, new enrollments, completions and certificates across your
          courses.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {activity.events.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Nothing has happened yet"
            description="This fills up as learners enroll, buy, finish lessons and earn certificates."
          />
        ) : (
          <div className="px-5 pb-2">
            <ActivityFeed
              events={activity.events}
              formatTime={(timestamp) => formatRelativeTime(timestamp)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CourseListPreview() {
  const courses = useQuery(api.courses.listInstructorCourses);

  if (courses === undefined) return null;

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        tone="brand"
        title="No courses yet"
        description="You haven't created any courses. Start by sharing your expertise with the world."
        action={
          <Button render={<Link href="/dashboard/instructor/courses/new" />}>
            Create your first course
          </Button>
        }
      />
    );
  }

  const recent = [...courses].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <CardTitle>Your courses</CardTitle>
            <CardDescription>
              {pluralize(courses.length, "course")} ·{" "}
              {courses.filter((c) => c.published).length} published
            </CardDescription>
          </div>
          <Link
            href="/dashboard/instructor/courses"
            className="touch-target inline-flex shrink-0 items-center text-sm font-medium text-brand link-quiet"
          >
            See all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-rule border-y border-rule">
          {recent.map((course) => (
            <li key={course._id}>
              <Link
                href={`/dashboard/instructor/courses/${course._id}`}
                className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {course.title}
                </span>
                {course.published ? (
                  <Badge>Published</Badge>
                ) : (
                  <Badge variant="secondary">Draft</Badge>
                )}
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function InstructorOverviewPage() {
  const earnings = useQuery(api.instructorStats.getEarningsSummary, { months: 6 });
  // Only for the public-profile link below. The id has to come from the session,
  // not from anything on the page, or the button would link to the wrong person.
  const me = useQuery(api.users.getCurrentUser);

  const chartData =
    earnings?.series.map((point) => ({
      key: point.key,
      label: point.label,
      grossKobo: point.grossKobo,
      netEarningsKobo: point.netEarningsKobo,
      sales: point.sales,
    })) ?? [];

  const lifetimeSales = earnings?.lifetime.sales ?? 0;
  const avgOrder = earnings?.lifetime.averageOrderKobo ?? 0;
  const freeCourses = earnings?.freeCourseCount ?? 0;

  return (
    <PageShell>
      {/* Both banners sit above the header. The bank notice is the one thing on
          the page that gates money; the platform announcement is where an
          instructor-only notice (audience "instructors") reaches staff, since
          learners never land on this console. */}
      <AnnouncementBanner />
      <BankInfoBanner />
      <PageHeader
        title="Overview"
        description="What you have earned, how your learners are doing, and what needs fixing today."
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href="/dashboard/instructor/earnings" data-tour="earnings" />}
            >
              <Banknote className="h-4 w-4" />
              Earnings
            </Button>
            {/* The profile is public and shareable, but nothing else links to
                it, so without this the only way to find your own is to guess. */}
            {me && (
              <Button variant="outline" render={<Link href={`/instructors/${me._id}`} />}>
                <ExternalLink className="h-4 w-4" />
                Public profile
              </Button>
            )}
            <Button render={<Link href="/dashboard/instructor/courses/new" data-tour="create-course" />}>
              <PlusCircle className="h-4 w-4" />
              New course
            </Button>
          </>
        }
      />

      {earnings === undefined ? (
        <OverviewSkeleton />
      ) : (
        <>
          <section
            aria-label="Headline numbers"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <EarningsPlate />
            <StatTile
              label="Collected — all time"
              icon={Wallet}
              value={formatNaira(earnings.lifetime.grossKobo)}
              sub={`${pluralize(lifetimeSales, "settled sale")}${
                lifetimeSales > 0 ? ` · ${formatNaira(avgOrder)} average` : ""
              }`}
            />
            <StatTile
              label="This month"
              icon={TrendingUp}
              value={formatNaira(earnings.thisMonth.netEarningsKobo)}
              delta={{ percent: earnings.trendPercent, comparison: "30-day trend" }}
              sub={
                earnings.lifetime.refunds > 0
                  ? `${formatNaira(earnings.lifetime.refundedKobo)} refunded, excluded`
                  : `${earnings.paidCourseCount} paid · ${freeCourses} free`
              }
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Earnings over time</CardTitle>
              <CardDescription>
                Dashed line is what learners paid; the filled line is your{" "}
                {Math.round(earnings.revenueShare * 100)}% share of it, after
                refunds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <EarningsChart data={chartData} />
              ) : (
                <EmptyState
                  icon={Banknote}
                  title="No revenue data yet"
                  description="Set a price on a published course and this chart tracks what it earns each month."
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LearnerBlock />
        <AttentionBlock />
      </div>

      <TopCourses />

      {/* These two stack until there is room for them side by side, and the
          room needed is more than it looks. A feed row is a sentence plus a
          badge: in a 340px column — what a 1:1 split leaves at 1024px — the
          event had about twelve characters to work with, and the course
          title next to it had about as much. Equal columns from `xl` give
          both a full sentence and a full title. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RecentActivity />
        <CourseListPreview />
      </div>
    </PageShell>
  );
}
