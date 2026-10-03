"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { Badge } from "@/components/ui";
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
import { BarChart3, Users, Trophy, Target } from "lucide-react";

function formatNaira(kobo?: number) {
  if (!kobo || kobo <= 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

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
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Enrollments &amp; quiz performance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {analytics === undefined ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-2 text-center">
              <div className="rounded-lg border p-2 sm:p-3">
                <Users className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-lg sm:text-xl font-bold mt-1">{analytics.enrollmentCount}</p>
                <p className="text-[11px] text-muted-foreground">Enrolled</p>
              </div>
              <div className="rounded-lg border p-2 sm:p-3">
                <Trophy className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-lg sm:text-xl font-bold mt-1">{analytics.completionRate}%</p>
                <p className="text-[11px] text-muted-foreground">Completed</p>
              </div>
              <div className="rounded-lg border p-2 sm:p-3">
                <Target className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-lg sm:text-xl font-bold mt-1">
                  {analytics.averageQuizScore != null ? `${analytics.averageQuizScore}%` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">Avg score</p>
              </div>
            </div>

            <div className="h-32 text-border">
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
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} stroke="currentColor" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} stroke="currentColor" />
                  <RechartsTooltip
                    cursor={{ fill: "transparent" }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      backgroundColor: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="value" fill="#945DA3" radius={[6, 6, 0, 0]} maxBarSize={48} />
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
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enrollment and performance insights for each of your courses.
        </p>
      </div>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You haven&apos;t created any courses yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {courses.map((course) => (
            <div key={course._id} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Badge variant={course.published ? "default" : "secondary"}>
                  {course.published ? "Published" : "Draft"}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatNaira(course.price)}</span>
              </div>
              <CourseAnalyticsCard courseId={course._id} title={course.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
