"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface DashboardWeeklyChartItem {
  week: string;
  lessonsCompleted: number;
  quizzesPassed?: number;
  studyHours?: number;
  hoursSpent?: number;
}

export function DashboardWeeklyChart({
  data,
}: {
  data: DashboardWeeklyChartItem[];
}) {
  return (
    <div className="w-full h-32 px-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorProgress" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <RechartsTooltip
            cursor={{ fill: "transparent" }}
            contentStyle={{
              borderRadius: "var(--radius-md)",
              border: "none",
              boxShadow: "var(--elevation-overlay)",
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
            }}
            formatter={(value: number, name: string) => [
              value,
              name === "lessonsCompleted"
                ? "Lessons"
                : name === "quizzesPassed"
                  ? "Quizzes"
                  : "Hours",
            ]}
          />
          <Area
            type="monotone"
            dataKey="lessonsCompleted"
            stroke="var(--brand)"
            fillOpacity={1}
            fill="url(#colorProgress)"
            strokeWidth={2}
          />
          <XAxis
            dataKey="week"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            dx={-10}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
