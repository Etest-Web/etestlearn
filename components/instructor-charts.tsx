"use client";

import * as React from "react";
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
import { formatNaira } from "@/lib/instructor-earnings";

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

export type MonthSeriesPoint = {
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
