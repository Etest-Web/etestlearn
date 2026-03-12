"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui";

export default function CertificateDetailPage() {
  const params = useParams<{ id: string }>();
  const certId = params.id as string;

  const certificates = useQuery(api.certificates.listMyCertificates) ?? [];
  const courses = useQuery(api.courses.listPublishedCourses) ?? [];

  const cert = certificates.find((c: any) => c._id === certId);

  if (!cert) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <p className="text-sm text-muted-foreground">
          Certificate not found or not accessible.
        </p>
      </div>
    );
  }

  const course = courses.find((c: any) => c._id === cert.courseId);

  return (
    <div className="mx-auto max-w-3xl py-8">
      <Card className="border-2 border-dashed border-zinc-300 bg-white text-zinc-900 shadow-lg">
        <CardContent className="space-y-4 px-8 py-10 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
            Certificate of Completion
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {course?.title ?? "Completed course"}
          </h1>
          <p className="text-sm text-zinc-600">
            Awarded to
          </p>
          <p className="text-xl font-semibold tracking-tight">
            {/* Clerk name is rendered elsewhere; this is a generic certificate */}
            You
          </p>
          <p className="text-xs text-zinc-500">
            In recognition of successfully completing the course on{" "}
            {new Date(cert.issuedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

