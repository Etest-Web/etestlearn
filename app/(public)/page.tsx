import { HeroPoster } from "@/components/marketing/hero-poster";
import { CategoryMarquee } from "@/components/marketing/category-marquee";
import { CourseShowcase } from "@/components/marketing/course-showcase";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { StarFeature } from "@/components/marketing/star-feature";
import { InstructorBand } from "@/components/marketing/instructor-band";
import { FaqSection } from "@/components/marketing/faq-section";
import { ClosingCta } from "@/components/marketing/closing-cta";

export default function Home() {
  return (
    <main>
      <HeroPoster />
      <CategoryMarquee />
      <CourseShowcase />
      <HowItWorks />
      <StarFeature />
      <InstructorBand />
      <FaqSection />
      <ClosingCta />
    </main>
  );
}
