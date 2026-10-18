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
 * Whether this person may review this instructor, and if not, why not.
 *
 * The course gate cannot be reused, because the interesting question is
 * different: a learner may review a course they are *enrolled in*, whereas an
 * instructor is rated by people who took *any* of their courses. So the rule
 * asks the question the profile page actually needs answered — "has this person
 * been taught by this person?" — and that is a fact about the database, not
 * about the request. The caller resolves it (see
 * `convex/instructorReviews.ts#loadInstructorEligibility`) and passes the answer
 * in; this function stays pure.
 *
 * Two of the three gates are inherited deliberately:
 *
 * **Instructors and admins do not rate.** Same reason as the course gate: staff
 * enrolling is free (`enrollInCourse` exempts them), so an instructor rating a
 * competitor would be a free, unlimited way to attack a rival's profile without
 * ever paying for anything. Self-rating is refused first and separately, since
 * "you cannot review yourself" is a clearer sentence than "only learners can
 * rate an instructor" when the reader is looking at their own profile.
 *
 * **Taking a course is the bar.** A signed-out visitor cannot rate, and a
 * signed-in student who has never enrolled in anything by this instructor
 * cannot either. That is stricter than it sounds and it is the point: it is what
 * makes the average mean "people who were actually taught this" rather than
 * "people with an account and an opinion".
 */
export function instructorReviewEligibility(input: {
  signedIn: boolean;
  role: string | undefined;
  isSelf: boolean;
  tookTheirCourse: boolean;
}): ReviewEligibility {
  if (!input.signedIn) {
    return { eligible: false, reason: "Sign in to leave a review." };
  }
  if (input.isSelf) {
    return { eligible: false, reason: "You cannot review yourself." };
  }
  if (input.role !== "student") {
    return {
      eligible: false,
      reason: "Only learners can review an instructor.",
    };
  }
  if (!input.tookTheirCourse) {
    return {
      eligible: false,
      reason: "Enroll in one of this instructor's courses to leave a review.",
    };
  }
  return { eligible: true };
}

/**
 * The rating fields to write after a review change, for any sum/count pair.
 *
 * Serves both denormalized totals on the platform — a course's and an
 * instructor's — because they are the same pair under the same arithmetic, and
 * the arithmetic is the part that must not exist twice. Returned as a patch
 * rather than applied here so there is one place that knows the shape of the
 * running total: the two fields travel together, because a stored average would
 * round on every write and drift away from the reviews it summarises.
 *
 * Both fields go back to `undefined` at zero, so a row whose last review was
 * deleted is byte-identical to one that never had a review.
 *
 * The field names are a parameter because `users` cannot also carry
 * `ratingSum`/`ratingCount` for the same value it already uses for its own
 * purposes — the names say *whose* rating this is, and the two denormalizations
 * coexist on the platform.
 */
export function ratingPatchOf<K extends string>(
  current: { [P in K]?: number },
  delta: { sum: number; count: number },
  fields: { sum: K; count: K },
): { [P in K]: number | undefined } {
  const count = (current[fields.count] ?? 0) + delta.count;
  const sum = (current[fields.sum] ?? 0) + delta.sum;

  if (count <= 0) {
    // Computed rather than written literally so the returned object is keyed by
    // whatever names the caller passed, not by the course ones.
    return { [fields.sum]: undefined, [fields.count]: undefined } as {
      [P in K]: number | undefined;
    };
  }
  return { [fields.sum]: sum, [fields.count]: count } as { [P in K]: number | undefined };
}

/**
 * The rating patch for a **course**'s running total.
 *
 * A named wrapper over {@link ratingPatchOf} rather than a default argument,
 * because a defaulted generic that silently picks the wrong field names is the
 * kind of helper that produces an instructor whose average drifts from their
 * reviews for a year with nothing in the logs. Callers that are not about a
 * course say which fields they mean.
 */
export function ratingPatch(
  current: { ratingSum?: number; ratingCount?: number },
  delta: { sum: number; count: number },
): { ratingSum: number | undefined; ratingCount: number | undefined } {
  return ratingPatchOf(current, delta, { sum: "ratingSum", count: "ratingCount" });
}
