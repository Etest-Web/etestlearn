import { HeroPoster } from "@/components/marketing/hero-poster";
import { CategoryMarquee } from "@/components/marketing/category-marquee";
import { ProofStrip } from "@/components/marketing/proof-strip";
import { CourseShowcase } from "@/components/marketing/course-showcase";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { StarFeature } from "@/components/marketing/star-feature";
import { InstructorBand } from "@/components/marketing/instructor-band";
import { FaqSection } from "@/components/marketing/faq-section";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { FAQS } from "@/components/marketing/faq-data";
import JsonLd from "@/components/seo/jsonld";
import { buildFaqSchema, buildWebPageSchema } from "@/components/seo/schemas";
import type { Metadata } from "next";

/**
 * The homepage is the one page whose canonical URL is the site root, and it
 * was the only public page without one.
 *
 * It is declared here rather than in the root layout on purpose: a canonical
 * in the root layout is inherited by every route that does not set its own,
 * which would tell the search engine that `/become-instructor` and
 * `/verify/<id>` are duplicates of the homepage. Next.js merges metadata
 * per-field, so a child that sets `alternates` replaces the parent's
 * wholesale — but a child that sets nothing inherits it, and that is the
 * wrong answer for every page except this one.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Eight sections, eight different layout families.
 *
 * That is the constraint this order exists to satisfy. The previous page ran
 * the star feature and the instructor band as the same boxed `3fr/2fr`
 * copy-left / list-right band, back to back, so the middle of the page looked
 * like one section twice.
 *
 *   1. asymmetric split hero      5. 3-cell asymmetric bento
 *   2. kinetic marquee             6. list-led two-column on a sunken plane
 *   3. hairline fact row           7. rule label + accordion
 *   4. catalog grid                8. brand colour plane + footer
 */
export default function Home() {
  return (
    <>
      {/*
        The homepage's own structured data, in the initial HTML.

        `WebPage` is what describes this page as part of the site; `FAQPage` is
        what lets the questions below show up as expandable results in search.
        Both are rendered here rather than from inside the client components
        that display the content, because a crawler that does not run
        JavaScript would otherwise see the copy but not the markup describing
        it.
      */}
      <JsonLd
        schema={[buildWebPageSchema(), buildFaqSchema(FAQS)]}
        id="homepage-schema"
      />
      <main>
        <HeroPoster />
        <CategoryMarquee />
        <ProofStrip />
        <CourseShowcase />
        <HowItWorks />
        <StarFeature />
        <InstructorBand />
        <FaqSection />
        <ClosingCta />
      </main>
    </>
  );
}
