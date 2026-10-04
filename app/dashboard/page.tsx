"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight, MoreVertical, Heart, UserPlus, Play, Sparkles, Target, Trophy, Clock, Flame, BookOpen, Award, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, Cell, AreaChart, Area } from "recharts";
import { useUser } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { user } = useUser();
  const enrollments = useQuery(api.enrollments.getUserEnrollments);
  const courses = useQuery(api.courses.listPublishedCourses);
  const statistics = useQuery(api.statistics.getUserStatistics);
  const weeklyChart = useQuery(api.statistics.getWeeklyActivityChart, { weeks: 8 });
  const userGoals = useQuery(api.goals.getUserGoals, { activeOnly: true });

  // Loading state
  if (enrollments === undefined || courses === undefined || statistics === undefined) {
    return (
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          <Skeleton className="h-[240px] w-full rounded-3xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div >
        </div >
        <div className="hidden xl:block">
          <Skeleton className="h-full w-full rounded-3xl" />
        </div >
      </div >
    );
  }

  const enrolledCourses = (enrollments ?? [])
    .map((enrollment) => {
      const course = (courses ?? []).find((c) => c._id === enrollment.courseId);
      return course ? { enrollment, course } : null;
    })
    .filter(Boolean) as { enrollment: any; course: any }[];

  const progressColors = ["bg-primary/10", "bg-warning/10", "bg-destructive/10"];
  const iconColors = ["text-primary", "text-warning", "text-destructive"];

  // Calculate overall progress for the circular chart
  const overallProgress = statistics.avgProgress || 0;

  // Prepare weekly chart data
  const chartData = weeklyChart ?? [];

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* LEFT COLUMN: Main Content */}
      <div className="flex min-w-0 flex-col gap-8">
        
        {/* Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-ink p-6 text-brand-foreground shadow-xl sm:p-8 md:p-12">
          <div className="relative z-10 max-w-lg">
            <span className="text-xs font-bold uppercase tracking-widest opacity-80 mb-3 block">
              Online Course
            </span >
            <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold leading-tight mb-6 md:mb-8">
              Sharpen Your Skills with Professional Online Courses
            </h1>
            <Link 
              href="/courses" 
              className="inline-flex items-center gap-3 bg-brand-foreground text-brand rounded-full pl-6 pr-2 py-2 font-semibold hover:bg-brand-foreground/90 transition-all active:scale-95"
            >
              Join Now
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-foreground text-brand">
                <ArrowRight size={16} />
              </span >
            </Link>
          </div >
          {/* Decorative Elements */}
          <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-20 hidden md:block">
            <Sparkles size={160} strokeWidth={1} />
          </div >
        </div >

        {/* Quick Stats Pills */}
        <div className="flex flex-wrap gap-4">
          {enrolledCourses.slice(0, 3).map((item, idx) => (
            <div key={item.course._id} className="flex-1 min-w-[160px] sm:min-w-[200px] flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-4 shadow-sm border border-border">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 min-w-0 flex-1">
                <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${progressColors[idx % 3]}`}>
                  <Play className={iconColors[idx % 3]} size={20} fill="currentColor" />
                </div >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {Math.round(item.enrollment.progressPercent)}% watched
                  </span >
                  <span className="text-sm font-bold text-foreground">
                    {item.course.category || item.course.title}
                  </span >
                </div >
              </div >
              <button className="text-muted-foreground hover:text-foreground"><MoreVertical size={16} /></button>
            </div >
          ))}
          {enrolledCourses.length === 0 && (
            <div className="w-full text-center py-6 bg-muted rounded-2xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground font-medium">No courses started yet. Browse catalog to enroll!</p>
            </div >
          )}
        </div >

        {/* Continue Watching Row */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Continue Watching</h2>
            <div className="flex gap-2">
              <button aria-label="Previous courses" className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button aria-label="Next courses" className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-brand-foreground shadow-sm hover:opacity-90 transition-opacity">
                <ChevronRight size={16} />
              </button>
            </div >
          </div >
          
          <div className="flex overflow-x-auto gap-4 pb-4 snap-x sm:gap-6">
            {enrolledCourses.length > 0 ? (
              enrolledCourses.map((item) => (
                <div key={item.course._id} className="w-[72%] max-w-[280px] min-w-0 shrink-0 sm:w-[280px] snap-start flex flex-col bg-card rounded-2xl shadow-sm border border-border overflow-hidden group">
                  <div className="h-36 bg-muted relative group cursor-pointer overflow-hidden">
                    <img 
                      src={item.course.thumbnailUrl || "/hero-backdrop.jpg"} 
                      alt="" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                    <button aria-label={`Add ${item.course.title} to favourites`} className="absolute top-3 right-3 text-white bg-black/20 p-2 rounded-full hover:bg-destructive transition-colors"><Heart size={16} /></button>
                  </div >
                  <div className="p-4 flex flex-col gap-2 relative">
                    {item.course.category && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-primary bg-primary/10 dark:bg-primary/20 px-2 py-1 rounded w-fit inline-block mb-1">
                        {item.course.category}
                      </span >
                    )}
                    <h3 className="font-bold text-foreground leading-snug line-clamp-2 min-h-[44px]">
                      {item.course.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 pt-4 border-t border-border">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold">
                        {item.course.instructorId.substring(0,2).toUpperCase()}
                      </div >
                      <div className="flex min-w-0 flex-col">
                        <span className="text-xs font-bold text-foreground truncate">Mentor</span>
                        <span className="text-[11px] text-muted-foreground">Verified</span>
                      </div >
                    </div >
                  </div >
                </div >
              ))
            ) : (
                <div className="text-sm text-muted-foreground py-12 px-6">
                  You are not enrolled in any courses to continue watching.
                </div >
            )}
          </div >
        </div >

        {/* Your Lesson List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Your Lessons</h2>
            <Link href="/dashboard/courses" className="text-sm font-semibold text-brand hover:underline">See all</Link>
          </div >
          
          <div className="bg-card rounded-2xl shadow-sm border border-border p-2 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-left border-collapse">
              <thead >
                <tr className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="font-normal px-4 py-3">Course</th>
                  <th className="font-normal px-4 py-3">Progress</th>
                  <th className="font-normal px-4 py-3">Lessons</th>
                  <th className="font-normal px-4 py-3 text-right">Action</th>
                </tr>
              </thead >
              <tbody >
                {enrolledCourses.slice(0, 5).map((item) => (
                  <tr key={item.course._id} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold text-xs">
                           {item.course.title.charAt(0)}
                         </div >
                         <div className="flex flex-col">
                           <span className="font-bold text-sm text-foreground">{item.course.title}</span>
                           <span className="text-xs text-muted-foreground">{item.course.category || "General"}</span>
                         </div >
                      </div >
                    </td >
                    <td className="px-4 py-3">
                      <div className="w-24">
                        <Progress value={Math.round(item.enrollment.progressPercent)} className="h-2" />
                        <span className="text-xs text-muted-foreground">{Math.round(item.enrollment.progressPercent)}%</span>
                      </div >
                    </td >
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-foreground">
                        {item.enrollment.completedLessonIds?.length || 0} / {item.course.id ? item.course.id.length : 0}
                      </span >
                    </td >
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/courses/${item.course.slug}`} aria-label={`Open ${item.course.title}`} className="inline-flex w-9 h-9 rounded-full border border-border items-center justify-center text-brand hover:bg-brand hover:text-brand-foreground transition-all">
                         <ArrowRight size={14} />
                      </Link>
                    </td >
                  </tr>
                ))}
              </tbody >
            </table >
            </div >
          </div >
        </div >
      </div >

      {/* RIGHT COLUMN: Statistics */}
      <div className="flex flex-col gap-8">
        
        {/* Main Stat Card - Overall Progress */}
        <Card className="rounded-[32px] p-6 shadow-sm border border-border">
          <div className="w-full flex justify-between items-center mb-6">
            <CardTitle className="font-bold text-lg text-foreground">Your Progress</CardTitle>
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <MoreVertical size={16} />
            </Button>
          </div >
          
          <div className="relative w-32 h-32 mx-auto mb-6">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              <circle cx="50" cy="50" r="45" fill="transparent" strokeWidth="8" className="stroke-muted" />
              <circle 
                cx="50" 
                cy="50" 
                r="45" 
                fill="transparent" 
                stroke="currentColor" 
                strokeWidth="8" 
                strokeDasharray="283" 
                strokeDashoffset={283 - (283 * overallProgress) / 100} 
                className="text-brand transition-all duration-1000 ease-out" 
              />
            </svg>
            <div className="absolute inset-0 m-auto w-24 h-24 rounded-full overflow-hidden bg-muted border-4 border-card shadow-sm">
                <img src={user?.imageUrl || "https://i.pravatar.cc/100"} alt="User Avatar" className="w-full h-full object-cover" />
            </div >
            <div className="absolute -top-2 -right-2 bg-brand text-brand-foreground text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md">
               {overallProgress}%
            </div >
          </div >
          
          <h2 className="text-2xl font-bold text-foreground mb-1 text-center tracking-tight">Welcome back, <span className="text-brand">{user?.firstName || "Learner"}</span>! 🔥</h2>
          <p className="text-xs text-muted-foreground text-center mb-8 px-4">
            {statistics.completedCourses} courses completed, {statistics.totalLessonsCompleted} lessons done
          </p>
          
          {/* Weekly Activity Mini Chart */}
          <div className="w-full h-32 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorProgress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <RechartsTooltip 
                  cursor={{fill: 'transparent'}} 
                  contentStyle={{ 
                    borderRadius: '8px', 
                    border: 'none', 
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', 
                    backgroundColor: 'var(--popover)', 
                    color: 'var(--popover-foreground)' 
                  }}
                  formatter={(value: number, name: string) => [value, name === 'lessonsCompleted' ? 'Lessons' : name === 'quizzesPassed' ? 'Quizzes' : 'Hours']}
                />
                <Area 
                  type="monotone" 
                  dataKey="lessonsCompleted" 
                  stroke="var(--brand)" 
                  fillOpacity={1} 
                  fill="url(#colorProgress)"
                  strokeWidth={2}
                />
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--muted-foreground)'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'var(--muted-foreground)'}} dx={-10} />
              </AreaChart>
            </ResponsiveContainer>
          </div >
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard 
            icon={<BookOpen className="w-5 h-5 text-primary" />}
            label="Courses"
            value={statistics.totalCoursesEnrolled}
            subValue={`${statistics.completedCourses} completed`}
            iconBg="bg-primary/10"
          />
          <StatCard 
            icon={<Award className="w-5 h-5 text-warning" />}
            label="Certificates"
            value={statistics.totalCertificatesEarned}
            subValue={`${statistics.totalCertificatesRevoked} revoked`}
            iconBg="bg-warning/10"
          />
          <StatCard 
            icon={<Clock className="w-5 h-5 text-muted-foreground" />}
            label="Study Time"
            value={`${statistics.totalStudyHours}h`}
            subValue={`${statistics.totalStudyMinutes}m total`}
            iconBg="bg-muted"
          />
          <StatCard 
            icon={<Flame className="w-5 h-5 text-destructive" />}
            label="Streak"
            value={`${statistics.currentStreak} days`}
            subValue={`Best: ${statistics.longestStreak} days`}
            iconBg="bg-destructive/10"
          />
        </div >

        {/* Goals Section */}
        {(userGoals && userGoals.length > 0) && (
          <Card className="rounded-[32px] p-6 shadow-sm border border-border">
            <div className="flex items-center justify-between mb-6">
              <CardTitle className="font-bold text-lg text-foreground flex items-center gap-2">
                <Target className="w-5 h-5 text-brand" />
                Your Goals
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-brand hover:bg-primary/10">
                Manage
              </Button>
            </div >
            
            <div className="flex flex-col gap-4">
              {userGoals.slice(0, 3).map((goal) => (
                <GoalProgressCard key={goal._id} goal={goal} />
              ))}
              {userGoals.length > 3 && (
                <Button variant="ghost" size="sm" className="text-brand hover:bg-primary/10 justify-start">
                  +{userGoals.length - 3} more goals
                </Button>
              )}
            </div >
          </Card>
        )}

        {/* Next Milestone */}
        {statistics.nextCertificateCourse && (
          <Card className="rounded-[32px] p-6 shadow-sm border border-border bg-gradient-to-br from-primary/5 to-warning/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-warning" />
                <span className="font-bold text-lg text-foreground">Next Certificate</span >
              </div >
              <Badge variant="secondary" className="text-xs">
                {statistics.nextCertificateCourse.progressPercent}%
              </Badge>
            </div >
            <h3 className="font-bold text-foreground mb-2">{statistics.nextCertificateCourse.courseTitle}</h3>
            <Progress value={statistics.nextCertificateCourse.progressPercent} className="h-2 mb-3" />
            <div className="flex flex-wrap gap-1">
              {statistics.nextCertificateCourse.blockers.map((blocker, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">
                  {blocker}
                </Badge>
              ))}
            </div >
          </Card>
        )}

        {/* Weekly Stats Summary */}
        <Card className="rounded-[32px] p-6 shadow-sm border border-border">
          <CardTitle className="font-bold text-lg text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand" />
            This Week
          </CardTitle>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-muted rounded-xl text-center">
              <div className="text-xl font-bold text-foreground">{statistics.lessonsThisWeek}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lessons</div>
            </div >
            <div className="p-3 bg-muted rounded-xl text-center">
              <div className="text-xl font-bold text-foreground">{statistics.quizzesThisWeek}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quizzes</div>
            </div >
            <div className="p-3 bg-muted rounded-xl text-center">
              <div className="text-xl font-bold text-foreground">{statistics.studyHoursThisWeek}h</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Study</div>
            </div >
          </div >
        </Card>
      </div >
    </div >
  );
}

// Helper Components
function StatCard({ icon, label, value, subValue, iconBg }: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  subValue: string; 
  iconBg: string;
}) {
  return (
    <Card className="rounded-2xl p-4 shadow-sm border border-border">
      <div className="flex flex-col gap-1">
        <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div >
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-[10px] text-muted-foreground">{subValue}</p>
        </div >
      </div >
    </Card>
  );
}

function GoalProgressCard({ goal }: { goal: any }) {
  const typeIcons: Record<string, React.ReactNode> = {
    complete_courses: <BookOpen className="w-4 h-4" />,
    complete_lessons: <BookOpen className="w-4 h-4" />,
    watch_hours: <Clock className="w-4 h-4" />,
    earn_certificates: <Award className="w-4 h-4" />,
    pass_quizzes: <Target className="w-4 h-4" />,
    study_streak_days: <Flame className="w-4 h-4" />,
  };

  const typeLabels: Record<string, string> = {
    complete_courses: "Complete Courses",
    complete_lessons: "Complete Lessons",
    watch_hours: "Watch Hours",
    earn_certificates: "Earn Certificates",
    pass_quizzes: "Pass Quizzes",
    study_streak_days: "Study Streak",
  };

  return (
    <div className="bg-muted/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {typeIcons[goal.type] || <Target className="w-4 h-4" />}
          </span >
          <span className="text-sm font-semibold text-foreground">{typeLabels[goal.type] || goal.type}</span>
        </div >
        <Badge variant="secondary" className="text-[10px]">
          {goal.period}
        </Badge>
      </div >
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span>{goal.current} / {goal.target}</span>
        <span>{goal.progressPercent}%</span>
      </div >
      <Progress value={goal.progressPercent} className="h-1.5" />
      {goal.daysRemaining !== null && (
        <p className="text-[10px] text-muted-foreground mt-1 text-right">
          {goal.daysRemaining} days remaining
        </p>
      )}
    </div >
  );
}
