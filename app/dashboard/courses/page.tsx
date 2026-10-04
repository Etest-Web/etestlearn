"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { PlayCircle, Award, Clock, ArrowRight } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

export default function MyLessonsPage() {
  const { user } = useUser();
  const enrollments = useQuery(api.enrollments.getUserEnrollments);
  const courses = useQuery(api.courses.listPublishedCourses);

  // Loading state
  if (enrollments === undefined || courses === undefined) {
    return (
      <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full">
        <Skeleton className="h-20 w-full max-w-[200px] rounded-xl" />
        <Skeleton className="h-12 w-full max-w-[300px] rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-72 rounded-[24px]" />
          <Skeleton className="h-72 rounded-[24px]" />
          <Skeleton className="h-72 rounded-[24px]" />
        </div>
      </div>
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
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      
      {/* Header section */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">
          My Lessons
        </h1>
        <p className="text-muted-foreground font-medium">
          You are enrolled in {enrolledCourses.length} course{enrolledCourses.length === 1 ? "" : "s"}. Let's keep making progress, {user?.firstName}!
        </p>
      </div>

      <Tabs defaultValue="all" className="w-full">
        {/* Three triggers need ~444px. Let them scroll horizontally instead of
            stretching the document; touch-target lifts them to 44px. */}
        <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="bg-card border border-border shadow-sm p-1 rounded-2xl h-auto inline-flex gap-2 w-max touch-target">
          <TabsTrigger 
            value="all" 
            className="rounded-xl px-4 sm:px-6 py-2.5 text-sm font-semibold data-active:bg-[#945DA3] data-active:text-white transition-all text-muted-foreground"
          >
            All Lessons ({enrolledCourses.length})
          </TabsTrigger>
          <TabsTrigger 
            value="in-progress" 
            className="rounded-xl px-4 sm:px-6 py-2.5 text-sm font-semibold data-active:bg-[#945DA3] data-active:text-white transition-all text-muted-foreground"
          >
            In Progress ({inProgressCourses.length})
          </TabsTrigger>
          <TabsTrigger 
            value="completed" 
            className="rounded-xl px-4 sm:px-6 py-2.5 text-sm font-semibold data-active:bg-[#945DA3] data-active:text-white transition-all text-muted-foreground"
          >
            Completed ({completedCourses.length})
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="all" className="mt-0 outline-none">
          <CourseGrid items={enrolledCourses} />
        </TabsContent>
        <TabsContent value="in-progress" className="mt-0 outline-none">
          <CourseGrid items={inProgressCourses} emptyMessage="You don't have any lessons currently in progress." />
        </TabsContent>
        <TabsContent value="completed" className="mt-0 outline-none">
          <CourseGrid items={completedCourses} emptyMessage="You haven't completed any lessons yet. Keep at it!" />
        </TabsContent>
      </Tabs>
      
    </div>
  );
}

// Reusable Grid Component
function CourseGrid({ 
  items, 
  emptyMessage = "You haven't enrolled in any lessons yet. Visit the catalog to get started." 
}: { 
  items: Array<{ enrollment: any; course: any }>;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border border-dashed border-border">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4 text-muted-foreground">
          <Clock size={32} />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">No Lessons Found</h3>
        <p className="text-muted-foreground max-w-sm text-center">{emptyMessage}</p>
        <Link 
          href="/courses" 
          className="mt-6 px-6 py-3 bg-foreground text-background font-bold rounded-xl hover:bg-foreground/90 transition-colors"
        >
          Explore Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => {
        const isCompleted = item.enrollment.progressPercent >= 100;
        
        return (
          <div 
            key={item.course._id} 
            className="flex flex-col bg-card rounded-[24px] border border-border shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
          >
            {/* Thumbnail */}
            <div className="h-44 bg-muted relative overflow-hidden">
              <img 
                src={item.course.thumbnailUrl || "/hero-backdrop.jpg"} 
                alt={item.course.title} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
              />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

               {/* Category Badge overlay */}
               {item.course.category && (
                 <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm text-xs font-bold px-3 py-1.5 rounded-lg text-foreground uppercase tracking-widest shadow-sm">
                  {item.course.category}
                </div>
              )}
            </div>

            {/* Content Body */}
            <div className="p-6 flex flex-col flex-1">
              <h3 className="font-bold text-xl text-foreground mb-4 line-clamp-2 leading-snug">
                {item.course.title}
              </h3>
              
              <div className="mt-auto flex flex-col gap-4">
                {/* Progress Details */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground">Progress</span>
                    <span className={isCompleted ? "text-emerald-500" : "text-[#945DA3]"}>
                      {Math.round(item.enrollment.progressPercent)}%
                    </span>
                  </div>
                  <Progress 
                    value={item.enrollment.progressPercent} 
                    className="h-2 bg-muted"
                  />
                </div>

                {/* Status Bar / Action */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                   <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                     {isCompleted ? (
                       <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md">
                         <Award size={14} />
                         Completed
                       </span>
                     ) : (
                       <span className="flex items-center gap-1 text-brand-ink bg-brand/20 px-2 py-1 rounded-md">
                         <PlayCircle size={14} />
                         In Progress
                       </span>
                     )}
                   </div>
                   <Link 
                     href={`/dashboard/courses/${item.course.slug}`} 
                     className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-[#945DA3] hover:border-[#945DA3] hover:text-white transition-colors"
                   >
                     <ArrowRight size={18} />
                   </Link>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
