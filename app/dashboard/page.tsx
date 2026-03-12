"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const enrollments = useQuery(api.enrollments.getUserEnrollments);
  const courses = useQuery(api.courses.listPublishedCourses);

  // Loading state
  if (enrollments === undefined || courses === undefined) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </section>
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-5 w-48" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-4 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const enrolledCourses = (enrollments ?? [])
    .map((enrollment) => {
      const course = (courses ?? []).find((c) => c._id === enrollment.courseId);
      return course ? { enrollment, course } : null;
    })
    .filter(Boolean) as { enrollment: any; course: any }[];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My learning</h1>
        <p className="text-sm text-muted-foreground">
          Continue where you left off, and keep an eye on your overall progress
          across courses.
        </p>
      </section>

      <Tabs defaultValue="courses">
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="courses">My Courses</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>
          <Link
            href="/courses"
            className="text-xs font-medium text-primary hover:underline"
          >
            Browse catalog
          </Link>
        </div>

        <TabsContent value="courses" className="mt-4 space-y-4">
          {enrolledCourses.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                You&apos;re not enrolled in any courses yet.{" "}
                <Link href="/courses" className="text-primary underline">
                  Browse the catalog
                </Link>{" "}
                and enroll to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {enrolledCourses.map(({ course, enrollment }) => (
                <Card key={course._id} className="flex flex-col">
                  <CardHeader className="space-y-1">
                    <div className="flex flex-wrap gap-2">
                      {course.category && (
                        <Badge variant="secondary">{course.category}</Badge>
                      )}
                      {course.level && (
                        <Badge variant="outline" className="text-xs">
                          {course.level}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="line-clamp-2">
                      {course.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Course progress</span>
                        <span>{Math.round(enrollment.progressPercent)}%</span>
                      </div>
                      <Progress value={enrollment.progressPercent} />
                    </div>
                    <Link
                      href={`/dashboard/courses/${course.slug}`}
                      className="mt-auto text-sm font-medium text-primary hover:underline"
                    >
                      Continue learning
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="progress" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Overall progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {enrolledCourses.length === 0 ? (
                <p>
                  Enroll in a course to start tracking your learning journey.
                </p>
              ) : (
                <>
                  <p>
                    You&apos;re enrolled in {enrolledCourses.length} course
                    {enrolledCourses.length > 1 ? "s" : ""}.
                  </p>
                  {/* Placeholder summary; we can compute richer stats later */}
                  <p>
                    Detailed charts and completion analytics will appear here as
                    we build out the progress dashboard.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

