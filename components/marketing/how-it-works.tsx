import { MousePointerClick, ListChecks, Award } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Pick your course",
    body: "Browse a focused catalog where every listing shows its outline, level, and price in Naira before you commit.",
  },
  {
    icon: ListChecks,
    title: "Learn, then prove it",
    body: "Work through lessons at your own pace — then back it up with quizzes that check you actually learned the material.",
  },
  {
    icon: Award,
    title: "Get certified & noticed",
    body: "Finish with a certificate that carries its own public verification page, plus a preference star on the EtestWeb platform.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-y bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <Reveal>
          <SectionHeading
            index="02"
            kicker="How it works"
            title={
              <>
                From sign-up to
                <br />
                signed certificate.
              </>
            }
          />
        </Reveal>

        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <Reveal as="li" key={title} delay={i * 120} className="relative flex flex-col gap-4 md:border-l md:pl-6 md:first:border-l-0 md:first:pl-0">
              <span className="font-mono text-sm tabular-nums text-muted-foreground/70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15 text-brand-ink">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
