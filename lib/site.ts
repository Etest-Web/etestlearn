export const siteConfig = {
    name: "Glypha Learn",
    tagline: "Learn skills that move you forward",
    description:
        "Glypha Learn is an online learning platform offering expert-led courses with quizzes, certificates, and verified completion — built for learners across Nigeria and beyond.",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    // This pointed at `/hero-backdrop.jpg`, which is not a path this repo
    // serves. The only file by that name is `public/bg/hero-backdrop.jpg`, and
    // it is a branding flat-lay for an unrelated client, so pointing there
    // would have swapped a 404 for the wrong picture. `certf.jpeg` is the
    // product: an actual Glypha certificate, which is also what the hero
    // shows, so the card and the page agree.
    ogImage: "/certf.jpeg",
};
