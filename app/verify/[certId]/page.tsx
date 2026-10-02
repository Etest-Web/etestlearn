"use client";

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
    <main className="min-h-dvh bg-gradient-to-b from-background to-muted flex items-center justify-center px-4 py-10 sm:py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-8">
          <GraduationCap className="h-6 w-6 text-[#945DA3]" />
          <span className="text-xl font-bold tracking-tight">Glypha Learn</span>
        </div>

        {result === undefined && (
          <div className="bg-card rounded-2xl shadow-sm border p-10 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Verifying certificate...</p>
          </div>
        )}

        {result === null && (
          <div className="bg-card rounded-2xl shadow-sm border p-10 text-center space-y-3">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-bold">Certificate not found</h1>
            <p className="text-muted-foreground text-sm">
              This verification link is invalid. Check the link and try again.
            </p>
            <Link href="/" className="inline-block text-sm font-medium text-[#945DA3] hover:underline">
              Back to Glypha Learn
            </Link>
          </div>
        )}

        {result && !result.valid && (
          <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
            <div className="bg-red-50 border-b border-red-100 p-5 flex items-start gap-3">
              <XCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">Certificate revoked</p>
                <p className="text-sm text-red-700/80">
                  {result.revocationReason
                    ? `This certificate was withdrawn: ${result.revocationReason}`
                    : "This certificate was withdrawn by the issuing instructor and is no longer valid."}
                </p>
              </div>
            </div>
            <dl className="p-8 space-y-6">
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Originally awarded to
                </dt>
                <dd className="text-2xl font-bold mt-1">{result.holderName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Course
                </dt>
                <dd className="text-lg font-semibold mt-1">{result.courseTitle}</dd>
              </div>
            </dl>
          </div>
        )}

        {result?.valid && (
          <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
            <div className="bg-emerald-50 border-b border-emerald-100 p-5 flex items-start gap-3">
              <BadgeCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-800">Authentic certificate</p>
                <p className="text-sm text-emerald-700/80">
                  This certificate was issued by Glypha Learn and its details below are verified.
                </p>
              </div>
            </div>

            <dl className="p-8 space-y-6">
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Awarded to
                </dt>
                <dd className="text-2xl font-bold mt-1">{result.holderName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  For successfully completing
                </dt>
                <dd className="text-lg font-semibold mt-1">{result.courseTitle}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Issued on
                </dt>
                <dd className="mt-1">{formatCertificateDate(result.issuedAt)}</dd>
              </div>
              {result.serial && (
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                    Certificate ID
                  </dt>
                  <dd className="mt-1 font-mono text-sm">{result.serial}</dd>
                </div>
              )}
              {result.issuerName && (
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                    Issued by
                  </dt>
                  <dd className="mt-1">{result.issuerName}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}