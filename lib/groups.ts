/**
 * Course-scoped study groups — the pure rules.
 *
 * A group hangs off a course, so admission reuses the course-access branch
 * (admin → course instructor → enrolled) that `convex/discussions.ts` already
 * established. Groups are archived rather than deleted, because members'
 * messages have to survive the group closing.
 *
 * Everything in this file is deliberately free of Convex and React imports so
 * it can be reasoned about (and tested) on its own. `convex/groups.ts` is the
 * only place that touches the database, and it derives every label, permission
 * and relationship it returns from the functions here — the browser never
 * re-derives a rule the server owns. That is the same single-source shape as
 * `lib/certificates.ts` and `lib/publishing.ts`.
 *
 * The payload interfaces below are the wire contract for the Convex module. They
 * are declared here (rather than inline in `convex/groups.ts`) because both the
 * server handlers and the client function references need them, and pinning the
 * handler return type means a field that drifts fails the typecheck instead of
 * silently reaching the UI as `undefined`.
 */

// ─── Vocabulary ────────────────────────────────────────────────────────────

/** Mirrors `studyGroupMembers.role`. */
export type GroupMemberRole = "member" | "moderator"

/**
 * Where the caller stands with respect to one group.
 *
 * The five states exist because "am I in this?" and "can I join?" are different
 * questions, and the answer drives four different buttons:
 *
 * · `member` / `moderator` — you hold a seat; you can leave and post.
 * · `pending` — a join request of yours is sitting in the queue. The button
 *   offers cancellation, not a second request.
 * · `request_pending` — you were *declined* before. Declines are kept as rows
 *   rather than deleted (same reasoning as archived groups: the trail is the
 *   point), so the server can tell "you already asked and were turned down"
 *   apart from "you never asked". The UI shows a Join action again — a decline
 *   is not a permanent ban — but warns you that it happened before.
 * · `can_join` — public groups join instantly; private ones create a request.
 */
export type GroupRelationship =
  | "member"
  | "moderator"
  | "pending"
  | "can_join"
  | "request_pending"

/** Capabilities derived server-side so the client renders what is actually true. */
export interface GroupPermissions {
  /** Member, and the group still takes messages. */
  canPost: boolean
  /** Read the conversation. Members always can; so can the course instructor. */
  canReadMessages: boolean
  /** Rename/describe the group: group moderator, course instructor or admin. */
  canEdit: boolean
  /** Work the join-request queue: group moderator, course instructor or admin. */
  canApprove: boolean
  /** Archive/unarchive: course instructor or admin only. */
  canArchive: boolean
  /** Promote/demote members: course instructor or admin only. */
  canManageMembers: boolean
  /** Leave the group — false when leaving would orphan it (see `decideLeave`). */
  canLeave: boolean
}

// ─── Limits ─────────────────────────────────────────────────────────────────
//
// Bounds live beside the rules that enforce them so a client asking for
// 10_000 messages gets the same answer as one asking for 10.

export const GROUP_NAME_MIN = 3
export const GROUP_NAME_MAX = 80
export const GROUP_DESCRIPTION_MAX = 500
export const MESSAGE_BODY_MAX = 2000
export const JOIN_REQUEST_MESSAGE_MAX = 400

/** How many groups "My groups" renders, and how many it may scan for them. */
export const MY_GROUPS_LIMIT = 50
export const MY_GROUPS_SCAN_LIMIT = 200
/** How many groups a single course browse may show or scan. */
export const BROWSE_GROUPS_LIMIT = 100
export const BROWSE_GROUPS_SCAN_LIMIT = 200
/** A course picker that lists the whole catalogue is not a picker. */
export const ACCESSIBLE_COURSES_LIMIT = 50
export const ACCESSIBLE_COURSES_SCAN_LIMIT = 300
/** Roster size and queue size. Both are inherently small; both are still capped. */
export const MEMBERS_LIMIT = 200
export const PENDING_REQUESTS_LIMIT = 100
/** Message feed page size — new enough to keep the subscription traffic low. */
export const MESSAGES_LIMIT = 50

/** How many recent messages the per-group cooldown reads back. */
export const POST_COOLDOWN_SCAN = 20
/** One message per group per 10s, mirroring the discussion board. */
export const GROUP_POST_COOLDOWN_MS = 10_000
/** …and 10 a minute across every group the caller belongs to. */
export const GROUP_POSTS_PER_MINUTE = 10
/** Creating groups is rare; opening ten a minute is not a study group. */
export const GROUP_CREATE_PER_HOUR = 5

// ─── Validation ─────────────────────────────────────────────────────────────
//
// Returned as a message addressed to the person typing, so the Convex handlers
// can `throw new Error(result)` and the client can toast it verbatim.

export function validateGroupName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length < GROUP_NAME_MIN) {
    return `Give the group a name of at least ${GROUP_NAME_MIN} characters`
  }
  if (trimmed.length > GROUP_NAME_MAX) {
    return `Keep the group name under ${GROUP_NAME_MAX} characters`
  }
  return null
}

export function validateGroupDescription(
  description: string | undefined,
): string | null {
  if (description === undefined) return null
  if (description.trim().length > GROUP_DESCRIPTION_MAX) {
    return `Keep the description under ${GROUP_DESCRIPTION_MAX} characters`
  }
  return null
}

export function validateMessageBody(body: string): string | null {
  if (body.trim().length === 0) return "Write something before posting"
  if (body.trim().length > MESSAGE_BODY_MAX) {
    return `Keep messages under ${MESSAGE_BODY_MAX} characters`
  }
  return null
}

export function validateJoinRequestMessage(
  message: string | undefined,
): string | null {
  if (message === undefined) return null
  if (message.trim().length > JOIN_REQUEST_MESSAGE_MAX) {
    return `Keep your note under ${JOIN_REQUEST_MESSAGE_MAX} characters`
  }
  return null
}

/**
 * Clamps a client-supplied page size.
 *
 * A missing or nonsensical value falls back to the server's own bound rather
 * than to an error: the client is trusted to be lazy, never to be large.
 */
export function clampLimit(
  requested: number | undefined,
  max: number,
  fallback: number = max,
): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return fallback
  }
  return Math.max(1, Math.min(Math.floor(requested), max))
}

// ─── Relationship + permissions ─────────────────────────────────────────────

export function deriveRelationship(input: {
  memberRole: GroupMemberRole | null
  hasPendingRequest: boolean
  wasDeclined: boolean
}): GroupRelationship {
  if (input.memberRole === "moderator") return "moderator"
  if (input.memberRole === "member") return "member"
  if (input.hasPendingRequest) return "pending"
  if (input.wasDeclined) return "request_pending"
  return "can_join"
}

/**
 * What the caller is allowed to do, from their seats and nothing else.
 *
 * Note what is *not* here: `canArchive` and `canManageMembers` are true only
 * for the course instructor or an admin. A group moderator runs their own
 * conversation but cannot change the group's visibility or hand out roles —
 * see the comments on `archiveGroup`/`promoteMember` in `convex/groups.ts` for
 * why that line is drawn there.
 */
export function derivePermissions(input: {
  memberRole: GroupMemberRole | null
  isArchived: boolean
  isCourseOwner: boolean
  leaveBlocked: boolean
}): GroupPermissions {
  const isMember = input.memberRole !== null
  const isGroupModerator = input.memberRole === "moderator"
  return {
    canPost: isMember && !input.isArchived,
    canReadMessages: isMember || input.isCourseOwner,
    canEdit: isGroupModerator || input.isCourseOwner,
    canApprove: isGroupModerator || input.isCourseOwner,
    canArchive: input.isCourseOwner,
    canManageMembers: input.isCourseOwner,
    canLeave: isMember && !input.leaveBlocked,
  }
}

// ─── Leaving a group ────────────────────────────────────────────────────────

export type LeaveDecision =
  /** Ordinary case: just remove the membership. */
  | "leave"
  /** A moderator is going and is the last one: promote somebody, then leave. */
  | "promote_then_leave"
  /** Refused: the group would be left with nobody to run it, and nobody who can
   *  archive it either. */
  | "blocked_last_member"

/**
 * What happens when a member tries to leave.
 *
 * The decision, stated once: **the server promotes the longest-tenured other
 * member when the last moderator leaves, and blocks the leave entirely when the
 * leaver is the group's only member.**
 *
 * The first half is the obvious one — a group with members but no moderator has
 * nobody who can approve join requests, which quietly kills it. Choosing the
 * longest-tenured member rather than "anyone random" keeps the promotion
 * predictable for the people in the room.
 *
 * The second half is the interesting one. The alternative (let them walk and
 * leave an empty group behind) produces a group that can never be joined again
 * — archiving is the course instructor's call, not the leaver's — so the last
 * person out is stuck holding a corpse they cannot close. Refusing, with a
 * message that names the way out, is the honest version.
 */
export function decideLeave(input: {
  memberRole: GroupMemberRole | null
  memberCount: number
  moderatorCount: number
}): LeaveDecision {
  if (!input.memberRole) return "blocked_last_member"
  if (input.memberCount <= 1) return "blocked_last_member"
  if (input.memberRole === "moderator" && input.moderatorCount <= 1) {
    return "promote_then_leave"
  }
  return "leave"
}

export function lastMemberBlockedMessage(): string {
  return (
    "You are the only member of this group. Ask the course instructor to archive it " +
    "instead of leaving it empty — nobody else could ever join it again."
  )
}

// ─── Copy ───────────────────────────────────────────────────────────────────
//
// CTA wording lives beside the relationship rules so the button can never
// disagree with the state the server derived.

export type GroupPrimaryAction = {
  kind: "join" | "request" | "cancel_request" | "none"
  label: string
}

export function groupPrimaryAction(input: {
  relationship: GroupRelationship
  isPrivate: boolean
}): GroupPrimaryAction {
  switch (input.relationship) {
    case "moderator":
      return { kind: "none", label: "Joined" }
    case "member":
      return { kind: "none", label: "Joined" }
    case "pending":
      return { kind: "cancel_request", label: "Cancel request" }
    case "request_pending":
      return { kind: "request", label: "Request to join" }
    case "can_join":
      return input.isPrivate
        ? { kind: "request", label: "Request to join" }
        : { kind: "join", label: "Join" }
  }
}

/** Short badge text for a relationship. Never colour-only — the word is the signal. */
export function relationshipBadgeLabel(
  relationship: GroupRelationship,
): string {
  switch (relationship) {
    case "moderator":
      return "Moderator"
    case "member":
      return "Joined"
    case "pending":
      return "Request pending"
    case "request_pending":
      return "Previously declined"
    case "can_join":
      return "Not joined"
  }
}

// ─── Display helpers ────────────────────────────────────────────────────────

/**
 * A person's name for a message bubble, a roster row or a request card.
 *
 * Names are optional in the `users` table (a Clerk account can arrive before
 * the webhook fills them in), so this never returns an empty string — an empty
 * author line reads as a broken message.
 */
export function displayName(
  person: { name?: string | null; email?: string | null } | null | undefined,
): string {
  const name = person?.name?.trim()
  if (name) return name
  const email = person?.email?.trim()
  if (email) return email.split("@")[0] || email
  return "Member"
}

/** Up to two letters for an avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

/** First line of a message body, clipped for a card preview. */
export function messagePreview(body: string, maxLength = 120): string {
  const firstLine = body.trim().split("\n")[0] ?? ""
  const collapsed = firstLine.replace(/\s+/g, " ").trim()
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, Math.max(0, maxLength - 1))}…`
}

// ─── Message-feed pagination ────────────────────────────────────────────────

/** A page cursor: the oldest message the client already has. */
export interface GroupMessageCursor {
  createdAt: number
  id: string
}

/**
 * True when `row` sits strictly *before* `cursor` in the exact order the
 * `by_group_created` index produces: `createdAt` descending with `_id` as the
 * final tiebreaker.
 *
 * The tiebreaker is the whole reason this is not `createdAt < cursor.createdAt`.
 * Convex appends `_id` to every index, and two messages can genuinely share a
 * millisecond (a double-tap on mobile, a seeded fixture, a retried request) —
 * a timestamp-only cursor silently drops one of them.
 */
export function isBeforeCursor(
  row: { createdAt: number; _id: string },
  cursor: GroupMessageCursor,
): boolean {
  if (row.createdAt !== cursor.createdAt) return row.createdAt < cursor.createdAt
  return row._id < cursor.id
}

/**
 * Splits an over-fetched page (`limit + 1` rows) into the rows to render and
 * whether more exist. Keeping the "+1" trick in one place stops the two halves
 * of a paginated response from disagreeing.
 */
export function splitPage<T>(
  rows: T[],
  limit: number,
): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, limit), hasMore: rows.length > limit }
}

/**
 * Roster ordering: moderators first, then longest-tenured first.
 *
 * The moderation tier is what a reader is looking for first, and inside each
 * tier "earliest joiner" is the order people actually recognise — it is the
 * order the group grew in.
 */
export function compareMembers(
  a: { role: GroupMemberRole; joinedAt: number; name: string },
  b: { role: GroupMemberRole; joinedAt: number; name: string },
): number {
  if (a.role !== b.role) return a.role === "moderator" ? -1 : 1
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt
  return a.name.localeCompare(b.name)
}

// ─── Wire contract ──────────────────────────────────────────────────────────

export interface GroupCourseRef {
  _id: string
  title: string
  slug: string
}

export interface PersonRef {
  name: string
  imageUrl: string | null
}

/** One card in "My groups". */
export interface MyGroupSummary {
  _id: string
  name: string
  description: string | null
  isPrivate: boolean
  isArchived: boolean
  course: GroupCourseRef
  memberCount: number
  myRole: GroupMemberRole
  createdAt: number
  /** Newest message, or group creation — what the list sorts on. */
  lastActivityAt: number
  latestMessage: { body: string; at: number; authorName: string } | null
}

/** One row in "Browse", with the caller's relationship already resolved. */
export interface BrowseGroupSummary {
  _id: string
  name: string
  description: string | null
  isPrivate: boolean
  isArchived: boolean
  course: GroupCourseRef
  memberCount: number
  pendingRequestCount: number
  relationship: GroupRelationship
  /**
   * The caller's own pending request, so the browser can offer "Cancel
   * request" without a second round trip. Present only while it is pending.
   */
  myPendingRequestId: string | null
  lastActivityAt: number
}

/** Everything the detail view needs in one payload. */
export interface GroupDetail {
  _id: string
  name: string
  description: string | null
  isPrivate: boolean
  isArchived: boolean
  createdAt: number
  course: GroupCourseRef
  createdBy: PersonRef
  memberCount: number
  pendingRequestCount: number
  myRole: GroupMemberRole | null
  hasPendingRequest: boolean
  wasDeclined: boolean
  permissions: GroupPermissions
}

export interface GroupMemberItem {
  /** The membership row — stable across role changes. */
  _id: string
  /**
   * The member's user id. Present because the course instructor is the only
   * person who can promote or demote, and the roster is the only place that
   * knows who to promote. Returning a `_id` alone would make that impossible to
   * express without a second round trip.
   */
  userId: string
  name: string
  imageUrl: string | null
  role: GroupMemberRole
  joinedAt: number
}

export interface GroupMessageItem {
  _id: string
  body: string
  createdAt: number
  authorName: string | null
  authorImageUrl: string | null
  authorRole: string | null
  /** Computed server-side: the client cannot be trusted to align its own bubbles. */
  isMine: boolean
}

export interface GroupMessagePage {
  messages: GroupMessageItem[]
  hasMore: boolean
  nextCursor: GroupMessageCursor | null
}

export interface GroupJoinRequestItem {
  _id: string
  groupId: string
  groupName: string
  requesterName: string
  requesterImageUrl: string | null
  message: string | null
  createdAt: number
}

export interface MyGroupStats {
  myGroups: number
  pendingRequestsToReview: number
  totalMembersAcrossMyGroups: number
}

export interface AccessibleCourse {
  _id: string
  title: string
  slug: string
  published: boolean
  /** Why the course is in the picker: they study it, or they teach it. */
  access: "enrolled" | "instructor"
  groupCount: number
}

export type JoinGroupResult =
  | { outcome: "joined"; membershipId: string }
  | { outcome: "request_created"; requestId: string }

export type ReviewJoinRequestResult = { membershipId: string | null }

export type LeaveGroupResult =
  | { outcome: "left" }
  | { outcome: "promoted_and_left"; promotedUserId: string }