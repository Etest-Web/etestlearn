import { averageRating } from "@/lib/reviews";
import { siteConfig } from "@/lib/site";
import type { SchemaOrg } from "./types";

/**
 * Every schema.org document this site emits.
 *
 * One file, one reason: the shapes are cross-referenced by `@id` (the
 * Organization is the WebSite's publisher and the WebPage's `about`), so a
 * document split across files drifts — a `@id` that no longer matches is a
 * silent reference break, and a reference break is how a site ends up with two
 * competing names for the same entity.
 *
 * These are plain functions, not components, so a server component can build
 * them from data it already has and hand the result to `JsonLd`.
 */

const ORGANIZATION_ID = `${siteConfig.url}/#organization`;
const WEBSITE_ID = `${siteConfig.url}/#website`;

export interface CourseMeta {
  title: string;
  description: string;
  slug: string;
  category?: string;
  level?: string;
  thumbnailUrl?: string;
  priceKobo?: number;
  publishedDate?: string;
  ratingSum?: number;
  ratingCount?: number;
}

export interface InstructorMeta {
  /** The Convex user id — the profile URL is `/instructors/<id>`. */
  instructorId: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  website?: string;
  ratingSum?: number;
  ratingCount?: number;
}

export interface FaqEntry {
  q: string;
  a: string;
}

/**
 * The organization behind the site.
 *
 * `EducationalOrganization` is listed alongside `Organization` rather than
 * instead of it: the two types carry the same properties here, and naming both
 * means a reader (or a validator) sees the specific type without losing the
 * generic one that most consumers key off.
 */
export function buildOrganizationSchema(): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "EducationalOrganization"],
    "@id": ORGANIZATION_ID,
    name: siteConfig.name,
    alternateName: "Glypha",
    description: siteConfig.description,
    url: siteConfig.url,
    logo: {
      "@type": "ImageObject",
      url: `${siteConfig.url}/SmallLogo.svg`,
      width: 500,
      height: 500,
    },
    image: `${siteConfig.url}${siteConfig.ogImage}`,
    sameAs: [
      "https://twitter.com/glypha_learn",
      "https://linkedin.com/company/glypha-learn",
    ],
  };
}

/**
 * The site itself.
 *
 * This is the document Google reads to decide what to call the site in search
 * results, which is why it carries an explicit `name` rather than leaving it
 * to be inferred from the title. `alternateName` covers the shorter form the
 * brand is also known by, so a search for either resolves to the same entity
 * instead of creating a second one.
 *
 * `potentialAction` points at the catalog search, which is the one search
 * surface the site actually has (`/courses?q=`). Declaring a `SearchAction`
 * for a query box that does not exist is a lie the markup should not tell.
 */
export function buildWebSiteSchema(): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: siteConfig.name,
    alternateName: "Glypha",
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteConfig.url}/courses?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * The homepage as a page, hung off the site and the organization.
 *
 * `isPartOf` and `about` are `@id` references rather than copies of the
 * documents, so the homepage, the site and the organization are one graph
 * instead of three look-alikes.
 */
export function buildWebPageSchema(): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${siteConfig.url}/#webpage`,
    url: siteConfig.url,
    name: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
  };
}

export function buildFaqSchema(faqs: readonly FaqEntry[]): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteConfig.url}/#faq`,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

/**
 * A course listing.
 *
 * Three things here are load-bearing for how Google reads a course:
 *
 * · `offers.availability` is `InStock`. The previous value was `SoldOut` for
 *   paid courses and `PreOrder` for free ones, both of which tell a search
 *   engine the course cannot be bought — the opposite of the truth, and enough
 *   to suppress the listing entirely.
 * · `price` is `0` for a free course. A free course with no `price` is read as
 *   "price unknown" rather than "free".
 * · `aggregateRating` is emitted only when there is at least one rating. An
 *   average over zero ratings is `0`, and a `0` star average is a worse signal
 *   than no rating at all.
 */
export function buildCourseSchema(course: CourseMeta): SchemaOrg {
  const priceValue = course.priceKobo ? course.priceKobo / 100 : 0;
  const url = `${siteConfig.url}/courses/${course.slug}`;
  const rating = averageRating(course.ratingSum, course.ratingCount);

  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    name: course.title,
    description: course.description.slice(0, 1000),
    url,
    image: course.thumbnailUrl
      ? new URL(course.thumbnailUrl, siteConfig.url).href
      : `${siteConfig.url}${siteConfig.ogImage}`,
    inLanguage: "en",
    courseMode: "recorded",
    ...(course.category ? { category: course.category, subject: course.category } : {}),
    ...(course.level
      ? {
          educationalLevel: course.level,
          educationalAlignment: {
            "@type": "EducationalAlignment",
            alignmentType: "educationalLevel",
            targetName: course.level,
          },
        }
      : {}),
    ...(course.publishedDate ? { datePublished: course.publishedDate } : {}),
    provider: { "@id": ORGANIZATION_ID },
    publisher: { "@id": ORGANIZATION_ID },
    offers: {
      "@type": "Offer",
      url,
      price: priceValue,
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
      category: priceValue > 0 ? "Paid" : "Free",
      seller: { "@id": ORGANIZATION_ID },
    },
    ...(rating !== null && course.ratingCount
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: rating.toFixed(1),
            reviewCount: course.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

export function buildBreadcrumbSchema(course: CourseMeta): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${siteConfig.url}/courses/${course.slug}#breadcrumb`,
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
        name: course.title,
        item: `${siteConfig.url}/courses/${course.slug}`,
      },
    ],
  };
}

/**
 * A public instructor profile, as a page and as the person it is about.
 *
 * `mainEntity` points at the `Person` rather than repeating its properties,
 * so the profile page and the instructor are one entity with two faces.
 */
export function buildInstructorProfileSchema(instructor: InstructorMeta): SchemaOrg {
  const url = `${siteConfig.url}/instructors/${instructor.instructorId}`;
  const rating = averageRating(instructor.ratingSum, instructor.ratingCount);

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#profilepage`,
    url,
    name: `${instructor.name} — Instructor on ${siteConfig.name}`,
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#person`,
      name: instructor.name,
      ...(instructor.imageUrl
        ? { image: new URL(instructor.imageUrl, siteConfig.url).href }
        : {}),
      ...(instructor.bio ? { description: instructor.bio.slice(0, 1000) } : {}),
      ...(instructor.website ? { sameAs: [instructor.website] } : {}),
      jobTitle: "Instructor",
      worksFor: { "@id": ORGANIZATION_ID },
      ...(rating !== null && instructor.ratingCount
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: rating.toFixed(1),
              reviewCount: instructor.ratingCount,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    },
  };
}
