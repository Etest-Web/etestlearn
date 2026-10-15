/**
 * Review policy — the rules for who may rate a course and what counts as a
 * valid rating.
 *
 * Pure on purpose, like `lib/certificates.ts` and `lib/publishing.ts`: the same
 * verdict has to be reached by the mutation that writes a review, the query that
 * decides whether to draw the form, and the tests. Splitting the rule from the
 * `ctx` is what stops the client's idea of "you can review this" from drifting
 * away from the server's.
 */

/** Ratings are whole stars, 1–5. Zero is not "no rating", it is invalid. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** Long enough for a real opinion, short enough that a review is not an essay. */
export const REVIEW_COMMENT_MAX_LENGTH = 1_000;

export type RatingValue = 1 | 2 | 3 | 4 | 5;

/** Trims a comment and turns an empty one into `undefined`, not `""`. */
export function normalizeComment(
  raw: string | null | undefined,
): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * What is wrong with this draft, or `null` if nothing is.
 *
 * Every caller shows this string verbatim, so it is written for a person rather
 * than for a log. Validation cannot live only in the mutation: the mutation's
 * error surfaces as a thrown exception with the whole form's fate riding on it,
 * while this returns the same sentence for inline display.
 */
export function reviewDraftError(input: {
  rating: number;
  comment?: string | null;
}): string | null {
  if (!Number.isInteger(input.rating)) {
    return "Pick a rating from 1 to 5 stars.";
  }
  if (input.rating < RATING_MIN || input.rating > RATING_MAX) {
    return "Pick a rating from 1 to 5 stars.";
  }
  const comment = normalizeComment(input.comment);
  if (comment && comment.length > REVIEW_COMMENT_MAX_LENGTH) {
    return `Keep your review under ${REVIEW_COMMENT_MAX_LENGTH} characters.`;
  }
  return null;
}

/** A star count as the words a screen reader should hear. */
export function ratingLabel(rating: number): string {
  return `${rating} out of ${RATING_MAX} ${rating === 1 ? "star" : "stars"}`;
}

/**
 * The mean of a course's ratings, or `null` when it has none.
 *
 * Takes the running sum and count the course row carries rather than a list of
 * ratings: a course with a thousand reviews must not be a thousand reads to
 * print one number. Unrounded — the caller rounds for display, but stars need
 * the fraction to fill partially.
 */
export function averageRating(
  ratingSum: number | undefined,
  ratingCount: number | undefined,
): number | null {
  const count = ratingCount ?? 0;
  const sum = ratingSum ?? 0;
  if (count <= 0) return null;
  return sum / count;
}

/** An average as one decimal place, for display. `null` when unrated. */
export function formatRating(average: number | null): string | null {
  if (average === null) return null;
  return average.toFixed(1);
}

/** How full each of the five marks is: 1 for filled, 0 for empty, 0–1 between. */
export function starFill(value: number, index: number): number {
  const remaining = value - index;
  if (remaining <= 0) return 0;
  if (remaining >= 1) return 1;
  return remaining;
}

export type ReviewEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Whether this person may review this course, and if not, why not.
 *
 * The two gates past "enrolled" are the interesting ones:
 *
 * **Instructors do not review.** `enrollInCourse` exempts instructors and
 * admins from the paid-course check, so for a teacher "enrolled" does not mean
 * "bought". Letting them review would hand every instructor a free, unlimited
 * way to rate a competitor's course without ever paying for it — the abuse a
 * review system is least able to survive. It also closes the obvious
 * self-praise path from the other side, since the owner of the course is
 * rejected before the role check even runs.
 *
 * **Enrollment is the bar, and it is a weaker one for free courses.** On a paid
 * course an enrollment row means a settled purchase, which is a strong signal.
 * On a free course anyone can enroll and review a minute later, so a free
 * course's rating is worth correspondingly less. The alternative — requiring
 * real progress — was rejected because it would suppress honest reviews from
 * people who bounced off a bad course, which is exactly the feedback that
 * matters most.
 */
export function reviewEligibility(input: {
  signedIn: boolean;
  role: string | undefined;
  isCourseInstructor: boolean;
  isEnrolled: boolean;
}): ReviewEligibility {
  if (!input.signedIn) {
    return { eligible: false, reason: "Sign in to leave a review." };
  }
  if (input.isCourseInstructor) {
    return { eligible: false, reason: "You teach this course, so you cannot review it." };
  }
  if (input.role !== "student") {
    return {
      eligible: false,
      reason: "Only learners can review a course.",
    };
  }
  if (!input.isEnrolled) {
    return { eligible: false, reason: "Enroll in this course to leave a review." };
  }
  return { eligible: true };
}

/**
 * The rating fields to write on a course after a review change.
 *
 * Returned as a patch rather than applied here so there is one place that knows
 * the shape of the running total — `ratingSum` and `ratingCount` are the pair,
 * because a stored average would round on every write and drift away from the
 * reviews it summarises.
 *
 * Both fields go back to `undefined` at zero, so a course whose last review was
 * deleted is byte-identical to one that never had a review.
 */
export function ratingPatch(
  current: { ratingSum?: number; ratingCount?: number },
  delta: { sum: number; count: number },
): { ratingSum: number | undefined; ratingCount: number | undefined } {
  const count = (current.ratingCount ?? 0) + delta.count;
  const sum = (current.ratingSum ?? 0) + delta.sum;
  if (count <= 0) return { ratingSum: undefined, ratingCount: undefined };
  return { ratingSum: sum, ratingCount: count };
}
