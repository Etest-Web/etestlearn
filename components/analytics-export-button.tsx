"use client";

import { useCallback } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buildAnalyticsExport } from "@/lib/analytics-export";

/**
 * The export button — wires the two staff-gated queries to the CSV builder and
 * triggers a browser download. No server round-trip: the queries are already
 * live on the page, so this is instant and always reflects the same numbers
 * the instructor is looking at.
 */
export function AnalyticsExportButton() {
  const pulse = useQuery(api.instructorStats.getInstructorPulse);
  const performance = useQuery(api.instructorStats.listInstructorCoursePerformance);

  const handleExport = useCallback(() => {
    if (!pulse || !performance) {
      toast.error("Data not ready yet — try again in a moment.");
      return;
    }

    const { filename, content } = buildAnalyticsExport({ pulse, performance });

    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Revoke on the next frame: revoking synchronously can cancel the download
    // in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);

    toast.success(`Downloaded ${filename}`);
  }, [pulse, performance]);

  const disabled = !pulse || !performance;

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {disabled ? (
        <>
          <Loader2 aria-hidden className="animate-spin" />
          Preparing…
        </>
      ) : (
        <>
          <Download aria-hidden />
          Export CSV
        </>
      )}
    </Button>
  );
}