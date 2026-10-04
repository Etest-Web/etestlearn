"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Award, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCertificateDate, isCertificateRevoked } from "@/lib/certificates";

export default function AdminCertificatesPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const certificates = useQuery(api.certificates.listAllCertificates);
  const revoke = useMutation(api.certificates.revokeCertificate);
  const reinstate = useMutation(api.certificates.reinstateCertificate);

  const [serial, setSerial] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (currentUser === undefined || (certificates === undefined && currentUser?.role === "admin")) {
    return (
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="mx-auto mt-16 w-full max-w-md">
        <EmptyState
          icon={Award}
          title="Access denied"
          description="This console is for administrators. Your account does not have access to it."
          tone="warning"
        />
      </div>
    );
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

  const rows = certificates ?? [];
  const search = serial.trim().toLowerCase();
  const filtered = search
    ? rows.filter(
        (c) =>
          (c.serial ?? "").toLowerCase().includes(search) ||
          c.holderName.toLowerCase().includes(search) ||
          c.courseTitle.toLowerCase().includes(search),
      )
    : rows;

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8">
      <PageHeader
        title="Certificates"
        description={
          <>
            Every certificate issued on the platform. Revoking keeps the audit
            record but makes the public verification page report it as withdrawn.{" "}
            <a
              href="/dashboard/admin/certificate-templates"
              className="link-quiet text-primary"
            >
              Certificate templates
            </a>{" "}
            are managed separately.
          </>
        }
      />

      <Card className="gap-0 p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            All certificates (<span className="tabular">{rows.length}</span>)
          </CardTitle>
          <CardDescription>
            Search by certificate ID, holder, or course.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <div className="space-y-1.5">
            <Label htmlFor="cert-search" className="eyebrow">
              Search
            </Label>
            <Input
              id="cert-search"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="GL-2026-… or a holder name"
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No certificates issued yet"
              description="Certificates appear here as learners complete a course that awards one."
              className="mt-5"
            />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">
                  Every certificate issued on the platform, with its holder, course,
                  certificate ID, issue date, and a control to revoke or reinstate it.
                </caption>
                <thead>
                  {/* Recessed head, hairline row rules: the table divides itself
                      with one rule rather than a box around every cell. */}
                  <tr className="border-b border-rule bg-surface-sunken">
                    <th scope="col" className="eyebrow px-3 py-2.5 pl-5 text-left">Holder</th>
                    <th scope="col" className="eyebrow px-3 py-2.5 text-left">Course</th>
                    <th scope="col" className="eyebrow px-3 py-2.5 text-left">Certificate ID</th>
                    <th scope="col" className="eyebrow px-3 py-2.5 text-left">Issued</th>
                    <th scope="col" className="eyebrow px-3 py-2.5 pr-5 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cert) => {
                    const isRevoked = isCertificateRevoked(cert);
                    return (
                      <tr
                        key={cert._id}
                        className="border-b border-rule transition-colors last:border-0 hover:bg-surface-sunken/60"
                      >
                        <td className="px-3 py-2.5 pl-5 font-medium">{cert.holderName}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {cert.courseTitle}
                        </td>
                        <td className="tabular px-3 py-2.5 font-mono text-xs">
                          {cert.serial ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          <span className="tabular">{formatCertificateDate(cert.issuedAt)}</span>
                          {isRevoked && (
                            /* Status keeps its word, so revoking is never
                               communicated by colour alone. */
                            <Badge variant="destructive" className="ml-2 align-middle">
                              Revoked
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 pr-5">
                          {/* Revoke is the destructive act and says so in both
                              the tint and the icon; reinstating is not. */}
                          <Button
                            variant={isRevoked ? "outline" : "destructive"}
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
                                <RotateCcw className="h-3.5 w-3.5" /> Reinstate
                              </>
                            ) : (
                              <>
                                <Ban className="h-3.5 w-3.5" /> Revoke
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="border-t border-rule pt-4 text-sm text-muted-foreground">
                  No certificates match that search.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}