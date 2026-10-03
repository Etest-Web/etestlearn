"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight, MoreVertical, Heart, UserPlus, Play, Sparkles } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip as RechartsTooltip, Cell } from "recharts";
import { useUser } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui";

const MOCK_BAR_DATA = [
  { name: '1-10 Aug', value: 30 },
  { name: '11-20 Aug', value: 45 },
  { name: '21-30 Aug', value: 60 },
];

const MOCK_MENTORS = [
  { name: "Padhang Satrio", role: "Mentor", img: "https://i.pravatar.cc/100?u=10" },
  { name: "Zakir Horizontal", role: "Mentor", img: "https://i.pravatar.cc/100?u=11" },
  { name: "Leonardo Samsul", role: "Mentor", img: "https://i.pravatar.cc/100?u=12" },
];

export default function DashboardPage() {
  const { user } = useUser();
  const enrollments = useQuery(api.enrollments.getUserEnrollments);
  const courses = useQuery(api.courses.listPublishedCourses);

  // Loading state
  if (enrollments === undefined || courses === undefined) {
    return (
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          <Skeleton className="h-[240px] w-full rounded-3xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
        <div className="hidden xl:block">
          <Skeleton className="h-full w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  const enrolledCourses = (enrollments ?? [])
    .map((enrollment) => {
      const course = (courses ?? []).find((c) => c._id === enrollment.courseId);
      return course ? { enrollment, course } : null;
    })
    .filter(Boolean) as { enrollment: any; course: any }[];

  const progressColors = ["bg-[#F2EAF7] dark:bg-[#945DA3]/20", "bg-[#FBF1DC] dark:bg-[#EABE5D]/20", "bg-[#FDECEC] dark:bg-[#FF4949]/20"];
  const iconColors = ["text-[#945DA3] dark:text-[#C090CE]", "text-[#8A6A1F] dark:text-[#EABE5D]", "text-[#E63B4B] dark:text-[#FF8A8A]"];

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* LEFT COLUMN: Main Content */}
      <div className="flex min-w-0 flex-col gap-8">
        
        {/* Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#945DA3] to-[#5B3368] p-6 text-white shadow-xl sm:p-8 md:p-12">
          <div className="relative z-10 max-w-lg">
            <span className="text-xs font-bold uppercase tracking-widest text-white mb-3 block">
              Online Course
            </span>
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold leading-tight mb-6 md:mb-8">
              Sharpen Your Skills with Professional Online Courses
            </h1>
            <Link 
              href="/courses" 
              className="inline-flex items-center gap-3 bg-foreground text-background rounded-full pl-6 pr-2 py-2 font-semibold hover:bg-foreground/90 transition-colors"
            >
              Join Now
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-foreground">
                <ArrowRight size={16} />
              </span>
            </Link>
          </div>
          {/* Decorative Elements */}
          <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-20 hidden md:block">
            <Sparkles size={160} strokeWidth={1} />
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="flex flex-wrap gap-4">
          {enrolledCourses.slice(0, 3).map((item, idx) => (
            <div key={item.course._id} className="flex-1 min-w-[160px] sm:min-w-[200px] flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-4 shadow-sm border border-border">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 min-w-0 flex-1">
                <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${progressColors[idx % 3]}`}>
                  <Play className={iconColors[idx % 3]} size={20} fill="currentColor" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {Math.round(item.enrollment.progressPercent)}% watched
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {item.course.category || item.course.title}
                  </span>
                </div>
              </div>
              <button className="text-muted-foreground hover:text-foreground"><MoreVertical size={16} /></button>
            </div>
          ))}
          {enrolledCourses.length === 0 && (
            <div className="w-full text-center py-6 bg-muted rounded-2xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">No courses started yet. Browse catalog to enroll!</p>
            </div>
          )}
        </div>

        {/* Continue Watching Row */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Continue Watching</h2>
            <div className="flex gap-2">
              <button aria-label="Previous courses" className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50">&lt;</button>
              <button aria-label="Next courses" className="w-9 h-9 rounded-full bg-[#945DA3] flex items-center justify-center text-white shadow-sm">&gt;</button>
            </div>
          </div>
          
          {/* Cards are a percentage below sm so a phone still shows a peek of the
              next one, then snap to a fixed 280px once there's room. */}
          <div className="flex overflow-x-auto gap-4 pb-4 snap-x sm:gap-6">
            {enrolledCourses.length > 0 ? (
              enrolledCourses.map((item) => (
                <div key={item.course._id} className="w-[72%] max-w-[280px] min-w-0 shrink-0 sm:w-[280px] snap-start flex flex-col bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                  <div className="h-36 bg-muted relative group cursor-pointer overflow-hidden">
                    <img 
                      src={item.course.thumbnailUrl || "/hero-backdrop.jpg"} 
                      alt="" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                    <button aria-label={`Add ${item.course.title} to favourites`} className="absolute top-3 right-3 text-white bg-black/20 p-2 rounded-full hover:bg-[#FF4949] transition-colors"><Heart size={16} /></button>
                  </div>
                  <div className="p-4 flex flex-col gap-2 relative">
                    {item.course.category && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#945DA3] bg-[#F2EAF7] dark:bg-[#945DA3]/20 px-2 py-1 rounded w-fit inline-block mb-1">
                        {item.course.category}
                      </span>
                    )}
                    <h3 className="font-bold text-foreground leading-snug line-clamp-2 min-h-[44px]">
                      {item.course.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 pt-4 border-t border-border">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold">
                        {item.course.instructorId.substring(0,2)}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-xs font-bold text-foreground truncate">Mentor ID</span>
                        <span className="text-[11px] text-muted-foreground">Mentor</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
                <div className="text-sm text-muted-foreground py-12 px-6">
                  You are not enrolled in any courses to continue watching.
                </div>
            )}
          </div>
        </div>

        {/* Your Lesson List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Your Lesson</h2>
            <Link href="/dashboard" className="text-sm font-semibold text-[#945DA3] hover:underline">See all</Link>
          </div>
          
          {/* The four columns need ~460px; contain the overflow here rather than
              letting it push a page-wide scrollbar on phones. */}
          <div className="bg-card rounded-2xl shadow-sm border border-border p-2 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="font-normal px-4 py-3">Mentor</th>
                  <th className="font-normal px-4 py-3">Type</th>
                  <th className="font-normal px-4 py-3">Desc</th>
                  <th className="font-normal px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {enrolledCourses.slice(0, 3).map((item) => (
                  <tr key={item.course._id} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold text-xs">
                           ID
                         </div>
                         <div className="flex flex-col">
                           <span className="font-bold text-sm text-foreground">Assigned Mentor</span>
                           <span className="text-xs text-muted-foreground">Since Jan</span>
                         </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#945DA3] bg-[#F2EAF7] dark:bg-[#945DA3]/20 px-2 py-1 rounded">
                        {item.course.category || "General"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-foreground line-clamp-1 max-w-[200px]">
                        {item.course.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/courses/${item.course.slug}`} aria-label={`Open ${item.course.title}`} className="inline-flex w-9 h-9 rounded-full border border-border items-center justify-center text-[#945DA3] hover:bg-[#945DA3] hover:text-white transition-colors">
                         <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Statistics */}
      <div className="flex flex-col gap-8">
        
        <div className="bg-card rounded-[32px] p-6 shadow-sm border border-border flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg text-foreground">Statistic</h3>
            <button aria-label="More statistic options" className="text-muted-foreground inline-flex w-9 h-9 items-center justify-center -mr-2"><MoreVertical size={16}/></button>
          </div>
          
          <div className="relative w-32 h-32 mb-6">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              <circle cx="50" cy="50" r="45" fill="transparent" strokeWidth="8" className="stroke-muted" />
              <circle cx="50" cy="50" r="45" fill="transparent" stroke="#945DA3" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 - (283 * 32) / 100} className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 m-auto w-24 h-24 rounded-full overflow-hidden bg-muted border-4 border-card shadow-sm">
                <img src={user?.imageUrl || "https://i.pravatar.cc/100"} alt="User Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -top-2 -right-2 bg-[#945DA3] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm">
               32%
            </div>
          </div>
          
          <h2 className="text-xl font-bold text-foreground mb-1">Good Morning {user?.firstName}🔥</h2>
          <p className="text-xs text-muted-foreground text-center mb-8 px-4">
            Continue your learning to achieve your target!
          </p>
          
          <div className="w-full h-32 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_BAR_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)' }}/>
                <Bar dataKey="value" fill="#945DA3" radius={[4, 4, 4, 4]} barSize={24}>
                   {
                     MOCK_BAR_DATA.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={index === 2 ? '#945DA3' : '#C090CE'} />
                     ))
                   }
                </Bar>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--muted-foreground)'}} dy={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-[32px] p-6 shadow-sm border border-border">
           <div className="flex items-center justify-between mb-6">
             <h3 className="font-bold text-lg text-foreground">Your mentor</h3>
             <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger render={<button aria-label="Add a mentor" className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">+</button>} />
                    <TooltipContent side="top" className="bg-foreground text-background font-medium">Coming soon</TooltipContent>
                  </Tooltip>
             </TooltipProvider>
           </div>
           
           <div className="flex flex-col gap-4">
               {MOCK_MENTORS.map((mentor, i) => (
                 <div key={i} className="flex items-center justify-between pb-4 border-b border-border border-dashed last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                       <div className="relative">
                          <img src={mentor.img} alt={mentor.name} className="w-10 h-10 rounded-full" />
                          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-foreground rounded-full border-2 border-card flex items-center justify-center">
                            <span className="w-1.5 h-1.5 bg-background rounded-full"></span>
                          </span>
                       </div>
                       <div className="flex min-w-0 flex-col">
                           <span className="text-sm font-bold text-foreground truncate">{mentor.name}</span>
                           <span className="text-[11px] text-muted-foreground font-medium">{mentor.role}</span>
                       </div>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger render={
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#945DA3] text-[#945DA3] hover:bg-[#945DA3] hover:text-white transition-colors text-xs font-bold">
                            <UserPlus size={12} />
                            Follow
                          </button>
                        } />
                        <TooltipContent side="top" className="bg-foreground text-background font-medium">Coming soon</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                 </div>
               ))}
           </div>
           
           <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={
                    <button className="w-full mt-6 py-3 rounded-full bg-muted text-[#945DA3] text-sm font-bold hover:bg-[#F2EAF7] dark:hover:bg-[#945DA3]/20 transition-colors">
                      See All
                    </button>
                  } />
                  <TooltipContent side="top" className="bg-foreground text-background font-medium">Coming soon</TooltipContent>
                </Tooltip>
           </TooltipProvider>
        </div>
        
      </div>
{/* 
This ends the columns.
*/}
    </div>
  );
}
