"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { PlusCircle, BookOpen, LayoutDashboard, Image as ImageIcon, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";

export default function InstructorCoursesPage() {
  const courses = useQuery(api.courses.listInstructorCourses);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Instructor Dashboard</h2>
          <p className="text-sm text-muted-foreground font-medium">Manage your courses, content, and students.</p>
        </div>
        <Button 
          className="w-full sm:w-auto shadow-md hover:shadow-lg transition-all active:scale-95" 
          onClick={() => router.push("/dashboard/instructor/courses/new")}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Course
        </Button>
      </div>

      {courses === undefined ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col overflow-hidden">
              <div className="aspect-[16/10] bg-muted w-full" />
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="flex-1">
                <Skeleton className="h-4 w-full" />
              </CardContent>
              <CardFooter className="pt-4 border-t">
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/30 text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-background shadow-sm flex items-center justify-center mb-6">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold">No courses yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto mt-2">
            You haven&apos;t created any courses. Start by sharing your expertise with the world!
          </p>
          <Button variant="default" onClick={() => router.push("/dashboard/instructor/courses/new")}>
            Create your first course
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Card key={course._id} className="flex flex-col overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                {course.thumbnailUrl ? (
                  <Image
                    src={course.thumbnailUrl}
                    alt={course.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-12 w-12 opacity-20" />
                  </div>
                )}
                <div className="absolute top-3 right-3">
                  {course.published ? (
                    <Badge className="bg-emerald-500/90 text-white border-none hover:bg-emerald-500/90 shadow-sm">Published</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm shadow-sm">Draft</Badge>
                  )}
                </div>
              </div>

              <CardHeader className="p-5">
                <div className="space-y-2">
                  <CardTitle className="line-clamp-2 text-lg leading-tight group-hover:text-brand transition-colors">
                    {course.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 text-sm">
                    {course.description || "No description provided."}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="px-5 pb-0 flex-1">
                <div className="flex flex-wrap gap-3 text-xs font-medium text-muted-foreground">
                  {course.category && (
                    <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                      <BookOpen className="h-3.5 w-3.5" />
                      {course.category}
                    </div>
                  )}
                  {course.level && (
                    <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                      <span className="opacity-70">Level:</span>
                      <span className="text-foreground capitalize">{course.level}</span>
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="p-5 pt-6 border-t bg-muted/5 mt-auto">
                <Button 
                  className="w-full shadow-sm" 
                  variant="outline" 
                  onClick={() => router.push(`/dashboard/instructor/courses/${course._id}`)}
                >
                  Manage Course
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
