import { cn } from "@/lib/utils";

/**
 * Section heading for the marketing page.
 *
 * Two departures from the version this replaced, both deliberate:
 *
 *   1. There is no `index` prop. It rendered "01" / "02" / "04" beside the
 *      kicker, which turned every section into a page of a printed report.
 *      Two sections opted out, so the sequence also skipped 03 and read as a
 *      bug. Nothing on the page enumerates the sections now.
 *
 *   2. The kicker is `eyebrow` and it is opt-in. It used to be required, which
 *      meant all three call sites shipped a small uppercase label above their
 *      headline, and the page ended up with seven of them. A section's
 *      position on the page already categorises it; the label was noise. Only
 *      one section on the page asks for one.
 *
 * The description stacks under the headline rather than sitting in a narrow
 * column beside it. A split header reads as "headline plus filler paragraph"
 * whenever the second column carries no visual of its own, and none of these
 * did.
 *
 * Headlines are sentence case at display size. The previous all-caps setting
 * (`INTENTIONAL COURSES HAND-PICKED AND VERIFIED.`) needed the caps to carry
 * weight, which is why it also needed 60px type to avoid looking small.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-4", className)}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="display-heading text-3xl text-balance sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-[58ch] text-pretty text-base leading-body text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}