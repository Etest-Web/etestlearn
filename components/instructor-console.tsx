"use client";

import * as React from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNaira } from "@/lib/instructor-earnings";

/**
 * Shared presentation for the instructor console.
 *
 * The overview, the earnings page and the analytics table all read the same
 * three queries, and each of them needs a headline number, a delta chip and a
 * chart. Those were written three times before and drifted three ways (one
 * printed `+∞%`, one showed "N/A" where a learner would want "no sales yet"),
 * so the vocabulary lives here once. The arithmetic stays in
 * `lib/instructor-earnings`; nothing in this file computes money.
 */

/**
 * A segmented control for switching between peer views of the same data.
 *
 * Built from buttons rather than `Tabs`, because these controls do not switch
 * panels — they re-filter one list or re-scale one chart. `Tabs` without
 * `TabsContent` panels is a control with no tabpanels, which is worse for a
 * screen reader than a toggle group that says what it is. `aria-pressed`
 * carries the selected state, and the count is part of the label so the filter
 * and its result are announced together.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex flex-wrap items-center gap-0 rounded-sm border border-rule bg-surface-sunken p-0.5",
        className,
      )}
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
              "touch-target inline-flex items-center gap-1.5 rounded-sm px-3.5 py-1.5 text-sm transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-card font-semibold text-foreground shadow-raised"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="tabular text-xs text-muted-foreground">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

type Delta = {
  /** Signed percentage, or null when there is no baseline to compare against. */
  percent: number | null;
  /** e.g. "vs previous 30 days" — the window is named, never implied. */
  comparison: string;
};

/**
 * A signed percentage chip.
 *
 * Null is a *state*, not a missing value: an instructor with no sales last month
 * gets "No prior sales" rather than an arrow and a zero. Direction is carried by
 * an icon as well as a colour, so the chip is not colour-only.
 */
export function DeltaChip({
  percent,
  comparison,
  className,
}: Delta & { className?: string }) {
  if (percent === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        <Minus className="size-3.5" aria-hidden />
        No prior sales
      </span>
    );
  }

  const up = percent > 0;
  const flat = percent === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        flat
          ? "text-muted-foreground"
          : up
            ? "text-success"
            : "text-destructive",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="tabular">
        {flat ? "Level" : `${up ? "+" : ""}${percent}%`}
      </span>
      <span className="text-muted-foreground">{comparison}</span>
    </span>
  );
}

/**
 * One headline figure.
 *
 * `tone` is for when a number is the point of the card (earnings) rather than
 * one of several peers, which is the only place the brand plate is justified —
 * a grid of four identical brand plates is a template, not a hierarchy.
 *
 * The figure is sized against the *tile*, not the viewport, because the tile
 * is what changes: the same component sits in a three-up row on the overview
 * and a four-up row on the earnings page, and a naira amount is one
 * unbreakable token that cannot wrap. At a fixed 1.75rem it was wider than
 * the tile in a four-up row and painted straight over the neighbouring card.
 * A container query lets the figure shrink with the tile it is in, so the
 * number stays whole and inside its box at every width.
 */
export function StatTile({
  label,
  value,
  sub,
  delta,
  icon: Icon,
  tone = "plain",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: Delta;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone?: "plain" | "brand";
  className?: string;
}) {
  const brand = tone === "brand";

  return (
    <div
      className={cn(
        "@container flex flex-col justify-between gap-4 p-5",
        brand
          ? "bg-brand text-brand-foreground"
          : "border border-rule bg-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "eyebrow",
            brand && "text-brand-foreground/75",
          )}
        >
          {label}
        </p>
        {Icon ? (
          <Icon
            className={cn(
              "size-4 shrink-0",
              brand ? "text-brand-foreground/70" : "text-muted-foreground",
            )}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <p
          className={cn(
            "tabular text-[clamp(1rem,calc(7cqw_+_0.5rem),1.75rem)] font-semibold leading-none tracking-[-0.02em]",
            brand ? "text-brand-foreground" : "text-foreground",
          )}
        >
          {value}
        </p>
        {delta ? (
          <DeltaChip
            percent={delta.percent}
            comparison={delta.comparison}
            className={brand ? "text-brand-foreground/80 [&>span:last-child]:text-brand-foreground/60" : undefined}
          />
        ) : null}
        {sub ? (
          <p
            className={cn(
              "tabular text-xs",
              brand ? "text-brand-foreground/70" : "text-muted-foreground",
            )}
          >
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Tooltip styling shared by every chart here.
 *
 * A tooltip is the one genuinely floating layer on these pages, so it is the
 * one place a shadow is load-bearing; the hairline border does the rest.
 */
const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--rule)",
  backgroundColor: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "var(--elevation-overlay)",
};

/**
 * Only the four fields the chart plots. Deliberately narrower than the query's
 * `MonthPoint` so a caller cannot pass a bucket it reshaped on the way in —
 * the series the chart draws and the series the statement table lists are the
 * same array from the same query, checked by the compiler.
 */
type MonthSeriesPoint = {
  key: string;
  label: string;
  grossKobo: number;
  netEarningsKobo: number;
  sales: number;
};

/**
 * A compact naira figure for a chart axis.
 *
 * The axis gutter is a fixed slice of the plot, and `formatNaira` prints the
 * full amount — "₦12,345,678" — so on a phone the label was wider than the
 * gutter it had to live in and got clipped. Axes read magnitudes, not exact
 * amounts, and the tooltip still carries the exact figure, so the axis
 * abbreviates. Below a hundred thousand the full amount is short enough to
 * keep as it is.
 */
function axisNaira(kobo: number): string {
  const naira = kobo / 100;
  const magnitude = Math.abs(naira);
  if (magnitude >= 1_000_000) {
    return `₦${(naira / 1_000_000).toFixed(1)}M`;
  }
  if (magnitude >= 100_000) {
    return `₦${Math.round(naira / 1_000)}k`;
  }
  return formatNaira(kobo);
}

/**
 * Earnings over time: gross collected as bars, the instructor's share as the
 * line above it.
 *
 * Both series on one axis because the gap between them *is* the story — the
 * reader should see the fee without doing arithmetic. Kept to a single
 * `ResponsiveContainer` so the two marks cannot drift out of alignment.
 */
export function EarningsChart({
  data,
  height = 260,
}: {
  data: MonthSeriesPoint[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="instructor-earnings-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.28} />
              <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(value: number) => axisNaira(value)}
          />
          <RechartsTooltip
            cursor={{ fill: "transparent" }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, name: string) => [
              formatNaira(value),
              name === "grossKobo" ? "Collected" : "Your earnings",
            ]}
            labelFormatter={(label: string) => label}
          />
          <Area
            type="monotone"
            dataKey="grossKobo"
            stroke="var(--chart-2)"
            strokeWidth={1.5}
            fill="transparent"
            strokeDasharray="4 3"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="netEarningsKobo"
            stroke="var(--brand)"
            strokeWidth={2.5}
            fill="url(#instructor-earnings-fill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Enrollments vs completions per course.
 *
 * Side-by-side bars rather than a stacked one on purpose: a stack makes
 * "completed" look like a share of "enrolled", when the interesting number is
 * the *gap* — how many people started and did not finish.
 */
export function EnrollmentFunnelChart({
  data,
  height = 240,
}: {
  data: { name: string; enrolled: number; completed: number }[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            // Not `interval={0}`. That forces every tick to render, and with
            // up to eight course titles on a phone-width chart the labels
            // overlap into a smear and the first and last are clipped by the
            // chart edge. Recharts thins to the ends instead, which keeps the
            // extremes — the ones that anchor the scale — and drops the
            // middle.
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <RechartsTooltip
            cursor={{ fill: "transparent" }}
            contentStyle={TOOLTIP_STYLE}
          />
          <Bar
            dataKey="enrolled"
            name="Enrolled"
            fill="var(--chart-1)"
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
          />
          <Bar
            dataKey="completed"
            name="Completed"
            fill="var(--chart-3)"
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * A share-of-total bar.
 *
 * Rendered as a single hairline-filled track rather than a percentage label
 * alone, so the reader sees the proportion *and* the number.
 */
export function ShareBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${percent}% of earnings`}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="tabular w-9 shrink-0 text-right text-xs text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}

/**
 * A labelled progress row with the count beside it.
 *
 * `value` is a percentage; the track is decorative and the numbers carry the
 * information, so the bar is hidden from assistive tech rather than read out
 * as a second, redundant percentage.
 */
export function ProgressRow({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: number;
  detail?: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="tabular text-sm font-semibold text-foreground">
          {detail ?? `${clamped}%`}
        </span>
      </div>
      <div
        aria-hidden
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            tone === "success"
              ? "bg-success"
              : tone === "warning"
                ? "bg-warning"
                : "bg-brand",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export type ActivityKind = "sale" | "enrollment" | "completion" | "certificate";

const ACTIVITY_META: Record<
  ActivityKind,
  { label: string; badge: React.ComponentProps<typeof Badge>["variant"] }
> = {
  sale: { label: "Sale", badge: "success" },
  enrollment: { label: "New learner", badge: "info" },
  completion: { label: "Completed", badge: "default" },
  certificate: { label: "Certificate", badge: "warning" },
};

function activitySentence(
  kind: ActivityKind,
  actorName: string | null,
  courseTitle: string,
): string {
  const who = actorName?.trim() || "A learner";
  switch (kind) {
    case "sale":
      return `${who} bought ${courseTitle}`;
    case "enrollment":
      return `${who} enrolled in ${courseTitle}`;
    case "completion":
      return `${who} finished ${courseTitle}`;
    case "certificate":
      return `${who} earned a certificate for ${courseTitle}`;
  }
}

/**
 * Recent events, newest first.
 *
 * One row per event with a kind badge rather than four separate feeds: an
 * instructor's real question is "what just happened", and interleaving sales
 * with completions is what answers it.
 *
 * **The row is a stack, not a line, and that is a layout decision rather than
 * a fallback.** It used to be one line: badge, sentence, amount, timestamp,
 * arrow, all side by side with the sentence truncated. That line needs about
 * 600px before it stops being cramped, so the moment the card went into a
 * two-column grid — which is where it lives — the sentence was squeezed to a
 * few characters and the course name, the one part worth reading, was
 * truncated away. The single-line version was only ever right on a very wide
 * screen, which is not where this card is.
 *
 * So the sentence wraps (capped at three lines) and the amount and timestamp
 * ride underneath it, the same shape the "needs your attention" list uses. A
 * narrow column now gives the sentence *more* room instead of less, and the
 * wrapping is also what keeps the row's min-content width small — a
 * truncated (`white-space: nowrap`) sentence contributes its full width to
 * its ancestors' intrinsic sizing, which is how this card used to push the
 * whole dashboard sideways on a phone.
 *
 * Three lines is the cap, not the norm: a short event is still one line, and
 * a long course title is bounded rather than free. Two was not enough — a
 * forty-five character event is the *shortest* realistic one ("Chinedu
 * Okafor bought Advanced Next.js Patterns"), and it needs three lines in a
 * phone-width column, which is exactly the width where the reader most needs
 * to see it in full.
 */
export function ActivityFeed({
  events,
  formatTime,
}: {
  events: {
    key: string;
    kind: ActivityKind;
    courseTitle: string;
    actorName: string | null;
    at: number;
    amountKobo: number | null;
    href: string;
  }[];
  formatTime: (timestamp: number) => string;
}) {
  return (
    <ul className="divide-y divide-rule">
      {events.map((event) => {
        const meta = ACTIVITY_META[event.kind];
        return (
          <li key={event.key}>
            <Link
              href={event.href}
              className="flex items-start gap-3 py-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <span className="mt-0.5 shrink-0">
                <Badge variant={meta.badge}>{meta.label}</Badge>
              </span>

              <span className="min-w-0 flex-1">
                <span className="line-clamp-3 text-sm leading-snug text-foreground">
                  {activitySentence(event.kind, event.actorName, event.courseTitle)}
                </span>
                <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  {event.amountKobo !== null ? (
                    <span className="tabular text-sm font-semibold text-foreground">
                      {formatNaira(event.amountKobo)}
                    </span>
                  ) : null}
                  <span>{formatTime(event.at)}</span>
                  {/* Below `sm` the arrow has nowhere to sit without
                      stealing the sentence's width, and 28px is the
                      difference between the course name fitting and being
                      ellipsised. It rides the metadata line instead, and
                      returns to the right of the row from `sm` up. */}
                  <ArrowRight
                    className="ml-auto size-4 shrink-0 text-muted-foreground sm:hidden"
                    aria-hidden
                  />
                </span>
              </span>

              <ArrowRight
                className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Colour ramp for the "at a glance" course tiles. */
export function completionTone(rate: number): string {
  if (rate >= 70) return "bg-success";
  if (rate >= 40) return "bg-brand";
  if (rate > 0) return "bg-warning";
  return "bg-muted";
}
