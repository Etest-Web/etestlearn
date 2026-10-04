"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import Image from "next/image";
import { SearchX } from "lucide-react";
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
    <main className="mx-auto max-w-6xl px-4 py-12 space-y-10">
      <PageHeader
        title={query ? `Search results for "${query}"` : "Explore world-class courses"}
        description={
          query
            ? undefined
            : "Browse published courses created by you and approved instructors."
        }
      />

      {filteredCourses.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No courses found"
          description={
            query
              ? "Nothing in the catalog matches that search. Try different keywords."
              : "There are no published courses to browse yet. Check back shortly."
          }
        />
      ) : (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((course) => (
            <Card key={course._id} variant="interactive">
              <CardHeader>
                <Image src={course.thumbnailUrl || "/hero-backdrop.jpg"} alt={course.title} width={500} height={500} className="mb-2 h-48 w-full rounded-sm object-cover" />
                <div className="flex flex-wrap gap-2">
                  {course.category && (
                    <Badge variant="secondary">{course.category}</Badge>
                  )}
                  {course.level && (
                    <Badge variant="outline">{course.level}</Badge>
                  )}
                </div>
                <CardTitle className="line-clamp-2">{course.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm leading-body text-muted-foreground line-clamp-3">
                  {course.description}
                </p>
                <Button className="mt-auto w-full" variant="outline" onClick={() => router.push(`/courses/${course.slug}`)}>
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
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Loading catalog...</div>}>
      <CoursesWrapper />
    </Suspense>
  );
}
