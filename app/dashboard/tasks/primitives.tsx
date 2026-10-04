"use client";

import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared presentation for the Task page.
 *
 * Every status in this feature is rendered as a *word plus an icon plus a
 * colour*, never colour alone — an overdue task and a finished one must be
 * distinguishable to somebody who cannot see the tint, and "Due in 3 days" has
 * to survive being copied out of the page.
 *
 * The pill is a tinted plate plus a hairline rather than a fill alone: at 8–10%
 * a tint is invisible on paper, so the border is what makes the chip read as a
 * chip. `tabular` is on the base because nearly every pill in this feature is a
 * count or a score, and a number that shifts width as it ticks reads as a glitch.
 *
 * `danger` / `warning` / `success` deliberately use Tailwind's own ramps with
 * explicit dark steps rather than the `--destructive` / `--warning` /
 * `--success` custom properties. Those three are declared in `:root` but are
 * never mapped into `@theme inline`, so `bg-success`, `bg-warning` and
 * `text-warning-foreground` are not generated as utilities at all; only
 * `--destructive` is mapped. Reported to the design-system owner rather than
 * worked around in globals.css, which is out of scope here.
 */

export type PillTone = "brand" | "danger" | "warning" | "success" | "neutral";

const TONE_CLASS: Record<PillTone, string> = {
  brand: "border-brand/30 bg-brand/10 text-brand-ink",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-400",
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  neutral: "border-rule bg-surface-sunken text-muted-foreground",
};

/** The house status pill: 14px icon + bold text in a tinted hairline box. */
export function StatusPill({
  tone,
  icon,
  children,
  className,
}: {
  tone: PillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-bold tabular",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="shrink-0 [&>svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * Due-date treatment. The label already spells out the urgency in words; the
 * tone and icon reinforce it rather than carry it.
 */
export function DuePill({
  label,
  overdue,
  dueSoon,
  done,
}: {
  label: string;
  overdue: boolean;
  dueSoon?: boolean;
  done?: boolean;
}) {
  if (done) {
    return (
      <StatusPill tone="success" icon={<CheckCircle2 />}>
        Done
      </StatusPill>
    );
  }
  if (overdue) {
    return (
      <StatusPill tone="danger" icon={<TriangleAlert />}>
        {label}
      </StatusPill>
    );
  }
  if (dueSoon) {
    return (
      <StatusPill tone="warning" icon={<Clock />}>
        {label}
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="neutral" icon={<CalendarDays />}>
      {label}
    </StatusPill>
  );
}

/** One number in a stat strip. Value + label, so it is readable without colour. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: ReactNode;
  tone?: PillTone;
}) {
  return (
    <div className="border border-rule bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-sm border",
            TONE_CLASS[tone],
            "[&>svg]:size-4",
          )}
        >
          {icon}
        </span>
      </div>
      <p className="display-subheading tabular mt-3 text-[26px] text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "shrink-0 rounded-sm border px-4 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90"
                : "border-rule bg-card text-muted-foreground hover:border-rule-strong hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Section heading inside a tab, used where the page needs an extra level. */
export function SectionHeading({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2">
      <h2 className="display-subheading flex items-center gap-2 text-lg text-foreground">
        {title}
        {count !== undefined ? (
          <span className="tabular text-sm font-semibold text-muted-foreground">
            ({count})
          </span>
        ) : null}
      </h2>
      {children}
    </div>
  );
}