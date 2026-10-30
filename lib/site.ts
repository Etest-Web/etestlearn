export const siteConfig = {
    name: "Glypha Learn",
    tagline: "Learn skills that move you forward",
    description:
        "Glypha Learn is an online learning platform offering expert-led courses with quizzes, certificates, and verified completion — built for learners across Nigeria and beyond.",
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
        "online courses",
        "online learning Nigeria",
        "e-learning platform",
        "tech skills",
        "programming courses",
        "business courses",
        "verified certificates",
        "digital skills training",
        "quizzes and assessments",
        "Glypha Learn",
    ],
    links: {
        twitter: "https://twitter.com/glypha_learn",
        linkedin: "https://linkedin.com/company/glypha-learn",
    },
};
