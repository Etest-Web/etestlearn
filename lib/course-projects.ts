/**
 * Course project policy — the shape and the limits of what an instructor
 * curates in "what you'll be able to build".
 *
 * Pure for the reason `lib/reviews.ts` is: the editor that drafts a project and
 * the mutation that stores it must agree, or Save fails on a form the instructor
 * believes is fine. Length caps live here rather than in the Convex validator
 * because a validator can reject a type, not a sentence written for a person.
 */

/** A project is a headline plus a short pitch, not a documentation page. */
export const PROJECT_TITLE_MAX_LENGTH = 80;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 600;

/** The takeaway sentence. Optional, but one sentence long when present. */
export const PROJECT_OUTCOME_MAX_LENGTH = 200;

/**
 * How many tools a project may claim to have used.
 *
 * Capped because the stack renders as a row of badges, and eleven of them stop
 * being scannable — at which point the list is decoration rather than
 * information about what the learner will have touched.
 */
export const TECH_STACK_MAX_TAGS = 8;
export const TECH_STACK_TAG_MAX_LENGTH = 30;

/** An instructor with more showcase rows than this has a syllabus problem. */
export const MAX_PROJECTS_PER_COURSE = 24;

/**
 * Cleans the tech-stack list: trims each tag, drops the blanks, de-duplicates
 * case-insensitively, and caps the count.
 *
 * De-duplication is case-insensitive but preserves the casing of the first
 * occurrence, so "React" followed by "react" keeps "React" rather than flipping
 * the badge text to lowercase every time a list is saved twice.
 *
 * Returns `undefined` rather than `[]` for an empty result, because "no stack
 * listed" and "an empty stack" are the same fact and the row should not carry
 * the difference.
 */
export function normalizeTechStack(
  raw: readonly string[] | null | undefined,
): string[] | undefined {
  if (!raw) return undefined;

  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of raw) {
    const tag = entry.trim().slice(0, TECH_STACK_TAG_MAX_LENGTH);
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === TECH_STACK_MAX_TAGS) break;
  }

  return out.length > 0 ? out : undefined;
}

/** Trims an optional free-text field, turning a blank into `undefined`. */
export function normalizeOptionalText(
  raw: string | null | undefined,
): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * What is wrong with this draft, or `null` if nothing is.
 *
 * Every caller shows this string verbatim, so it reads as a sentence. Title and
 * description are required because a project with neither is not a project; the
 * image, stack and outcome are all optional.
 */
export function projectDraftError(input: {
  title: string;
  description: string;
  outcome?: string | null;
}): string | null {
  const title = input.title.trim();
  if (title.length === 0) {
    return "Give the project a title.";
  }
  if (title.length > PROJECT_TITLE_MAX_LENGTH) {
    return `Keep the title under ${PROJECT_TITLE_MAX_LENGTH} characters.`;
  }

  const description = input.description.trim();
  if (description.length === 0) {
    return "Describe what the learner will have built.";
  }
  if (description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    return `Keep the description under ${PROJECT_DESCRIPTION_MAX_LENGTH} characters.`;
  }

  const outcome = normalizeOptionalText(input.outcome);
  if (outcome && outcome.length > PROJECT_OUTCOME_MAX_LENGTH) {
    return `Keep the outcome under ${PROJECT_OUTCOME_MAX_LENGTH} characters.`;
  }

  return null;
}