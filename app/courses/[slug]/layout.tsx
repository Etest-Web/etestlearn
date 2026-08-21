import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { siteConfig } from "@/lib/site";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  let course: { title: string; description: string; thumbnailUrl?: string } | null =
    null;
  try {
    const result = await client.query(api.courses.getCourseBySlug, { slug });
    course = result?.course ?? null;
  } catch {
    // Metadata is best-effort; the page itself handles missing courses.
  }

  if (!course) {
    return { title: "Course" };
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
  };
}

export default function CourseDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
