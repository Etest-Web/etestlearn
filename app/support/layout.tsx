import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";
import JsonLd from "@/components/seo/jsonld";
import { buildBreadcrumbsSchema, buildSupportPageSchema } from "@/components/seo/schemas";

export const metadata: Metadata = {
  title: "Help & Support",
  description:
    "Get help with your Glypha Learn account, courses, quizzes, certificates, and billing. Search FAQs or submit a support ticket.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "Help & Support | Glypha Learn",
    description:
      "Get help with your Glypha Learn account, courses, quizzes, certificates, and billing. Search FAQs or submit a support ticket.",
    url: `${siteConfig.url}/support`,
    type: "website",
    siteName: siteConfig.name,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Help & Support | Glypha Learn",
    description:
      "Get help with your Glypha Learn account, courses, quizzes, certificates, and billing. Search FAQs or submit a support ticket.",
    site: "@glypha_learn",
    creator: "@glypha_learn",
  },
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        schema={[
          buildSupportPageSchema(),
          buildBreadcrumbsSchema(
            [
              { name: "Home", url: "/" },
              { name: "Help & Support", url: "/support" },
            ],
            `${siteConfig.url}/support#breadcrumb`
          ),
        ]}
        id="support-schema"
      />
      {children}
    </>
  );
}
