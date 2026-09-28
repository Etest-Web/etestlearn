"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, Button } from "@/components/ui";
import { BadgeCheck, Copy } from "lucide-react";
import { toast } from "sonner";

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
      <Card className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-card text-foreground shadow-lg">
        <CardContent className="space-y-4 px-8 py-10 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-muted-foreground">
            Certificate of Completion
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {course?.title ?? "Completed course"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Awarded to
          </p>
          <p className="text-xl font-semibold tracking-tight">
            {/* Clerk name is rendered elsewhere; this is a generic certificate */}
            You
          </p>
          <p className="text-xs text-muted-foreground">
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

      <div className="mt-6 flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const url = `${window.location.origin}/verify/${certId}`;
            navigator.clipboard.writeText(url).then(
              () => toast.success("Verification link copied"),
              () => toast.error("Could not copy link"),
            );
          }}
        >
          <Copy className="mr-2 h-4 w-4" /> Copy verification link
        </Button>
        <a
          href={`/verify/${certId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm font-medium text-[#5340FF] hover:underline"
        >
          <BadgeCheck className="mr-1.5 h-4 w-4" /> View public verification page
        </a>
      </div>
    </div>
  );
}

