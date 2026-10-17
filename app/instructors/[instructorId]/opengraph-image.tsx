import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isConvexId } from "@/lib/instructors";
import { renderOgBrandCard, renderOgCard, resolveOgImage } from "@/lib/og";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og-brand";

/**
 * The share card for a public instructor profile: name, bio line and the
 * profile photo down the right-hand side.
 *
 * Same rule as the course card: every failure path lands on the branded card.
 * A profile that has since been unpublished, suspended or deleted should keep
 * its existing shared links looking intentional rather than broken — the page
 * still 404s, which is the correct answer for a human, but a crawler has
 * nothing to show either way and a blank preview is worse than a generic one.
 */

export const runtime = "nodejs";

export const alt = "Glypha Learn instructor";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function loadInstructor(instructorId: string) {
  try {
    return await client.query(api.instructors.getInstructorCard, {
      instructorId: instructorId as Id<"users">,
    });
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ instructorId: string }>;
}) {
  const { instructorId } = await params;

  // The same guard the page's metadata uses: a segment that cannot be an id is
  // answered without a round trip, and a thrown validator never reaches here.
  if (!isConvexId(instructorId)) return renderOgBrandCard();

  const instructor = await loadInstructor(instructorId);
  if (!instructor) return renderOgBrandCard();

  const image = await resolveOgImage(instructor.imageUrl);

  return renderOgCard({
    eyebrow: "Instructor",
    title: instructor.name,
    subtitle:
      instructor.bio ??
      // Only used when the account has no bio. Kept short on purpose: the
      // wordmark already names the platform, and the previous phrasing
      // ("…verified certificates on Glypha Learn.") was clamped mid-word at
      // card width.
      "Expert-led courses, quizzes and verified certificates.",
    chips: [instructor.location].filter(Boolean) as string[],
    image,
  });
}
