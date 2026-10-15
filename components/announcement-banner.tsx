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
        "relative flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{announcement.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{announcement.body}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss announcement"
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => {
          localStorage.setItem("dismissed-announcement", announcement._id);
          setDismissedId(announcement._id);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
