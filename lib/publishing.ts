/**
 * Who may take a course off sale.
 *
 * The scam this exists to close: an instructor lists a paid course, a learner
 * pays, and the listing then disappears — with no refund, no notice and nothing
 * the buyer can do about it. Publishing itself stays entirely in the
 * instructor's hands (they need to be able to launch), but *unpublishing* a
 * course somebody has already paid for becomes an admin decision made through a
 * request. Nothing is lost in the meantime: buyers keep their enrollment and
 * their access (see `courses.hasAccessToCourse`), and the course keeps its URL.
 *
 * This is the single source for that rule, the same way `lib/certificates.ts`
 * owns the completion rule: `convex/courses.ts` enforces it and refuses a
 * direct unpublish, `lib/publishing.test.ts` pins the edges, and the instructor
 * UI asks the server (`courses.getCoursePublishingState`) rather than
 * re-deriving it in the browser.
 */

/** Prices are kobo; absent or 0 means the course is free. */
export function isPaidCourse(price: number | undefined): boolean {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

export type UnpublishPolicy =
  /** Free course — the owner may unpublish it at any time. */
  | "free"
  /** Paid, but nobody has bought yet — no buyer is affected by unpublishing. */
  | "paid_unsold"
  /** Paid *and* sold — unpublishing needs an admin to approve it. */
  | "needs_approval";

/**
 * Classifies a course's unpublish rights.
 *
 * `paidSales` counts completed (`paid`) purchases, which is the number that
 * matters: a pending checkout has not taken money yet, and the webhook still
 * grants the enrollment if it completes, so gating on it would only add admin
 * work without protecting anyone.
 */
export function unpublishPolicy(input: {
  price?: number;
  paidSales: number;
}): UnpublishPolicy {
  if (!isPaidCourse(input.price)) return "free";
  return input.paidSales > 0 ? "needs_approval" : "paid_unsold";
}

/**
 * Thrown-style message for a refused direct unpublish. Written for the
 * instructor reading it in a toast, and specific enough that they know the next
 * action rather than just that they were denied.
 */
export function unpublishBlockedMessage(paidSales: number): string {
  return (
    `${paidSales} learner${paidSales === 1 ? " has" : "s have"} already paid for this course. ` +
    "Unpublishing it needs admin approval — submit a request and an admin will review it."
  );
}

/** Thrown when a free/unsold course is sent down the request path needlessly. */
export function unpublishNotGatedMessage(): string {
  return "Nobody has paid for this course yet, so you can unpublish it directly.";
}