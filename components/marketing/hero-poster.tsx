"use client";

import { cn } from "@/lib/utils";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, BadgeCheck, LockKeyhole, Star } from "lucide-react";
import Link from "next/link";
import TextLoop from "@/components/TextLoop";
import Image from "next/image";

const TRUST_POINTS = [
  { icon: BadgeCheck, label: "Verified certificates" },
  { icon: LockKeyhole, label: "Paystack-secured payments" },
  { icon: Star, label: "Hand-picked catalog" },
];

function CertificateMock() {
  return (
    <div className="group/cert relative mx-auto max-w-sm md:max-w-none">
      <Image
        src="/certf.jpeg"
        alt="Certificate preview"
        width={1600}
        height={1140}
        className="tilt-card h-auto w-full shadow-elevation-raised"
        priority
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-3 left-1/2 -z-10 h-full w-[92%] -translate-x-1/2 rounded-sm border border-rule bg-surface-sunken"
      />
    </div>
  );
}

export function HeroPoster() {
  const { user, isLoaded } = useUser();

  const primaryHref = user ? "/dashboard" : "/courses";
  const primaryLabel = user ? "Go to dashboard" : "Start learning";

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden">
      <section className="relative w-full">
        {/* Fixed TextLoop Background Wrapper */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center blur">
          {/* w-full rather than min-w-screen: 100vw counts the scrollbar and
              would hand the parent ~15px of over-wide canvas to clip. */}
          <div className="w-full min-h-screen flex flex-col justify-between">
            <TextLoop
              text="Glypha"
              shape="wave"
              speed={55}
              path=""
              direction="forward"
              separator="✦"
              curviness={48}
              fontSize={46}
              fontWeight={800}
              letterSpacing={8}
              uppercase
              color="currentColor"
              ribbon
              ribbonColor="currentColor"
              ribbonWidth={86}
              className="hidden sm:block"
              pauseOnHover={false}
            />
            <TextLoop
              text="Glypha"
              shape="wave"
              speed={55}
              path=""
              direction="forward"
              separator="✦"
              curviness={48}
              fontSize={46}
              fontWeight={800}
              letterSpacing={8}
              uppercase
              color="currentColor"
              ribbon
              ribbonColor="currentColor"
              ribbonWidth={86}
              className="hidden sm:block"
              pauseOnHover={false}
            />
          </div>
        </div>

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-10 sm:gap-14 sm:px-6 sm:pb-20 sm:pt-14 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:pb-28 md:pt-20 lg:gap-10">
          <div className="space-y-6 sm:space-y-8">
            <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:tracking-[0.24em]">
              <span className="h-px w-8 shrink-0 bg-brand" aria-hidden="true" />
              Learn skills that move you forward
            </p>

            {/* Fluid until sm, then the 7xl step. The 7vw coefficient is set
                against the nowrap'd "HANDS ON": at 320px the clamp floors at
                1.5rem and the run lands near 130px, comfortably inside the
                288px content box. The previous 10vw/2rem pair was sized for a
                condensed face and this one is not — 10vw put the run at ~280px
                against that same 288px box, one rounding difference from
                clipping. */}
            <h1 className="display-heading text-[clamp(1.5rem,7vw,3rem)] text-balance sm:text-7xl">
              A Digital Hub
              <br />
              for{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span className="relative z-10">HANDS ON</span>
                <span
                  aria-hidden="true"
                  className="absolute inset-x-[-0.08em] bottom-[0.06em] z-1 h-[0.32em] bg-brand/70"
                />
              </span>{" "}
              Skill Development
            </h1>

            <p className="max-w-xl text-base text-pretty text-muted-foreground md:text-lg">
              Glypha Learning pairs a hand-picked catalog with quizzes,
              certificates you can publicly verify, and a preference star that
              puts your skills on display across the GlyphaWeb platform.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className={cn(
                  "group inline-flex h-12 items-center justify-center gap-2 rounded-sm bg-brand px-7 text-sm font-semibold text-brand-foreground",
                  "transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:bg-brand/90 active:translate-y-0 active:scale-[0.96]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                {isLoaded ? primaryLabel : "Loading…"}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              {!user && (
                <Link
                  href="/sign-in"
                  className="inline-flex h-12 items-center justify-center rounded-sm border border-rule-strong bg-card px-7 text-sm font-medium transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Sign in to continue
                </Link>
              )}
              <Link
                href="/become-instructor"
                className="group inline-flex h-12 items-center justify-center gap-1.5 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Teach on Glypha
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>

            <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <CertificateMock />
        </div>
      </section>
    </main>
  );
}
