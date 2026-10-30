import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import JsonLd from "@/components/seo/jsonld";
import { buildBreadcrumbsSchema, buildTeachPageSchema } from "@/components/seo/schemas";

export const metadata: Metadata = {
  title: "Teach on Glypha Learn — Become an Instructor",
  description:
    "Share your expertise with learners across Nigeria and beyond. Create video courses, set your price, host quizzes, and issue verified certificates.",
  alternates: { canonical: "/become-instructor" },
  openGraph: {
    title: "Teach on Glypha Learn — Become an Instructor",
    description:
      "Share your expertise with learners across Nigeria and beyond. Create video courses, set your price, host quizzes, and issue verified certificates.",
    url: `${siteConfig.url}/become-instructor`,
    type: "website",
    siteName: siteConfig.name,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Teach on Glypha Learn — Become an Instructor",
    description:
      "Share your expertise with learners across Nigeria and beyond. Create video courses, set your price, host quizzes, and issue verified certificates.",
    site: "@glypha_learn",
    creator: "@glypha_learn",
  },
};

export default function BecomeInstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        schema={[
          buildTeachPageSchema(),
          buildBreadcrumbsSchema(
            [
              { name: "Home", url: "/" },
              { name: "Become an Instructor", url: "/become-instructor" },
            ],
            `${siteConfig.url}/become-instructor#breadcrumb`
          ),
        ]}
        id="teach-schema"
      />
      {children}
    </>
  );
}
