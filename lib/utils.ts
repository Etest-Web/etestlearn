import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Humanises a timestamp for the UI — "just now", "12m ago", "Yesterday",
 * "4 Mar". Never returns an epoch number or a raw `Date`.
 *
 * `now` is a parameter (defaulting to the current time) so the result is
 * deterministic under test and so a caller rendering a batch can pass the same
 * reference time to every item instead of drifting mid-list.
 *
 * A timestamp in the future is reported as "just now" rather than a negative
 * duration: client clocks drift, and "in -3 seconds" reads as a bug.
 */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const elapsed = now - timestamp;

  if (elapsed < 45_000) return "just now";

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }

  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  const date = new Date(timestamp);
  // Past a week the exact time stops mattering in a feed, so drop it. The year
  // is only shown when it is not the current one — "4 Mar" beats "4 Mar 2026".
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}
