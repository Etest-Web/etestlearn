"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BadgeCheck, Copy, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardContent, Skeleton } from "@/components/ui";
import { formatCertificateDate, isCertificateRevoked } from "@/lib/certificates";

export default function CertificateDetailPage() {
  const params = useParams<{ id: string }>();
  const certificateId = params.id as string;
  const cert = useQuery(api.certificates.getMyCertificate, {
    certificateId: certificateId as Id<"certificates">,
  });
  const [copied, setCopied] = useState(false);

  // Serial-based links are the shareable form; older certificates without one
  // fall back to the id route so nothing becomes unreachable.
  const verifyPath = cert?.serial
    ? `/verify/${encodeURIComponent(cert.serial)}`
    : `/verify/${certificateId}`;

  async function copyLink() {
    const url = `${window.location.origin}${verifyPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }

  if (cert === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72 w-full rounded-sm" />
      </div>
    );
  }

  if (cert === null) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <p className="text-sm text-muted-foreground">
          Certificate not found or not accessible.
        </p>
      </div>
    );
  }

  const revoked = isCertificateRevoked(cert);

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* A double frame, because a certificate is meant to read as a printed
          sheet — but no shadow: the frame is the whole effect. */}
      <Card className="border-2 border-rule print:border-0">
        <CardContent className="space-y-5 px-4 py-8 text-center sm:px-8 sm:py-10">
          <p className="eyebrow">
            {revoked ? "Certificate of completion (revoked)" : "Certificate of completion"}
          </p>

          <div className="space-y-3">
            {/* The certificate is a printed document rather than a page header,
                so it keeps its centred layout and takes the display voice
                directly rather than through PageHeader. */}
            <h1 className="display-heading text-2xl text-balance sm:text-3xl">
              {cert.courseTitle}
            </h1>
            <p className="eyebrow">Awarded to</p>
            {/* The previous version hardcoded "You" here because listMyCertificates
                did not join the holder name. */}
            <p className="text-xl font-semibold tracking-tight">{cert.holderName}</p>
            <p className="text-xs text-muted-foreground">
              Completed on {formatCertificateDate(cert.issuedAt)}
            </p>
          </div>

          <dl className="mx-auto grid max-w-md grid-cols-1 gap-3 border-t border-rule pt-5 text-left sm:grid-cols-2">
            <div>
              <dt className="eyebrow">
                Certificate ID
              </dt>
              <dd className="font-mono text-xs">{cert.serial ?? "—"}</dd>
            </div>
            <div>
              <dt className="eyebrow">
                Issued by
              </dt>
              <dd className="text-xs">{cert.issuerName ?? "Glypha Learn"}</dd>
            </div>
          </dl>

          {revoked && (
            <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              This certificate was revoked
              {cert.revocationReason ? `: ${cert.revocationReason}` : "."} Contact
              the course instructor if you think this is a mistake.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap print:hidden">
        {cert.pdfUrl && !revoked && (
          <Button size="sm" render={<a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer" />}>
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={copyLink}>
          <Copy className="h-4 w-4" />
          {copied ? "Link copied" : "Copy verification link"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Link
          href={verifyPath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:underline touch-target"
        >
          <BadgeCheck className="h-4 w-4" /> Public verification page
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Anyone with the verification link can confirm this certificate is
        authentic.
      </p>
    </div>
  );
}