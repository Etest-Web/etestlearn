"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { Button } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";

export default function CoursesPage() {
  const courses = useQuery(api.courses.listPublishedCourses) ?? [];
  const router = useRouter();

  return (
    <>
    <Navbar />
    <main className="mx-auto max-w-6xl px-4 py-12 space-y-8">
      <header className="space-y-3 text-center">
        <Badge variant="outline" className="uppercase tracking-wide">
          Courses
        </Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Explore world-class courses
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          Browse published courses created by you and approved instructors.
        </p>
      </header>

      {courses.length === 0 ? (
        <p className="text-center text-muted-foreground">
          No courses published yet. Once you add courses in Convex, they will
          appear here.
        </p>
      ) : (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course._id} className="flex flex-col">
              <CardHeader>
                <div className="flex flex-wrap gap-2 mb-2">
                  {course.category && (
                    <Badge variant="secondary">{course.category}</Badge>
                  )}
                  {course.level && (
                    <Badge variant="outline" className="text-xs">
                      {course.level}
                    </Badge>
                  )}
                </div>
                <CardTitle className="line-clamp-2">{course.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {course.description}
                </p>
                <Button className="mt-auto" onClick={() => router.push(`/courses/${course.slug}`)}>
                  View course
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </main>
    </>
  );
}

