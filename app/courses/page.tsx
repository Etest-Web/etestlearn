"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { Button } from "@/components/ui";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CoursesWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";

  // Full-text search runs against the Convex search index; empty queries list
  // all published courses.
  const searchedCourses = useQuery(
    api.courses.searchCourses,
    query ? { query } : "skip",
  );
  const allCourses = useQuery(api.courses.listPublishedCourses);
  const filteredCourses =
    (query ? (searchedCourses ?? []) : (allCourses ?? [])) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 space-y-8">
      <header className="space-y-3 text-center">
        <Badge variant="outline" className="uppercase tracking-wide">
          Courses
        </Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          {query ? `Search results for "${query}"` : "Explore world-class courses"}
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          {query ? "" : "Browse published courses created by you and approved instructors."}
        </p>
      </header>

      {filteredCourses.length === 0 ? (
        <p className="text-center text-muted-foreground mt-12 py-12 border border-dashed rounded-xl border-gray-200">
          No courses found matching your search. Try different keywords!
        </p>
      ) : (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((course) => (
            <Card key={course._id} className="flex flex-col">
              <CardHeader>
                <Image src={course.thumbnailUrl || "/hero-backdrop.jpg"} alt={course.title} width={500} height={500} className="w-full h-48 object-cover rounded-lg" />
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
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading catalog...</div>}>
      <CoursesWrapper />
    </Suspense>
  );
}

