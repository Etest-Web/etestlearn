import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatCurrency } from "@/lib/currency";
import { renderOgBrandCard, renderOgCard, resolveOgImage } from "@/lib/og";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og-brand";

/**
 * The share card for one course: title, category, instructor, level and price,
 * with the course thumbnail down the right-hand side.
 *
 * Every failure path lands on the branded card rather than an error. This
 * route is what a crawler hits when a link is shared, and a 500 here does not
 * mean "no card" — it means the platform's own preview goes blank for every
 * share of a course. The page (`app/courses/[slug]/page.tsx`) is the thing
 * that should 404; this never does.
 */

export const runtime = "nodejs";

export const alt = "Glypha Learn course";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Reads the course, treating an unreachable database as "no course". */
async function loadCourse(slug: string) {
  try {
    const result = await client.query(api.courses.getCourseBySlug, { slug });
    return result?.course ?? null;
  } catch {
    return null;
  }
}

/**
 * The "taught by" name.
 *
 * Best-effort on purpose: it needs a second query, and losing the instructor
 * line costs the card a subtitle while losing the course costs it the card.
 */
async function loadInstructorName(instructorId: Id<"users">): Promise<string | undefined> {
  try {
    const card = await client.query(api.instructors.getInstructorCard, { instructorId });
    return card?.name || undefined;
  } catch {
    return undefined;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await loadCourse(slug);
  if (!course) return renderOgBrandCard();

  const [instructorName, image] = await Promise.all([
    loadInstructorName(course.instructorId),
    resolveOgImage(course.thumbnailUrl),
  ]);

  // A course with no price, or a stored price of 0, is free — the same rule
  // `lib/publishing.ts` applies to the unpublish policy.
  const priceLabel = course.price
    ? formatCurrency(course.price / 100, course.currency ?? "NGN")
    : "Free";

  return renderOgCard({
    eyebrow: course.category ?? "Course",
    title: course.title,
    subtitle: instructorName ? `Taught by ${instructorName}` : undefined,
    chips: [course.level, priceLabel].filter(Boolean) as string[],
    image,
  });
}
