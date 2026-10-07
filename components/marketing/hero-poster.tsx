"use client";

import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import TextLoop from "@/components/TextLoop";
import { cn } from "@/lib/utils";

/* One button system for the whole page. The marketing sections used to each
   hand-roll their CTA, which is how three different labels ended up pointing
   at `/courses` and four pointing at `/become-instructor`. Intent is now a
   single label wherever it appears: "Browse courses" to learn, "Apply to
   teach" to teach. The navbar keeps its own longer labels, since nav wording
   is a separate contract from page copy. */
const CTA_BASE =
  "group inline-flex h-11 items-center justify-center gap-2 rounded-sm px-6 text-sm font-semibold transition-transform duration-200 ease-out active:translate-y-0 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const CTA_PRIMARY = cn(CTA_BASE, "bg-brand text-brand-foreground hover:-translate-y-0.5 hover:bg-brand/90");
const CTA_SECONDARY = cn(
  CTA_BASE,
  "border border-rule-strong bg-card text-foreground hover:-translate-y-0.5 hover:bg-surface-sunken",
);

export function HeroPoster() {
  const { user } = useUser();

  const primaryHref = user ? "/dashboard" : "/courses";
  const primaryLabel = user ? "Continue learning" : "Browse courses";

  return (
    <section className="relative overflow-hidden border-b border-rule">
      {/* The Glypha wave. This is the brand motif: the same wordmark repeats down
          the side of every certificate, so it is the one piece of decoration
          on this page that is doing real work rather than filling space.

          Three things were wrong with how it was wired up before, and all
          three are fixed here without touching the component:

          · Colour was hardcoded to `#ffffff`, which is invisible on the
            light page background. `currentColor` plus a `text-` class means it
            follows the theme: light-mode brand, and the lightened brand that
            `--brand` already steps up to in dark mode.
          · `ribbon` painted a 86px band in `#3f3f3f`, a fixed dark grey that
            read as a smear on a near-white page. Off now.
          · Two instances were stacked to fill the hero height. One is enough,
            and a second doubled the GSAP work for a texture nobody looks at
            twice. `pauseOnHover` stays false so it never stalls mid-scroll.

          `hidden sm:block` because the wave is a texture, not information:
          on a phone it was competing with the headline for the same pixels. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex select-none items-center justify-center overflow-hidden opacity-100 blur-[2px] text-brand/25 dark:text-brand/30"
      >
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
          ribbon={false}
          className="hidden w-full sm:block"
          pauseOnHover={false}
        />
      </div>

      {/* A wash at a third of the strength the previous section used. Under
          the wave it only needs to stop the plane being a flat value. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-48 -top-56 h-[38rem] w-[38rem] rounded-full bg-brand/6 blur-3xl" />
        <div className="absolute -bottom-64 -right-40 h-[30rem] w-[30rem] rounded-full bg-brand/5 blur-3xl" />
      </div>

      {/* No `min-h-dvh`. A full-height hero here left the certificate floating
          in the bottom third with the headline stranded in the middle, and on a
          short laptop it pushed the primary CTA below the fold. Height is now
          whatever the content needs, with padding carrying the air. */}
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 md:py-24 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,1fr)] lg:gap-16">
        {/* Three text elements: headline, subtext, actions. The eyebrow and the
            trust micro-strip that used to sit here are both gone. A label
            above the headline repeated down the whole page, and "Verified
            certificates / Paystack-secured payments / Hand-picked catalog"
            inside the hero is a trust strip that belongs below it. */}
        <div className="space-y-7">
          <h1 className="hero-enter-1 display-heading max-w-[16ch] text-4xl text-balance sm:text-5xl lg:text-6xl">
            Learn a skill. Then prove you have it.
          </h1>

          <p className="hero-enter-2 max-w-[52ch] text-pretty text-base leading-body text-muted-foreground md:text-lg">
            Hand-picked courses with quizzes, verifiable certificates, and a
            preference star beside your name across the GlyphaWeb platform.
          </p>

          <div className="hero-enter-3 flex flex-wrap items-center gap-3">
            <Link href={primaryHref} className={CTA_PRIMARY}>
              {primaryLabel}
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
            <Link href="/become-instructor" className={CTA_SECONDARY}>
              Apply to teach
              <ArrowUpRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>

        {/* The certificate is a real artifact the product actually issues, not
            a screenshot stand-in, so it earns the hero slot. Capped at 26rem:
            at the column width it used to render, a 1600x1140 JPEG pushed the
            section past a viewport and the CTA off screen. */}
        <figure className="hero-enter-4 m-0 lg:justify-self-end">
          <div className="group/cert relative w-full max-w-[22rem] lg:max-w-[26rem]">
            <Image
              src="/certf.jpeg"
              alt="A Glypha certificate of completion for the graphics design course, signed and stamped."
              width={1600}
              height={1140}
              sizes="(max-width: 1024px) 88vw, 26rem"
              className="tilt-card h-auto w-full border border-rule shadow-raised"
              priority
            />
          </div>

          {/* Caption sits outside the image, never over it. One functional line
              about what the artifact does, no photographer credit. */}
          <figcaption className="mt-6 flex max-w-[22rem] items-start gap-3 border-t border-rule pt-4 lg:max-w-[26rem]">
            <Image
              src="/SmallLogo.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0"
            />
            <p className="text-pretty text-sm leading-body text-muted-foreground">
              Every certificate carries its own public verification page.
            </p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}