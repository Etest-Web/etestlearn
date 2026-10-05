"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "convex/react";
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
      className="group flex flex-col overflow-hidden rounded-sm border border-rule bg-card transition-[border-color,transform] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:-translate-y-1 hover:border-rule-strong"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        {course.thumbnailUrl ? (
          <Image
            src={course.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="display-subheading text-4xl text-muted-foreground/40">
              {course.title.slice(0, 24)}
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-sm bg-background/90 px-3 py-1 text-[11px] font-semibold backdrop-blur-sm">
          {price ? (
            <span className="tabular">{price}</span>
          ) : (
            <span className="text-success">Free</span>
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          {course.category ? (
            <span className="text-[11px] font-semibold uppercase tracking-label text-primary">
              {course.category}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1" title={course.level ?? undefined}>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                aria-hidden="true"
                className={`size-1.5 rounded-full ${dots >= n ? "bg-brand" : "bg-rule-strong"}`}
              />
            ))}
          </div>
        </div>

        <h3 className="text-base font-semibold leading-snug text-balance group-hover:text-primary">
          {course.title}
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{course.description}</p>

        <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
          View course
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col overflow-hidden rounded-sm border border-rule bg-card">
      <div className="aspect-[16/10] bg-surface-sunken" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-16 rounded-sm bg-surface-sunken" />
        <div className="h-4 w-3/4 rounded-sm bg-surface-sunken" />
        <div className="h-3 w-full rounded-sm bg-surface-sunken" />
      </div>
    </div>
  );
}

function CatalogEmptyState() {
  return (
    <div className="col-span-full border border-rule bg-card">
      <EmptyState
        icon={BookOpen}
        tone="brand"
        title="The catalog is being curated"
        description="Our first courses are in review right now. Check back shortly — or apply to teach the first one."
        action={
          <Button render={<Link href="/become-instructor" />}>
            Become an instructor
          </Button>
        }
      />
    </div>
  );
}

export function CourseShowcase() {
  const courses = useQuery(api.courses.listPublishedCourses);
  const featured = courses?.slice(0, 6);

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
      <Reveal>
        <SectionHeading
          index="01"
          kicker="The catalog"
          title={
            <>
              INTENTIONAL COURSES
              <br />
              HAND-PICKED AND VERIFIED.
            </>
          }
          description="Every course is reviewed before it goes live — structured lessons, real assessments, and outcomes you can show for your time."
        />
      </Reveal>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses === undefined &&
          Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}

        {courses !== undefined && featured && featured.length > 0 && (
          <>
            {featured.map((course, i) => (
              <Reveal key={course._id} delay={(i % 3) * 90}>
                <CourseCard course={course} />
              </Reveal>
            ))}
          </>
        )}

        {courses !== undefined && courses.length === 0 && <CatalogEmptyState />}
      </div>

      {courses !== undefined && courses.length > 6 && (
        <div className="mt-10 flex justify-center">
          <Link
            href="/courses"
            className="inline-flex h-11 items-center justify-center rounded-sm border border-rule-strong px-6 text-sm font-medium transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Browse all <span className="tabular">{courses.length}</span> courses
          </Link>
        </div>
      )}
    </section>
  );
}
