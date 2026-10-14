/**
 * The address instructors (and learners) write to when they need a human.
 *
 * Centralised because it appears in three places that must not drift: the
 * Earnings receipt's "cannot change this myself" copy, the server-side error
 * the save mutation throws, and the confirmation email. One function, so a
 * change of address is a one-line edit.
 *
 * Env override (`SUPPORT_EMAIL`) lets an operator redirect mail without a
 * deploy — the default is the address that actually gets read today.
 */

export const DEFAULT_SUPPORT_EMAIL = "noreply@glypha.com.ng";

export function supportEmail(): string {
  // Two names on purpose: `NEXT_PUBLIC_SUPPORT_EMAIL` is what a Next.js
  // client bundle can inline, `SUPPORT_EMAIL` is what an operator would
  // naturally set on Convex (`npx convex env set SUPPORT_EMAIL …`). Whichever
  // is present wins; the default is the address that actually gets read today.
  const configured = (
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??
    process.env.SUPPORT_EMAIL ??
    ""
  ).trim();
  return configured.length > 0 ? configured : DEFAULT_SUPPORT_EMAIL;
}

/** `mailto:` link with a prefilled subject, for the "contact support" links. */
export function supportMailto(subject: string): string {
  return `mailto:${supportEmail()}?subject=${encodeURIComponent(subject)}`;
}
