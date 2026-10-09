"use client";

import { useState } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { CourseSchema } from "@/components/seo/course-schema";
import { notFound, useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ListChecks, Loader2, Lock } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

function formatNaira(kobo?: number) {
  if (!kobo || kobo <= 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export default function CoursePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { isSignedIn } = useUser();

  const data = useQuery(api.courses.getCourseBySlug, slug ? { slug } : "skip");
  const hasAccess = useQuery(
    api.payments.hasAccessToCourse,
    data?.course ? { courseId: data.course._id } : "skip",
  );
  const createPendingPurchase = useMutation(api.payments.createPendingPurchase);
  const initializeCheckout = useAction(api.paystack.initializeCheckout);

  const [isPaying, setIsPaying] = useState(false);

  async function handlePay() {
    if (!data) return;
    setIsPaying(true);
    try {
      // Step 1: create pending purchase record
      const { reference } = await createPendingPurchase({ courseId: data.course._id });
      // Step 2: get Paystack checkout URL and redirect
      const { authorizationUrl } = await initializeCheckout({ reference });
      window.location.href = authorizationUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setIsPaying(false);
    }
  }

  if (data === undefined) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-muted-foreground">Loading course...</p>
      </main>
    );
  }

  if (data === null) {
    notFound();
  }

  const { course, lessons } = data;
  const isPaidCourse = !!course.price && course.price > 0;

  function renderCta() {
    if (!isSignedIn) {
      return (
        <Button size="lg" onClick={() => router.push("/sign-in")}>
          Sign in to enroll
        </Button>
      );
    }
    if (hasAccess) {
      return (
        <Button size="lg" onClick={() => router.push(`/dashboard/courses/${course.slug}`)}>
          Continue learning
        </Button>
      );
    }
    if (isPaidCourse) {
      return (
        <Button size="lg" disabled={isPaying} onClick={handlePay}>
          {isPaying ? (
            <>
              <Loader2 className="animate-spin" /> Redirecting to Paystack...
            </>
          ) : (
            <>
              <Lock /> Pay {formatNaira(course.price)} with Paystack
            </>
          )}
        </Button>
      );
    }
    return (
      <Button size="lg" onClick={() => router.push(`/dashboard/courses/${course.slug}`)}>
        Enroll &amp; start learning
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
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:py-12">
      {/* Kept outside PageHeader rather than in its `actions` slot: that slot
          sits beside the title on desktop but *below* it on mobile, and "Back"
          has to stay above the title at every width. */}
      <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => router.back()}>
        <ArrowLeft /> Back
      </Button>

      <PageHeader
        title={course.title}
        description={course.description}
        actions={renderCta()}
      >
        {/* Fixed square so it sits inline with the badges — w-full in a
            flex-wrap row claimed a whole line at 1:1 on phones. */}
        <div className="flex flex-wrap items-center gap-2">
          <Image src={course.thumbnailUrl || "/hero-backdrop.jpg"} alt={course.title} width={500} height={500} className="h-12 w-12 shrink-0 rounded-sm object-cover" />
          {course.category && <Badge variant="secondary">{course.category}</Badge>}
          {course.level && <Badge variant="outline">{course.level}</Badge>}
          {/* Price is a number a buyer scans for, so it is set as a price rather
              than as a 10px chip. `tabular` stops it reflowing as digits change. */}
          <span className="tabular text-[15px] font-semibold text-foreground">
            {formatNaira(course.price)}
          </span>
        </div>
      </PageHeader>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="rule-heading">Course outline</CardTitle>
          </CardHeader>
          <CardContent>
            {lessons.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                tone="neutral"
                title="No lessons published yet"
                description="Lessons will appear here once the instructor has added them in Convex."
              />
            ) : (
              <ol className="space-y-3">
                {lessons.map((lesson) => (
                  <li
                    key={lesson._id}
                    className="flex items-center justify-between border border-rule px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{lesson.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {lesson.contentType}
                      </p>
                    </div>
                    {lesson.durationMinutes && (
                      <span className="tabular text-xs text-muted-foreground">
                        {lesson.durationMinutes} min
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>

      {isPaidCourse && !hasAccess && (
        <p className="text-xs text-center text-muted-foreground">
          Payments are processed securely by Paystack — cards, bank transfer &amp; USSD accepted.
        </p>
      )}
      </main>
    </>
  );
}
