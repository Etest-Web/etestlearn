"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Award } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { formatCertificateDate, isCertificateRevoked } from "@/lib/certificates";

export default function CertificatesPage() {
  // Joined server-side: the previous version fetched published courses
  // separately and silently dropped certificates for unpublished courses.
  const certificates = useQuery(api.certificates.listMyCertificates);

  if (certificates === undefined) {
    return (
      <PageShell width="narrow" className="gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-sm" />
        <Skeleton className="h-40 w-full rounded-sm" />
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow" className="gap-6">
      <PageHeader
        title="Certificates"
        description={
          certificates.length > 0
            ? "Download, share, or open the public verification page for any of your certificates."
            : "Courses you complete appear here with a shareable verification link."
        }
      />

      {certificates.length === 0 ? (
        <EmptyState
          icon={Award}
          tone="brand"
          title="No certificates yet"
          description="Finish every lesson and pass every quiz in a course to earn one automatically."
          // Every other empty state in the dashboard offers the next step. This
          // one used to be a dead end with no route onward.
          action={
            <Button variant="outline" render={<Link href="/dashboard/courses" />}>
              Find a course to finish
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {certificates.map((cert) => {
            const revoked = isCertificateRevoked(cert);
            return (
              <li key={cert._id}>
                <Link
                  href={`/dashboard/certificates/${cert._id}`}
                  className="block h-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {/* The card *is* the link target, so it takes the interactive
                      variant: the hairline and the focus ring come with it. */}
                  <Card variant="interactive" size="sm" className="h-full">
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <Award
                          aria-hidden
                          className={`mt-0.5 h-5 w-5 shrink-0 ${
                            revoked ? "text-muted-foreground" : "text-brand"
                          }`}
                        />
                        {/* The state is a word, not just a colour. `destructive`
                            is a registered colour token; the live state takes the
                            neutral outline, which is what it had before. */}
                        <Badge variant={revoked ? "destructive" : "outline"}>
                          {revoked ? "Revoked" : "Active"}
                        </Badge>
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
    </PageShell>
  );
}
