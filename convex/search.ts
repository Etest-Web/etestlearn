import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, type Doc, type Id, type ReadCtx, type UserDoc } from "./helpers/auth";
import { relationshipStatesFor } from "./helpers/relationships";
import { readUsersByRole } from "./helpers/users";
import { toPublicInstructor } from "./instructors";
import { displayName, EMAIL_MATCH_RANK } from "../lib/friends";
import {
  compareRanked,
  instructorMatchRank,
  isSearchableTerm,
  MAX_SEARCH_TERM_LENGTH,
  normalizeSearchTerm,
  searchMatchRank,
  SEARCH_LIMITS,
  toCourseHit,
  type CourseHit,
  type InstructorHit,
  type PersonHit,
  type SearchResults,
} from "../lib/search";

/**
 * One search across courses, instructors and people.
 *
 * The dashboard's search box used to know about courses only, so "who teaches
 * this?" and "who is learning this with me?" had no answer anywhere on the
 * platform. This is that answer: one query, one round trip, three kinds of
 * result.
 *
 * **Why one query and not three.** A keystroke in the search field has to
 * produce a settled page, and three separate subscriptions means three
 * loading states, three round trips and a result set that can be half old and
 * half new. One query also means one consistent snapshot — a course and the
 * instructor who teaches it are read against the same view of the world.
 *
 * **Why the results are grouped rather than interleaved.** A course and a
 * person are not comparable: one has a price and a syllabus, the other has an
 * avatar and a request button. Ranking them against each other would need a
 * cross-kind score that means nothing, so each kind is ranked against its own
 * kind and the sections are presented in that order.
 *
 * **No `limit` argument.** The section sizes are a product decision (see
 * `SEARCH_LIMITS`), not a knob: this query reads a bounded slice of three
 * collections at once, and a client-supplied limit would be a client-supplied
 * read size. The server owns the cap.
 */

// ─── The query ────────────────────────────────────────────────────────────

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<SearchResults> => {
    const user = await requireUser(ctx);

    const term = normalizeSearchTerm(args.query).slice(0, MAX_SEARCH_TERM_LENGTH);
    // One or two letters match most of the directory and help nobody find
    // anyone. Short-circuited before a single read.
    if (!isSearchableTerm(term)) {
      return {
        courses: [],
        instructors: [],
        people: [],
        moreCourses: false,
        moreInstructors: false,
        morePeople: false,
      };
    }

    const [courses, instructors, people] = await Promise.all([
      searchCourses(ctx, term),
      searchInstructors(ctx, term),
      searchPeople(ctx, term, user),
    ]);

    return {
      courses: courses.rows,
      instructors: instructors.rows,
      people: people.rows,
      moreCourses: courses.more,
      moreInstructors: instructors.more,
      morePeople: people.more,
    };
  },
});

// ─── Courses ──────────────────────────────────────────────────────────────

/**
 * Published courses matching the term.
 *
 * This is the `search` index on `courses` — a real full-text index over
 * "title description category" — the same one `courses.searchCourses` uses, so
 * a course is found by the same rules wherever it is searched from. The
 * `published` filter is on the index rather than applied afterwards, so a
 * draft never enters the result set at all.
 */
async function searchCourses(
  ctx: ReadCtx,
  term: string,
): Promise<{ rows: CourseHit[]; more: boolean }> {
  // One more than the cap, so "there may be more" is a fact rather than a
  // guess.
  const found = await ctx.db
    .query("courses")
    .withSearchIndex("search", (s) =>
      s.search("searchText", term).eq("published", true),
    )
    .take(SEARCH_LIMITS.courses + 1);

  return {
    rows: found.slice(0, SEARCH_LIMITS.courses).map(toCourseHit),
    more: found.length > SEARCH_LIMITS.courses,
  };
}

// ─── Instructors ──────────────────────────────────────────────────────────

/**
 * Instructors and admins matching the term.
 *
 * Both roles are searched because both have a public profile —
 * `convex/instructors.ts` publishes exactly those two roles, and a card that
 * linked to a profile that did not exist would be a dead end. There is no
 * third role to read, so two ranges cover every teachable account.
 *
 * A suspended account is filtered out: the platform treats suspension as
 * "signed out" everywhere else, so a suspended profile must not turn up in a
 * directory either.
 */
async function searchInstructors(
  ctx: ReadCtx,
  term: string,
): Promise<{ rows: InstructorHit[]; more: boolean }> {
  const [instructors, admins] = await Promise.all([
    readUsersByRole(ctx, "instructor"),
    readUsersByRole(ctx, "admin"),
  ]);

  // Rank against what the card will actually *show*. The raw row's name can
  // be untrimmed or empty, and the public projection replaces an empty one
  // with "Glypha Instructor" — so ranking against the raw name would make a
  // nameless instructor unfindable by the name they are displayed under, and
  // rank a padded name as a mere substring match.
  const candidates = [...instructors, ...admins]
    .filter((user) => user.suspendedAt === undefined)
    .map((user) => {
      const person = toPublicInstructor(user);
      return {
        rank: instructorMatchRank(
          { name: person.name, bio: person.bio, location: person.location },
          term,
        ),
        name: person.name,
        _id: user._id,
        user,
      };
    })
    .filter(
      (match): match is { rank: number; name: string; _id: Id<"users">; user: Doc<"users"> } =>
        match.rank !== null,
    )
    .sort(compareRanked);

  const more = candidates.length > SEARCH_LIMITS.instructors;
  const rows = candidates.slice(0, SEARCH_LIMITS.instructors);

  return {
    rows: rows.map(({ user }) => {
      // The public projection, not the row: an address, a phone number and an
      // encrypted bank account live on the same document.
      const person = toPublicInstructor(user);
      return {
        _id: person._id,
        name: person.name,
        imageUrl: person.imageUrl ?? null,
        bio: person.bio,
        location: person.location,
        role: user.role,
        // The star total is denormalized onto the user row, so showing a
        // reputation here costs no extra read.
        ratingSum: person.instructorRatingSum,
        ratingCount: person.instructorRatingCount,
      };
    }),
    more,
  };
}

// ─── People ───────────────────────────────────────────────────────────────

/**
 * Other learners matching the term.
 *
 * Only students. Instructors are searchable, but they are searchable *as
 * instructors* — with a public profile to read and courses to look at — so
 * listing them again among "people" would give one person two rows and two
 * different things to click.
 *
 * The caller is excluded: you are not a result for "who else is learning
 * here?".
 */
async function searchPeople(
  ctx: ReadCtx,
  term: string,
  caller: UserDoc,
): Promise<{ rows: PersonHit[]; more: boolean }> {
  const students = await readUsersByRole(ctx, "student");

  const matches = students
    .filter((user) => user._id !== caller._id && user.suspendedAt === undefined)
    .map((user) => ({
      rank: searchMatchRank(user, term),
      name: displayName(user),
      _id: user._id,
      user,
    }))
    .filter(
      (match): match is { rank: number; name: string; _id: Id<"users">; user: Doc<"users"> } =>
        match.rank !== null,
    )
    .sort(compareRanked);

  const more = matches.length > SEARCH_LIMITS.people;
  const rows = matches.slice(0, SEARCH_LIMITS.people);

  // Where the caller stands with each of them — **only** the people about to
  // be shown, and only after the list is settled. Two point reads each, off
  // the pair index, so the cost is bounded by the size of the result and not
  // by the size of the caller's social graph. Asking earlier would mean
  // reading every friendship the caller has to answer a question about eight
  // people.
  const relationships = await relationshipStatesFor(
    ctx,
    caller._id,
    rows.map((match) => match._id),
  );

  return {
    rows: rows.map(({ rank, user }) => ({
      _id: user._id,
      name: displayName(user),
      imageUrl: user.imageUrl ?? null,
      role: user.role,
      // The address is shown only when the address is what matched. A name
      // search must not hand out a directory of addresses.
      email: rank >= EMAIL_MATCH_RANK ? user.email ?? null : null,
      relationship: relationships.get(user._id) ?? { kind: "none" },
    })),
    more,
  };
}

// ─── Shared reads ─────────────────────────────────────────────────────────
