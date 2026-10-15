"use client";

import { useQuery } from "convex/react";
import { Megaphone } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Published course announcements, as a learner (or the course owner) reads them
 * on the course page.
 *
 * Renders nothing at all when the course has none: an enrolled learner opening
 * a course should see the curriculum, not an empty box apologising for the
 * absence of news. The server serves published rows only, so a draft the
 * instructor is still writing never appears here.
 */
export function CourseAnnouncementsList({
  courseId,
}: {
  courseId: Id<"courses">;
}) {
  const announcements = useQuery(api.courseAnnouncements.listForCourse, {
    courseId,
  });

  if (announcements === undefined) return <Skeleton className="h-24 w-full" />;
  if (announcements.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="rule-heading eyebrow">Announcements</h2>
      <Card>
        <CardContent className="divide-y divide-rule px-0">
          {announcements.map((announcement) => (
            <article key={announcement._id} className="px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Megaphone className="size-4 text-brand" aria-hidden />
                  {announcement.title}
                </h3>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(announcement.publishedAt).toISOString()}
                >
                  {new Date(announcement.publishedAt).toLocaleDateString("en-NG", {
                    dateStyle: "medium",
                  })}
                </time>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-[1.7] text-muted-foreground">
                {announcement.body}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Posted by {announcement.authorName}
              </p>
            </article>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
