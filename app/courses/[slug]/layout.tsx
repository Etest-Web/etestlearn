import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { siteConfig } from "@/lib/site";
import { buildCourseSchema, buildBreadcrumbSchema } from "@/components/seo/course-schema-helpers";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  let course: { title: string; description: string; thumbnailUrl?: string } | null = null;
  try {
    const result = await client.query(api.courses.getCourseBySlug, { slug });
    course = result?.course ?? null;
  } catch {
    // Metadata is best-effort; the page itself handles missing courses.
  }

  if (!course) {
    // Server-side 404: no content, no metadata, proper HTTP 404
    notFound();
  }

  const description = course.description.slice(0, 160);
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${slug}` },
    openGraph: {
      title: course.title,
      description,
      url: `${siteConfig.url}/courses/${slug}`,
      images: course.thumbnailUrl ? [{ url: course.thumbnailUrl }] : undefined,
      type: "article",
    },
    other: {
      // Server-side JSON-LD via `other` (Next.js injects these into <head>).
      "script:ld+json-course": JSON.stringify(buildCourseSchema({
        title: course.title,
        description: course.description,
        slug: slug,
        thumbnailUrl: course.thumbnailUrl,
        // Additional minimal fields needed for buildCourseSchema type
        category: undefined,
        level: undefined,
        priceKobo: undefined,
        publishedDate: undefined,
      }), null, 2),
      "script:ld+json-breadcrumb": JSON.stringify(buildBreadcrumbSchema(slug), null, 2),
    },
  };
}

export default function CourseDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}