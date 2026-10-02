"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { PlusCircle, BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

import { Skeleton } from "@/components/ui/skeleton";

export default function InstructorCoursesPage() {
  const courses = useQuery(api.courses.listInstructorCourses);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Instructor Dashboard</h2>
          <p className="text-sm text-muted-foreground">Manage your courses and content.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => router.push("/dashboard/instructor/courses/new")}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Course
        </Button>
      </div>

      {courses === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-2 w-full">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2 mt-2" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 mt-4">
                <Skeleton className="h-4 w-full" />
              </CardContent>
              <CardFooter className="pt-4 border-t">
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No courses yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
            You haven&apos;t created any courses. Start by creating your first course to share your knowledge.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => router.push("/dashboard/instructor/courses/new")}>
            Create your first course
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Card key={course._id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <CardTitle className="line-clamp-2 leading-tight">{course.title}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-2">
                      {course.description || "No description provided."}
                    </CardDescription>
                  </div>
                  {course.published ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">Published</Badge>
                  ) : (
                    <Badge variant="secondary">Draft</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex gap-4 text-sm text-muted-foreground mt-4">
                  {course.category && (
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-4 w-4" />
                      {course.category}
                    </span>
                  )}
                  {course.level && (
                    <span className="flex items-center gap-1">
                      <span className="font-semibold">L</span>
                      {course.level}
                    </span>
                  )}
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t">
                <Button className="w-full" variant="outline" onClick={() => router.push(`/dashboard/instructor/courses/${course._id}`)}>
                  Manage Course
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
