import { makeFunctionReference } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Typed handles on `convex/friends.ts`, for the client and for tests.
 *
 * Why not `api.friends.*`: `convex/_generated/api.d.ts` is produced by
 * `npx convex dev` and does not list this module yet, so `api.friends.listFriends`
 * does not typecheck. `makeFunctionReference` names the same wire function
 * ("modulePath:exportName") and needs no codegen.
 * **Run `npx convex dev` and switch these to `api.friends.*` once the module is
 * registered** — this file is the only place that has to change, because every
 * consumer imports from here.
 *
 * This file is also the seam that keeps the browser away from server code:
 * client components may not import a Convex *server* module (it would bundle
 * the function definitions), so they import these opaque references instead.
 *
 * Every list returns denormalized, ready-to-render objects. `_id` is always the
 * **other person's `users` id** (it reads as "this person"), and
 * `friendshipId` is always present alongside it because the response mutations
 * address a `friendships` row rather than a user.
 */

/** No-argument queries. `Record<string, never>` is Convex's `EmptyObject`. */
export type NoArgs = Record<string, never>;

/** Mirrors `users.role` in `convex/schema.ts`. */
export type UserRole = "student" | "instructor" | "admin";

/** Compact per-friend learning summary shown on the Friends tab. */
export interface FriendActivitySummary {
  /** Non-revoked certificates earned. */
  certificatesEarned: number;
  /** Enrollments with 0 < progress < 100. */
  coursesInProgress: number;
  /** Consecutive UTC days with recorded activity, counting today backwards. */
  currentStreak: number;
  /** Most recent learning activity, or null when they have never studied. */
  lastActiveAt: number | null;
}

/** One row of `friends.listFriends`. */
export interface FriendSummary {
  /** The friend's `users` id. */
  _id: Id<"users">;
  /** The `friendships` row to pass to `removeFriend`. */
  friendshipId: Id<"friendships">;
  name: string;
  imageUrl: string | null;
  role: UserRole;
  /** When the friendship was accepted (falls back to when it was requested). */
  since: number;
  activity: FriendActivitySummary;
}

/** One row of `friends.listSidebarFriends` — deliberately no activity data. */
export interface SidebarFriend {
  _id: Id<"users">;
  name: string;
  imageUrl: string | null;
  role: UserRole;
}

/** One pending request, in either direction, from `friends.listRequests`. */
export interface RequestEntry {
  /** The other person's `users` id. */
  _id: Id<"users">;
  /** The `friendships` row to pass to accept / decline / cancel. */
  friendshipId: Id<"friendships">;
  name: string;
  imageUrl: string | null;
  role: UserRole;
  createdAt: number;
}

export interface RequestsBundle {
  /** Pending where I am the addressee — I can accept or decline these. */
  incoming: RequestEntry[];
  /** Pending where I am the requester — I can cancel these. */
  outgoing: RequestEntry[];
}

/** One row of `friends.searchUsers`. */
export interface DiscoverUser {
  _id: Id<"users">;
  name: string;
  /** Included because discover matches on it; omitted from every other list. */
  email: string | null;
  imageUrl: string | null;
  role: UserRole;
}

/** One row of `friends.getFriendsActivity`. */
export interface FriendsActivityItem {
  activityId: Id<"learningActivities">;
  /** The friend the activity belongs to. Never the caller. */
  userId: Id<"users">;
  name: string;
  imageUrl: string | null;
  role: UserRole;
  type: string;
  courseTitle: string | null;
  at: number;
}

// ── Queries ──────────────────────────────────────────────────────────────

export const listFriends = makeFunctionReference<"query", NoArgs, FriendSummary[]>(
  "friends:listFriends",
);
export const listSidebarFriends = makeFunctionReference<
  "query",
  { limit?: number },
  SidebarFriend[]
>("friends:listSidebarFriends");
export const listRequests = makeFunctionReference<"query", NoArgs, RequestsBundle>(
  "friends:listRequests",
);
export const getPendingRequestCount = makeFunctionReference<
  "query",
  NoArgs,
  number
>("friends:getPendingRequestCount");
export const searchUsers = makeFunctionReference<
  "query",
  { query: string; limit?: number },
  DiscoverUser[]
>("friends:searchUsers");
export const getFriendsActivity = makeFunctionReference<
  "query",
  { limit?: number },
  FriendsActivityItem[]
>("friends:getFriendsActivity");

// ── Mutations ────────────────────────────────────────────────────────────

export const sendRequest = makeFunctionReference<
  "mutation",
  { userId: Id<"users"> },
  Id<"friendships">
>("friends:sendRequest");
export const acceptRequest = makeFunctionReference<
  "mutation",
  { friendshipId: Id<"friendships"> },
  Id<"friendships">
>("friends:acceptRequest");
export const declineRequest = makeFunctionReference<
  "mutation",
  { friendshipId: Id<"friendships"> },
  Id<"friendships">
>("friends:declineRequest");
export const cancelRequest = makeFunctionReference<
  "mutation",
  { friendshipId: Id<"friendships"> },
  Id<"friendships">
>("friends:cancelRequest");
export const removeFriend = makeFunctionReference<
  "mutation",
  { friendshipId: Id<"friendships"> },
  Id<"friendships">
>("friends:removeFriend");

/** Grouped, so a component can pull exactly the handles it needs. */
export const friendsApi = {
  listFriends,
  listSidebarFriends,
  listRequests,
  getPendingRequestCount,
  searchUsers,
  getFriendsActivity,
  sendRequest,
  acceptRequest,
  declineRequest,
  cancelRequest,
  removeFriend,
} as const;
