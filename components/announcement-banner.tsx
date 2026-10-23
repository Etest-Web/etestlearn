"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Megaphone, X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

/**
 * Newest active platform announcement addressed to the viewer, dismissible per
 * announcement id.
 *
 * Dismissal lives in localStorage rather than the database: the banner is
 * chrome, not state, and per-device dismissal is the behavior people expect.
 *
 * The query is audience-aware (`announcements.getActiveAnnouncement`), so this
 * one component shows an instructor-only notice on a staff console and a
 * learner notice on the learner dashboard with no branch here — which is the
 * point of keeping the audience rule on the server.
 */
export function AnnouncementBanner({ className }: { className?: string }) {
  const announcement = useQuery(api.announcements.getActiveAnnouncement);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    setDismissedId(localStorage.getItem("dismissed-announcement"));
  }, []);

  if (!announcement || dismissedId === announcement._id) return null;

  return (
    <div
      data-slot="announcement-banner"
      className={cn(
        "relative flex items-start gap-2.5 sm:gap-3 rounded-xl sm:rounded-2xl border border-rule bg-card p-3 sm:p-4 shadow-sm",
        className,
      )}
    >
      <Megaphone className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="flex-1 min-w-0 pr-7 sm:pr-8">
        <p className="text-sm font-semibold text-foreground break-words [overflow-wrap:anywhere]">
          {announcement.title}
        </p>
        <p className="mt-1 text-xs sm:text-sm leading-relaxed text-muted-foreground break-words [overflow-wrap:anywhere]">
          {announcement.body}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss announcement"
        className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2 inline-flex size-7 sm:size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => {
          localStorage.setItem("dismissed-announcement", announcement._id);
          setDismissedId(announcement._id);
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
