/**
 * One definition of "this is an email address" for code that puts an address
 * somewhere it can do damage — a `replyTo` header, an SMTP envelope, a
 * notification body.
 *
 * Deliberately its own module with no imports: `lib/mail.ts` pulls in
 * nodemailer and Resend at load time, and the Convex default runtime must be
 * able to import this check (see `convex/instructorApplications.ts`) without
 * dragging a mail client into the bundle.
 *
 * What it refuses, and why (M-9):
 *
 *  - **CR/LF/NUL anywhere.** A newline in an address is a header separator to
 *    an SMTP server. Resend sends JSON and nodemailer sets `replyTo` through
 *    its own header builder, so classic injection is unlikely on either path
 *    — but "unlikely on the current transport" is not a property of the
 *    *input*, and the fallback transport is the one that changes.
 *  - **Length.** 254 total, 64 for the local part (RFC 5321). The callers used
 *    to cap at 320 characters, which is a size limit, not a shape check.
 *  - **Anything that does not look like `local@domain.tld`.** Conservative on
 *    purpose: an address this rejects is one a human can retype, and the
 *    alternative is handing arbitrary text to a mail header.
 */

const PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** Maximum total length of an address (RFC 5321 §4.5.3.1.3). */
const MAX_TOTAL_CHARS = 254;
/** Maximum length of the part before the `@` (RFC 5321 §4.5.3.1.1). */
const MAX_LOCAL_CHARS = 64;

/**
 * Trim, strip nothing, and return the address if — and only if — it is one.
 *
 * Returns `null` rather than throwing: every caller wants "not an address" as
 * data (drop the reply-to, reject the form, skip the row) rather than as an
 * exception to thread up.
 */
export function normalizeEmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const address = value.trim();
  if (!address || address.length > MAX_TOTAL_CHARS) return null;
  // Checked before the regex so a newline never even reaches the pattern, and
  // so the reason is not "it did not match" when the real reason is a header
  // separator.
  if (/[\r\n\0]/.test(address)) return null;

  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  if (address.slice(0, at).length > MAX_LOCAL_CHARS) return null;

  return PATTERN.test(address) ? address : null;
}

/**
 * The value to put in a `replyTo`, or `undefined` if the candidate is not an
 * address.
 *
 * Dropping (rather than substituting or throwing) is the right failure here:
 * a reply-to is a convenience, so losing it costs a reply going to the From
 * address instead — while keeping an unvalidated one hands a mail header to
 * whoever typed it.
 */
export function replyToAddress(value: unknown): string | undefined {
  return normalizeEmailAddress(value) ?? undefined;
}
