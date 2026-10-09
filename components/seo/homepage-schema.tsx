"use client";

import ScriptOrg from "@/components/seo/script-org";
import type { SchemaOrg } from "@/components/seo/types";

function buildHomepageSchema(): SchemaOrg {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Glypha Learn",
    description:
      "Glypha Learn is an online learning platform offering expert-led courses with quizzes, certificates, and verified completion — built for learners across Nigeria and beyond.",
    url: siteUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "Glypha Learn",
      url: siteUrl,
    },
    about: {
      "@type": "EducationalOrganization",
      name: "Glypha Learn",
    },
  };
}

export function HomepageSchema() {
  const schema = buildHomepageSchema();
  return <ScriptOrg organization={schema} />;
}