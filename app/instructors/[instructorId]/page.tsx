"use client";

import { useQuery } from "convex/react";
import { useParams, notFound, useRouter } from "next/navigation";
import Image from "next/image";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Globe, MapPin, SearchX } from "lucide-react";
import { isConvexId, websiteHref, websiteLabel } from "@/lib/instructors";

/**
 * A public instructor profile.
 *
 * Reachable signed out — `/instructors` is in the public route list in
 * `proxy.ts` — because the whole point is a page an instructor can share. The
 * data comes from `instructors.getPublicProfile`, which returns only instructors
 * and admins and only the fields that are safe to print; this page never touches
 * a user document.
 */

function ProfileSkeleton() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:py-12">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </main>
  );
}

export default function InstructorProfilePage() {
  const router = useRouter();
  const params = useParams();
  const rawId = typeof params?.instructorId === "string" ? params.instructorId : undefined;
  const instructorId = isConvexId(rawId) ? (rawId as Id<"users">) : undefined;

  const data = useQuery(
    api.instructors.getPublicProfile,
    instructorId ? { instructorId } : "skip",
  );

  // A malformed id is a 404, not a blank page: there is nothing to retry.
  if (!instructorId) notFound();

  if (data === undefined) return <ProfileSkeleton />;

  // Null covers a missing user, a suspended account, and a learner id — the
  // server refuses all three identically, so the page can too.
  if (data === null) notFound();

  const { instructor, courses } = data;
  const joined = new Date(instructor.joinedAt).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Image
          src={instructor.imageUrl || "/certf.jpeg"}
          alt={instructor.name}
          width={160}
          height={160}
          className="h-20 w-20 shrink-0 rounded-full object-cover sm:h-24 sm:w-24"
        />
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <h1 className="font-outfit text-3xl leading-tight">
              {instructor.name}
              {instructor.pronouns && (
                <span className="ml-2 align-middle text-sm font-normal text-muted-foreground">
                  ({instructor.pronouns})
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Instructor on Glypha Learn since {joined}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              {data.courseCount} {data.courseCount === 1 ? "published course" : "published courses"}
            </span>
            {instructor.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {instructor.location}
              </span>
            )}
            {instructor.website && (
              <a
                href={websiteHref(instructor.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-foreground"
              >
                <Globe className="h-4 w-4" />
                {websiteLabel(instructor.website)}
              </a>
            )}
          </div>

          {instructor.bio && (
            <p className="max-w-2xl text-sm leading-body text-muted-foreground">
              {instructor.bio}
            </p>
          )}
        </div>
      </header>

      <section className="space-y-6">
        <h2 className="font-outfit text-2xl">Courses</h2>

        {courses.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No published courses yet"
            description={`${instructor.name} has not published a course yet. Check back soon.`}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {courses.map((course) => (
              <Card key={course._id} variant="interactive">
                <CardHeader>
                  <Image
                    src={course.thumbnailUrl || "/certf.jpeg"}
                    alt={course.title}
                    width={500}
                    height={500}
                    className="mb-2 h-40 w-full rounded-sm object-cover"
                  />
                  <div className="flex flex-wrap gap-2">
                    {course.category && <Badge variant="secondary">{course.category}</Badge>}
                    {course.level && <Badge variant="outline">{course.level}</Badge>}
                  </div>
                  <CardTitle className="line-clamp-2">{course.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="text-sm leading-body text-muted-foreground line-clamp-3">
                    {course.description}
                  </p>
                  <Button
                    className="mt-auto w-full"
                    variant="outline"
                    onClick={() => router.push(`/courses/${course.slug}`)}
                  >
                    View course
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
