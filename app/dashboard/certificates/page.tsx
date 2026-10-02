"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Award } from "lucide-react";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { formatCertificateDate, isCertificateRevoked } from "@/lib/certificates";

export default function CertificatesPage() {
  // Joined server-side: the previous version fetched published courses
  // separately and silently dropped certificates for unpublished courses.
  const certificates = useQuery(api.certificates.listMyCertificates);

  if (certificates === undefined) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Certificates</h1>
        <p className="text-sm text-muted-foreground">
          {certificates.length > 0
            ? "Download, share, or open the public verification page for any of your certificates."
            : "Courses you complete appear here with a shareable verification link."}
        </p>
      </section>

      {certificates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            You don&apos;t have any certificates yet. Finish every lesson and pass
            every quiz in a course to earn one automatically.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {certificates.map((cert) => {
            const revoked = isCertificateRevoked(cert);
            return (
              <li key={cert._id}>
                <Link
                  href={`/dashboard/certificates/${cert._id}`}
                  className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <Award
                          aria-hidden
                          className={`mt-0.5 h-5 w-5 shrink-0 ${
                            revoked ? "text-muted-foreground" : "text-[#945DA3]"
                          }`}
                        />
                        <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider">
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium leading-snug">{cert.courseTitle}</p>
                        <p className="text-xs text-muted-foreground">
                          Issued {formatCertificateDate(cert.issuedAt)}
                        </p>
                        {cert.serial && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {cert.serial}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}