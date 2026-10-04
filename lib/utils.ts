import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * `pluralize(1, "member") === "1 member"`, `pluralize(3, "member") === "3 members"`.
 *
 * The dashboard shows a lot of small counts ("1 member", "3 requests to
 * review") and getting the plural wrong is the kind of thing that makes a
 * product feel unfinished, so it lives in one place rather than in each card.
 */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Absolute date for timestamps too old for a relative label ("on 4 Mar 2026").
 *
 * Pinned to UTC and a hand-rolled month table rather than `toLocaleDateString`
 * so the same millisecond always renders the same string — that keeps the
 * helper testable and keeps SSR output from disagreeing with the client on a
 * timezone boundary.
 */
export function formatAbsoluteDate(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * Humanised timestamp for anything the dashboard labels with "when".
 *
 * Every epoch number in a Convex payload is milliseconds since the epoch; the
 * one rule for this repo is that raw numbers never reach the DOM. This is the
 * single place that turns them into words, so a card, a message and a stats
 * strip all read the same way.
 *
 * Deliberate choices:
 * · Anything under 45 seconds is "just now" rather than "in 12 seconds" — a
 *   freshly posted message should not look like it is from the future because
 *   of clock skew between the browser and the server.
 * · Beyond a month a relative label stops being useful ("7 weeks ago" is not a
 *   date anybody plans around), so it switches to an absolute date.
 * · `now` is injectable so tests do not depend on the wall clock.
 */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  if (!Number.isFinite(timestamp)) return ""
  if (!Number.isFinite(now)) now = Date.now()

  const delta = now - timestamp
  const isFuture = delta < 0
  const magnitude = Math.abs(delta)

  if (magnitude < 45 * SECOND) return "just now"

  let phrase: string
  if (magnitude < HOUR) {
    const n = Math.round(magnitude / MINUTE)
    phrase = pluralize(n, "minute")
  } else if (magnitude < DAY) {
    const n = Math.round(magnitude / HOUR)
    phrase = pluralize(n, "hour")
  } else if (magnitude < WEEK) {
    const n = Math.round(magnitude / DAY)
    phrase = pluralize(n, "day")
  } else if (magnitude < 30 * DAY) {
    const n = Math.round(magnitude / WEEK)
    phrase = pluralize(n, "week")
  } else {
    return `on ${formatAbsoluteDate(timestamp)}`
  }

  return isFuture ? `in ${phrase}` : `${phrase} ago`
}