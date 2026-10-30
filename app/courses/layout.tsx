import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { siteConfig } from "@/lib/site";
import JsonLd from "@/components/seo/jsonld";
import {
  buildBreadcrumbsSchema,
  buildCourseCatalogSchema,
} from "@/components/seo/schemas";

export const metadata: Metadata = {
  title: "Explore Courses",
  description:
    "Browse published courses across tech, business, and creative skills — free and paid, with quizzes and certificates.",
  alternates: { canonical: "/courses" },
  openGraph: {
    title: "Explore Courses | Glypha Learn",
    description:
      "Browse published courses across tech, business, and creative skills — free and paid, with quizzes and certificates.",
    url: `${siteConfig.url}/courses`,
    type: "website",
    siteName: siteConfig.name,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Courses | Glypha Learn",
    description:
      "Browse published courses across tech, business, and creative skills — free and paid, with quizzes and certificates.",
    site: "@glypha_learn",
    creator: "@glypha_learn",
  },
};

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default async function CoursesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let coursesList: { title: string; slug: string; description?: string }[] = [];
  try {
    const published = await client.query(api.courses.listPublishedCourses, {});
    coursesList = (published ?? []).map((c) => ({
      title: c.title,
      slug: c.slug,
      description: c.description,
    }));
  } catch {
    // Best-effort if database is unreachable during SSR
  }

  return (
    <>
      <JsonLd
        schema={[
          buildCourseCatalogSchema(coursesList),
          buildBreadcrumbsSchema(
            [
              { name: "Home", url: "/" },
              { name: "Courses", url: "/courses" },
            ],
            `${siteConfig.url}/courses#breadcrumb`
          ),
        ]}
        id="catalog-schema"
      />
      {children}
    </>
  );
}
