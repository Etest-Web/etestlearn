import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

/**
 * "3 hours ago" / "in 2 days" — one shared relative-time formatter for every
 * timestamp the dashboard shows (submissions, grades, task creation).
 *
 * Deliberately dependency-free and locale-free: this file is imported by every
 * UI primitive (and therefore transitively by anything rendered on the server),
 * so the output has to be identical in both environments or React will report a
 * hydration mismatch. It is hand-rolled rather than `Intl.RelativeTimeFormat`
 * for that reason, and because the dashboard's voice is plain English.
 *
 * `now` is injectable so callers under test can pin the clock. Anything inside
 * roughly a minute reads as "just now" — second-level precision is noise on a
 * page whose oldest meaningful value is hours.
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  if (!Number.isFinite(timestamp)) return "unknown"

  const delta = now - timestamp
  const future = delta < 0
  // Magnitude only — the wording differs for past and present.
  const abs = Math.abs(delta)

  let unit: string
  if (abs < MINUTE_MS) return "just now"
  else if (abs < HOUR_MS) unit = pluralize(Math.floor(abs / MINUTE_MS), "minute")
  else if (abs < DAY_MS) unit = pluralize(Math.floor(abs / HOUR_MS), "hour")
  else if (abs < WEEK_MS) unit = pluralize(Math.floor(abs / DAY_MS), "day")
  else if (abs < MONTH_MS) unit = pluralize(Math.floor(abs / WEEK_MS), "week")
  else if (abs < YEAR_MS) unit = pluralize(Math.floor(abs / MONTH_MS), "month")
  else unit = pluralize(Math.floor(abs / YEAR_MS), "year")

  return future ? `in ${unit}` : `${unit} ago`
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}
