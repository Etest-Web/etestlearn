"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { PlayCircle, Award, ArrowRight, BookOpen } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/dashboard-shell";

export default function MyLessonsPage() {
  const { user } = useUser();
  const enrollments = useQuery(api.enrollments.getUserEnrollments);
  const courses = useQuery(api.courses.listPublishedCourses);

  // Loading state
  if (enrollments === undefined || courses === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-20 w-full max-w-[200px] rounded-sm" />
        <Skeleton className="h-12 w-full max-w-[300px] rounded-sm" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-72 rounded-sm" />
          <Skeleton className="h-72 rounded-sm" />
          <Skeleton className="h-72 rounded-sm" />
        </div>
      </PageShell>
    );
  }

  // Map enrollments to corresponding courses
  const enrolledCourses = enrollments
    .map((enrollment) => {
      const course = courses.find((c) => c._id === enrollment.courseId);
      return course ? { enrollment, course } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const inProgressCourses = enrolledCourses.filter(
    (item) => item.enrollment.progressPercent < 100
  );

  const completedCourses = enrolledCourses.filter(
    (item) => item.enrollment.progressPercent >= 100
  );

  return (
    <PageShell>
      <PageHeader
        title="My Lessons"
        description={`You are enrolled in ${enrolledCourses.length} course${enrolledCourses.length === 1 ? "" : "s"}. Let's keep making progress, ${user?.firstName}!`}
      />

      <Tabs defaultValue="all" className="w-full">
        {/* All / In progress / Completed are peer views of one list, so the
            segmented variant is right here rather than the rule bar. Three
            triggers need ~444px: they scroll horizontally instead of widening the
            document, and `touch-target` lifts them to 44px. */}
        <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant="segmented" className="w-max touch-target">
          <TabsTrigger value="all" className="tabular">
            All Lessons ({enrolledCourses.length})
          </TabsTrigger>
          <TabsTrigger value="in-progress" className="tabular">
            In Progress ({inProgressCourses.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="tabular">
            Completed ({completedCourses.length})
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="all" className="mt-0 outline-none">
          <CourseGrid items={enrolledCourses} />
        </TabsContent>
        <TabsContent value="in-progress" className="mt-0 outline-none">
          <CourseGrid items={inProgressCourses} emptyTitle="Nothing in progress" emptyMessage="You don't have any lessons currently in progress." />
        </TabsContent>
        <TabsContent value="completed" className="mt-0 outline-none">
          <CourseGrid items={completedCourses} emptyTitle="Nothing completed yet" emptyMessage="You haven't completed any lessons yet. Keep at it!" />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

// Reusable Grid Component
function CourseGrid({
  items,
  emptyTitle = "No Lessons Found",
  emptyMessage = "You haven't enrolled in any lessons yet. Visit the catalog to get started."
}: {
  items: Array<{ enrollment: any; course: any }>;
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title={emptyTitle}
        description={emptyMessage}
        action={
          <Button render={<Link href="/courses" />}>Explore Catalog</Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => {
        const isCompleted = item.enrollment.progressPercent >= 100;

        return (
          /* The Card carries the surface: no radius, no shadow, and the rule on
             its edge does the separating. `gap-0 p-0` lets the thumbnail sit
             flush, which is why no image-radius override is needed. */
          <Card key={item.course._id} className="group gap-0 overflow-hidden p-0">
            {/* Thumbnail */}
            <div className="h-44 bg-surface-sunken relative overflow-hidden">
              <img
                src={item.course.thumbnailUrl || "/hero-backdrop.jpg"}
                alt={item.course.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

               {/* Category Badge overlay */}
               {item.course.category && (
                 <Badge
                   variant="outline"
                   className="absolute left-4 top-4 border-0 bg-background/90 backdrop-blur-sm"
                 >
                  {item.course.category}
                </Badge>
              )}
            </div>

            {/* Content Body */}
            <div className="p-6 flex flex-col flex-1">
              <h3 className="text-xl font-semibold text-foreground mb-4 line-clamp-2 leading-snug">
                {item.course.title}
              </h3>

              <div className="mt-auto flex flex-col gap-4">
                {/* Progress Details */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="eyebrow">Progress</span>
                    <span
                      className={
                        isCompleted ? "tabular text-emerald-600" : "tabular text-brand"
                      }
                    >
                      {Math.round(item.enrollment.progressPercent)}%
                    </span>
                  </div>
                  <Progress
                    value={item.enrollment.progressPercent}
                    className="h-2"
                  />
                </div>

                {/* Status Bar / Action */}
                <div className="flex items-center justify-between pt-4 border-t border-rule">
                   {/* The word is in the badge, so the status never rides on
                       colour alone. */}
                   {isCompleted ? (
                     <Badge variant="success" className="gap-1 text-emerald-600">
                       <Award />
                       Completed
                     </Badge>
                   ) : (
                     <Badge className="gap-1">
                       <PlayCircle />
                       In Progress
                     </Badge>
                   )}
                   <Button
                     variant="outline"
                     size="icon"
                     render={<Link href={`/dashboard/courses/${item.course.slug}`} />}
                     className="hover:border-brand hover:bg-brand hover:text-brand-foreground"
                   >
                     <ArrowRight size={18} />
                   </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
