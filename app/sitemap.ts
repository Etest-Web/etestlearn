import type { MetadataRoute } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteConfig.url, changeFrequency: "weekly", priority: 1 },
    { url: `${siteConfig.url}/courses`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteConfig.url}/become-instructor`, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    const courses = await client.query(api.courses.listPublishedCourses, {});
    return [
      ...staticRoutes,
      ...courses.map((course) => ({
        url: `${siteConfig.url}/courses/${course.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // Sitemap must not fail the build if the database is unreachable.
    return staticRoutes;
  }
}
