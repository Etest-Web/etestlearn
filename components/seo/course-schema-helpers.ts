import type { SchemaOrg } from "./types";
import { siteConfig } from "@/lib/site";

export interface CourseMeta {
  title: string;
  description: string;
  slug: string;
  category?: string;
  level?: string;
  thumbnailUrl?: string;
  instructorName?: string;
  priceKobo?: number;
  publishedDate?: string;
}

interface CourseSchemaProps {
  course: CourseMeta;
}

export function buildCourseSchema(course: CourseMeta): SchemaOrg {
  const priceValue = course.priceKobo ? course.priceKobo / 100 : 0;
  const siteUrl = siteConfig.url;

  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description.slice(0, 1000),
    url: `${siteUrl}/courses/${course.slug}`,
    image: course.thumbnailUrl ? new URL(course.thumbnailUrl, siteUrl).href : `${siteUrl}${siteConfig.ogImage}`,
    inLanguage: "en",
    category: course.category,
    courseMode: "recorded",
    ...(course.category && { subject: course.category }),
    ...(course.level && { educationalAlignment: { "@type": "EducationalAlignment", alignmentType: "educationalLevel", targetName: course.level } }),
    about: course.description,
    offers: {
      "@type": "Offer",
      price: priceValue,
      priceCurrency: "NGN",
      availability: "https://schema.org/PreOrder", // Paid courses get PreOrder; free courses get InStock
      url: `${siteUrl}/courses/${course.slug}`,
      seller: {
        "@type": "Organization",
        name: "Glypha Learn",
      },
    },
    provider: {
      "@type": "Organization",
      name: "Glypha Learn",
      sameAs: [
        "https://twitter.com/glypha_learn",
        "https://linkedin.com/company/glypha-learn",
      ],
    },
  };
}

export function buildBreadcrumbSchema(slug: string): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteConfig.url,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Courses",
        item: `${siteConfig.url}/courses`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: slug,
        item: `${siteConfig.url}/courses/${slug}`,
      },
    ],
  };
}

export function buildHomepageSchema(): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Glypha Learn",
    description:
      "Glypha Learn is an online learning platform offering expert-led courses with quizzes, certificates, and verified completion — built for learners across Nigeria and beyond.",
    url: siteConfig.url,
    isPartOf: {
      "@type": "WebSite",
      name: "Glypha Learn",
      url: siteConfig.url,
    },
    about: {
      "@type": "EducationalOrganization",
      name: "Glypha Learn",
    },
  };
}

export function buildOrganizationSchema(): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Glypha Learn",
    description:
      "Glypha Learn is an online learning platform offering expert-led courses with quizzes, certificates, and verified completion — built for learners across Nigeria and beyond.",
    url: siteConfig.url,
    logo: `${siteConfig.url}/SmallLogo.svg`,
    sameAs: [
      "https://twitter.com/glypha_learn",
      "https://linkedin.com/company/glypha-learn",
    ],
  };
}

export function buildSitemapSchema(): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Glypha Learn",
    url: siteConfig.url,
  };
}

/**
 * DEPRECATED: Use server-side ScriptLdJson instead.
 * This function is kept for backward compatibility but should not be used.
 * @deprecated
 */
export function buildCourseSchemaLegacy(course: { title: string; slug: string; category?: string }): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    url: `${siteConfig.url}/courses/${course.slug}`,
    ...(course.category && { subject: course.category }),
  };
}