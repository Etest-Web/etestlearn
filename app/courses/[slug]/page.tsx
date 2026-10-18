"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { CourseSchema } from "@/components/seo/course-schema";
import { CourseReviews } from "@/components/course-reviews";
import { CourseClassDiscussion } from "@/components/course-class-discussion";
import { CourseProjects } from "@/components/course-projects";
import { BookmarkButton } from "@/components/bookmark-button";
import { StarRating } from "@/components/star-rating";
import { VideoPlayer } from "@/components/video-player";
import { EncryptedVideoPlayer } from "@/components/encrypted-video-player";
import Link from "next/link";
import { notFound, useRouter, useParams } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  ListChecks,
  Loader2,
  Lock,
  MessageSquare,
  Play,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Tag,
  Video as VideoIcon,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { useLocalization } from "@/components/localization-provider";
import { averageRating, formatRating } from "@/lib/reviews";
import { COUPON_CODE_MAX_LENGTH } from "@/lib/coupons";
import { cn } from "@/lib/utils";

export default function CoursePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { isSignedIn } = useUser();
  const { currency, formatPrice } = useLocalization();
  const [displayPrice, setDisplayPrice] = useState<string>("...");

  const data = useQuery(api.courses.getCourseBySlug, slug ? { slug } : "skip");
  const hasAccess = useQuery(
    api.payments.hasAccessToCourse,
    data?.course ? { courseId: data.course._id } : "skip",
  );
  const instructor = useQuery(
    api.instructors.getInstructorCard,
    data?.course ? { instructorId: data.course.instructorId } : "skip",
  );
  // Read here purely to decide whether the Projects tab exists at all. The tab's
  // own content subscribes separately, so switching tabs is instant, but the
  // trigger cannot be conditional on a value the panel has not asked for yet.
  const projectCount = useQuery(
    api.courseProjects.listForCourse,
    data?.course ? { courseId: data.course._id } : "skip",
  );
  const hasProjects = (projectCount?.length ?? 0) > 0;
  const createPendingPurchase = useMutation(api.payments.createPendingPurchase);
  const initializeCheckout = useAction(api.paystack.initializeCheckout);

  const [isPaying, setIsPaying] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const couponPreview = useQuery(
    api.coupons.preview,
    data?.course && submittedCode
      ? { courseId: data.course._id, code: submittedCode }
      : "skip",
  );

  useEffect(() => {
    async function updatePrice() {
      if (data?.course) {
        const formatted = await formatPrice(data.course.price, data.course.currency ?? "NGN");
        setDisplayPrice(formatted);
      }
    }
    updatePrice();
  }, [data, formatPrice]);

  const [discountedPrice, setDiscountedPrice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function update() {
      if (!couponPreview?.valid || !data?.course?.price) {
        setDiscountedPrice(null);
        return;
      }
      const remaining = Math.max(0, data.course.price - couponPreview.discountKobo);
      const formatted = await formatPrice(remaining, data.course.currency ?? "NGN");
      if (!cancelled) setDiscountedPrice(formatted);
    }
    update();
    return () => {
      cancelled = true;
    };
  }, [couponPreview, data, formatPrice]);

  const appliedCouponCode = submittedCode || undefined;
  const payablePrice = discountedPrice ?? displayPrice;

  async function handlePay() {
    if (!data) return;
    setIsPaying(true);
    try {
      const { reference } = await createPendingPurchase({
        courseId: data.course._id,
        couponCode: appliedCouponCode,
      });
      const { authorizationUrl } = await initializeCheckout({
        reference,
        currency: currency,
      });
      window.location.href = authorizationUrl;
    } catch (err) {
      toast.error(getErrorMessage(err, "Payment failed to start"));
    } finally {
      setIsPaying(false);
    }
  }

  const course = data?.course;
  const rawLessons = data?.lessons;
  const lessons = useMemo(() => rawLessons ?? [], [rawLessons]);
  const skills = useMemo(() => {
    if (data && "skills" in data && Array.isArray((data as { skills?: unknown }).skills)) {
      return (data as { skills: { _id: string; name: string }[] }).skills;
    }
    return [];
  }, [data]);

  // Active lesson in theater preview player
  const activeLesson = useMemo(() => {
    if (!lessons.length) return null;
    if (selectedLessonId) {
      return lessons.find((l) => l._id === selectedLessonId) ?? lessons[0];
    }
    return lessons[0];
  }, [lessons, selectedLessonId]);

  const totalDurationMinutes = useMemo(() => {
    return lessons.reduce((acc, l) => acc + (l.durationMinutes ?? 0), 0);
  }, [lessons]);

  const formattedTotalDuration = useMemo(() => {
    if (totalDurationMinutes === 0) return null;
    const hours = Math.floor(totalDurationMinutes / 60);
    const mins = totalDurationMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ""}`;
    }
    return `${mins}m`;
  }, [totalDurationMinutes]);

  if (data === undefined) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>Loading course preview...</p>
        </div>
      </main>
    );
  }

  if (data === null || !course) {
    notFound();
  }

  const isPaidCourse = !!course.price && course.price > 0;
  const average = averageRating(course.ratingSum, course.ratingCount);

  const isTrailerActive = Boolean(
    course?.previewVideoUrl &&
      (selectedLessonId === "preview" || (selectedLessonId === null && !hasAccess)),
  );

  // Lesson preview permission: lesson 1 is free preview; all lessons unlocked once enrolled
  // ponytail: lesson.order === 1 is default preview; upgrade to explicit lesson.isPreview when added to schema
  const isLessonUnlocked = (lessonOrder: number) => {
    return Boolean(hasAccess || lessonOrder === 1);
  };

  const isActiveLessonUnlocked = activeLesson ? isLessonUnlocked(activeLesson.order) : false;

  function renderCta(options?: { className?: string; size?: "default" | "sm" | "lg" }) {
    const size = options?.size ?? "lg";
    const className = cn("w-full font-medium shadow-sm", options?.className);

    if (!isSignedIn) {
      return (
        <Button size={size} className={className} onClick={() => router.push("/sign-in")}>
          Sign in to enroll
        </Button>
      );
    }
    if (hasAccess) {
      return (
        <Button
          size={size}
          className={className}
          onClick={() => router.push(`/dashboard/courses/${course!.slug}`)}
        >
          Continue learning
        </Button>
      );
    }
    if (isPaidCourse) {
      return (
        <Button size={size} className={className} disabled={isPaying} onClick={handlePay}>
          {isPaying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Paystack...
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" /> Enroll for {payablePrice}
            </>
          )}
        </Button>
      );
    }
    return (
      <Button
        size={size}
        className={className}
        onClick={() => router.push(`/dashboard/courses/${course!.slug}`)}
      >
        Enroll for free
      </Button>
    );
  }

  return (
    <>
      <CourseSchema
        course={{
          title: course.title,
          description: course.description,
          slug: course.slug,
          category: course.category,
          level: course.level,
          thumbnailUrl: course.thumbnailUrl,
          priceKobo: course.price,
        }}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-10 space-y-8 pb-24 lg:pb-16">
        {/* Breadcrumb & Back */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </Button>
          <div className="flex items-center gap-2">
            {course.category && (
              <Badge variant="secondary" className="font-normal text-xs">
                {course.category}
              </Badge>
            )}
            {course.level && (
              <Badge variant="outline" className="font-normal text-xs">
                {course.level}
              </Badge>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* SKILLSHARE-STYLE THEATER: PREVIEW PLAYER & PLAYLIST */}
        {/* ============================================================== */}
        <section aria-label="Course Preview Theater" className="rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left: 16:9 Cinema Preview Player */}
            <div className="lg:col-span-8 p-3 sm:p-5 flex flex-col justify-between">
              <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black flex items-center justify-center border border-zinc-900 shadow-inner">
                {isTrailerActive && course.previewVideoUrl ? (
                  <VideoPlayer
                    src={course.previewVideoUrl}
                    title={`${course.title} - Preview Trailer`}
                  />
                ) : activeLesson ? (
                  isActiveLessonUnlocked ? (
                    activeLesson.contentType === "video" ? (
                      activeLesson.videoAssetId ? (
                        <EncryptedVideoPlayer
                          assetId={activeLesson.videoAssetId}
                          title={activeLesson.title}
                        />
                      ) : activeLesson.content ? (
                        <VideoPlayer src={activeLesson.content} title={activeLesson.title} />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-400">
                          <VideoIcon className="h-10 w-10 text-zinc-600 mb-2" />
                          <p className="text-sm font-medium">Video preview being prepared</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            The instructor is finalizing the media for this lesson.
                          </p>
                        </div>
                      )
                    ) : (
                      /* Article or Quiz preview */
                      <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
                        {activeLesson.contentType === "quiz" ? (
                          <HelpCircle className="h-12 w-12 text-primary mb-3" />
                        ) : (
                          <FileText className="h-12 w-12 text-primary mb-3" />
                        )}
                        <span className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
                          {activeLesson.contentType} Lesson
                        </span>
                        <h3 className="text-lg font-semibold text-zinc-100">{activeLesson.title}</h3>
                        <p className="text-xs text-zinc-400 mt-2">
                          {hasAccess
                            ? "You are enrolled in this course. Launch the dashboard to complete this lesson."
                            : "This lesson is included with this course. Enroll to take quizzes and read full notes."}
                        </p>
                        {hasAccess ? (
                          <Button
                            size="sm"
                            className="mt-4"
                            onClick={() =>
                              router.push(
                                activeLesson.contentType === "quiz"
                                  ? `/dashboard/courses/${course.slug}/lessons/${activeLesson._id}/quiz`
                                  : `/dashboard/courses/${course.slug}/lessons/${activeLesson._id}`,
                              )
                            }
                          >
                            Open lesson in dashboard
                          </Button>
                        ) : (
                          <div className="mt-4 max-w-xs">{renderCta({ size: "sm" })}</div>
                        )}
                      </div>
                    )
                  ) : (
                    /* Locked Lesson Overlay */
                    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center">
                      <Image
                        src={course.thumbnailUrl || "/hero-backdrop.jpg"}
                        alt={course.title}
                        fill
                        className="object-cover opacity-20 filter blur-xs"
                      />
                      <div className="relative z-10 flex flex-col items-center max-w-md">
                        <div className="h-12 w-12 rounded-full bg-zinc-900/90 border border-zinc-700 flex items-center justify-center text-amber-400 mb-3 shadow-lg">
                          <Lock className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
                          Lesson {activeLesson.order} is Locked
                        </span>
                        <h3 className="text-lg font-semibold text-white">{activeLesson.title}</h3>
                        <p className="text-xs text-zinc-300 mt-2 mb-4 leading-relaxed">
                          Enroll in <span className="text-white font-medium">{course.title}</span> to
                          unlock all {lessons.length} lessons, hands-on tasks, and your completion
                          certificate.
                        </p>
                        <div className="w-full max-w-xs">{renderCta({ size: "default" })}</div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center p-6 text-zinc-500">
                    <p className="text-sm">No lessons available yet.</p>
                  </div>
                )}
              </div>

              {/* Theater Bottom Bar */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-900 text-xs text-zinc-400">
                {isTrailerActive ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-zinc-200 truncate">
                      Course Trailer &amp; Overview
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 font-normal shrink-0"
                    >
                      Free Preview
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    {activeLesson && (
                      <>
                        <span className="font-medium text-zinc-200 truncate">
                          Lesson {activeLesson.order}: {activeLesson.title}
                        </span>
                        {activeLesson.order === 1 && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 font-normal shrink-0"
                          >
                            Free Preview
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                )}
                {!isTrailerActive && activeLesson?.durationMinutes && (
                  <span className="flex items-center gap-1 tabular text-zinc-400 shrink-0">
                    <Clock className="h-3 w-3" /> {activeLesson.durationMinutes} min
                  </span>
                )}
              </div>
            </div>

            {/* Right: Playlist Queue */}
            <div className="lg:col-span-4 p-3 sm:p-5 border-t lg:border-t-0 lg:border-l border-zinc-800 flex flex-col justify-between bg-zinc-950/80">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Course Lessons</h2>
                    <p className="text-[11px] text-zinc-400">
                      {lessons.length} lessons {course.previewVideoUrl ? "+ Trailer" : ""}{" "}
                      {formattedTotalDuration ? `· ${formattedTotalDuration}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-medium">
                    {course.previewVideoUrl ? "Trailer Free" : "1 Preview Free"}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 max-h-[360px] lg:max-h-[420px] overflow-y-auto pr-1">
                  {course.previewVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setSelectedLessonId("preview")}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-start gap-3 group border mb-1",
                        isTrailerActive
                          ? "bg-zinc-900 border-zinc-700 text-white shadow-sm"
                          : "bg-zinc-950/40 hover:bg-zinc-900/50 text-zinc-300 border-transparent",
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isTrailerActive ? (
                          <div className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                            <Play className="h-2.5 w-2.5 fill-current" />
                          </div>
                        ) : (
                          <PlayCircle className="h-5 w-5 text-emerald-400 group-hover:text-emerald-300" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="tabular text-[10px] text-emerald-400 font-mono font-medium">
                            PREVIEW
                          </span>
                          <p
                            className={cn(
                              "truncate font-medium",
                              isTrailerActive ? "text-white" : "text-zinc-200",
                            )}
                          >
                            Course Trailer &amp; Overview
                          </p>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-400">
                          <span>Video Preview</span>
                          <span className="text-emerald-400 font-medium">· Free Preview</span>
                        </div>
                      </div>
                    </button>
                  )}

                  {lessons.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-6 text-center">No lessons uploaded yet.</p>
                  ) : (
                    lessons.map((lesson) => {
                      const isSelected = !isTrailerActive && activeLesson?._id === lesson._id;
                      const isUnlocked = isLessonUnlocked(lesson.order);
                      const isFreePreview = lesson.order === 1;

                      return (
                        <button
                          key={lesson._id}
                          type="button"
                          onClick={() => setSelectedLessonId(lesson._id)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-start gap-3 group border",
                            isSelected
                              ? "bg-zinc-900 border-zinc-700 text-white shadow-sm"
                              : "bg-zinc-950/40 hover:bg-zinc-900/50 text-zinc-300 border-transparent",
                          )}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isSelected ? (
                              <div className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                                <Play className="h-2.5 w-2.5 fill-current" />
                              </div>
                            ) : isUnlocked ? (
                              <PlayCircle className="h-5 w-5 text-zinc-400 group-hover:text-zinc-200" />
                            ) : (
                              <Lock className="h-4 w-4 text-zinc-500 mt-0.5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="tabular text-[10px] text-zinc-400 font-mono">
                                {String(lesson.order).padStart(2, "0")}
                              </span>
                              <p className={cn("truncate font-medium", isSelected ? "text-white" : "text-zinc-300")}>
                                {lesson.title}
                              </p>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-400">
                              <span className="capitalize">{lesson.contentType}</span>
                              {lesson.durationMinutes && <span>· {lesson.durationMinutes} min</span>}
                              {isFreePreview && (
                                <span className="text-emerald-400 font-medium">· Free Preview</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Playlist footer note */}
              <div className="pt-3 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>{hasAccess ? "Full Access Unlocked" : "Preview mode active"}</span>
                {!hasAccess && isPaidCourse && (
                  <span className="text-zinc-200 font-semibold">{payablePrice}</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* COURSE OVERVIEW & TEACHER ROW */}
        {/* ============================================================== */}
        <section className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {course.title}
            </h1>
            <p className="text-base text-muted-foreground max-w-3xl leading-relaxed">
              {course.description}
            </p>
          </div>

          {/* Instructor & Meta Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-y border-border">
            {instructor && (
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 border border-border">
                  <AvatarImage src={instructor.imageUrl || "/certf.jpeg"} alt={instructor.name} />
                  <AvatarFallback>{instructor.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{instructor.name}</p>
                    {instructor.pronouns && (
                      <span className="text-xs text-muted-foreground">({instructor.pronouns})</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Course Instructor</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {average !== null && (
                <div className="flex items-center gap-1.5">
                  <StarRating value={average} size="sm" />
                  <span className="tabular font-medium text-foreground">
                    {formatRating(average)}
                  </span>
                  <span>({course.ratingCount ?? 0} reviews)</span>
                </div>
              )}
              {lessons.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  {lessons.length} lessons
                </span>
              )}
              {formattedTotalDuration && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedTotalDuration} total
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* TWO-COLUMN DETAILS & CHECKOUT SIDEBAR */}
        {/* ============================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Left: Tabs Content */}
          <div className="lg:col-span-8 space-y-6">
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="about">About Class</TabsTrigger>
                <TabsTrigger value="syllabus">Syllabus</TabsTrigger>
                <TabsTrigger value="instructor">Teacher</TabsTrigger>
                <TabsTrigger value="reviews">
                  Reviews {course.ratingCount ? `(${course.ratingCount})` : ""}
                </TabsTrigger>
                {/* Hidden entirely rather than shown empty: a "Projects" tab with
                    nothing in it reads as a gap in the course, not as a decision
                    the instructor has not made yet. */}
                {hasProjects && <TabsTrigger value="projects">Projects</TabsTrigger>}
              </TabsList>

              {/* ABOUT TAB */}
              <TabsContent value="about" className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">About This Class</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-line">
                    {course.description}
                  </div>
                </div>

                {/* Skills tags */}
                {skills && skills.length > 0 && (
                  <div className="space-y-2 pt-4 border-t border-border">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Skills You Will Learn
                    </h4>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {skills.map((skill: { _id: string; name: string }) => (
                        <Badge key={skill._id} variant="secondary" className="px-2.5 py-1 text-xs">
                          <Tag className="h-3 w-3 mr-1 opacity-70" /> {skill.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* What's included value props */}
                <div className="rounded-xl border border-border p-5 bg-card space-y-3">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Key Class Highlights
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground pt-1">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{lessons.length} on-demand video &amp; interactive lessons</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Award className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Official Certificate of Completion awarded</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Direct class discussion community and instructor Q&amp;A</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <GraduationCap className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>Lifetime access on mobile and desktop</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* SYLLABUS TAB */}
              <TabsContent value="syllabus" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">Course Syllabus</h3>
                  <span className="text-xs text-muted-foreground tabular">
                    {lessons.length} lessons {formattedTotalDuration ? `(${formattedTotalDuration})` : ""}
                  </span>
                </div>

                {lessons.length === 0 && !course.previewVideoUrl ? (
                  <EmptyState
                    icon={ListChecks}
                    tone="neutral"
                    title="No lessons published yet"
                    description="The instructor has not added any lessons to this course yet."
                  />
                ) : (
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden bg-card">
                    {course.previewVideoUrl && (
                      <div className="flex items-center justify-between p-3.5 sm:p-4 text-sm hover:bg-muted/40 transition-colors bg-muted/10">
                        <div className="flex items-start gap-3 min-w-0 pr-4">
                          <div className="mt-0.5 shrink-0 text-emerald-500">
                            <PlayCircle className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              Course Trailer &amp; Overview
                            </p>
                            <span className="text-xs text-muted-foreground">
                              Introductory video preview
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]"
                          >
                            Free Preview
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              setSelectedLessonId("preview");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Watch
                          </Button>
                        </div>
                      </div>
                    )}
                    {lessons.map((lesson) => {
                      const isFree = lesson.order === 1;
                      const unlocked = isLessonUnlocked(lesson.order);

                      return (
                        <div
                          key={lesson._id}
                          className="flex items-center justify-between p-3.5 sm:p-4 text-sm hover:bg-muted/40 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0 pr-4">
                            <div className="mt-0.5 shrink-0 text-muted-foreground">
                              {unlocked ? (
                                <PlayCircle className="h-4 w-4 text-primary" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{lesson.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                <span className="capitalize">{lesson.contentType}</span>
                                {lesson.durationMinutes && (
                                  <span>· {lesson.durationMinutes} min</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isFree ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]"
                              >
                                Free Preview
                              </Badge>
                            ) : !hasAccess ? (
                              <span className="text-xs text-muted-foreground">Locked</span>
                            ) : null}

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                setSelectedLessonId(lesson._id);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              {unlocked ? "Watch" : "Preview"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* INSTRUCTOR TAB */}
              <TabsContent value="instructor" className="space-y-4">
                {instructor ? (
                  <Card>
                    <CardContent className="pt-6 flex flex-col sm:flex-row gap-5 items-start">
                      <Avatar className="h-16 w-16 border border-border shrink-0">
                        <AvatarImage
                          src={instructor.imageUrl || "/certf.jpeg"}
                          alt={instructor.name}
                        />
                        <AvatarFallback>
                          {instructor.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold text-foreground">
                              {instructor.name}
                            </h3>
                            {instructor.pronouns && (
                              <p className="text-xs text-muted-foreground">{instructor.pronouns}</p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            render={<Link href={`/instructors/${instructor._id}`} />}
                          >
                            View instructor profile
                            <ArrowUpRight className="h-4 w-4" />
                          </Button>
                        </div>
                        {instructor.bio ? (
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                            {instructor.bio}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            No bio provided by instructor.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">Instructor profile unavailable.</p>
                )}
              </TabsContent>

              {/* REVIEWS TAB */}
              <TabsContent value="reviews" className="space-y-8">
                <CourseReviews
                  courseId={course._id}
                  ratingSum={course.ratingSum}
                  ratingCount={course.ratingCount}
                />
                {/* Below the stars, not in a tab of its own: it is the longer
                    account of the same question ("how was it?") and separating it
                    would put the learner's retrospective one click away from the
                    average it supports. */}
                <CourseClassDiscussion courseId={course._id} />
              </TabsContent>

              {/* PROJECTS TAB */}
              <TabsContent value="projects">
                <CourseProjects courseId={course._id} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Sticky Checkout Card */}
          <div className="lg:col-span-4">
            <div className="sticky top-20 space-y-4">
              <Card className="relative border-border shadow-lg">
                {/* Sits in the card's own corner rather than in the pricing
                    column: saving a course is a decision about the future, not
                    about whether to buy it today. */}
                <BookmarkButton
                  courseId={course._id}
                  className="absolute right-3 top-3 z-10"
                />
                <CardHeader className="pb-3">
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Enrollment &amp; Pricing
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-foreground tabular">
                        {payablePrice}
                      </span>
                      {discountedPrice && (
                        <span className="text-sm text-muted-foreground line-through tabular">
                          {displayPrice}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Primary Action Button */}
                  {renderCta()}

                  {/* Coupon section for unpurchased paid courses */}
                  {isPaidCourse && !hasAccess && (
                    <div className="pt-2 border-t border-border space-y-2">
                      <Label htmlFor="coupon-code-input" className="text-xs font-medium text-foreground">
                        Have a discount coupon?
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="coupon-code-input"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          maxLength={COUPON_CODE_MAX_LENGTH}
                          placeholder="DISCOUNT-CODE"
                          className="font-mono text-xs uppercase"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSubmittedCode(couponInput.trim())}
                          disabled={couponInput.trim().length < 4}
                        >
                          Apply
                        </Button>
                        {submittedCode && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSubmittedCode("");
                              setCouponInput("");
                            }}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                      {submittedCode && couponPreview !== undefined && (
                        <p
                          className={cn(
                            "text-xs font-medium",
                            couponPreview.valid ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                          )}
                        >
                          {couponPreview.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Trust & Guarantee points */}
                  <div className="pt-3 border-t border-border space-y-2.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Instant access to all lessons &amp; preview videos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Official certificate upon completion</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Secure payment handled by Paystack</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isPaidCourse && !hasAccess && (
                <p className="text-[11px] text-center text-muted-foreground px-2">
                  Payments are processed securely via Paystack. Cards, Bank Transfer &amp; USSD accepted.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ============================================================== */}
      {/* MOBILE STICKY BOTTOM CHECKOUT BAR */}
      {/* ============================================================== */}
      {!hasAccess && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border p-3 px-4 lg:hidden flex items-center justify-between gap-4 shadow-lg">
          <div>
            <span className="text-[11px] text-muted-foreground block">Total price</span>
            <span className="text-lg font-bold text-foreground tabular">{payablePrice}</span>
          </div>
          <div className="w-1/2">{renderCta({ size: "default" })}</div>
        </div>
      )}
    </>
  );
}