import { Check } from "lucide-react";
import Image from "next/image";
import { Reveal } from "./reveal";

const PERKS = [
  "A preference star next to your name across the GlyphaWeb platform",
  "A certificate with its own public verification page anyone can check",
  "Proof you passed a real assessment, not just watched videos",
];

/**
 * The product's one claim that no competitor has: the preference star.
 *
 * Composition is a 3-cell bento, one cell per claim, and the cell count is
 * exactly the claim count rather than a 3-wide grid with two empty tiles. Two
 * of the three cells carry real visual variation. The large cell is a brand
 * plane with the actual Glypha monogram on it (an existing asset from
 * `public/`, not a hand-drawn mark), and the second is a recessed well, so
 * this does not read as three white cards with text inside.
 */
export function StarFeature() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
      <Reveal>
        <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
          {/* Large cell. `md:col-span-2 md:row-span-2` in CSS Grid also
              removes it from flow order, so the DOM order below is the reading
              order for anyone navigating by keyboard or screen reader. */}
          <div className="relative flex flex-col justify-between gap-10 overflow-hidden rounded-sm border border-brand/30 bg-gradient-to-br from-brand/20 via-brand/8 to-transparent p-8 sm:p-10 md:col-span-2 md:row-span-2 md:p-12">
            <div className="max-w-md">
              <h2 className="display-heading text-3xl text-balance sm:text-4xl">
                Finish a course. Earn a preference star.
              </h2>
              <p className="mt-5 max-w-[46ch] text-pretty text-base leading-body text-muted-foreground">
                Most platforms hand you a PDF and wish you luck. Glypha Learn
                graduates get a preference star: a permanent mark of verified
                skill wherever their profile appears on GlyphaWeb.
              </p>
            </div>

            {/* Real brand mark, sized as a graphic rather than used as a logo
                lockup. `--brand` on a brand-tinted plane, so it needs no
                separate dark-mode value. */}
            <Image
              src="/SmallLogo.svg"
              alt=""
              width={96}
              height={96}
              aria-hidden="true"
              className="size-20 self-start opacity-70 sm:size-24"
            />
          </div>

          <ul className="flex flex-col justify-center gap-4 rounded-sm border border-rule bg-surface-sunken p-7 md:col-start-3 md:row-start-1">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                  <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="text-sm leading-body text-pretty">{perk}</span>
              </li>
            ))}
          </ul>

          <p className="self-center rounded-sm border-t border-rule pt-6 md:col-start-3 md:row-start-2 md:border-t-0 md:border-l md:pl-7 md:pt-0">
            <span className="display-subheading block text-base">
              Anyone can check it
            </span>
            <span className="mt-2 block text-sm leading-body text-pretty text-muted-foreground">
              Certificates are published at their own address. Send an employer
              the link and they see the course, the date, and the holder.
            </span>
          </p>
        </div>
      </Reveal>
    </section>
  );
}