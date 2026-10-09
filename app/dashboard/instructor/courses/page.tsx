"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/instructor-console";
import { formatNaira } from "@/lib/instructor-earnings";
import { formatRelativeTime, pluralize } from "@/lib/utils";
import { ArrowRight, BookOpen, Image as ImageIcon, PlusCircle, Users } from "lucide-react";
import Image from "next/image";

/**
 * My courses — the management surface for the catalog itself.
 *
 * Lives at its own route rather than on the overview because it is a list you
 * *work in* (open one, edit it, publish it), not a summary you read. Each card
 * carries the two numbers that decide what to work on next — learners and
 * earnings — so the choice of which course to open is made here rather than by
 * opening five courses to find out.
 *
 * The filters are `segmented` tabs rather than a dropdown: three peer views of
 * one list, small enough to show all of them at once.
 */

type Filter = "all" | "published" | "drafts" | "earning";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "drafts", label: "Drafts" },
  { value: "earning", label: "Earning" },
];

function matchesFilter(
  filter: Filter,
  course: { _id: string; published: boolean; price?: number },
  earningsByCourse: Map<string, number>,
): boolean {
  switch (filter) {
    case "published":
      return course.published;
    case "drafts":
      return !course.published;
    case "earning":
      return (earningsByCourse.get(course._id) ?? 0) > 0;
    case "all":
      return true;
  }
}

export default function InstructorCoursesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const courses = useQuery(api.courses.listInstructorCourses);
  const performance = useQuery(api.instructorStats.listInstructorCoursePerformance);

  const earningsByCourse = new Map(
    (performance ?? []).map((row) => [row.courseId as string, row.netEarningsKobo]),
  );
  const learnersByCourse = new Map(
    (performance ?? []).map((row) => [row.courseId as string, row.enrollmentCount]),
  );
  const completionByCourse = new Map(
    (performance ?? []).map((row) => [row.courseId as string, row.completionRate]),
  );

  const visible =
    courses?.filter((course) => matchesFilter(filter, course, earningsByCourse)) ?? [];

  const counts = {
    all: courses?.length ?? 0,
    published: courses?.filter((c) => c.published).length ?? 0,
    drafts: courses?.filter((c) => !c.published).length ?? 0,
    earning: courses?.filter((c) => (earningsByCourse.get(c._id) ?? 0) > 0).length ?? 0,
  };

  return (
    <PageShell>
      <PageHeader
        title="My courses"
        description={
          courses
            ? `${pluralize(courses.length, "course")} · ${counts.published} published · ${counts.drafts} draft${counts.drafts === 1 ? "" : "s"}`
            : "Loading your catalog."
        }
        actions={
          <Button render={<Link href="/dashboard/instructor/courses/new" />}>
            <PlusCircle className="h-4 w-4" />
            New course
          </Button>
        }
      />

      {courses === undefined ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="flex flex-col overflow-hidden">
              <Skeleton className="aspect-[16/10] w-full" />
              <CardContent className="flex flex-col gap-3 pt-5">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
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
            <Button render={<Link href="/dashboard/instructor/courses/new" />}>
              Create your first course
            </Button>
          }
        />
      ) : (
        <>
          <SegmentedControl
            label="Filter courses"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((item) => ({
              value: item.value,
              label: item.label,
              count: counts[item.value],
            }))}
          />

          {visible.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={
                filter === "earning"
                  ? "No course has earned yet"
                  : filter === "drafts"
                    ? "No drafts — everything is published"
                    : "Nothing in this view"
              }
              description={
                filter === "earning"
                  ? "Once a learner pays for one of your courses, it appears here with its earnings to date."
                  : filter === "drafts"
                    ? "Drafts are private to you until you publish them."
                    : "Try a different filter."
              }
              tone="brand"
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((course) => {
                const learners = learnersByCourse.get(course._id) ?? 0;
                const earned = earningsByCourse.get(course._id) ?? 0;
                const completion = completionByCourse.get(course._id) ?? 0;

                return (
                  <Card
                    key={course._id}
                    variant="interactive"
                    className="flex-col gap-0 overflow-hidden p-0"
                  >
                    <Link
                      href={`/dashboard/instructor/courses/${course._id}`}
                      className="flex h-full flex-col focus-visible:outline-none"
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-rule bg-surface-sunken">
                        {course.thumbnailUrl ? (
                          <Image
                            src={course.thumbnailUrl}
                            alt=""
                            fill
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="object-cover transition-transform duration-500 group-hover/card:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                            <ImageIcon className="h-10 w-10" aria-hidden />
                          </div>
                        )}
                        <div className="absolute top-3 right-3">
                          {course.published ? (
                            <Badge>Published</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <h2 className="line-clamp-2 leading-tight transition-colors group-hover/card:text-brand">
                          {course.title}
                        </h2>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span className="tabular font-medium text-foreground">
                            {course.price && course.price > 0
                              ? formatNaira(course.price)
                              : "Free"}
                          </span>
                          {course.category ? (
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="h-3.5 w-3.5" aria-hidden />
                              {course.category}
                            </span>
                          ) : null}
                          {course.level ? (
                            <span className="capitalize">{course.level}</span>
                          ) : null}
                        </div>

                        {/* The numbers that decide which course to open next. */}
                        <dl className="mt-auto grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3">
                          {[
                            {
                              label: "Learners",
                              value: learners,
                              icon: Users,
                            },
                            {
                              label: "Complete",
                              value: learners > 0 ? `${completion}%` : "—",
                              icon: null,
                            },
                            {
                              label: "Earned",
                              value: formatNaira(earned),
                              icon: null,
                            },
                          ].map((stat) => (
                            <div key={stat.label} className="px-2 first:pl-0 last:pr-0">
                              <dt className="eyebrow">{stat.label}</dt>
                              <dd className="tabular text-sm font-semibold text-foreground">
                                {stat.value}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <p className="text-xs text-muted-foreground">
                          Updated {formatRelativeTime(course.updatedAt)}
                        </p>
                      </div>
                    </Link>

                    <div className="border-t border-rule p-3">
                      <Button
                        className="w-full"
                        variant="outline"
                        render={
                          <Link href={`/dashboard/instructor/courses/${course._id}`} />
                        }
                      >
                        Manage course
                        <ArrowRight className="h-4 w-4 transition-transform group-hover/card:translate-x-1" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
