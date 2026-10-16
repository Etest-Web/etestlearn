"use client";

import { useState, useEffect } from "react";
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
  Input,
  Label,
  PageHeader,
} from "@/components/ui";
import { CourseSchema } from "@/components/seo/course-schema";
import { CourseReviews } from "@/components/course-reviews";
import { StarRating } from "@/components/star-rating";
import Link from "next/link";
import { notFound, useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, ListChecks, Loader2, Lock } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { useLocalization } from "@/components/localization-provider";
import { averageRating, formatRating } from "@/lib/reviews";
import { COUPON_CODE_MAX_LENGTH } from "@/lib/coupons";

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
  // The "taught by" card. Deliberately the light `getInstructorCard` rather than
  // the full profile: a course page needs a name and a face, not a read of every
  // other course the instructor has listed.
  const instructor = useQuery(
    api.instructors.getInstructorCard,
    data?.course ? { instructorId: data.course.instructorId } : "skip",
  );
  const createPendingPurchase = useMutation(api.payments.createPendingPurchase);
  const initializeCheckout = useAction(api.paystack.initializeCheckout);

  const [isPaying, setIsPaying] = useState(false);

  // Coupon state. The code is only sent to the server when the buyer presses
  // Apply — a live query keyed on every keystroke would be a request per
  // character for an answer that is almost always "no".
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

  // The price after an accepted coupon, formatted the same way as the list
  // price. `null` means no accepted coupon, so the list price stands.
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

  // The code is sent whenever the buyer submitted one, not only when the
  // preview said it was good. The preview is advisory; `createPendingPurchase`
  // is the authority, so a code that lapsed while the page sat open is judged
  // there rather than silently dropped because a preview had not loaded yet.
  const appliedCouponCode = submittedCode || undefined;
  const payablePrice = discountedPrice ?? displayPrice;

  async function handlePay() {
    if (!data) return;
    setIsPaying(true);
    try {
      // Step 1: create pending purchase record. The coupon code is re-checked
      // server-side; the discounted price the buyer saw is what gets charged.
      const { reference } = await createPendingPurchase({
        courseId: data.course._id,
        couponCode: appliedCouponCode,
      });
      // Step 2: get Paystack checkout URL and redirect, passing the localized currency
      const { authorizationUrl } = await initializeCheckout({ 
        reference,
        currency: currency 
      });
      window.location.href = authorizationUrl;
    } catch (err) {
      toast.error(getErrorMessage(err, "Payment failed to start"));
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
  // The running total lives on the course document, so the header and the
  // review block below it read the same two numbers and cannot drift apart.
  const average = averageRating(course.ratingSum, course.ratingCount);

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
              <Lock /> Pay {payablePrice} with Paystack
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
      <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => router.back()}>
        <ArrowLeft /> Back
      </Button>

      <PageHeader
        title={course.title}
        description={course.description}
        actions={renderCta()}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Image src={course.thumbnailUrl || "/hero-backdrop.jpg"} alt={course.title} width={500} height={500} className="h-12 w-12 shrink-0 rounded-sm object-cover" />
          {course.category && <Badge variant="secondary">{course.category}</Badge>}
          {course.level && <Badge variant="outline">{course.level}</Badge>}
          {average !== null && (
            <span className="flex items-center gap-1.5">
              <StarRating value={average} size="sm" />
              <span className="tabular text-sm text-muted-foreground">
                {formatRating(average)}
                {course.ratingCount ? ` · ${course.ratingCount}` : ""}
              </span>
            </span>
          )}
          <span className="tabular text-[15px] font-semibold text-foreground">
            {discountedPrice && (
              <span className="mr-2 font-normal text-muted-foreground line-through">
                {displayPrice}
              </span>
            )}
            {payablePrice}
          </span>
        </div>
      </PageHeader>

      {/* Coupon entry sits with the price it changes, and only for a paid course
          the visitor has not already bought. */}
      {isPaidCourse && !hasAccess && (
        <section className="rounded-sm border border-rule p-4">
          <Label htmlFor="coupon-code-input" className="eyebrow">
            Have a coupon?
          </Label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              id="coupon-code-input"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              maxLength={COUPON_CODE_MAX_LENGTH}
              placeholder="DISCOUNT-CODE"
              className="max-w-[16rem] font-mono"
            />
            <Button
              variant="outline"
              onClick={() => setSubmittedCode(couponInput.trim())}
              disabled={couponInput.trim().length < 4}
            >
              Apply
            </Button>
            {submittedCode && (
              <Button
                variant="ghost"
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
              className={
                couponPreview.valid
                  ? "mt-2 text-sm text-success"
                  : "mt-2 text-sm text-destructive"
              }
            >
              {couponPreview.message}
            </p>
          )}
        </section>
      )}

      {instructor && (
        <section>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4">
              <Image
                src={instructor.imageUrl || "/certf.jpeg"}
                alt={instructor.name}
                width={112}
                height={112}
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Taught by
                </p>
                <p className="font-medium">
                  {instructor.name}
                  {instructor.pronouns && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({instructor.pronouns})
                    </span>
                  )}
                </p>
                {instructor.bio && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{instructor.bio}</p>
                )}
              </div>
              {/* A real link, not a router.push: this is the one crawlable path
                  into the public profile, which is what makes listing profiles
                  in the sitemap worth anything. */}
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/instructors/${instructor._id}`} />}
              >
                View profile
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

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

      <section>
        <CourseReviews
          courseId={course._id}
          ratingSum={course.ratingSum}
          ratingCount={course.ratingCount}
        />
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
