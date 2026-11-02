export const siteConfig = {
    name: "Glypha Learn",
    tagline: "Learn skills that move you forward",
    description:
        "Glypha Learn is an online learning platform offering expert-led design and creative courses — graphic design, UI/UX, motion graphics, branding — with quizzes, certificates, and verified completion. Built for students across Nigeria and West Africa.",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://learn.glypha.com.ng",
    // The static fallback image, for structured data only —
    // `buildCourseSchema` uses it when a course has no thumbnail. It is NOT
    // the OpenGraph card any more: the share cards are generated per route by
    // `lib/og.tsx` and served from `app/opengraph-image.tsx` and the per-route
    // `opengraph-image.tsx` files, so nothing in this config points a crawler
    // at a JPEG.
    //
    // This pointed at `/hero-backdrop.jpg`, which is not a path this repo
    // serves. The only file by that name is `public/bg/hero-backdrop.jpg`, and
    // it is a branding flat-lay for an unrelated client, so pointing there
    // would have swapped a 404 for the wrong picture. `certf.jpeg` is the
    // product: an actual Glypha certificate, which is also what the hero
    // shows.
    ogImage: "/certf.jpeg",
    keywords: [
        "graphic design course Nigeria",
        "UI/UX design course",
        "online design courses Africa",
        "learn graphic design from scratch",
        "motion graphics course",
        "brand identity design course",
        "Figma course for beginners",
        "digital illustration course",
        "design course for students Nigeria",
        "online design school Africa",
        "design courses in naira",
        "verified design certificate",
        "affordable design courses Nigeria",
        "how to become a graphic designer Nigeria",
        "best design tools for beginners",
        "design portfolio for students",
        "Glypha Learn",
    ],
    links: {
        twitter: "https://twitter.com/glypha_learn",
        linkedin: "https://linkedin.com/company/glypha-learn",
    },
};
