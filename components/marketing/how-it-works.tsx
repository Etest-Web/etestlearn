import { MousePointerClick, ListChecks, Award } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: MousePointerClick,
    title: "Pick a course",
    body: "Browse a focused catalog where every listing shows its outline, level, and price in naira before you commit.",
  },
  {
    icon: ListChecks,
    title: "Learn, then be tested",
    body: "Work through lessons at your own pace, then answer the quiz. Finishing the video does not count on its own.",
  },
  {
    icon: Award,
    title: "Get the certificate",
    body: "Finish with a certificate that carries its own public verification page, plus a preference star on GlyphaWeb.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-y border-rule bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <Reveal>
          <SectionHeading
            title="How a course runs, from sign-up to certificate."
            description="Three steps, in the order you will meet them."
          />
        </Reveal>

        {/* Vertical rules between columns rather than three boxed cards. The
            steps are a sequence, not three independent features, and the
            connecting rule is what makes that legible at a glance. */}
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <Reveal
              as="li"
              key={title}
              delay={i * 120}
              className="relative flex flex-col gap-4 md:border-l md:pl-6 md:first:border-l-0 md:first:pl-0"
            >
              {/* An ordinal in a sequence that needs one, not a section label
                  sitting above a headline. */}
              <span className="tabular text-sm text-muted-foreground/70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-brand/15 text-brand-ink">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="text-sm leading-body text-pretty text-muted-foreground">
                {body}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}