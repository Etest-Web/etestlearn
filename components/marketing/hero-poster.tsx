"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, BadgeCheck, LockKeyhole, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const TRUST_POINTS = [
  { icon: BadgeCheck, label: "Verified certificates" },
  { icon: LockKeyhole, label: "Paystack-secured payments" },
  { icon: Star, label: "Hand-picked catalog" },
];

function CertificateMock() {
  return (
    <div className="group/cert relative mx-auto w-full max-w-sm md:max-w-none">
      <div className="tilt-card relative rounded-2xl border border-border bg-card p-6 shadow-[0_24px_60px_-24px_oklch(0_0_0/0.25)] sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-dashed pb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Etest Learning
            </p>
            <p className="mt-1 font-display text-2xl tracking-wide">Certificate of Completion</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-black">
            <Star className="h-6 w-6 fill-current" />
          </div>
        </div>

        <div className="space-y-4 pt-5">
          <p className="text-xs text-muted-foreground">This certifies that</p>
          <p className="font-display text-3xl tracking-wide">Adaeze Okafor</p>
          <p className="text-xs text-muted-foreground">
            has completed all lessons and passed the final assessment of
          </p>
          <p className="text-sm font-semibold leading-snug text-balance">
            Graphic Design Masterclass — From Brief to Brand
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            ETL-CRT-8F42-K91
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
            <BadgeCheck className="h-3.5 w-3.5" />
            Publicly verifiable
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute -bottom-3 left-1/2 -z-10 h-full w-[92%] -translate-x-1/2 rounded-2xl border border-border/60 bg-muted/50"
      />
    </div>
  );
}

export function HeroPoster() {
  const { user, isLoaded } = useUser();

  const primaryHref = user ? "/dashboard" : "/courses";
  const primaryLabel = user ? "Go to dashboard" : "Start learning";

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-brand/10 blur-3xl"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:pb-28 md:pt-20 lg:gap-10">
        <div className="space-y-8">
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <span className="h-px w-8 bg-brand" aria-hidden="true" />
            Learn skills that move you forward
          </p>

          <h1 className="font-display text-6xl leading-[0.9] tracking-wide text-balance sm:text-7xl md:text-8xl">
            Stop scrolling.
            <br />
            Start{" "}
            <span className="relative inline-block whitespace-nowrap">
              <span className="relative z-10">building</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-[-0.08em] bottom-[0.06em] z-0 h-[0.32em] bg-brand/70"
              />
            </span>{" "}
            real skills.
          </h1>

          <p className="max-w-xl text-base text-pretty text-muted-foreground md:text-lg">
            Etest Learning pairs a hand-picked catalog with quizzes,
            certificates you can publicly verify, and a preference star that
            puts your skills on display across the EtestWeb platform.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={primaryHref}
              className={cn(
                "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-7 text-sm font-semibold text-black",
                "transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.96]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              {isLoaded ? primaryLabel : "Loading…"}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            {!user && (
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-7 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Sign in to continue
              </Link>
            )}
            <Link
              href="/become-instructor"
              className="group inline-flex h-12 items-center justify-center gap-1.5 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Teach on Etest
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
            {TRUST_POINTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon className="h-4 w-4 text-brand" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <CertificateMock />
      </div>
    </section>
  );
}
