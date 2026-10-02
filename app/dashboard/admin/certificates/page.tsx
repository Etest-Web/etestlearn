"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Award, Ban, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
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
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold">Access denied</h1>
        <p className="text-sm text-muted-foreground">Admins only.</p>
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
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Award className="h-6 w-6" /> Certificates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every certificate issued on the platform. Revoking keeps the audit
          record but makes the public verification page report it as withdrawn.{" "}
          <a
            href="/dashboard/admin/certificate-templates"
            className="text-[#945DA3] hover:underline"
          >
            Certificate templates
          </a>{" "}
          are managed separately.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All certificates ({rows.length})</CardTitle>
          <CardDescription>
            Search by certificate ID, holder, or course.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cert-search" className="text-xs">
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
            <p className="text-sm text-muted-foreground">
              No certificates issued yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-3 pr-4">Holder</th>
                    <th className="py-3 pr-4">Course</th>
                    <th className="py-3 pr-4">Certificate ID</th>
                    <th className="py-3 pr-4">Issued</th>
                    <th className="py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cert) => {
                    const isRevoked = isCertificateRevoked(cert);
                    return (
                      <tr key={cert._id} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{cert.holderName}</td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {cert.courseTitle}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">
                          {cert.serial ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                          {formatCertificateDate(cert.issuedAt)}
                          {isRevoked && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              revoked
                            </Badge>
                          )}
                        </td>
                        <td className="py-3">
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
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reinstate
                              </>
                            ) : (
                              <>
                                <Ban className="mr-1.5 h-3.5 w-3.5" /> Revoke
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
                <p className="pt-4 text-sm text-muted-foreground">
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