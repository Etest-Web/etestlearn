"use client";

import { useState } from "react";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { notFound, useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
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
        <Button size="lg" className="mt-2" onClick={() => router.push("/sign-in")}>
          Sign in to enroll
        </Button>
      );
    }
    if (hasAccess) {
      return (
        <Button size="lg" className="mt-2" onClick={() => router.push(`/dashboard/courses/${course.slug}`)}>
          Continue learning
        </Button>
      );
    }
    if (isPaidCourse) {
      return (
        <Button size="lg" className="mt-2" disabled={isPaying} onClick={handlePay}>
          {isPaying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to Paystack...
            </>
          ) : (
            <>
              <Lock className="mr-2 h-4 w-4" /> Pay {formatNaira(course.price)} with Paystack
            </>
          )}
        </Button>
      );
    }
    return (
      <Button size="lg" className="mt-2" onClick={() => router.push(`/dashboard/courses/${course.slug}`)}>
        Enroll &amp; start learning
      </Button>
    );
  }

  return (
    <>
    <main className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      <header className="space-y-4">
        <Button onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div className="flex flex-wrap gap-2 items-center">
          <Image src={course.thumbnailUrl || "/hero-backdrop.jpg"} alt={course.title} width={500} height={500} className="w-full h-full object-cover rounded-lg" />
          {course.category && <Badge variant="secondary">{course.category}</Badge>}
          {course.level && (
            <Badge variant="outline" className="text-xs">
              {course.level}
            </Badge>
          )}
          <Badge variant={isPaidCourse ? "default" : "secondary"}>{formatNaira(course.price)}</Badge>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{course.title}</h1>
        <p className="text-muted-foreground">{course.description}</p>
        {renderCta()}
      </header>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Course outline</CardTitle>
          </CardHeader>
          <CardContent>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Lessons will appear here once you add them in Convex.
              </p>
            ) : (
              <ol className="space-y-3">
                {lessons.map((lesson) => (
                  <li
                    key={lesson._id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{lesson.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {lesson.contentType}
                      </p>
                    </div>
                    {lesson.durationMinutes && (
                      <span className="text-xs text-muted-foreground">
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
        <p className="text-xs text-muted-foreground text-center">
          Payments are processed securely by Paystack — cards, bank transfer &amp; USSD accepted.
        </p>
      )}
    </main>
    </>
  );
}
