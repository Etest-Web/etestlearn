/**
 * Plain-text input hygiene for anything stored in the database.
 *
 * Server-side enforcement, not cosmetic client trimming: Convex functions are
 * callable by any client, so every string that lands on a row is stripped of
 * control characters, trimmed and length-capped before it is stored. Multiline
 * fields keep \n and \t; single-line fields strip everything that is not printable.
 */

/** Control characters except tab, LF and CR (safe for multiline fields). */
const NON_PRINTABLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** All control characters (single-line fields). */
const ALL_CONTROL = /[\u0000-\u001F\u007F]/g;

export const TEXT_LIMITS = {
  title: 200,
  description: 10_000,
  category: 100,
  level: 50,
  section: 200,
  fileName: 255,
  url: 2048,
  content: 500_000,
  reason: 2_000,
} as const;

/** Single-line plain text: strips all control characters, trims, caps length. */
export function sanitizeSingleLine(value: string, maxLength: number = TEXT_LIMITS.title): string {
  return value.replace(ALL_CONTROL, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Multiline plain text: keeps newlines, strips other control characters, trims, caps length. */
export function sanitizeMultiline(value: string, maxLength: number = TEXT_LIMITS.description): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(NON_PRINTABLE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

/**
 * Stored URLs (thumbnails, trailers, avatars…) must be absolute http(s) —
 * `javascript:`/`data:` URLs would otherwise be kept verbatim and rendered
 * straight into `src` attributes.
 */
export function isSafeHttpUrl(value: string, maxLength: number = TEXT_LIMITS.url): boolean {
  if (value.length === 0 || value.length > maxLength) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" || url.protocol === "http:";
}

/**
 * Normalizes an optional stored-URL field: returns the trimmed URL when it is
 * safe, `undefined` for empty (clears the field when used with patch semantics
 * that treat `undefined` as "remove"), and throws for unsafe values.
 */
export function sanitizeStoredUrl(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!isSafeHttpUrl(trimmed)) {
    throw new Error(`${field} must be an absolute http(s) URL`);
  }
  return trimmed;
}
