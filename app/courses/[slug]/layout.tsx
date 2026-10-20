import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { siteConfig } from "@/lib/site";
import JsonLd from "@/components/seo/jsonld";
import {
  buildBreadcrumbSchema,
  buildCourseSchema,
  type CourseMeta,
} from "@/components/seo/schemas";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * The course document, as the schema and the metadata both need it.
 *
 * `notFound()` rather than a null return: a slug that matches no course is a
 * 404, and saying so here means the status code is right before a crawler
 * looks at the body. A page that renders "not found" with a 200 is a soft 404
 * — the exact thing that tells a search engine the URL is a duplicate of
 * another one it already has.
 */
async function loadCourse(slug: string): Promise<Doc<"courses">> {
  let course: Doc<"courses"> | null = null;
  try {
    const result = await client.query(api.courses.getCourseBySlug, { slug });
    course = result?.course ?? null;
  } catch {
    // Metadata is best-effort; the page itself handles a missing course.
  }

  if (!course) notFound();
  return course;
}

/** The shape the schema builders take, from the document the query returned. */
function toCourseMeta(course: Doc<"courses">): CourseMeta {
  return {
    title: course.title,
    description: course.description,
    slug: course.slug,
    thumbnailUrl: course.thumbnailUrl,
    category: course.category,
    level: course.level,
    priceKobo: course.price,
    publishedDate: course.createdAt
      ? new Date(course.createdAt).toISOString()
      : undefined,
    ratingSum: course.ratingSum,
    ratingCount: course.ratingCount,
  };
}

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
  const course = await loadCourse(slug);

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
  };
}

export default async function CourseDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await loadCourse(slug);
  const courseMeta = toCourseMeta(course);

  return (
    <>
      {/*
        The course's structured data, in the initial HTML.

        This used to be emitted through `metadata.other` under a
        `script:ld+json-course` key. Next.js has no special case for that
        name — it rendered as `<meta name="script:ld+json-course">`, which no
        crawler reads as structured data, so the markup was inert. It is a real
        `<script type="application/ld+json">` now, in the server-rendered
        response.

        The layout is where it lives because the layout is the server
        component that already has the course; the page itself is a client
        component that reads through `useQuery` and would have no data to
        describe during the server render.
      */}
      <JsonLd
        schema={[
          buildCourseSchema(courseMeta),
          buildBreadcrumbSchema(courseMeta),
        ]}
        id="course-schema"
      />
      {children}
    </>
  );
}
