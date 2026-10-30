import type { MetadataRoute } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${siteConfig.url}/courses`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/become-instructor`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteConfig.url}/support`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  try {
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const courses = await client.query(api.courses.listPublishedCourses, {});

    // Instructor profiles come from the courses already in hand rather than a
    // second query: a profile exists to be found through a course, and any
    // instructor with nothing published has nothing to crawl yet. `Set` because
    // one instructor teaching five courses is one profile.
    const instructorIds = [...new Set(courses.map((course) => course.instructorId))];

    return [
      ...staticRoutes,
      ...courses.map((course) => ({
        url: `${siteConfig.url}/courses/${course.slug}`,
        lastModified: new Date(course.updatedAt ?? course.createdAt ?? Date.now()),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...instructorIds.map((instructorId) => ({
        url: `${siteConfig.url}/instructors/${instructorId}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    // Sitemap must not fail the build if the database is unreachable.
    return staticRoutes;
  }
}
