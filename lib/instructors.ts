/**
 * Small pure helpers for the public instructor profile.
 *
 * Shared by the profile page and its metadata layout so the "is this a usable
 * id?" test and the "is this a safe href?" test exist once. Same shape as
 * `lib/slug.ts`: no I/O, no React, testable in isolation.
 */

/**
 * Whether a URL segment could be a Convex document id.
 *
 * This is *not* a validator — only Convex can say whether an id belongs to a
 * table, and `v.id("users")` rejects anything that is not one by **throwing**.
 * On a public URL that turns `/instructors/garbage` into an error screen, so
 * the page screens out obvious garbage first and gets a 404 instead. Real ids
 * are lowercase alphanumeric; the check is deliberately looser than that (it
 * accepts upper case too) because being wrong in the strict direction would
 * 404 a real profile, and being wrong in the loose direction only costs the
 * server a call it was going to reject anyway.
 */
export function isConvexId(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[A-Za-z0-9]{16,64}$/.test(value);
}

/**
 * A stored website as something safe to put in an `href`.
 *
 * Instructors type `mysite.com` far more often than `https://mysite.com`, and
 * a scheme-less href is resolved relative to Glypha rather than to `mysite.com`
 * — so it must be prefixed. Only `http`/`https` are recognised: anything else
 * (including a `javascript:` scheme a compromised profile could have stored)
 * gets `https://` in front of it and becomes a harmless, broken https URL
 * rather than a script the browser would run.
 */
export function websiteHref(website: string): string {
  const trimmed = website.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Protocol-relative input would otherwise resolve against whatever origin the
  // page happens to be on; pin it to https so the link goes where it says.
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

/** The text to show for a website link, without the scheme. */
export function websiteLabel(website: string): string {
  return website.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}
