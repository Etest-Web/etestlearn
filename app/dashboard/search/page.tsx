"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search as SearchIcon, ArrowRight, PlayCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";

  const searchedCourses = useQuery(
    api.courses.searchCourses,
    query ? { query } : "skip",
  );
  const allCourses = useQuery(api.courses.listPublishedCourses);

  const loading = searchedCourses === undefined || (query ? false : allCourses === undefined);

  if (loading) {
    return (
      <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full">
        <Skeleton className="h-20 w-full max-w-[200px] rounded-sm" />
        <Skeleton className="h-12 w-full max-w-[300px] rounded-sm" />
      </div>
    );
  }

  // Server-side full-text search across title, description, and category.
  const filteredCourses = query
    ? (searchedCourses ?? [])
    : (allCourses ?? []);

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      <PageHeader
        title={query ? `Search Results for "${query}"` : "Search Results"}
        description={`Found ${filteredCourses.length} available course${filteredCourses.length === 1 ? "" : "s"} matching your search.`}
      />

      {filteredCourses.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No courses found"
          description="We couldn't find any courses matching your keywords. Try a different search, or browse the full catalog."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
             /* The Card carries the surface — a hairline, no shadow — and the
                thumbnail sits flush against it. */
             <Card key={course._id} className="group gap-0 overflow-hidden p-0">
              {/* Thumbnail */}
              <div className="h-44 bg-surface-sunken relative overflow-hidden">
               <img
                 src={course.thumbnailUrl || "/hero-backdrop.jpg"}
                 alt={course.title}
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
               {course.category && (
                 <Badge
                   variant="outline"
                   className="absolute left-4 top-4 border-0 bg-background/90 backdrop-blur-sm"
                 >
                   {course.category}
                 </Badge>
               )}
             </div>

             {/* Content Body */}
             <div className="p-6 flex flex-col flex-1">
               <h3 className="text-xl font-semibold text-foreground mb-4 line-clamp-2 leading-snug">
                 {course.title}
               </h3>

               <p className="text-sm text-muted-foreground leading-[1.6] line-clamp-2 mb-6">
                 {course.description}
               </p>

               <div className="mt-auto flex items-center justify-between pt-4 border-t border-rule">
                  <Badge className="gap-1">
                    <PlayCircle />
                    Available
                  </Badge>
                  <Button
                    variant="outline"
                    size="icon"
                    render={<Link href={`/dashboard/courses/${course.slug}`} />}
                    className="hover:border-brand hover:bg-brand hover:text-brand-foreground"
                  >
                    <ArrowRight size={18} />
                  </Button>
               </div>
             </div>
           </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardSearchPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Searching...</div>}>
      <SearchResults />
    </Suspense>
  )
}
