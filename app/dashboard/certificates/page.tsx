"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui";

export default function CertificatesPage() {
  const certificates = useQuery(api.certificates.listMyCertificates) ?? [];
  const courses = useQuery(api.courses.listPublishedCourses) ?? [];

  const items = certificates
    .map((cert) => {
      const course = courses.find((c) => c._id === cert.courseId);
      return course ? { cert, course } : null;
    })
    .filter(Boolean) as { cert: any; course: any }[];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Certificates</h1>
        <p className="text-sm text-muted-foreground">
          Courses you&apos;ve completed and earned a certificate for.
        </p>
      </section>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            You don&apos;t have any certificates yet. Progress through your
            courses and reach the completion threshold to unlock them.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(({ cert, course }) => (
            <Link
              key={cert._id}
              href={`/dashboard/certificates/${cert._id}`}
              className="block"
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    {course.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    Completed
                  </Badge>
                  <p>
                    Issued on{" "}
                    {new Date(cert.issuedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

