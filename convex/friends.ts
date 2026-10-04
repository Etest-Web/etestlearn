import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRateLimit } from "./helpers/rateLimit";
import {
  requireUser,
  type Doc,
  type Id,
  type ReadCtx,
  type UserDoc,
  type WriteCtx,
} from "./helpers/auth";
import {
  clampCount,
  compareSearchResults,
  displayName,
  FRIENDSHIP_STATUSES,
  isSearchableTerm,
  normalizeSearchTerm,
  orderByBefriended,
  planSendRequest,
  searchMatchRank,
  sendRequestBlockedMessage,
  summarizeActivity,
  utcDayKey,
} from "../lib/friends";
import type {
  DiscoverUser,
  FriendSummary,
  FriendsActivityItem,
  RequestEntry,
  RequestsBundle,
  SidebarFriend,
} from "../lib/friends-api";

/**
 * Mutual-approval social graph.
 *
 * Product decision: students, instructors and admins all participate, and
 * anyone can befriend anyone. What *is* enforced is privacy —
 *
 *  · your friend list is private to you; there is no public profile read,
 *  · a friend's learning activity is readable **only** by accepted friends,
 *  · a pending request grants nothing, and a declined one never did.
 *
 * Two structural choices carry most of the weight:
 *
 *  1. **Two range reads, not a scan.** `friendships` has no pair key, because
 *     a Convex index cannot express "either column equals me". So every read of
 *     "my friends" is exactly two equality range reads (`by_requester_status`
 *     and `by_addressee_status`, both pinned to `"accepted"`) merged in memory.
 *     See `acceptedFriendships`.
 *  2. **Activity is never stored per friendship.** It is computed at read time
 *     from the friend's own `certificates` / `enrollments` / `learningActivities`
 *     rows, after the accepted-friend id set has been built. There is no
 *     denormalised copy that could outlive the friendship and leak.
 *
 * No `logAudit` here: befriending is ordinary self-service, not a privileged
 * action, and an audit row per friend click would bury the rows that matter.
 *
 * Bounds (all routes through `clampCount`) exist because a client-supplied
 * limit is a client-supplied read size:
 *   · `STREAK_SCAN_LIMIT`  recent activity rows read per friend, per summary.
 *   · `USER_SCAN_LIMIT`   ceiling on the table scan behind `searchUsers`.
 *   · `PENDING_COUNT_CEILING` ceiling on the badge count.
 */

// ─── Bounds ───────────────────────────────────────────────────────────────

const SIDEBAR_DEFAULT = 6;
const SIDEBAR_MAX = 20;

const DISCOVER_DEFAULT = 10;
const DISCOVER_MAX = 25;

const FEED_DEFAULT = 20;
const FEED_MAX = 50;
/** Over-fetch per friend so the global newest-N cut is not starved by ordering. */
const FEED_OVERSCAN = 2;

/**
 * Recent activity rows read per friend. The streak walks backwards from today
 * and stops at the first gap, so a few hundred rows covers any plausible streak;
 * beyond that the number is a guess nobody can act on.
 */
const STREAK_SCAN_LIMIT = 400;

/**
 * How many `users` rows one `searchUsers` call will look at. See the long note
 * on that query for why a scan is unavoidable today and what would replace it.
 */
const USER_SCAN_LIMIT = 300;

/**
 * The nav badge saturates here. Convex has no count aggregation, so counting is
 * still a read — bounded, so a pathological account cannot make the dashboard's
 * shared sidebar expensive. The UI renders anything at or above this as "99+".
 */
const PENDING_COUNT_CEILING = 200;

// ─── Rate-limit budgets ───────────────────────────────────────────────────

/** Asking someone to be your friend is rare; 20 an hour is not a wall. */
const SEND_REQUEST_MAX = 20;
const SEND_REQUEST_WINDOW = 60 * 60 * 1000;

/**
 * Responding is cheap but it is still a write per click, and a client that
 * walks a long list pressing "Accept" would otherwise be unbounded.
 */
const RESPOND_MAX = 30;
const RESPOND_WINDOW = 60 * 1000;

// ─── Shared reads ─────────────────────────────────────────────────────────

/**
 * The `friendships` row, derived from the schema rather than restated here, so
 * this file cannot drift from `convex/schema.ts`.
 */
type FriendshipRow = Doc<"friendships">;

/** When a friendship became visible to both sides. */
function befriendedAt(row: FriendshipRow): { since: number; tiebreak: string } {
  return { since: row.respondedAt ?? row.createdAt, tiebreak: row._id };
}

/** The other party, whichever end of the row `selfId` is standing on. */
function otherParty(row: FriendshipRow, selfId: Id<"users">): Id<"users"> {
  return row.requesterId === selfId ? row.addresseeId : row.requesterId;
}

/**
 * Your accepted friendships, in both directions, as two index range reads.
 *
 * This is the heart of the read path and it is deliberately *not* a full table
 * scan with an `includes()` predicate: both queries are equality-pinned on
 * `(userId, "accepted")`, so the database never leaves the index range. The
 * merge happens in memory because the schema cannot index "either column".
 *
 * The merge also de-duplicates by the *other* person, keeping the most recently
 * accepted row. `sendRequest` already refuses to create two rows for one pair,
 * so this is belt-and-braces for rows written before that guard existed (or by
 * a future migration): without it a person would appear twice on the Friends
 * tab and twice in the activity feed.
 */
async function acceptedFriendships(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<FriendshipRow[]> {
  const [outgoing, incoming] = await Promise.all([
    ctx.db
      .query("friendships")
      .withIndex("by_requester_status", (q) =>
        q.eq("requesterId", userId).eq("status", "accepted"),
      )
      .collect(),
    ctx.db
      .query("friendships")
      .withIndex("by_addressee_status", (q) =>
        q.eq("addresseeId", userId).eq("status", "accepted"),
      )
      .collect(),
  ]);
  return dedupeByParty([...outgoing, ...incoming], userId);
}

/**
 * Collapses rows that describe the same person, keeping the newest. Order of
 * the result is not meaningful — callers sort with `orderByBefriended`.
 */
function dedupeByParty(
  rows: FriendshipRow[],
  selfId: Id<"users">,
): FriendshipRow[] {
  const byParty = new Map<Id<"users">, FriendshipRow>();
  for (const row of rows) {
    const party = otherParty(row, selfId);
    const kept = byParty.get(party);
    if (!kept || befriendedAt(row).since >= befriendedAt(kept).since) {
      byParty.set(party, row);
    }
  }
  return [...byParty.values()];
}

/**
 * Everyone already in a relationship with `userId`, in either direction, in any
 * status. Used by `searchUsers` so discover never offers someone you have
 * already sent to, already accepted, or already turned down.
 *
 * Six small range reads (three statuses × two directions) because the indexes
 * are `(userId, status)` — there is no single range covering all three statuses.
 */
async function relatedUserIds(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Set<Id<"users">>> {
  const ids = new Set<Id<"users">>();
  for (const status of FRIENDSHIP_STATUSES) {
    const [outgoing, incoming] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_requester_status", (q) =>
          q.eq("requesterId", userId).eq("status", status),
        )
        .collect(),
      ctx.db
        .query("friendships")
        .withIndex("by_addressee_status", (q) =>
          q.eq("addresseeId", userId).eq("status", status),
        )
        .collect(),
    ]);
    for (const row of outgoing) ids.add(row.addresseeId);
    for (const row of incoming) ids.add(row.requesterId);
  }
  return ids;
}

/** Resolves a row's counterpart, or null when that account is gone. */
async function toProfile(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<{ name: string; imageUrl: string | null; role: UserDoc["role"] } | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  return {
    name: displayName(user),
    imageUrl: user.imageUrl ?? null,
    role: user.role,
  };
}

async function summarizeFriend(
  ctx: ReadCtx,
  selfId: Id<"users">,
  row: FriendshipRow,
  todayKey: string,
): Promise<FriendSummary | null> {
  const friendId = otherParty(row, selfId);

  const [profile, certificates, enrollments, activities] = await Promise.all([
    toProfile(ctx, friendId),
    ctx.db
      .query("certificates")
      .withIndex("by_user", (q) => q.eq("userId", friendId))
      .collect(),
    ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", friendId))
      .collect(),
    // Newest first so the streak scan and `lastActiveAt` both stop early.
    ctx.db
      .query("learningActivities")
      .withIndex("by_user_created", (q) => q.eq("userId", friendId))
      .order("desc")
      .take(STREAK_SCAN_LIMIT),
  ]);

  if (!profile) return null;

  return {
    _id: friendId,
    friendshipId: row._id,
    name: profile.name,
    imageUrl: profile.imageUrl,
    role: profile.role,
    since: befriendedAt(row).since,
    activity: summarizeActivity({
      certificates,
      enrollments,
      activityTimestamps: activities.map((a) => a.createdAt),
      todayKey,
    }),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────

/**
 * Accepted friends with a compact activity summary, most recently befriended
 * first (see `orderByBefriended`).
 *
 * Privacy is structural, not a filter applied at the end: the rows joined here
 * can only come out of `acceptedFriendships`, which is pinned to `"accepted"`,
 * so a pending or declined relationship is never in scope to be joined against.
 */
export const listFriends = query({
  args: {},
  handler: async (ctx): Promise<FriendSummary[]> => {
    const user = await requireUser(ctx);
    const rows = await acceptedFriendships(ctx, user._id);
    if (rows.length === 0) return [];

    const todayKey = utcDayKey(Date.now());
    const summarized = await Promise.all(
      rows.map((row) => summarizeFriend(ctx, user._id, row, todayKey)),
    );

    return orderByBefriended(
      summarized
        .filter((f): f is FriendSummary => f !== null)
        .map((summary) => ({
          value: summary,
          since: summary.since,
          tiebreak: summary.friendshipId,
        })),
    ).map((entry) => entry.value);
  },
});

/**
 * Top N friends for the dashboard sidebar: `{ _id, name, imageUrl, role }` and
 * nothing else.
 *
 * "Deliberately cheap" is the whole point — this runs on every dashboard page,
 * so it reads **no** certificates, enrollments or activity rows for anyone. Only
 * the `friendships` ranges plus one point read per surviving friend.
 *
 * Ordering: most recently befriended first, same rule as `listFriends`.
 * The cap is applied *before* the point reads, so a 500-friend account still
 * costs six document reads rather than five hundred.
 */
export const listSidebarFriends = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SidebarFriend[]> => {
    const user = await requireUser(ctx);
    const cap = clampCount(args.limit, 1, SIDEBAR_MAX, SIDEBAR_DEFAULT);

    const rows = await acceptedFriendships(ctx, user._id);
    if (rows.length === 0) return [];

    const top = orderByBefriended(rows.map((row) => ({ row, ...befriendedAt(row) }))).slice(
      0,
      cap,
    );

    const resolved = await Promise.all(
      top.map(async ({ row }) => {
        const friendId = otherParty(row, user._id);
        const profile = await toProfile(ctx, friendId);
        if (!profile) return null;
        return {
          _id: friendId,
          name: profile.name,
          imageUrl: profile.imageUrl,
          role: profile.role,
        } satisfies SidebarFriend;
      }),
    );
    return resolved.filter((f): f is SidebarFriend => f !== null);
  },
});

/**
 * Both directions of pending request in one call, so the Requests tab renders
 * from a single query: `incoming` (I am the addressee — accept or decline) and
 * `outgoing` (I asked — cancel). Newest first in each list.
 */
export const listRequests = query({
  args: {},
  handler: async (ctx): Promise<RequestsBundle> => {
    const user = await requireUser(ctx);

    const [incomingRows, outgoingRows] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_addressee_status", (q) =>
          q.eq("addresseeId", user._id).eq("status", "pending"),
        )
        .collect(),
      ctx.db
        .query("friendships")
        .withIndex("by_requester_status", (q) =>
          q.eq("requesterId", user._id).eq("status", "pending"),
        )
        .collect(),
    ]);

    const toEntry = async (
      row: FriendshipRow,
      otherId: Id<"users">,
    ): Promise<RequestEntry | null> => {
      const profile = await toProfile(ctx, otherId);
      if (!profile) return null;
      return {
        _id: otherId,
        friendshipId: row._id,
        name: profile.name,
        imageUrl: profile.imageUrl,
        role: profile.role,
        createdAt: row.createdAt,
      };
    };

    const [incoming, outgoing] = await Promise.all([
      Promise.all(
        incomingRows.map((row) => toEntry(row, otherParty(row, user._id))),
      ),
      Promise.all(outgoingRows.map((row) => toEntry(row, otherParty(row, user._id)))),
    ]);

    const newestFirst = (a: { createdAt: number }, b: { createdAt: number }) =>
      b.createdAt - a.createdAt;

    return {
      incoming: incoming
        .filter((e): e is RequestEntry => e !== null)
        .sort(newestFirst),
      outgoing: outgoing
        .filter((e): e is RequestEntry => e !== null)
        .sort(newestFirst),
    };
  },
});

/**
 * A **number**, for the nav badge — never a list. Counting incoming pending
 * only: a request I sent is my own business, not something I am waiting on
 * *them* to do, and showing it as a badge would be a guilt trip.
 *
 * Bounded at {@link PENDING_COUNT_CEILING}; callers render the cap as "99+".
 */
export const getPendingRequestCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("friendships")
      .withIndex("by_addressee_status", (q) =>
        q.eq("addresseeId", user._id).eq("status", "pending"),
      )
      .take(PENDING_COUNT_CEILING);
    return rows.length;
  },
});

/**
 * Discover people by name or email substring.
 *
 * **Why this scans.** `users` has exactly one index, `by_clerk_id`, and no
 * index can serve `LIKE '%term%'` — a substring predicate is a full scan by
 * construction, and the schema forbids adding a `searchIndex` to an existing
 * table from a feature branch. So the read is bounded instead:
 * `.take(USER_SCAN_LIMIT)` caps the documents examined, `.take(limit)` caps what
 * comes back, and a term shorter than {@link MIN_SEARCH_LENGTH} short-circuits
 * before any read at all.
 *
 * **What that costs, honestly.** Results are in insertion order, so a match
 * beyond the scan window is invisible rather than merely unranked. That is an
 * acceptable trade at the current user-table size (one row per Clerk account,
 * low hundreds) but it is the first thing to break. **At scale, replace the scan
 * with a `searchIndex` on a normalised `searchText` field — `courses` already
 * has exactly that pattern — or move discovery to a real search service.** The
 * exclusion set should move to an index-backed lookup at the same time; today it
 * is six small range reads, which is fine and would not be at 10k friendships.
 *
 * Anyone already in a relationship with the caller is excluded in **every**
 * status, including declined: discover should never re-offer someone you turned
 * down, and the UI renders no "send again" affordance for them.
 */
export const searchUsers = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<DiscoverUser[]> => {
    const user = await requireUser(ctx);

    const term = normalizeSearchTerm(args.query);
    if (!isSearchableTerm(term)) return [];

    const limit = clampCount(args.limit, 1, DISCOVER_MAX, DISCOVER_DEFAULT);

    const excluded = await relatedUserIds(ctx, user._id);
    excluded.add(user._id);

    const scanned = await ctx.db.query("users").take(USER_SCAN_LIMIT);

    const matches: Array<{
      rank: number;
      name: string;
      email: string | null;
      candidate: UserDoc;
    }> = [];
    for (const candidate of scanned) {
      if (excluded.has(candidate._id)) continue;
      const rank = searchMatchRank(candidate, term);
      if (rank === null) continue;
      matches.push({
        rank,
        name: displayName(candidate),
        email: candidate.email ?? null,
        candidate,
      });
    }

    matches.sort(compareSearchResults);

    return matches.slice(0, limit).map(({ candidate }) => ({
      _id: candidate._id,
      name: displayName(candidate),
      email: candidate.email ?? null,
      imageUrl: candidate.imageUrl ?? null,
      role: candidate.role,
    }));
  },
});

/**
 * Recent learning activity across accepted friends.
 *
 * This is the highest-risk read in the module, so the ordering is deliberate
 * and worth stating plainly:
 *
 *   1. Build the friend id set **first**, and only from `"accepted"` rows.
 *   2. If that set is empty, return `[]` without reading a single user's data.
 *   3. Read `learningActivities` for those ids and nobody else. The set is the
 *      only thing that is ever used as a `userId` filter, so a non-friend's
 *      activity is not merely filtered out of the response — it is never read.
 *
 * A pending request produces no id here, which is why a not-yet-accepted
 * friendship cannot see anything, and a declined one never could.
 */
export const getFriendsActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<FriendsActivityItem[]> => {
    const user = await requireUser(ctx);
    const limit = clampCount(args.limit, 1, FEED_MAX, FEED_DEFAULT);

    // `acceptedFriendships` already collapsed rows to one per person, so the
    // set below is exactly "people I am friends with" — and it is the *only*
    // thing that is ever used as a `userId` filter.
    const friendIds = (await acceptedFriendships(ctx, user._id)).map((row) =>
      otherParty(row, user._id),
    );
    if (friendIds.length === 0) return [];

    const perFriend = Math.max(
      1,
      Math.ceil((limit * FEED_OVERSCAN) / friendIds.length),
    );

    // Read ONLY accepted friends' rows. Nothing else is ever queried by user.
    const perFriendActivity = await Promise.all(
      friendIds.map((friendId) =>
        ctx.db
          .query("learningActivities")
          .withIndex("by_user_created", (q) => q.eq("userId", friendId))
          .order("desc")
          .take(perFriend),
      ),
    );

    const profiles = await Promise.all(friendIds.map((id) => toProfile(ctx, id)));

    const courseTitles = new Map<Id<"courses">, string | null>();
    const items: FriendsActivityItem[] = [];

    for (let i = 0; i < friendIds.length; i++) {
      const profile = profiles[i];
      // A deleted account keeps its friendships row until Clerk is reconciled;
      // skip it rather than rendering an anonymous entry.
      if (!profile) continue;
      const friendId = friendIds[i];

      for (const activity of perFriendActivity[i]) {
        let courseTitle: string | null = null;
        if (activity.courseId) {
          if (!courseTitles.has(activity.courseId)) {
            courseTitles.set(
              activity.courseId,
              (await ctx.db.get(activity.courseId))?.title ?? null,
            );
          }
          courseTitle = courseTitles.get(activity.courseId) ?? null;
        }
        items.push({
          activityId: activity._id,
          userId: friendId,
          name: profile.name,
          imageUrl: profile.imageUrl,
          role: profile.role,
          type: activity.type,
          courseTitle,
          at: activity.createdAt,
        });
      }
    }

    return items.sort((a, b) => b.at - a.at).slice(0, limit);
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────

/**
 * Ask someone to be your friend.
 *
 * Self-requests and requests to a missing account are refused outright. The
 * duplicate guard lives here rather than in an index because Convex has no
 * unique constraint: it checks the pair in **both** directions, so "they already
 * asked me" and "I already asked them" are both refused instead of producing two
 * half-open requests that neither of you can resolve. `planSendRequest` owns the
 * rule; see it for why a declined request re-opens rather than appends.
 */
export const sendRequest = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Id<"friendships">> => {
    const user = await requireUser(ctx);

    if (args.userId === user._id) {
      throw new Error("You cannot send a friend request to yourself");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new Error("That person no longer has an account here");
    }

    const [forward, reverse] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_requester_addressee", (q) =>
          q.eq("requesterId", user._id).eq("addresseeId", args.userId),
        )
        .first(),
      ctx.db
        .query("friendships")
        .withIndex("by_requester_addressee", (q) =>
          q.eq("requesterId", args.userId).eq("addresseeId", user._id),
        )
        .first(),
    ]);

    const plan = planSendRequest({
      forward: forward?.status ?? null,
      reverse: reverse?.status ?? null,
    });
    if (plan.kind === "blocked") {
      throw new Error(sendRequestBlockedMessage(plan.reason, displayName(target)));
    }

    // Global per-user budget, after the cheap checks above. A per-target guard
    // does nothing about a client that walks the (bounded) user table and asks
    // everybody once; only a per-actor budget stops that shape.
    await requireRateLimit(
      ctx,
      `friends.sendRequest:${user._id}`,
      SEND_REQUEST_MAX,
      SEND_REQUEST_WINDOW,
    );

    const now = Date.now();

    if (plan.kind === "reopen") {
      // `planSendRequest` only re-opens when the forward row is the declined
      // one, so `forward` is non-null — checked rather than cast.
      if (!forward) throw new Error("That request no longer exists");
      // `respondedAt: undefined` unsets the field, so the Requests tab and the
      // "friends since" label both read the new attempt rather than the old one.
      await ctx.db.patch(forward._id, {
        status: "pending",
        createdAt: now,
        respondedAt: undefined,
      });
      return forward._id;
    }

    return await ctx.db.insert("friendships", {
      requesterId: user._id,
      addresseeId: args.userId,
      status: "pending",
      createdAt: now,
    });
  },
});

/**
 * Load a pending row addressed to the caller, or throw the reason why not.
 * Shared by accept and decline so the authorization gate is literally one
 * function rather than two copies that can drift.
 *
 * The `requesterId === addresseeId` check is a belt-and-braces guard against a
 * malformed self-row slipping through — nobody may answer their own outgoing
 * request, and `sendRequest` already refuses to create one.
 */
async function respondableRow(
  ctx: WriteCtx,
  friendshipId: Id<"friendships">,
): Promise<{ user: UserDoc; row: FriendshipRow }> {
  const user = await requireUser(ctx);
  const row = await ctx.db.get(friendshipId);
  if (!row) throw new Error("That request no longer exists");
  if (row.requesterId === row.addresseeId) {
    throw new Error("That request is malformed");
  }
  if (row.addresseeId !== user._id) {
    throw new Error("This request was sent to someone else");
  }
  if (row.status !== "pending") {
    throw new Error("This request has already been handled");
  }
  return { user, row };
}

/** Accept an incoming request. Addressee only, pending only. */
export const acceptRequest = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args): Promise<Id<"friendships">> => {
    const { user, row } = await respondableRow(ctx, args.friendshipId);
    await requireRateLimit(
      ctx,
      `friends.respond:${user._id}`,
      RESPOND_MAX,
      RESPOND_WINDOW,
    );
    await ctx.db.patch(row._id, { status: "accepted", respondedAt: Date.now() });
    return row._id;
  },
});

/** Decline an incoming request. Same addressee-only, pending-only gate. */
export const declineRequest = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args): Promise<Id<"friendships">> => {
    const { user, row } = await respondableRow(ctx, args.friendshipId);
    await requireRateLimit(
      ctx,
      `friends.respond:${user._id}`,
      RESPOND_MAX,
      RESPOND_WINDOW,
    );
    await ctx.db.patch(row._id, { status: "declined", respondedAt: Date.now() });
    return row._id;
  },
});

/**
 * Withdraw a request you sent. Requester only, pending only — you cannot
 * "cancel" somebody's request to you, and once it is answered there is nothing
 * left to withdraw.
 *
 * The row is deleted rather than marked, so a later `sendRequest` starts a
 * fresh attempt and the pair does not accumulate request history.
 */
export const cancelRequest = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args): Promise<Id<"friendships">> => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.friendshipId);
    if (!row) throw new Error("That request no longer exists");
    if (row.requesterId !== user._id) {
      throw new Error("You can only cancel a request you sent");
    }
    if (row.status !== "pending") {
      throw new Error("This request has already been handled");
    }

    await requireRateLimit(
      ctx,
      `friends.respond:${user._id}`,
      RESPOND_MAX,
      RESPOND_WINDOW,
    );
    await ctx.db.delete(row._id);
    return row._id;
  },
});

/**
 * End an accepted friendship. Either party may do it, and it deliberately
 * refuses anything that is not `"accepted"` — removing a *pending* request goes
 * through `cancelRequest` / `declineRequest` so there is exactly one way to end
 * each state and no way to answer a request by deleting it.
 */
export const removeFriend = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args): Promise<Id<"friendships">> => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.friendshipId);
    if (!row) throw new Error("That friendship no longer exists");
    if (row.requesterId !== user._id && row.addresseeId !== user._id) {
      throw new Error("You are not part of this friendship");
    }
    if (row.status !== "accepted") {
      throw new Error("Only an accepted friendship can be removed");
    }

    await requireRateLimit(
      ctx,
      `friends.respond:${user._id}`,
      RESPOND_MAX,
      RESPOND_WINDOW,
    );
    await ctx.db.delete(row._id);
    return row._id;
  },
});
