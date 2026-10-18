/**
 * Bookmark policy — what a learner may save, and what the UI needs to know
 * before it draws a heart.
 *
 * Pure for the same reason `lib/reviews.ts` is: the button on a course card and
 * the mutation behind it must reach the same verdict, or the page will offer a
 * toggle that refuses when pressed. There is deliberately very little here — a
 * bookmark is the least rule-heavy feature on the platform — but the two rules
 * that do exist are the ones that would otherwise be re-derived per call site.
 */

/** Longest bookmark list a page will render before it needs a real pager. */
export const MAX_BOOKMARKS = 200;

/**
 * A course is bookmarkable if it is visible and the caller is not its author.
 *
 * **Unpublished courses are refused** because a bookmark is reached from a
 * public catalog card or the public course page, and neither can render an
 * unpublished listing — so the only way to get here with one is a stale link or
 * a crafted id, and saving it would produce a row pointing at something the
 * saved-courses page cannot show.
 *
 * **Your own course is refused** because saving your own listing is never what
 * anyone means by it: the instructor already has a console for that course, and
 * a "Saved" tab full of your own work is a worse place to look than that
 * console.
 *
 * `published` is passed rather than the course document, so this stays pure and
 * the caller keeps the already-loaded row.
 */
export function bookmarkableCourse(input: {
  published: boolean;
  isOwnCourse: boolean;
}): { eligible: true } | { eligible: false; reason: string } {
  if (!input.published) {
    return {
      eligible: false,
      reason: "This course is not available to save.",
    };
  }
  if (input.isOwnCourse) {
    return {
      eligible: false,
      reason: "You teach this course, so there is nothing to save it for.",
    };
  }
  return { eligible: true };
}