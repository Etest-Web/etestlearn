import type { Id } from "../_generated/dataModel";
import {
  FRIENDSHIP_STATUSES,
  mergeRelationship,
  type FriendshipStatus,
  type RelationshipRowState,
  type RelationshipState,
} from "../../lib/friends";
import type { ReadCtx } from "./auth";

/**
 * Where the caller stands with other accounts.
 *
 * `friendships` has no pair key that says "either column equals me" — a
 * Convex index cannot express that — but it *does* have a pair index
 * (`by_requester_addressee`) that answers "the row between these two people".
 * So there are two ways to ask, and this module offers both, because the two
 * questions are genuinely different:
 *
 *  · {@link relationshipStates} — *everyone* I am related to. Six small range
 *    reads (three statuses × two directions), each pinned to
 *    `(userId, status)`, merged in memory. The friend list and the Discover
 *    tab need this: discover must never offer somebody who is already in a
 *    relationship with me in **any** status, including declined.
 *  · {@link relationshipStatesFor} — *these specific* people. Two point reads
 *    each, off the pair index. The search page needs this: it only ever asks
 *    about the handful of people it is about to show, and a learner with a
 *    large friend graph must not make every keystroke read every friendship
 *    they have.
 *
 * The merge rule is `mergeRelationship` in `lib/friends.ts` in both cases, and
 * it is the same priority `planSendRequest` uses — see the note there for why
 * the two must agree.
 */

/**
 * Which of two rows for the same pair wins.
 *
 * The same priority as `mergeRelationship`: accepted, then pending, then
 * declined. `sendRequest` keeps one row per directed pair, so this only
 * matters for rows written before that guard existed, or by a migration — but
 * when it does matter, the surviving row must not make a pair look *less*
 * connected than it is.
 */
const PRIORITY: Record<FriendshipStatus, number> = {
  accepted: 0,
  pending: 1,
  declined: 2,
};

/** Keeps the better of two rows for the same other person. */
function keepBetter(
  current: RelationshipRowState | undefined,
  next: RelationshipRowState,
): RelationshipRowState {
  if (!current) return next;
  return PRIORITY[next.status] < PRIORITY[current.status] ? next : current;
}

/**
 * The caller's relationship with **every** account they are related to, in
 * either direction, in any status.
 *
 * Six small range reads because the indexes are `(userId, status)` — there is
 * no single range covering all three statuses.
 */
export async function relationshipStates(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Map<Id<"users">, RelationshipState>> {
  /** The rows where the caller is the requester. */
  const forward = new Map<Id<"users">, RelationshipRowState>();
  /** The rows where the caller is the addressee. */
  const reverse = new Map<Id<"users">, RelationshipRowState>();

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
    for (const row of outgoing) {
      forward.set(
        row.addresseeId,
        keepBetter(forward.get(row.addresseeId), {
          status: row.status,
          friendshipId: row._id,
        }),
      );
    }
    for (const row of incoming) {
      reverse.set(
        row.requesterId,
        keepBetter(reverse.get(row.requesterId), {
          status: row.status,
          friendshipId: row._id,
        }),
      );
    }
  }

  const states = new Map<Id<"users">, RelationshipState>();
  for (const id of new Set([...forward.keys(), ...reverse.keys()])) {
    states.set(
      id,
      mergeRelationship(forward.get(id) ?? null, reverse.get(id) ?? null),
    );
  }
  return states;
}

/**
 * The caller's relationship with a **specific** set of people.
 *
 * Two point reads per person, off `by_requester_addressee` — one for each
 * direction — so the cost is bounded by the size of the list, not by the size
 * of the caller's social graph. An empty list reads nothing at all, which is
 * why the search page calls this *after* it has decided who to show.
 *
 * People with no relationship are simply absent from the map; a caller can
 * read that as "not connected".
 */
export async function relationshipStatesFor(
  ctx: ReadCtx,
  userId: Id<"users">,
  otherIds: readonly Id<"users">[],
): Promise<Map<Id<"users">, RelationshipState>> {
  const states = new Map<Id<"users">, RelationshipState>();
  if (otherIds.length === 0) return states;

  await Promise.all(
    otherIds.map(async (otherId) => {
      const [forwardRows, reverseRows] = await Promise.all([
        ctx.db
          .query("friendships")
          .withIndex("by_requester_addressee", (q) =>
            q.eq("requesterId", userId).eq("addresseeId", otherId),
          )
          .collect(),
        ctx.db
          .query("friendships")
          .withIndex("by_requester_addressee", (q) =>
            q.eq("requesterId", otherId).eq("addresseeId", userId),
          )
          .collect(),
      ]);

      // A pair may hold more than one row in a direction (rows written before
      // the one-row-per-pair guard, or by a migration), so the better row
      // wins rather than whichever the index happened to yield first.
      let forward: RelationshipRowState | null = null;
      for (const row of forwardRows) {
        forward = keepBetter(forward ?? undefined, {
          status: row.status,
          friendshipId: row._id,
        });
      }
      let reverse: RelationshipRowState | null = null;
      for (const row of reverseRows) {
        reverse = keepBetter(reverse ?? undefined, {
          status: row.status,
          friendshipId: row._id,
        });
      }

      states.set(otherId, mergeRelationship(forward, reverse));
    }),
  );

  return states;
}
