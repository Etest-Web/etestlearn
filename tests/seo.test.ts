import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { siteConfig } from "@/lib/site";
import {
  buildBreadcrumbsSchema,
  buildCourseCatalogSchema,
  buildCourseSchema,
  buildFaqSchema,
  buildInstructorProfileSchema,
  buildOrganizationSchema,
  buildSupportPageSchema,
  buildTeachPageSchema,
  buildWebPageSchema,
  buildWebSiteSchema,
} from "@/components/seo/schemas";

describe("robots.txt configuration", () => {
  it("allows public crawling and locks down private/authenticated routes", () => {
    const config = robots();
    expect(config.sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
    expect(config.host).toBe(siteConfig.url);

    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const defaultRule = rules.find((r) => r.userAgent === "*");
    expect(defaultRule).toBeDefined();
    expect(defaultRule?.allow).toBe("/");

    const disallow = Array.isArray(defaultRule?.disallow)
      ? defaultRule?.disallow
      : [defaultRule?.disallow];

    expect(disallow).toContain("/dashboard");
    expect(disallow).toContain("/dashboard/");
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/sign-in");
    expect(disallow).toContain("/sign-up");
    expect(disallow).toContain("/courses/paid/");
    expect(disallow).toContain("/sso-callback");
    expect(disallow).toContain("/maintenance");
  });
});

describe("sitemap configuration", () => {
  it("includes all key static routes with priorities and lastModified timestamps", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(siteConfig.url);
    expect(urls).toContain(`${siteConfig.url}/courses`);
    expect(urls).toContain(`${siteConfig.url}/become-instructor`);
    expect(urls).toContain(`${siteConfig.url}/support`);

    for (const entry of entries) {
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.lastModified).toBeDefined();
      expect(entry.lastModified instanceof Date).toBe(true);
      expect(entry.priority).toBeGreaterThanOrEqual(0.1);
      expect(entry.priority).toBeLessThanOrEqual(1.0);
    }
  });
});

describe("Schema.org structured data generators", () => {
  it("builds valid Organization and EducationalOrganization schema", () => {
    const schema = buildOrganizationSchema();
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toEqual(["Organization", "EducationalOrganization"]);
    expect(schema["@id"]).toBe(`${siteConfig.url}/#organization`);
    expect(schema.name).toBe(siteConfig.name);
    expect(schema.url).toBe(siteConfig.url);
    expect(schema.logo).toBeDefined();
    expect(schema.sameAs).toBeInstanceOf(Array);
  });

  it("builds valid WebSite schema with catalog search action", () => {
    const schema = buildWebSiteSchema();
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("WebSite");
    expect(schema["@id"]).toBe(`${siteConfig.url}/#website`);
    expect(schema.name).toBe(siteConfig.name);
    expect(schema.potentialAction).toBeDefined();
    expect(schema.potentialAction["@type"]).toBe("SearchAction");
  });

  it("builds valid WebPage schema pointing to WebSite and Organization", () => {
    const schema = buildWebPageSchema();
    expect(schema["@type"]).toBe("WebPage");
    expect(schema.isPartOf).toEqual({ "@id": `${siteConfig.url}/#website` });
    expect(schema.about).toEqual({ "@id": `${siteConfig.url}/#organization` });
  });

  it("builds valid Course schema with Online courseMode, instance, and offers", () => {
    const course = {
      title: "Introduction to TypeScript",
      description: "Learn modern TypeScript with practical projects.",
      slug: "intro-typescript",
      category: "Tech",
      level: "Beginner",
      priceKobo: 500000, // 5000 NGN
      ratingSum: 48,
      ratingCount: 10,
      instructorName: "Ada Lovelace",
      instructorId: "user-123",
    };

    const schema = buildCourseSchema(course);
    expect(schema["@type"]).toBe("Course");
    expect(schema.name).toBe(course.title);
    expect(schema.url).toBe(`${siteConfig.url}/courses/${course.slug}`);
    expect(schema.courseMode).toBe("Online");
    expect(schema.hasCourseInstance).toEqual({
      "@type": "CourseInstance",
      courseMode: "Online",
      courseWorkload: "Level: Beginner",
    });
    expect(schema.instructor).toEqual({
      "@type": "Person",
      name: "Ada Lovelace",
      url: `${siteConfig.url}/instructors/user-123`,
    });
    expect(schema.offers).toEqual({
      "@type": "Offer",
      url: `${siteConfig.url}/courses/${course.slug}`,
      price: 5000,
      priceCurrency: "NGN",
      availability: "https://schema.org/InStock",
      category: "Paid",
      seller: { "@id": `${siteConfig.url}/#organization` },
    });
    expect(schema.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: 10,
      bestRating: 5,
      worstRating: 1,
    });
  });

  it("builds Course schema for a free unrated course without aggregateRating", () => {
    const course = {
      title: "Free Git Basics",
      description: "Start using Git in minutes.",
      slug: "git-basics",
    };

    const schema = buildCourseSchema(course);
    expect(schema["@type"]).toBe("Course");
    expect(schema.offers.price).toBe(0);
    expect(schema.offers.category).toBe("Free");
    expect(schema.aggregateRating).toBeUndefined();
    expect(schema.instructor).toBeUndefined();
  });

  it("builds ItemList schema for course catalog", () => {
    const courses = [
      { title: "Course 1", slug: "c1" },
      { title: "Course 2", slug: "c2" },
    ];
    const schema = buildCourseCatalogSchema(courses);
    expect(schema["@type"]).toBe("ItemList");
    expect(schema.numberOfItems).toBe(2);
    expect(schema.itemListElement).toHaveLength(2);
    expect(schema.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Course 1",
      url: `${siteConfig.url}/courses/c1`,
    });
  });

  it("builds BreadcrumbList schema correctly", () => {
    const items = [
      { name: "Home", url: "/" },
      { name: "Courses", url: "/courses" },
      { name: "Next.js", url: "/courses/nextjs" },
    ];
    const schema = buildBreadcrumbsSchema(items, "test-id");
    expect(schema["@type"]).toBe("BreadcrumbList");
    expect(schema["@id"]).toBe("test-id");
    expect(schema.itemListElement).toHaveLength(3);
    expect(schema.itemListElement[2].item).toBe(`${siteConfig.url}/courses/nextjs`);
  });

  it("builds ContactPage schema for support", () => {
    const schema = buildSupportPageSchema();
    expect(schema["@type"]).toBe("ContactPage");
    expect(schema.url).toBe(`${siteConfig.url}/support`);
    expect(schema.isPartOf).toEqual({ "@id": `${siteConfig.url}/#website` });
  });

  it("builds WebPage schema for instructor recruitment", () => {
    const schema = buildTeachPageSchema();
    expect(schema["@type"]).toBe("WebPage");
    expect(schema.url).toBe(`${siteConfig.url}/become-instructor`);
    expect(schema.isPartOf).toEqual({ "@id": `${siteConfig.url}/#website` });
  });

  it("builds ProfilePage and Person schema for instructors", () => {
    const schema = buildInstructorProfileSchema({
      instructorId: "inst_123",
      name: "Prof. John Doe",
      bio: "Senior engineer and educator.",
      imageUrl: "https://example.com/photo.jpg",
      website: "https://johndoe.com",
      ratingSum: 19,
      ratingCount: 4,
    });
    expect(schema["@type"]).toBe("ProfilePage");
    expect(schema.url).toBe(`${siteConfig.url}/instructors/inst_123`);
    expect(schema.mainEntity["@type"]).toBe("Person");
    expect(schema.mainEntity.name).toBe("Prof. John Doe");
    expect(schema.mainEntity.worksFor).toEqual({
      "@id": `${siteConfig.url}/#organization`,
    });
    expect(schema.mainEntity.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: 4,
      bestRating: 5,
      worstRating: 1,
    });
  });

  it("builds FAQPage schema for FAQ list", () => {
    const faqs = [
      { q: "Is this free?", a: "Some courses are free." },
      { q: "Do I get a certificate?", a: "Yes, verified certificates are issued." },
    ];
    const schema = buildFaqSchema(faqs);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema.mainEntity[0]["@type"]).toBe("Question");
    expect(schema.mainEntity[0].name).toBe("Is this free?");
    expect(schema.mainEntity[0].acceptedAnswer.text).toBe("Some courses are free.");
  });
});
