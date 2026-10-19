import type { Id } from "../convex/_generated/dataModel";
import {
  MIN_SEARCH_LENGTH,
  isSearchableTerm,
  normalizeSearchTerm,
  searchMatchRank,
} from "./friends";
import type { RelationshipState } from "./friends";

/**
 * The shared vocabulary of the platform search.
 *
 * One search answers one question — "is there something here for me?" — and the
 * answer has three kinds of thing in it: a **course** to take, an
 * **instructor** who teaches, and a **person** to learn alongside. Those used
 * to be three separate surfaces: the dashboard search box only knew about
 * courses, the friends page had its own people directory, and an instructor
 * could not be found by name at all. This module is where the three agree on
 * what a result looks like.
 *
 * Two rules live here rather than in `convex/search.ts`, because they are the
 * parts most worth pinning down in a test and the parts a Convex function body
 * cannot be unit-tested for:
 *
 *  · **How something is matched and ranked** — `instructorMatchRank` for a
 *    public profile, and `searchMatchRank` (from `lib/friends.ts`, reused
 *    rather than rewritten) for a person.
 *  · **How a snippet of matched text is cut** — `matchExcerpt`, so the word
 *    that matched is the word the reader sees marked.
 *
 * The Convex module enforces; this module decides. Same shape as
 * `lib/certificates.ts` and `lib/publishing.ts`.
 */

/**
 * People-search primitives, re-exported from `lib/friends.ts`.
 *
 * They are re-exported rather than re-implemented on purpose: the friends
 * Discover tab and this search page both match people by name and address, and
 * two copies of "what counts as a match" would drift into two dialects of
 * "search". `lib/friends.ts` owns them because the social graph is where they
 * were first needed — and it is also where {@link RelationshipState} lives,
 * because a person and their relationship to you are one subject.
 */
export {
  MIN_SEARCH_LENGTH,
  isSearchableTerm,
  normalizeSearchTerm,
  searchMatchRank,
};

// ── Limits ────────────────────────────────────────────────────────────────

/**
 * How many results each section shows.
 *
 * Courses get the most room: a title matches a lot of listings, and a course
 * is the thing a learner is most likely to act on. People and instructors are
 * narrower — the point of finding a person is to act on *one* of them, not to
 * browse two hundred — and a longer list of them is mostly noise.
 *
 * These are the server's caps, not the client's: a client-supplied limit is a
 * client-supplied read size, and this query reads a bounded slice of three
 * collections at once.
 */
export const SEARCH_LIMITS = {
  courses: 12,
  instructors: 8,
  people: 8,
} as const;

/**
 * The longest term a search will act on.
 *
 * Convex validators cannot express a maximum length, so the cap is applied
 * here. It matters more than it looks: the term is matched against every
 * account on the platform, so a one-megabyte term would be a one-megabyte
 * regular expression a thousand times over, against a one-second query
 * budget. No real name, address or course title comes close to 64
 * characters, so nothing is lost by cutting there — and the cut is a
 * *truncation*, so a search for a long phrase still matches on its opening
 * words.
 */
export const MAX_SEARCH_TERM_LENGTH = 64;

// ── Result shapes ─────────────────────────────────────────────────────────

export type SearchRole = "student" | "instructor" | "admin";

/** One course in the result list. */
export interface CourseHit {
  _id: Id<"courses">;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl?: string;
  category?: string;
  level?: string;
  price?: number;
  currency?: string;
}

/**
 * One instructor in the result list.
 *
 * The public subset only — the same projection `convex/instructors.ts` serves
 * on a profile page. An address, a phone number, a birthday and the encrypted
 * bank account live on the same row and are deliberately not carried here:
 * the safest way to keep them out of a search result is for the result never
 * to be handed them.
 */
export interface InstructorHit {
  _id: Id<"users">;
  name: string;
  imageUrl: string | null;
  bio?: string;
  location?: string;
  role: SearchRole;
  /**
   * The running star total behind the average on their public profile.
   *
   * The sum/count *pair*, not a stored average, for the same reason
   * `courses.ratingSum` is a pair: an average rounds on every write and
   * slowly drifts from the reviews it claims to summarise. Both absent means
   * "never rated" — which is also what an instructor whose last review was
   * deleted must look like.
   *
   * Carried rather than counted, so a search result costs no extra read to
   * show a reputation.
   */
  ratingSum?: number;
  ratingCount?: number;
}

/** One person in the result list. */
export interface PersonHit {
  _id: Id<"users">;
  name: string;
  imageUrl: string | null;
  role: SearchRole;
  /**
   * The address, present **only** when the query matched it.
   *
   * A name search must not hand out a directory of addresses, and the address
   * is the only way to find somebody whose profile carries no name at all —
   * so it is shown when it is the thing that was searched for and hidden
   * otherwise.
   */
  email: string | null;
  /** Where the caller stands with this person. */
  relationship: RelationshipState;
}

/** Everything one search returned, with a flag per section for "there may be more". */
export interface SearchResults {
  courses: CourseHit[];
  instructors: InstructorHit[];
  people: PersonHit[];
  /** True when a section hit its cap, so more may exist behind it. */
  moreCourses: boolean;
  moreInstructors: boolean;
  morePeople: boolean;
}

// ── Matching ──────────────────────────────────────────────────────────────

/**
 * Match quality for an instructor's public profile, best first.
 *
 * The name is what somebody types when they are looking for a *person*, so it
 * outranks everything else. The bio and the location are what they type when
 * they are looking for a *subject* ("python"), and both rank lower because
 * they match far more loosely than a name does.
 *
 * `null` means no match.
 */
export function instructorMatchRank(
  profile: { name?: string; bio?: string; location?: string },
  term: string,
): number | null {
  const needle = normalizeSearchTerm(term);
  if (needle.length === 0) return null;

  const name = (profile.name ?? "").toLowerCase();
  if (name) {
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
  }

  const bio = (profile.bio ?? "").toLowerCase();
  if (bio.includes(needle)) return 3;

  const location = (profile.location ?? "").toLowerCase();
  if (location.includes(needle)) return 4;

  return null;
}

/**
 * Deterministic ordering for a result list: best match first, then name, then
 * the row id.
 *
 * The id is the final tiebreak because two people can share a name, and a
 * list that reshuffles between two identical queries is a list nobody can
 * point at.
 */
export function compareRanked(
  a: { rank: number; name: string; _id: string },
  b: { rank: number; name: string; _id: string },
): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return a._id.localeCompare(b._id);
}

// ── Snippets ──────────────────────────────────────────────────────────────

export interface ExcerptPart {
  text: string;
  match: boolean;
}

/**
 * A window of `text` around the first match of `term`, split so the hit can be
 * marked.
 *
 * The result is a list of plain strings, never HTML: the UI renders the
 * matched part inside a `<mark>` and the rest as text. A bio is user input,
 * so nothing here may be able to inject markup.
 *
 * The window starts a little before the hit so the reader gets context, but
 * never so far that the hit itself falls outside it — and the cut is marked
 * with an ellipsis on whichever side was trimmed, so a snippet taken out of
 * the middle of a long bio does not read as if it were the whole bio.
 */
export function matchExcerpt(
  text: string,
  term: string,
  maxChars = 160,
): ExcerptPart[] {
  const source = text.trim();
  if (!source) return [];

  const limit = Math.max(1, maxChars);
  const needle = normalizeSearchTerm(term);

  if (needle.length === 0) {
    return [{ text: clip(source, limit), match: false }];
  }

  const at = source.toLowerCase().indexOf(needle);
  if (at === -1) {
    return [{ text: clip(source, limit), match: false }];
  }

  const start = Math.max(0, at - Math.floor(limit / 3));
  const window = source.slice(start, start + limit);

  const parts: ExcerptPart[] = [];
  const lower = window.toLowerCase();
  let cursor = 0;
  for (;;) {
    const hit = lower.indexOf(needle, cursor);
    if (hit === -1) break;
    if (hit > cursor) {
      parts.push({ text: window.slice(cursor, hit), match: false });
    }
    parts.push({ text: window.slice(hit, hit + needle.length), match: true });
    cursor = hit + needle.length;
  }
  if (cursor < window.length) {
    parts.push({ text: window.slice(cursor), match: false });
  }
  if (parts.length === 0) {
    return [{ text: clip(window, limit), match: false }];
  }

  if (start > 0) {
    parts[0] = { ...parts[0], text: `…${parts[0].text}` };
  }
  if (start + limit < source.length) {
    const last = parts[parts.length - 1];
    parts[parts.length - 1] = { ...last, text: `${last.text}…` };
  }

  return parts;
}

/** The first `limit` characters, with an ellipsis when anything was cut. */
function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// ── Projections ───────────────────────────────────────────────────────────

/**
 * The course fields a search result carries.
 *
 * A projection rather than the whole document: the result is rendered in a
 * list, and the document carries bookkeeping (the denormalised `searchText`,
 * the rating totals, the instructor id) that nobody renders there.
 *
 * Shared with the page's browse-everything view so both draw the same card
 * from the same fields.
 */
export function toCourseHit(course: {
  _id: Id<"courses">;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl?: string;
  category?: string;
  level?: string;
  price?: number;
  currency?: string;
}): CourseHit {
  return {
    _id: course._id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    thumbnailUrl: course.thumbnailUrl,
    category: course.category,
    level: course.level,
    price: course.price,
    currency: course.currency,
  };
}
