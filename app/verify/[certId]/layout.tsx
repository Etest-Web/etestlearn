import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { siteConfig } from "@/lib/site";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ certId: string }>;
}): Promise<Metadata> {
  const { certId } = await params;
  let cert = null;
  try {
    cert = await client.query(api.certificates.getCertificateForVerification, {
      ref: certId,
    });
  } catch {
    // Best-effort lookup for social cards
  }

  const title = cert
    ? `Verified Certificate: ${cert.holderName} — ${cert.courseTitle}`
    : "Verify Certificate";
  const description = cert
    ? `Official certificate of completion issued to ${cert.holderName} for completing "${cert.courseTitle}" on Glypha Learn.`
    : "Verify the authenticity of a Glypha Learn certificate by its verification link.";

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title: `${title} | ${siteConfig.name}`,
      description,
      url: `${siteConfig.url}/verify/${certId}`,
      type: "article",
      siteName: siteConfig.name,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${siteConfig.name}`,
      description,
      site: "@glypha_learn",
    },
  };
}

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
