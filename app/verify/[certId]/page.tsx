"use client";

import { Button, EmptyState } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { BadgeCheck, GraduationCap, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatCertificateDate } from "@/lib/certificates";

export default function VerifyCertificatePage() {
  const params = useParams();
  const ref = params.certId as string;

  const result = useQuery(
    api.certificates.getCertificateForVerification,
    ref ? { ref } : "skip",
  );

  return (
    /* A flat sunken plane with a single raised document on it, rather than a
       gradient: someone reading this page is checking a credential, so it
       should read as a document and not as a landing page. */
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken px-4 py-10 sm:py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2">
          <GraduationCap aria-hidden className="h-5 w-5 text-brand" />
          <span className="display-subheading text-lg tracking-editorial">
            Glypha Learn
          </span>
        </div>

        {result === undefined && (
          <div className="border border-rule bg-card p-10 text-center">
            <Loader2
              aria-hidden
              className="mx-auto h-8 w-8 animate-spin text-muted-foreground"
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Verifying certificate&hellip;
            </p>
          </div>
        )}

        {result === null && (
          <div className="border border-rule bg-card">
            {/* EmptyState owns an h3; the h1 keeps the page heading in the
                document outline. */}
            <h1 className="sr-only">Certificate not found</h1>
            <EmptyState
              className="border-y-0"
              icon={XCircle}
              tone="warning"
              title="Certificate not found"
              description="This verification link is invalid. Check the link and try again."
              action={
                <Button variant="outline" render={<Link href="/" />}>
                  Back to Glypha Learn
                </Button>
              }
            />
          </div>
        )}

        {result && !result.valid && (
          <div className="border border-rule bg-card">
            {/* Tint plus hairline rather than a hardcoded pale red plate, so the
                banner survives dark mode. The word "revoked" carries the state;
                the colour only reinforces it. */}
            <div className="flex items-start gap-3 border-b border-destructive/25 bg-destructive/8 p-5">
              <XCircle
                aria-hidden
                className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              />
              <div>
                <p className="font-semibold text-destructive">
                  Certificate revoked
                </p>
                <p className="text-sm text-foreground/75">
                  {result.revocationReason
                    ? `This certificate was withdrawn: ${result.revocationReason}`
                    : "This certificate was withdrawn by the issuing instructor and is no longer valid."}
                </p>
              </div>
            </div>
            <dl className="space-y-6 p-8">
              <div>
                <dt className="eyebrow">Originally awarded to</dt>
                <dd className="display-subheading mt-1 text-2xl text-foreground">
                  {result.holderName}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Course</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">
                  {result.courseTitle}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {result?.valid && (
          <div className="border border-rule bg-card">
            <div className="flex items-start gap-3 border-b border-success/25 bg-success/10 p-5">
              <BadgeCheck
                aria-hidden
                className="mt-0.5 h-5 w-5 shrink-0 text-success"
              />
              <div>
                <p className="font-semibold text-success">
                  Authentic certificate
                </p>
                <p className="text-sm text-foreground/75">
                  This certificate was issued by Glypha Learn and its details
                  below are verified.
                </p>
              </div>
            </div>

            <dl className="space-y-6 p-8">
              <div>
                <dt className="eyebrow">Awarded to</dt>
                <dd className="display-subheading mt-1 text-2xl text-foreground">
                  {result.holderName}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">For successfully completing</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">
                  {result.courseTitle}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Issued on</dt>
                <dd className="tabular mt-1 text-foreground">
                  {formatCertificateDate(result.issuedAt)}
                </dd>
              </div>
              {result.serial && (
                <div>
                  <dt className="eyebrow">Certificate ID</dt>
                  <dd className="mt-1 font-mono text-sm text-foreground">
                    {result.serial}
                  </dd>
                </div>
              )}
              {result.issuerName && (
                <div>
                  <dt className="eyebrow">Issued by</dt>
                  <dd className="mt-1 text-foreground">{result.issuerName}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}
