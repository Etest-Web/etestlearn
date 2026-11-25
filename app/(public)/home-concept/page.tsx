import type { Metadata } from "next";

import { ChatHero } from "@/components/marketing/chat-hero";
import { ConceptFooter } from "@/components/marketing/concept-footer";

/**
 * Chat-first homepage concept. A design preview, not the production homepage:
 * it duplicates no route, is excluded from the sitemap, and is marked
 * noindex so it cannot be picked up by search engines while it is being
 * evaluated. The real hero replaces this only after the concept is approved.
 */
export const metadata: Metadata = {
  title: "Homepage concept — chat-first",
  robots: { index: false, follow: false },
};

export default function HomeConcept() {
  return (
    <main>
      <ChatHero />
      <ConceptFooter />
    </main>
  );
}
