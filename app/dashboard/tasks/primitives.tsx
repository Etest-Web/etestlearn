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
 */

export type PillTone = "brand" | "danger" | "warning" | "success" | "neutral";

const TONE_CLASS: Record<PillTone, string> = {
  brand: "text-brand-ink bg-brand/20",
  danger: "text-red-700 bg-red-500/10 dark:text-red-400",
  warning: "text-amber-800 bg-amber-500/10 dark:text-amber-400",
  success: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400",
  neutral: "text-muted-foreground bg-muted",
};

/** The house status pill: 14px icon + bold text in a tinted rounded-md box. */
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
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold",
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

/**
 * The dashed empty state every tab, filter and list falls back to. Always has
 * an icon, a heading and a next action — a bare "no items" line reads as a bug.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&>svg]:size-8">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-bold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
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
    <div className="bg-card rounded-[24px] border border-border shadow-sm p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <span
          aria-hidden
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            TONE_CLASS[tone],
            "[&>svg]:size-4",
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{value}</p>
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
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "border-[#945DA3] bg-[#945DA3] text-white"
                : "border-border bg-card text-muted-foreground hover:border-[#945DA3]/40 hover:text-foreground",
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
        {title}
        {count !== undefined ? (
          <span className="text-sm font-semibold text-muted-foreground">({count})</span>
        ) : null}
      </h2>
      {children}
    </div>
  );
}