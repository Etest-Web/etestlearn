import Link from "next/link";
import Image from "next/image";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const LEVEL_DOTS: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

function formatNaira(kobo?: number) {
  if (!kobo || kobo === 0) return null;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

export function CourseCard({ course }: { course: Doc<"courses"> }) {
  const price = formatNaira(course.price);
  const dots = LEVEL_DOTS[(course.level ?? "").toLowerCase()] ?? 0;

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-sm border border-rule bg-card transition-[border-color,transform] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:-translate-y-1 hover:border-rule-strong"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        {course.thumbnailUrl ? (
          <Image
            src={course.thumbnailUrl}
            alt={course.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/60" />
          </div>
        )}
        {course.category ? (
          <span className="absolute left-3 top-3 rounded-sm bg-background/90 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
            {course.category}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-[-0.01em]">
            {course.title}
          </h3>
          {price ? (
            <span className="shrink-0 text-sm font-semibold">{price}</span>
          ) : (
            <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Free
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-sm leading-body text-muted-foreground">
          {course.description}
        </p>
        <div className="mt-auto flex items-center justify-between pt-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i < dots ? "bg-brand" : "bg-rule-strong"
                  }`}
                />
              ))}
            </span>
            <span className="capitalize">{course.level || "All levels"}</span>
          </div>
          <span className="inline-flex items-center gap-1 transition-transform group-hover:translate-x-0.5">
            View course
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function CatalogEmptyState() {
  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <EmptyState
        icon={BookOpen}
        tone="brand"
        title="The catalog is being curated"
        description="The first courses are in review right now. Browse back shortly, or apply to teach one of them."
        action={
          <Button render={<Link href="/become-instructor" />}>
            Apply to teach
          </Button>
        }
      />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sm border border-rule bg-card">
      <div className="aspect-[16/10] animate-pulse bg-surface-sunken" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="h-5 w-2/3 animate-pulse rounded-sm bg-surface-sunken" />
          <div className="h-4 w-14 animate-pulse rounded-sm bg-surface-sunken" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded-sm bg-surface-sunken" />
          <div className="h-3 w-4/5 animate-pulse rounded-sm bg-surface-sunken" />
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="h-3 w-24 animate-pulse rounded-sm bg-surface-sunken" />
          <div className="h-3 w-20 animate-pulse rounded-sm bg-surface-sunken" />
        </div>
      </div>
    </div>
  );
}

export async function CourseShowcase() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  let courses: Doc<"courses">[] = [];
  if (url) {
    try {
      const client = new ConvexHttpClient(url);
      courses = (await client.query(api.courses.listPublishedCourses, {})) ?? [];
    } catch {
      courses = [];
    }
  }
  const featured = courses.slice(0, 6);

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
      <Reveal>
        <SectionHeading
          title="Every course is reviewed before it goes live."
          description="Structured lessons, real assessments, and the price in naira shown before you enroll."
        />
      </Reveal>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featured.length > 0 && (
          <>
            {featured.map((course, i) => (
              <Reveal key={course._id} delay={(i % 3) * 90}>
                <CourseCard course={course} />
              </Reveal>
            ))}
          </>
        )}

        {featured.length === 0 && <CatalogEmptyState />}
      </div>

      {courses.length > 6 && (
        <div className="mt-10 flex justify-center">
          <Link
            href="/courses"
            className="inline-flex h-11 items-center justify-center rounded-sm border border-rule-strong px-6 text-sm font-medium transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Browse courses
          </Link>
        </div>
      )}
    </section>
  );
}
