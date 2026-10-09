"use client";

import { useMemo } from "react";
import type { SchemaOrg } from "@/components/seo/types";

const organization: SchemaOrg = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Glypha Learn",
  description:
    "Glypha Learn is an online learning platform offering expert-led courses with quizzes, certificates, and verified completion — built for learners across Nigeria and beyond.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  logo: "/SmallLogo.svg",
  sameAs: [
    "https://twitter.com/glypha_learn",
    "https://linkedin.com/company/glypha-learn",
  ],
};

export { organization };
export type { SchemaOrg };