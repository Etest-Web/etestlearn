"use client";

import { useMemo } from "react";
import ScriptOrg from "@/components/seo/script-org";
import type { SchemaOrg } from "@/components/seo/types";

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

function buildCourseSchema(course: CourseMeta): SchemaOrg {
  const priceValue = course.priceKobo ? course.priceKobo / 100 : 0;
  const priceCurrency = "NGN";

  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description.slice(0, 1000),
    url: new URL(`/courses/${course.slug}`, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").href,
    image: course.thumbnailUrl
      ? new URL(course.thumbnailUrl, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").href
      : "/certf.jpeg",
    inLanguage: "en",
    category: course.category,
    courseMode: "recorded",
    numberOfCredits: null,
    educationalCredentialAwarded: null,
    subject: course.category,
    about: course.description,
    offers: {
      "@type": "Offer",
      price: priceValue,
      priceCurrency: priceCurrency,
      availability: priceValue > 0 ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    },
    provider: {
      "@type": "Organization",
      name: "Glypha Learn",
      sameAs: [
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      ],
    },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "recorded",
      courseWorkUrl: new URL(`/courses/${course.slug}`, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").href,
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
        item: new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").href,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Courses",
        item: new URL("/courses", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").href,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: slug,
        item: new URL(`/courses/${slug}`, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").href,
      },
    ],
  };
}

export function CourseSchema({ course }: CourseSchemaProps) {
  const schema = useMemo(() => buildCourseSchema(course), [course]);

  return <ScriptOrg organization={schema} />;
}

export function CourseBreadcrumb({ slug }: { slug: string }) {
  const schema = useMemo(() => buildBreadcrumbSchema(slug), [slug]);
  return <ScriptOrg organization={schema} />;
}