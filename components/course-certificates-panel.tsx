"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Award, Ban, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCertificateDate, isCertificateRevoked } from "@/lib/certificates";

/**
 * Instructor-side certificate management for a single course: who has been
 * awarded one, who is close to qualifying, plus manual award and revocation.
 * Instructors can only reach this for courses they own — enforced server-side
 * in convex/certificates.ts, not here.
 */
export function CertificatesPanel({
  courseId,
}: {
  courseId: Id<"courses">;
}) {
  const certificates = useQuery(api.certificates.listCourseCertificates, {
    courseId,
  });
  const award = useMutation(api.certificates.issueCertificateForLearner);
  const revoke = useMutation(api.certificates.revokeCertificate);
  const reinstate = useMutation(api.certificates.reinstateCertificate);

  const [learnerId, setLearnerId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (certificates === undefined) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const activeCount = certificates.filter((c) => !isCertificateRevoked(c)).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Issued certificates ({activeCount})</CardTitle>
          <CardDescription>
            Certificates are awarded automatically when a learner completes
            every lesson and passes every quiz. Revoking one keeps the record
            but makes the public verification page report it as withdrawn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No certificates issued for this course yet.
            </p>
          ) : (
            <ul className="divide-y">
              {certificates.map((cert) => {
                const isRevoked = isCertificateRevoked(cert);
                return (
                  <li
                    key={cert._id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Award
                        aria-hidden
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          isRevoked ? "text-muted-foreground" : "text-[#945DA3]"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {cert.holderName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCertificateDate(cert.issuedAt)}
                          {cert.serial ? ` · ${cert.serial}` : ""}
                        </p>
                        {isRevoked && cert.revocationReason && (
                          <p className="text-xs text-destructive">
                            Revoked: {cert.revocationReason}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === cert._id}
                      onClick={() =>
                        run(
                          cert._id,
                          () =>
                            isRevoked
                              ? reinstate({ certificateId: cert._id })
                              : revoke({
                                  certificateId: cert._id,
                                  reason:
                                    window.prompt(
                                      "Reason for revoking (optional):",
                                    ) ?? undefined,
                                }),
                          isRevoked ? "Certificate reinstated" : "Certificate revoked",
                        )
                      }
                    >
                      {isRevoked ? (
                        <>
                          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reinstate
                        </>
                      ) : (
                        <>
                          <Ban className="mr-2 h-3.5 w-3.5" /> Revoke
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Issue manually</CardTitle>
          <CardDescription>
            Award a certificate to an enrolled learner without waiting for the
            completion bar — for a manually approved completion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="learner-id" className="text-xs">
            Learner ID
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="learner-id"
              value={learnerId}
              onChange={(e) => setLearnerId(e.target.value.trim())}
              placeholder="Convex user id"
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              disabled={!learnerId || busy === "award"}
              onClick={() =>
                run(
                  "award",
                  () =>
                    award({
                      userId: learnerId as Id<"users">,
                      courseId,
                    }),
                  "Certificate issued",
                ).finally(() => setLearnerId(""))
              }
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              {busy === "award" ? "Issuing…" : "Issue certificate"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A learner ID is shown on their profile page. Issuance is
            idempotent — issuing twice returns the same certificate.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}