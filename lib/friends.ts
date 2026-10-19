import type { Id } from "../convex/_generated/dataModel";
import type { FriendActivitySummary, UserRole } from "./friends-api";

/**
 * Pure logic behind the mutual-approval social graph in `convex/friends.ts`.
 *
 * Everything here is deliberately free of `ctx`: relationship resolution,
 * ordering, streak arithmetic and search ranking are the parts most worth
 * pinning down in tests, and Convex function bodies are not reachable from
 * Vitest. The shape mirrors `lib/publishing.ts` / `lib/certificates.ts` — the
 * rule lives here, the Convex module enforces it, `lib/friends.test.ts` pins
 * the edges, and the client asks the server rather than re-deriving anything.
 */

export const FRIENDSHIP_STATUSES = ["pending", "accepted", "declined"] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

export const USER_ROLES: readonly UserRole[] = ["student", "instructor", "admin"];

// ── Relationship resolution ──────────────────────────────────────────────

export type SendRequestBlockReason =
  | "already_friends"
  | "request_sent"
  | "request_received";

export type SendRequestPlan =
  /** No usable row exists in the acting direction — insert one. */
  | { kind: "insert" }
  /** The acting direction holds a previously declined row — re-open it. */
  | { kind: "reopen" }
  | { kind: "blocked"; reason: SendRequestBlockReason };

/**
 * Decides what `sendRequest` should do given the two possible rows for the
 * pair: `forward` is me → them, `reverse` is them → me. `null` means no row.
 *
 * The rule, in priority order:
 *  1. An accepted friendship in either direction wins — one row per pair, and
 *     the person you are already friends with is not a new candidate.
 *  2. A pending row I sent → "you already asked".
 *  3. A pending row they sent → "they asked first", because the useful action
 *     is to accept that request, not to open a second one and leave both
 *     dangling.
 *  4. A **declined** row I sent → re-open it as pending.
 *  5. Otherwise insert.
 *
 * On (4): a decline is "not now", not "never". Re-asking is allowed, and it
 * re-uses the same row rather than appending a second one for the same directed
 * pair — otherwise `pending → declined → pending` would leave the table with a
 * history nobody queries and the "one row per direction" invariant broken. The
 * row keeps `createdAt` fresh so the Requests tab shows the new attempt.
 *
 * A declined row in the *reverse* direction deliberately does **not** reopen:
 * that row belongs to their request, and flipping it would silently reassign who
 * asked whom. Instead a fresh forward row is inserted, which is the honest
 * record of "I asked them this time".
 *
 * Convex has no unique constraint, so this function is the only thing standing
 * between the app and two people both pressing "Send" at once — which is why
 * `sendRequest` computes the plan and *then* inserts.
 */
export function planSendRequest(input: {
  forward: FriendshipStatus | null;
  reverse: FriendshipStatus | null;
}): SendRequestPlan {
  const { forward, reverse } = input;

  if (forward === "accepted" || reverse === "accepted") {
    return { kind: "blocked", reason: "already_friends" };
  }
  if (forward === "pending") {
    return { kind: "blocked", reason: "request_sent" };
  }
  if (reverse === "pending") {
    return { kind: "blocked", reason: "request_received" };
  }
  if (forward === "declined") {
    return { kind: "reopen" };
  }
  return { kind: "insert" };
}

/**
 * Toast-readable refusals. Each one names the next action instead of just
 * saying "no", so the reader is not left guessing.
 */
export function sendRequestBlockedMessage(
  reason: SendRequestBlockReason,
  otherName: string,
): string {
  switch (reason) {
    case "already_friends":
      return `You and ${otherName} are already friends.`;
    case "request_sent":
      return `You already sent ${otherName} a friend request. Wait for them to respond.`;
    case "request_received":
      return `${otherName} has already sent you a friend request — accept it instead.`;
  }
}

// ── Relationship state ────────────────────────────────────────────────────

/** Which way a pending request points, from the caller's side. */
export type RelationshipDirection = "outgoing" | "incoming";

/**
 * Where one person stands with another.
 *
 * `"none"` is a real value rather than an absent key: the search page renders
 * an action for every person it shows, so "no relationship" has to be
 * expressible — and a missing key would have to be read as "not connected"
 * anyway, which is the same rule stated more quietly.
 *
 * `direction` is carried on the two states where it changes what a person may
 * do. A request you sent is waiting on them; one they sent is waiting on you.
 * A decline you sent is re-askable (`planSendRequest` re-opens it); a decline
 * they sent is **not** — the platform does not re-offer somebody you turned
 * down, and the difference has to survive all the way to the button.
 */
export type RelationshipState =
  | { kind: "none" }
  | {
      kind: "pending";
      direction: RelationshipDirection;
      friendshipId: Id<"friendships">;
    }
  | { kind: "accepted"; friendshipId: Id<"friendships"> }
  | {
      kind: "declined";
      direction: RelationshipDirection;
      friendshipId: Id<"friendships">;
    };

/** One side of a pair, as it is stored on the row. */
export interface RelationshipRowState {
  status: FriendshipStatus;
  friendshipId: Id<"friendships">;
}

/**
 * Collapses the two possible rows for a pair into the one state a person is in.
 *
 * The priority is deliberately the same as {@link planSendRequest}'s, because
 * the two questions are the same question asked twice: "is there a usable row
 * between us, and what may I do about it?". A rule that ordered these two
 * differently would let the search page offer a button that the friends page
 * then refuses.
 *
 *  1. An accepted row in either direction wins — one row per pair, and the
 *     person you are already friends with is not a new candidate.
 *  2. A pending row you sent → `"outgoing"`. The other way round →
 *     `"incoming"`, because the useful action is to accept it rather than to
 *     open a second request and leave both dangling.
 *  3. A declined row in either direction → `"declined"`, with the direction
 *     that produced it. Which direction it was changes what may be done
 *     about it: a request **you** sent and they declined may be re-asked
 *     (`planSendRequest` re-opens it), whereas a request **they** sent and you
 *     declined may not — the platform does not re-offer somebody you turned
 *     down.
 *
 * `"none"` therefore means *no row at all* — which is the only case in which
 * a brand new request may be inserted.
 */
export function mergeRelationship(
  forward: RelationshipRowState | null,
  reverse: RelationshipRowState | null,
): RelationshipState {
  const accepted =
    forward?.status === "accepted"
      ? forward
      : reverse?.status === "accepted"
        ? reverse
        : null;
  if (accepted) {
    return { kind: "accepted", friendshipId: accepted.friendshipId };
  }

  if (forward?.status === "pending") {
    return {
      kind: "pending",
      direction: "outgoing",
      friendshipId: forward.friendshipId,
    };
  }
  if (reverse?.status === "pending") {
    return {
      kind: "pending",
      direction: "incoming",
      friendshipId: reverse.friendshipId,
    };
  }

  if (forward?.status === "declined") {
    return {
      kind: "declined",
      direction: "outgoing",
      friendshipId: forward.friendshipId,
    };
  }
  if (reverse?.status === "declined") {
    return {
      kind: "declined",
      direction: "incoming",
      friendshipId: reverse.friendshipId,
    };
  }

  return { kind: "none" };
}

/**
 * The word a person is described by.
 *
 * Never a colour or an icon alone — the label is the message, so it survives
 * greyscale and colour-blindness.
 */
export function relationshipLabel(state: RelationshipState): string {
  switch (state.kind) {
    case "none":
      return "Not connected";
    case "pending":
      return state.direction === "outgoing" ? "Request sent" : "Request received";
    case "accepted":
      return "Friends";
    case "declined":
      return "Not connected";
  }
}

// ── Ordering ─────────────────────────────────────────────────────────────

export interface BefriendedAt {
  /** When the friendship was accepted, or when it was first requested. */
  since: number;
  /** Stable tiebreak so equal timestamps do not reshuffle between reads. */
  tiebreak: string;
}

/**
 * The one ordering rule for friendship lists: **most recently befriended
 * first**, falling back to the row id so equal timestamps are deterministic.
 *
 * Chosen over "most recently active" on purpose. Activity ordering would mean
 * reading `learningActivities` for every friend before you can draw the list —
 * expensive for `listSidebarFriends`, which the dashboard renders on *every*
 * page. `since` is already on the row, so this costs nothing.
 */
export function orderByBefriended<T extends BefriendedAt>(items: T[]): T[] {
  return [...items].sort((a, b) => b.since - a.since || (a.tiebreak < b.tiebreak ? 1 : a.tiebreak > b.tiebreak ? -1 : 0));
}

// ── Activity arithmetic ──────────────────────────────────────────────────

/** UTC day bucket, matching how `statistics.calculateCurrentStreak` groups. */
export function utcDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Shifts a `YYYY-MM-DD` key by whole days. UTC throughout, so no DST drift. */
export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return utcDayKey(shifted.getTime());
}

/**
 * Consecutive active days counting backwards from `todayKey`.
 *
 * Deliberately duplicated from `convex/statistics.ts` instead of shared with it:
 * that module is existing surface with its own tests, and refactoring it from a
 * feature branch would put unrelated churn in the diff. The semantics are
 * identical, including the grace rule that an active *yesterday* keeps a streak
 * alive (today has not necessarily started yet when the page renders).
 *
 * `maxDays` bounds the walk so a sparse history cannot spin.
 */
export function currentStreakDays(
  dayKeys: Iterable<string>,
  todayKey: string,
  maxDays = 366,
): number {
  const active = new Set(dayKeys);
  if (active.size === 0) return 0;

  let streak = 0;
  for (let i = 0; i < maxDays; i++) {
    const key = shiftDayKey(todayKey, -i);
    if (active.has(key)) {
      streak += 1;
      continue;
    }
    // Today missing is not a broken streak on its own — only if yesterday is
    // missing too does the run actually end.
    if (i === 0 && active.has(shiftDayKey(todayKey, -1))) continue;
    break;
  }
  return streak;
}

/** Turns a friend's raw rows into the compact summary the UI renders. */
export function summarizeActivity(input: {
  certificates: ReadonlyArray<{ revokedAt?: number }>;
  enrollments: ReadonlyArray<{ progressPercent: number }>;
  activityTimestamps: ReadonlyArray<number>;
  todayKey: string;
}): FriendActivitySummary {
  const active = input.certificates.filter((c) => c.revokedAt === undefined);
  const inProgress = input.enrollments.filter(
    (e) => e.progressPercent > 0 && e.progressPercent < 100,
  );
  // `activityTimestamps` arrives newest-first from the index, so head is last-seen.
  const lastActiveAt = input.activityTimestamps[0] ?? null;

  return {
    certificatesEarned: active.length,
    coursesInProgress: inProgress.length,
    currentStreak: currentStreakDays(
      input.activityTimestamps.map(utcDayKey),
      input.todayKey,
    ),
    lastActiveAt,
  };
}

// ── Discover search ──────────────────────────────────────────────────────

/** Below this, a substring search matches almost everyone. */
export const MIN_SEARCH_LENGTH = 2;

export function normalizeSearchTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isSearchableTerm(term: string): boolean {
  // Normalises internally so a padded term (" ada ") is judged on its content,
  // not its length. The call sites normalise first anyway; this just means a
  // future caller cannot accidentally short-circuit on whitespace.
  return normalizeSearchTerm(term).length >= MIN_SEARCH_LENGTH;
}

export interface SearchableUser {
  name?: string;
  email?: string;
}

/**
 * The first rank {@link searchMatchRank} gives to an address match.
 *
 * The ranks are ordered: name matches are 0–2 and address matches are 3–5, so
 * "the address is what matched" is `rank >= EMAIL_MATCH_RANK`. A caller that
 * needs to know *which field* matched — the search page, which shows an
 * address only when the address is what was searched for — reads this rather
 * than hard-coding a number that would silently drift if the ranking changed.
 */
export const EMAIL_MATCH_RANK = 3;

/**
 * Match quality, best first. Name beats email because someone searching
 * "ada" wants Ada Lovelace, not whoever has ada@ somewhere in their address.
 * `null` means no match.
 */
export function searchMatchRank(
  user: SearchableUser,
  term: string,
): number | null {
  const needle = normalizeSearchTerm(term);
  if (needle.length === 0) return null;

  const name = (user.name ?? "").toLowerCase();
  if (name) {
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
  }

  const email = (user.email ?? "").toLowerCase();
  if (email) {
    if (email === needle) return 3;
    if (email.startsWith(needle)) return 4;
    if (email.includes(needle)) return 5;
  }

  return null;
}

/** Deterministic ordering: rank, then display name, then email. */
export function compareSearchResults(
  a: { rank: number; name: string; email: string | null },
  b: { rank: number; name: string; email: string | null },
): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const byName = a.name.localeCompare(b.name);
  if (byName !== 0) return byName;
  return (a.email ?? "").localeCompare(b.email ?? "");
}

// ── Presentation ─────────────────────────────────────────────────────────

/**
 * Last-resort display name. `users.name` is optional (Clerk webhooks can arrive
 * without a full name), so every list falls back through email to a neutral
 * label rather than rendering an empty row.
 */
export function displayName(user: SearchableUser): string {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  return "Learner";
}

/** Up to two initials for the avatar fallback. Never empty. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

const ROLE_LABELS: Record<UserRole, string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Admin",
};

/** Human label for a role. Status is never communicated by colour alone, so
 * the word is always rendered next to whatever icon or tint carries it. */
export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

// ── Bounds ───────────────────────────────────────────────────────────────

/**
 * Clamps a caller-supplied limit into `[min, max]`, falling back to `fallback`
 * for anything unusable. Every list in `convex/friends.ts` routes its limit
 * through here: an unbounded `limit` from a client is an unbounded read.
 */
export function clampCount(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
