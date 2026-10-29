"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

type Day = { date: string; count: number };

function getLevel(count: number) {
  if (count <= 0) return 0;
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export function ActivityHeatmap({
  data,
  days = 365,
  className,
}: {
  data: Day[];
  days?: number;
  className?: string;
}) {
  const cells = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data) map.set(d.date, d.count);

    const out: Array<{ date: string; count: number; level: number }> = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - i);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const count = map.get(key) ?? 0;
      out.push({ date: key, count, level: getLevel(count) });
    }
    return out;
  }, [data, days]);

  return (
    <div className={cn("grid grid-flow-col grid-rows-7 gap-[2px]", className)} aria-label="Learning activity heatmap">
      {cells.map((c) => (
        <div
          key={c.date}
          title={`${c.count} ${c.count === 1 ? "activity" : "activities"} on ${c.date}`}
          className={cn(
            "h-2.5 w-2.5 rounded-[1px]",
            c.level === 0 && "bg-muted/40",
            c.level === 1 && "bg-brand/20",
            c.level === 2 && "bg-brand/40",
            c.level === 3 && "bg-brand/70",
            c.level === 4 && "bg-brand",
          )}
        />
      ))}
    </div>
  );
}
