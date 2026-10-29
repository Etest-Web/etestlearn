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
import { StarRating } from "@/components/star-rating";
import { BookmarkListButton } from "@/components/bookmark-button";
import { averageRating, formatRating } from "@/lib/reviews";

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
  // One bookmark set for the whole catalog rather than a subscription per card:
  // fifty hearts asking the same question fifty times is fifty round trips on a
  // page that is otherwise a single query.
  const bookmarkedIds = useQuery(api.bookmarks.listBookmarkedCourseIds, {});
  const savedCourseIds = bookmarkedIds ? new Set(bookmarkedIds) : null;
  const filteredCourses =
    (query ? (searchedCourses ?? []) : (allCourses ?? [])) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 space-y-10">
      <PageHeader
        title={query ? `Search results for "${query}"` : "Explore world-class courses"}
        description={
          query
            ? undefined
            : (
              <>
                <p className="mb-4 text-base leading-body">
                  Every course in this catalog is hand-picked and reviewed before it goes
                  live — no filler, no outdated tutorials. Whether you're starting a
                  <strong>graphic design course</strong> to build a portfolio, a
                  <strong>web development course</strong> to switch careers, or a 
                  <strong>data analysis course</strong> to level up at work, you'll
                  find structured lessons, real assessments, and the price in naira shown
                  before you enroll.
                </p>
                <p className="text-sm leading-body text-muted-foreground">
                  Free and paid options available. All courses include quizzes, a
                  verifiable certificate with its own public verification page, and a
                  preference star on your GlyphaWeb profile once you complete the
                  assessment.
                </p>
              </>
            )
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
          {filteredCourses.map((course) => {
            const average = averageRating(course.ratingSum, course.ratingCount);
            return (
              <Card key={course._id} variant="interactive" className="relative">
                <BookmarkListButton
                  courseId={course._id}
                  bookmarkedIds={savedCourseIds}
                  className="absolute right-3 top-3 z-10"
                />
                <CardHeader>
                  <Image src={course.thumbnailUrl || "/certf.jpeg"} alt={course.title} width={500} height={500} className="mb-2 h-48 w-full rounded-sm object-cover" />
                  <div className="flex flex-wrap gap-2">
                    {course.category && (
                      <Badge variant="secondary">{course.category}</Badge>
                    )}
                    {course.level && (
                      <Badge variant="outline">{course.level}</Badge>
                    )}
                  </div>
                  <CardTitle className="line-clamp-2">{course.title}</CardTitle>
                  {average !== null && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <StarRating value={average} size="xs" />
                      <span className="tabular text-xs text-muted-foreground">
                        {formatRating(average)}
                        {course.ratingCount ? ` · ${course.ratingCount}` : ""}
                      </span>
                    </div>
                  )}
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
            );
          })}
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
