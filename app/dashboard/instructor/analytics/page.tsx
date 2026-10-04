"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Users, Trophy, Target, LineChart } from "lucide-react";

function formatNaira(kobo?: number) {
  if (!kobo || kobo <= 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

/**
 * One course's numbers. The three figures are a hairline-divided row rather
 * than three nested boxes — the rules do the separating, which is why the
 * values can be set large and tabular without the row reading as three cards.
 */
function CourseAnalyticsCard({
  courseId,
  title,
}: {
  courseId: Id<"courses">;
  title: string;
}) {
  const analytics = useQuery(api.courses.getCourseAnalytics, { courseId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Enrollments &amp; quiz performance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {analytics === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <dl className="grid grid-cols-3 divide-x divide-rule border-y border-rule">
              <div className="flex flex-col-reverse items-center gap-1 px-2 py-3 sm:px-3">
                <dt className="eyebrow">Enrolled</dt>
                <dd className="tabular text-xl font-semibold text-foreground sm:text-2xl">
                  {analytics.enrollmentCount}
                </dd>
                <Users aria-hidden className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col-reverse items-center gap-1 px-2 py-3 sm:px-3">
                <dt className="eyebrow">Completed</dt>
                <dd className="tabular text-xl font-semibold text-foreground sm:text-2xl">
                  {analytics.completionRate}%
                </dd>
                <Trophy aria-hidden className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col-reverse items-center gap-1 px-2 py-3 sm:px-3">
                <dt className="eyebrow">Avg score</dt>
                <dd className="tabular text-xl font-semibold text-foreground sm:text-2xl">
                  {analytics.averageQuizScore != null ? `${analytics.averageQuizScore}%` : "—"}
                </dd>
                <Target aria-hidden className="h-4 w-4 text-muted-foreground" />
              </div>
            </dl>

            {/* The chart sits on a well rather than floating: a hairline and a
                sunken plane, no shadow. */}
            <div className="h-32 border border-rule bg-surface-sunken px-2 py-3 text-muted-foreground">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Enrolled", value: analytics.enrollmentCount },
                    {
                      name: "Completed",
                      value: Math.round(
                        (analytics.completionRate / 100) * analytics.enrollmentCount,
                      ),
                    },
                    { name: "Attempts", value: analytics.attemptCount },
                  ]}
                  margin={{ top: 0, right: 0, bottom: 0, left: -25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--rule)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} stroke="currentColor" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} stroke="currentColor" />
                  <RechartsTooltip
                    cursor={{ fill: "transparent" }}
                    contentStyle={{
                      borderRadius: "var(--radius-md)",
                      // A tooltip is an overlay layer, so it is the one place a
                      // shadow is load-bearing — and the border does the rest.
                      boxShadow: "0 12px 32px -8px oklch(14.5% 0.012 318.82 / 0.16)",
                      border: "1px solid var(--rule)",
                      backgroundColor: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="value" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function InstructorAnalyticsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const courses = useQuery(api.courses.listInstructorCourses);

  if (currentUser === undefined || courses === undefined) {
    return (
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8">
      <PageHeader
        title="Analytics"
        description="Enrollment and performance insights for each of your courses."
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No courses to report on"
          description="Analytics appear here once you have created a course and learners have started enrolling."
          tone="brand"
        />
      ) : (
        <div className="grid gap-8 md:grid-cols-2">
          {courses.map((course) => (
            <div key={course._id} className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Badge variant={course.published ? "default" : "secondary"}>
                  {course.published ? "Published" : "Draft"}
                </Badge>
                <span className="tabular text-xs text-muted-foreground">
                  {formatNaira(course.price)}
                </span>
              </div>
              <CourseAnalyticsCard courseId={course._id} title={course.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}