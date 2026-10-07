import { ArrowRight, LineChart, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

const PERKS = [
  {
    icon: Wallet,
    title: "You set the price",
    body: "Priced in naira, and free courses stay free. Nothing is listed without your say-so.",
  },
  {
    icon: LineChart,
    title: "The numbers are already wired",
    body: "Enrollments, completions and quiz scores land in your dashboard without a spreadsheet.",
  },
  {
    icon: ShieldCheck,
    title: "Every application is read by a person",
    body: "Your portfolio and bio go to the team. It is the reason the catalog stays small on purpose.",
  },
];

/**
 * Instructor recruitment.
 *
 * This used to invert to `bg-foreground text-background`, which put a dark band
 * between two light sections on a light page. Read as one scroll it felt like
 * the site changed owner halfway down. It is now a sunken plane in the same
 * theme family as everything above and below it.
 *
 * Layout is list-led rather than a second `3fr/2fr` copy-left / list-right
 * band, which is what this and the preference-star section both were.
 */
export function InstructorBand() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
      <Reveal>
        <div className="grid gap-10 rounded-sm bg-surface-sunken p-8 sm:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16 lg:p-14">
          <div className="lg:max-w-sm">
            <h2 className="display-heading text-3xl text-balance sm:text-4xl">
              You teach. We run the platform.
            </h2>
            <p className="mt-5 text-pretty text-base leading-body text-muted-foreground">
              Lessons, quizzes, payments and analytics are already built. You
              bring the expertise; we bring the learners.
            </p>
            <Link
              href="/become-instructor"
              className="group mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-brand px-6 text-sm font-semibold text-brand-foreground transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:bg-brand/90 active:translate-y-0 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Apply to teach
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </div>

          {/* One hairline above the group, one between rows. Sparse on purpose:
              three rows with a rule under every one of them reads as a spec
              table rather than as an argument. */}
          <ul className="divide-y divide-rule border-t border-rule lg:border-t-0 lg:pt-0">
            {PERKS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-5 py-6 first:pt-0 last:pb-0 lg:first:pt-0">
                <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 max-w-[46ch] text-pretty text-sm leading-body text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}