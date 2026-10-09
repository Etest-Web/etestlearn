import { HeroPoster } from "@/components/marketing/hero-poster";
import { CategoryMarquee } from "@/components/marketing/category-marquee";
import { ProofStrip } from "@/components/marketing/proof-strip";
import { CourseShowcase } from "@/components/marketing/course-showcase";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { StarFeature } from "@/components/marketing/star-feature";
import { InstructorBand } from "@/components/marketing/instructor-band";
import { FaqSection } from "@/components/marketing/faq-section";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { HomepageSchema } from "@/components/seo/homepage-schema";

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
      <HomepageSchema />
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