import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { siteConfig } from "@/lib/site";
import { buildCourseSchema, buildBreadcrumbSchema } from "@/components/seo/course-schema-helpers";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // The whole document, not a narrowed pick: the schema below needs category,
  // level, price and its creation date, which the previous hand-written
  // annotation excluded — so they were being passed as `undefined` and dropped
  // from the structured data entirely.
  let course: Doc<"courses"> | null = null;
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
      // No `images`: `./opengraph-image.tsx` in this directory generates the
      // card, and Next only applies a file-based image when the key is absent
      // entirely — `images: undefined` still counts as present and would
      // suppress it. See the longer note in `app/layout.tsx`.
      title: course.title,
      description,
      url: `${siteConfig.url}/courses/${slug}`,
      type: "article",
      siteName: siteConfig.name,
      locale: "en_US",
    },
    twitter: {
      // Mirrored rather than inherited: a child's `openGraph`/`twitter`
      // replaces the root's wholesale (Next merges metadata shallowly), so
      // without this block X renders the *site-wide* title and description on
      // a shared course link — the preview and the page disagreeing.
      card: "summary_large_image",
      title: course.title,
      description,
      site: "@glypha_learn",
    },
    other: {
      // Server-side JSON-LD via `other` (Next.js injects these into <head>).
      // Everything below comes from the one query already made for the
      // metadata above — the course document carries category, level, price and
      // its creation date, which the schema previously received as undefined
      // and therefore omitted from the structured data entirely.
      "script:ld+json-course": JSON.stringify(buildCourseSchema({
        title: course.title,
        description: course.description,
        slug: slug,
        thumbnailUrl: course.thumbnailUrl,
        category: course.category,
        level: course.level,
        priceKobo: course.price,
        publishedDate: course.createdAt
          ? new Date(course.createdAt).toISOString()
          : undefined,
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