"use client";

import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/navbar";

export default function Home() {
  const { user } = useUser();

  return (
    <div className="min-h-screen  text-zinc-50">
      <Navbar />

      <main className="mx-auto min-h-screen bg-[url('/hero-backdrop.jpg')] bg-cover bg-center flex max-w-6xl flex-col gap-16 px-4 py-14 md:py-20">
        <section className="grid gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className=" border-zinc-300 dark:bg-zinc-900/60 text-xs uppercase tracking-[0.2em] text-foreground dark:text-zinc-300">
              Where the best in the world learn
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl text-foreground dark:text-zinc-200">
              Elevate your{" "}
              <span className="bg-linear-to-r from-yellow-300 via-amber-300 to-red-300 bg-clip-text text-transparent">
                Graphic Design Skills
              </span>
              .
            </h1>
            <p className="max-w-xl text-base text-foreground dark:text-zinc-300 md:text-lg">
              A modern learning platform where the best in the world instructors publish
              courses, and serious learners master real skills to put you above the competition.
            </p>

        {!user ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/courses">
                <Button size="lg">Browse courses</Button>
              </Link>
              <Link href="/sign-in">
                <Button size="lg" variant="outline" className="border-zinc-600 bg-zinc-900/40">
                  Sign in to continue
                </Button>
              </Link>
            </div>
            </>
        ) : (
          <Link href="/dashboard">
            <Button size="lg">Go to dashboard</Button>
          </Link>
        )}
            <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
              <span>Curated by you. Scaled by approved instructors.</span>
              <span className="h-4 w-px bg-zinc-700" />
              <span>Progress tracking, quizzes, certificates—coming next.</span>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="border-zinc-700 bg-none shadow-md dark:shadow-none dark:bg-zinc-900/60">
              <CardHeader>
                <CardTitle className="text-sm font-medium dark:text-zinc-200">
                  For learners
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm dark:text-zinc-300">
                <p>
                  Discover focused, high‑quality courses approved by Etest Learning.
                  Learn at your own pace with clear outlines and upcoming progress
                  tracking.
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs dark:text-zinc-400">
                  <li>Browse published courses by topic and level</li>
                  <li>See structured lesson outlines before enrolling</li>
                  <li>Sign in once, learn across all your devices</li>
                  <li>Get a certificate of completion and preference on the EtestWeb Platform</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-zinc-700 bg-none shadow-md dark:shadow-none dark:bg-zinc-900/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium dark:text-zinc-200">
                  For instructors (soon)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm dark:text-zinc-300">
                <p>
                  Apply to become an instructor, design lessons, and publish to
                  a growing marketplace of motivated learners.
                </p>
                <p className="text-xs dark:text-zinc-400">
                  Instructor tools and detailed analytics will be part of the
                  upcoming phases as we expand the platform.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <Card className="border-zinc-700 bg-none shadow-md dark:shadow-none dark:bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-sm font-medium dark:text-zinc-200">
                Curated catalog
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm dark:text-zinc-300">
              Start with a small, high‑intent catalog. Every course is hand‑picked
              and aligned with concrete outcomes.
            </CardContent>
          </Card>
          <Card className="border-zinc-700 bg-none shadow-md dark:shadow-none dark:bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-sm font-medium dark:text-zinc-200">
                Special treatment
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm dark:text-zinc-300">
              Once you&apos;ve completed a course, 
              you will be given a special preference star 
              on the EtestWeb Platform to show your skills to the world.
            </CardContent>
          </Card>
          <Card className="border-zinc-700 bg-none shadow-md dark:shadow-none dark:bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-sm font-medium dark:text-zinc-200">
                Designed to grow
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm dark:text-zinc-300">
              Quizzes, progress dashboards, certificates, and instructor
              analytics are all part of the roadmap we’re building towards.
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
