import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Humanises an epoch-millisecond timestamp as "3 hours ago" / "yesterday" /
 * "12 Mar 2026".
 *
 * Why one shared helper: every dashboard surface that shows a timestamp needs
 * the same wording, and hand-rolling it per page is how the app ends up with
 * "2 hours ago", "2 hrs ago" and "02:11" on three screens that are supposed to
 * look like one product. Raw `Date` objects and epoch numbers must never reach
 * the UI (BRIEF §5), so every relative timestamp goes through here.
 *
 * `now` is injectable so the wording is deterministic under test rather than
 * drifting with the clock.
 *
 * Anything unusable — NaN, Infinity, a timestamp in the future from clock skew
 * between the browser and the server — reads as "just now" instead of throwing
 * inside a render.
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  if (!Number.isFinite(timestamp)) return "just now"

  const delta = now - timestamp
  // A future timestamp means clock skew, not a time machine. Never render
  // "in -2 hours".
  if (delta <= 0) return "just now"

  if (delta < 45_000) return "just now"
  if (delta < 90_000) return "a minute ago"
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} minutes ago`
  if (delta < 2 * HOUR) return "an hour ago"
  if (delta < DAY) return `${Math.floor(delta / HOUR)} hours ago`
  if (delta < 2 * DAY) return "yesterday"
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)} days ago`
  return formatDate(timestamp)
}

/**
 * Absolute fallback for timestamps older than a week, where "32 days ago"
 * stops being useful. Locale-stable input; the exact string is whatever the
 * runtime's `en-US` formatter produces.
 */
export function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "unknown date"
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
