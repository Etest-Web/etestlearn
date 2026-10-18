/**
 * Class-discussion policy — who may post about a course they finished, how deep
 * a thread may run, and what counts as a usable post.
 *
 * Pure for the same reason `lib/reviews.ts` and `lib/certificates.ts` are: the
 * gate has to be reached identically by the query that decides whether to draw
 * the form, the mutation that writes the post, and the tests. A UI that offers
 * a box the write then refuses is the failure this prevents.
 *
 * The *completion* half of the gate is deliberately **not** here. It is
 * `evaluateCertificateCompletion`, which is already the platform's single
 * definition of "completed" and is resolved against the database by
 * `convex/helpers/completion.ts`. This file owns only the parts that are a
 * policy rather than a fact about a database.
 */

/**
 * Posts are longer than reviews, because they are retrospective rather than a
 * rating justification — but bounded, because an unbounded text box on a public
 * page is a wall someone has to scroll past.
 */
export const CLASS_COMMENT_BODY_MAX_LENGTH = 4_000;
export const CLASS_COMMENT_BODY_MIN_LENGTH = 1;

/**
 * How many levels below a top-level post are stored and read.
 *
 * Threads are unbounded in *depth* as a product concept — a reply to a reply is
 * a reply — but not in storage or display, for two reasons that happen to agree:
 *
 * · **Writes.** `depth` is copied from the parent so the guard is a field read;
 *   a thread that could grow without limit would also grow without a bound on
 *   how far a single "is this reply legal?" check has to trust the stored value.
 * · **Reads.** The tree is assembled from one bounded walk of the course's rows,
 *   so depth is really about how deep a *person* will follow a conversation on
 *   a product page. Past five levels the thread is a sidebar argument.
 *
 * Raising this is a one-line change plus a data migration if depth is wrong on
 * existing rows — which is why it is a named constant and not a literal at the
 * two places that use it.
 */
export const MAX_COMMENT_DEPTH = 5;

/** Display bound for one page of the discussion. */
export const MAX_TOP_LEVEL_POSTS = 50;

/** Reply cap inside one post, so a popular thread cannot dominate the page. */
export const MAX_REPLIES_PER_POST = 100;

export type ClassCommentEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Whether this person may post in this course's class discussion.
 *
 * The inputs are deliberately split so this function does no I/O:
 *
 * · `completedCourse` is the *certificate-grade* verdict — every lesson done and
 *   every quiz passed — not `progressPercent === 100`. Those are different
 *   questions: progress is lessons only, and a learner who watched everything and
 *   bombed one quiz has still sat through the class. It is also the same
 *   definition the certificate uses, so "finished the course" means one thing on
 *   this platform rather than two.
 * · `isCourseInstructor` is asked about separately because the instructor is
 *   usually *not* an eligible poster but must always be able to answer. The
 *   refusal for them is about writing a retrospective, not about being here.
 *
 * The order matters and is asserted in the tests: a signed-out visitor should
 * never learn anything about their standing, and a signed-in learner who has not
 * finished should be told the real reason rather than "sign in".
 */
export function classCommentEligibility(input: {
  signedIn: boolean;
  isCourseInstructor: boolean;
  enrolled: boolean;
  completedCourse: boolean;
}): ClassCommentEligibility {
  if (!input.signedIn) {
    return { eligible: false, reason: "Sign in to share your experience." };
  }
  if (input.isCourseInstructor) {
    return {
      eligible: false,
      reason: "You teach this course — you can reply, but not post a review of it.",
    };
  }
  if (!input.enrolled) {
    return {
      eligible: false,
      reason: "Only people who took this course can post about it.",
    };
  }
  if (!input.completedCourse) {
    return {
      eligible: false,
      reason: "Finish every lesson and pass the quizzes to share your experience.",
    };
  }
  return { eligible: true };
}

/**
 * Whether this person may *reply* here.
 *
 * Deliberately looser than posting: anyone signed in who can see the discussion
 * may join it, including another learner who has not finished. A thread that
 * only the certified-finished may enter is a testimonial wall, not a discussion,
 * and the instructor's answer usually provokes a reply from people still
 * working through it.
 *
 * `replyingToDeleted` covers replying to a removed post: the slot is still there
 * and the conversation under it is still readable, so refusing would strand the
 * replies already there.
 */
export function classCommentReplyEligibility(input: {
  signedIn: boolean;
  parentDepth: number;
}): ClassCommentEligibility {
  if (!input.signedIn) {
    return { eligible: false, reason: "Sign in to join the conversation." };
  }
  if (input.parentDepth >= MAX_COMMENT_DEPTH) {
    return {
      eligible: false,
      reason: "This thread is as deep as it goes — reply to the comment above instead.",
    };
  }
  return { eligible: true };
}

/** Trims a post body, or returns `undefined` for one that is only whitespace. */
export function normalizeCommentBody(
  raw: string | null | undefined,
): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * What is wrong with this draft, or `null` if nothing is.
 *
 * Written as a sentence a person can read, because every caller shows the string
 * verbatim. The minimum is 1 rather than a sentence minimum on purpose: a
 * learner's real post can be one word, and rejecting it would be the platform
 * editing someone's experience.
 */
export function classCommentDraftError(input: {
  body: string;
}): string | null {
  const body = normalizeCommentBody(input.body);

  if (!body || body.length < CLASS_COMMENT_BODY_MIN_LENGTH) {
    return "Write something before posting.";
  }
  if (body.length > CLASS_COMMENT_BODY_MAX_LENGTH) {
    return `Keep your post under ${CLASS_COMMENT_BODY_MAX_LENGTH} characters.`;
  }
  return null;
}

/**
 * The depth a reply to this parent will sit at.
 *
 * Trivial, but named so the one place that writes `depth` and the one place that
 * renders the indentation cannot disagree about what "one level deeper" means.
 */
export function replyDepth(parentDepth: number): number {
  return parentDepth + 1;
}