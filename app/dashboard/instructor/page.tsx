"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui";
import { PlusCircle, BookOpen, Image as ImageIcon, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";

export default function InstructorCoursesPage() {
  const courses = useQuery(api.courses.listInstructorCourses);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Instructor"
        title="Instructor Dashboard"
        description="Manage your courses, content, and students."
        actions={
          <Button onClick={() => router.push("/dashboard/instructor/courses/new")}>
            <PlusCircle className="h-4 w-4" />
            Create Course
          </Button>
        }
      />

      {courses === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col overflow-hidden">
              <div className="aspect-[16/10] bg-surface-sunken w-full" />
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="flex-1">
                <Skeleton className="h-4 w-full" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-9 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="You haven't created any courses. Start by sharing your expertise with the world."
          tone="brand"
          action={
            <Button onClick={() => router.push("/dashboard/instructor/courses/new")}>
              Create your first course
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Card
              key={course._id}
              className="group flex-col gap-0 overflow-hidden p-0 transition-colors hover:border-rule-strong"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-rule bg-surface-sunken">
                {course.thumbnailUrl ? (
                  <Image
                    src={course.thumbnailUrl}
                    alt={course.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <ImageIcon className="h-12 w-12" />
                  </div>
                )}
                <div className="absolute top-3 right-3">
                  {course.published ? (
                    <Badge variant="default">Published</Badge>
                  ) : (
                    <Badge variant="secondary">Draft</Badge>
                  )}
                </div>
              </div>

              <CardHeader className="px-5 pt-5">
                <div className="space-y-2">
                  <CardTitle className="line-clamp-2 leading-tight transition-colors group-hover:text-brand">
                    {course.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {course.description || "No description provided."}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="px-5 pb-5 flex-1">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {course.category && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" />
                      {course.category}
                    </span>
                  )}
                  {course.level && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="eyebrow">Level</span>
                      <span className="text-foreground capitalize">{course.level}</span>
                    </span>
                  )}
                </div>
              </CardContent>

              <CardFooter className="px-5 pb-5 mt-auto">
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => router.push(`/dashboard/instructor/courses/${course._id}`)}
                >
                  Manage Course
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}