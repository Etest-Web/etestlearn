"use client";

/**
 * Renderers shared by the structured slide kinds and the freeform canvas.
 * Kept out of `slide-deck.tsx` so the canvas editor can use the exact same
 * chart and markdown output without importing the deck (and creating a cycle).
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PALETTE_STYLES, type ChartRow } from "@/lib/slides";

export type SlidePalette = (typeof PALETTE_STYLES)[keyof typeof PALETTE_STYLES];

export function SlideMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`prose prose-sm sm:prose-base max-w-none ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

const CHART_COLORS = ["#818cf8", "#34d399", "#f472b6", "#fbbf24", "#38bdf8", "#a78bfa"];

export function SlideChart({
  chart,
  palette,
  fontFamily,
  className = "h-[280px] w-full",
}: {
  chart: { type: "bar" | "line" | "pie" | "donut"; rows: ChartRow[] };
  palette: SlidePalette;
  fontFamily: string;
  className?: string;
}) {
  const rows = chart.rows;
  if (!rows.length) return null;
  const axis = { stroke: palette.muted, fontSize: 11, fontFamily };
  const tooltipStyle = {
    background: palette.background,
    color: palette.foreground,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    fontSize: 12,
  };
  const common = (
    <>
      <CartesianGrid stroke={palette.border} strokeDasharray="3 3" />
      <XAxis dataKey="label" {...axis} tickLine={false} />
      <YAxis {...axis} tickLine={false} width={40} />
      <Tooltip contentStyle={tooltipStyle} />
    </>
  );

  return (
    <div className={className} style={{ fontFamily }}>
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === "pie" || chart.type === "donut" ? (
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              innerRadius={chart.type === "donut" ? "45%" : 0}
              labelLine={false}
            >
              {rows.map((row, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        ) : chart.type === "bar" ? (
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {common}
            <Bar dataKey="value" fill={palette.accent} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {common}
            <Line type="monotone" dataKey="value" stroke={palette.accent} strokeWidth={2} dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
