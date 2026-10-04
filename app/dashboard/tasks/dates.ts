/**
 * `<input type="date">` glue.
 *
 * The value has to be `YYYY-MM-DD` in the *viewer's* timezone or the browser
 * silently shifts a deadline by a day, so both directions go through local date
 * parts rather than `toISOString()` (which is UTC and would show yesterday for
 * anybody east of Greenwich in the evening).
 *
 * Deliberately client-side UI glue rather than `lib/`: it has no server-side
 * meaning, and the shared date maths already lives in `lib/tasks.ts`.
 */

/** Epoch ms → `YYYY-MM-DD` for the viewer's timezone. */
export function dateToInputValue(timestamp: number | undefined | null): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * A human date for prose ("18 Apr 2026"), not for a form control — use
 * {@link dateToInputValue} there.
 *
 * Month names are a fixed table rather than `toLocaleDateString`, so the server
 * and browser produce identical text. This is only ever rendered after a query
 * resolves, but a stable formatter is cheaper to reason about than a locale
 * argument nobody can verify.
 */
export function formatHumanDate(timestamp: number | undefined | null): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "no date";
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * `YYYY-MM-DD` → epoch ms at the end of that local day, so a learner picking
 * "Friday" gets the whole of Friday as their deadline rather than 00:00 on it.
 * Returns undefined for an empty value, which the mutations read as "no deadline".
 */
export function inputValueToTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getTime();
}