import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { siteConfig } from "@/lib/site";
import { isConvexId } from "@/lib/instructors";

/**
 * Metadata for a public instructor profile.
 *
 * The page itself is a client component (it mirrors `app/courses/[slug]`, which
 * reads through `useQuery`), so the crawler-facing half lives here, the same way
 * the course detail route does it. Published profiles are in the sitemap, so
 * this is the half that decides whether the page is worth indexing.
 */

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/** Reads the card, treating an unreachable database as "no profile". */
async function loadInstructor(instructorId: string) {
  try {
    return await client.query(api.instructors.getInstructorCard, {
      instructorId: instructorId as Id<"users">,
    });
  } catch {
    // Metadata is best-effort; the page itself handles a missing profile.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ instructorId: string }>;
}): Promise<Metadata> {
  const { instructorId } = await params;

  // A segment that cannot be an id is a 404 without a round trip, and the same
  // guard keeps a thrown validator out of the metadata path.
  if (!isConvexId(instructorId)) notFound();

  const instructor = await loadInstructor(instructorId);
  if (!instructor) notFound();

  const description =
    instructor.bio?.slice(0, 160) ??
    `Courses by ${instructor.name} on Glypha Learn — expert-led lessons, quizzes and verified certificates.`;

  return {
    title: `${instructor.name} — Instructor`,
    description,
    alternates: { canonical: `/instructors/${instructorId}` },
    openGraph: {
      // No `images` — `./opengraph-image.tsx` generates the card, and Next
      // skips a file-based image when this key exists at all, even undefined.
      // See the note in `app/layout.tsx`.
      title: `${instructor.name} — Instructor on Glypha Learn`,
      description,
      url: `${siteConfig.url}/instructors/${instructorId}`,
      type: "profile",
      siteName: siteConfig.name,
      locale: "en_US",
    },
    twitter: {
      // Mirrored rather than inherited — a child's openGraph/twitter replaces
      // the root's wholesale, so X would otherwise show the site-wide copy on a
      // shared profile link.
      card: "summary_large_image",
      title: `${instructor.name} — Instructor on Glypha Learn`,
      description,
      site: "@glypha_learn",
    },
  };
}

export default function InstructorProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
