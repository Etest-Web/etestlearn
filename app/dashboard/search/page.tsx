"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search as SearchIcon, ArrowRight, PlayCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

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
        <Skeleton className="h-20 w-[200px] rounded-xl" />
        <Skeleton className="h-12 w-[300px] rounded-xl" />
      </div>
    );
  }

  // Server-side full-text search across title, description, and category.
  const filteredCourses = query
    ? (searchedCourses ?? [])
    : (allCourses ?? []);

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      {/* Header section */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">
          Search Results {query && `for "${query}"`}
        </h1>
        <p className="text-gray-500 font-medium">
          Found {filteredCourses.length} available course{filteredCourses.length === 1 ? "" : "s"} matching your search.
        </p>
      </div>

      {filteredCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 text-gray-400">
            <SearchIcon size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Courses Found</h3>
          <p className="text-gray-500 max-w-sm text-center">We couldn't find any courses matching your keywords.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
             <div 
             key={course._id} 
             className="flex flex-col bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
           >
             {/* Thumbnail */}
             <div className="h-44 bg-gray-100 relative overflow-hidden">
               <img 
                 src={course.thumbnailUrl || "/hero-backdrop.jpg"} 
                 alt={course.title} 
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
               />
               <div className="absolute inset-0 bg-gradient-to-t from-gray-900/50 to-transparent" />
               {course.category && (
                 <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-xs font-bold px-3 py-1.5 rounded-lg text-gray-900 uppercase tracking-widest shadow-sm">
                   {course.category}
                 </div>
               )}
             </div>
 
             {/* Content Body */}
             <div className="p-6 flex flex-col flex-1">
               <h3 className="font-bold text-xl text-gray-900 mb-4 line-clamp-2 leading-snug">
                 {course.title}
               </h3>
               
               <p className="text-sm text-gray-500 line-clamp-2 mb-6">
                 {course.description}
               </p>

               <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-50">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                      <span className="flex items-center gap-1 text-[#5340FF] bg-[#F8F9FA] px-2 py-1 rounded-md">
                        <PlayCircle size={14} />
                        Available
                      </span>
                  </div>
                  <Link 
                    href={`/dashboard/courses/${course.slug}`} 
                    className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-900 hover:bg-gray-900 hover:text-white transition-colors"
                  >
                    <ArrowRight size={18} />
                  </Link>
               </div>
             </div>
           </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardSearchPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Searching...</div>}>
      <SearchResults />
    </Suspense>
  )
}
