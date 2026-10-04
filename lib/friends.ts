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
