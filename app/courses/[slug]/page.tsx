"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { notFound, useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export default function CoursePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const data = useQuery(api.courses.getCourseBySlug, slug ? { slug } : "skip");

  if (data === undefined) {
    // still loading
    return (
      <>
        <main className="mx-auto max-w-4xl px-4 py-12">
          <p className="text-muted-foreground">Loading course...</p>
        </main>
      </>
    );
  }

  if (data === null) {
    notFound();
  }

  const { course, lessons } = data;

  return (
    <>
    <main className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      <header className="space-y-4">
        <Button onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <div className="flex flex-wrap gap-2">
          <Image src={course.thumbnailUrl || "/hero-backdrop.jpg"} alt={course.title} width={500} height={500} className="w-full h-full object-cover rounded-lg" />
          {course.category && <Badge variant="secondary">{course.category}</Badge>}
          {course.level && (
            <Badge variant="outline" className="text-xs">
              {course.level}
            </Badge>
          )}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{course.title}</h1>
        <p className="text-muted-foreground">{course.description}</p>
        <Button size="lg" className="mt-2" onClick={() => router.push(`/dashboard/courses/${course.slug}`)}>
          Enroll & start learning
        </Button>
      </header>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Course outline</CardTitle>
          </CardHeader>
          <CardContent>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Lessons will appear here once you add them in Convex.
              </p>
            ) : (
              <ol className="space-y-3">
                {lessons.map((lesson) => (
                  <li
                    key={lesson._id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{lesson.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {lesson.contentType}
                      </p>
                    </div>
                    {lesson.durationMinutes && (
                      <span className="text-xs text-muted-foreground">
                        {lesson.durationMinutes} min
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
    </>
  );
}

