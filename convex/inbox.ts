import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./helpers/auth";
import { requireRateLimit } from "./helpers/rateLimit";
import { createNotification } from "./helpers/notifications";
import type { Doc, Id, ReadCtx, UserDoc, WriteCtx } from "./helpers/auth";
import { buildMessagePreview, countUnreadMessages } from "../lib/inbox";

/**
 * Direct messages + the in-app notification feed.
 *
 * Roles play no part here: students, instructors and admins all participate
 * (product decision). The only access rules are "is this conversation yours"
 * and, for discussion activity, the same course-admission check
 * `discussions.ts:verifyAccess` applies.
 *
 * Nothing here is audited — a learner sending a message is ordinary
 * self-service, and `auditLogs.actorId` is required, so logging it would bury
 * the privileged rows the log exists for.
 *
 * Every read goes through an index. Where a lookup genuinely needs a bounded
 * scan (the discussion activity feed — the existing tables have no by-author
 * index and adding one is out of scope for this module) the scan limit and its
 * reason are spelled out at the call site.
 */

// ─── Limits ─────────────────────────────────────────────────────────────────
//
// Each of these is a read bound, not a business rule. They exist so one caller
// cannot turn a single query into an unbounded table walk.

/** Threads returned by `listThreads`. */
const THREAD_LIST_CAP = 50;
/** Threads read per participant index before the two sides are merged. */
const THREAD_SIDE_SCAN = THREAD_LIST_CAP;
/** Messages examined per thread when counting unread. */
const UNREAD_SCAN_CAP = 100;
/** Threads walked by `getUnreadCounts` (the header badge). */
const BADGE_THREAD_CAP = 100;
/** Messages fetched per page by `getMessages`. */
const MESSAGE_PAGE_CAP = 100;
/** Threads scanned for an existing pair when `startThread` is called. */
const PAIR_SCAN_CAP = 1_000;
/** `users` documents examined by `searchPeople`. */
const PEOPLE_SCAN_CAP = 500;
/** Threads returned by `listDiscussionActivity`. */
const ACTIVITY_RESULT_CAP = 25;
/** Candidate discussion threads taken forward after the participation scan. */
const ACTIVITY_CANDIDATE_CAP = 100;
/** `discussionMessages` / `discussionThreads` documents examined to find mine. */
const ACTIVITY_SCAN_CAP = 2_000;
/** Rows read per bounded scan of the unread-notification index. */
const SCAN_PAGE_SIZE = 200;

/** Longest accepted DM body. Bounds both storage and the thread-list preview. */
export const MAX_MESSAGE_LENGTH = 2_000;

// ─── Rate limits ────────────────────────────────────────────────────────────
//
// DMs are user-generated content, so they are budgeted the same way discussion
// posts are. A per-thread cooldown alone is not enough: it only slows someone
// down *within one conversation*, and does nothing about a client walking every
// thread in the inbox and writing once in each — which is exactly the shape of a
// spam flood. The per-user bucket is what caps that fan-out.

const SEND_PER_MINUTE = 20;
const SEND_THREAD_COOLDOWN_MS = 2_000;
const START_THREADS_PER_HOUR = 20;
const BULK_READ_PER_MINUTE = 30;

function clamp(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), max);
}

// ─── Result shapes ──────────────────────────────────────────────────────────
//
// Denormalized on purpose: the client renders these directly and never has to
// join an id back to a profile. Declared here so the page can import the types
// rather than keeping a second, drifting copy.

type Role = "student" | "instructor" | "admin";

export interface PersonSummary {
  id: Id<"users">;
  name: string;
  imageUrl: string | null;
  role: Role;
}

/** One row of the DM thread list, with the *other* participant resolved. */
export interface ThreadSummary extends PersonSummary {
  threadId: Id<"dmThreads">;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  /** Newest message in the thread, or null when nothing has been sent. */
  lastMessageId: Id<"dmMessages"> | null;
  /** Whether the newest message is mine — the list styles it differently. */
  lastMessageIsMine: boolean | null;
  unreadCount: number;
  /** True when `unreadCount` hit {@link UNREAD_SCAN_CAP} rather than the truth. */
  unreadCapped: boolean;
}

export interface MessageView {
  id: Id<"dmMessages">;
  senderId: Id<"users">;
  senderName: string;
  senderImageUrl: string | null;
  senderRole: Role;
  body: string;
  createdAt: number;
  /** Computed server-side so the client never has to compare its own id. */
  isMine: boolean;
}

export interface MessagePage {
  /** Oldest first, for reading order. */
  messages: MessageView[];
  /** Older messages exist — pass `nextBefore` back as `before`. */
  hasMore: boolean;
  /** Cursor for the next (older) page, or null at the start of the thread. */
  nextBefore: number | null;
}

export interface NotificationView {
  id: Id<"notifications">;
  type: NotificationType;
  title: string;
  body: string | null;
  /** In-app deep link. Never an external URL — validated on write. */
  href: string | null;
  createdAt: number;
  isRead: boolean;
  actor: PersonSummary | null;
}

export interface UnreadCounts {
  messages: number;
  notifications: number;
}

/** A course discussion the caller has taken part in or opened. */
export interface DiscussionActivityView {
  threadId: Id<"discussionThreads">;
  courseId: Id<"courses">;
  courseTitle: string;
  courseSlug: string;
  title: string;
  createdByMe: boolean;
  /** Newest reply, if the thread has any. */
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  lastMessageAuthorName: string | null;
}

/** A candidate recipient, with the thread to reopen if one already exists. */
export interface PersonOption extends PersonSummary {
  /** An existing conversation with this person, so the picker can say so. */
  existingThreadId: Id<"dmThreads"> | null;
}

/**
 * The closed set of feed events. Mirrors the union in `convex/schema.ts`; written
 * out literally rather than generated from a `map` so that adding a literal to
 * one and forgetting the other is a type error rather than a silent hole.
 */
export const NOTIFICATION_TYPES = [
  "certificate_earned",
  "course_completed",
  "quiz_graded",
  "streak_milestone",
  "discussion_reply",
  "task_assigned",
  "task_graded",
  "group_invite",
  "friend_request",
  "friend_accepted",
  "course_purchased",
  "course_reminder",
  "direct_message",
  // Written by `instructorApplications.reviewApplication` — promotion is
  // otherwise silent, so the applicant would only find out by noticing a
  // console appeared.
  "instructor_application_reviewed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notificationTypeValidator = v.union(
  v.literal("certificate_earned"),
  v.literal("course_completed"),
  v.literal("quiz_graded"),
  v.literal("streak_milestone"),
  v.literal("discussion_reply"),
  v.literal("task_assigned"),
  v.literal("task_graded"),
  v.literal("group_invite"),
  v.literal("friend_request"),
  v.literal("friend_accepted"),
  v.literal("course_purchased"),
  v.literal("course_reminder"),
  v.literal("direct_message"),
  v.literal("instructor_application_reviewed"),
);

// ─── Shared helpers ─────────────────────────────────────────────────────────

function toPersonSummary(
  user: Doc<"users">,
): PersonSummary {
  return {
    id: user._id,
    // The UI shows this verbatim, so an account with no name gets something
    // better than an empty column.
    name: user.name?.trim() || "Glypha learner",
    imageUrl: user.imageUrl ?? null,
    role: user.role,
  };
}

/** The participant pair shape both the DM and discussion thread tables share. */
interface ParticipantPair {
  userA: Id<"users">;
  userB: Id<"users">;
}

/** The other participant, given the caller and a thread they belong to. */
function otherParticipantId(
  thread: ParticipantPair,
  viewerId: Id<"users">,
): Id<"users"> {
  return thread.userA === viewerId ? thread.userB : thread.userA;
}

function isParticipant(
  thread: ParticipantPair,
  userId: Id<"users">,
): boolean {
  return thread.userA === userId || thread.userB === userId;
}

/** Sorted participant pair — the order `dmThreads.userA` / `userB` are stored in. */
function pairOrder(a: Id<"users">, b: Id<"users">): [Id<"users">, Id<"users">] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Loads a thread and proves the caller is in it.
 *
 * Every function taking a `threadId` goes through here, so "not yours" always
 * throws the same way and there is exactly one place to audit that check. It runs
 * before a single message body is read — this is the check that keeps one
 * learner's conversation out of another's hands.
 */
async function requireParticipant(
  ctx: ReadCtx,
  user: UserDoc,
  threadId: Id<"dmThreads">,
): Promise<Doc<"dmThreads">> {
  const thread = await ctx.db.get(threadId);
  if (!thread) throw new Error("Conversation not found");
  if (!isParticipant(thread, user._id)) {
    throw new Error("You are not a participant in this conversation");
  }
  return thread;
}

/** The caller's read markers as a thread id → high-water-mark map. */
async function loadReadMarkers(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Map<Id<"dmThreads">, number>> {
  const rows = await ctx.db
    .query("dmReadMarkers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const markers = new Map<Id<"dmThreads">, number>();
  for (const row of rows) markers.set(row.threadId, row.lastReadAt);
  return markers;
}

/**
 * Merged, newest-first thread list for one user.
 *
 * Two index range reads (`by_user_a` and `by_user_b`) merged in memory — the
 * alternative, a full table scan with an `includes()` predicate, cannot be
 * expressed against an index at all. Each side is capped at
 * {@link THREAD_SIDE_SCAN}; `lastMessageAt` is optional, and Convex sorts
 * missing index fields first ascending, so descending order puts never-used
 * threads at the end where they belong.
 */
async function loadParticipantThreads(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Doc<"dmThreads">[]> {
  const [asA, asB] = await Promise.all([
    ctx.db
      .query("dmThreads")
      .withIndex("by_user_a", (q) => q.eq("userA", userId))
      .order("desc")
      .take(THREAD_SIDE_SCAN),
    ctx.db
      .query("dmThreads")
      .withIndex("by_user_b", (q) => q.eq("userB", userId))
      .order("desc")
      .take(THREAD_SIDE_SCAN),
  ]);

  const merged = new Map<Id<"dmThreads">, Doc<"dmThreads">>();
  for (const thread of [...asA, ...asB]) merged.set(thread._id, thread);

  return [...merged.values()].sort((left, right) => {
    const leftAt = left.lastMessageAt ?? left.createdAt;
    const rightAt = right.lastMessageAt ?? right.createdAt;
    return rightAt - leftAt;
  });
}

/**
 * Newest messages in a DM thread, newest first.
 *
 * Two overloads rather than a generic helper: `dmMessages` and
 * `discussionMessages` are different tables with different index shapes, so one
 * signature covering both would need casts to satisfy the compiler.
 */
async function latestDmMessages(
  ctx: ReadCtx,
  threadId: Id<"dmThreads">,
  take: number,
): Promise<Doc<"dmMessages">[]> {
  return await ctx.db
    .query("dmMessages")
    .withIndex("by_thread_created", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(take);
}

/** Newest replies in a course discussion thread, newest first. */
async function latestDiscussionMessages(
  ctx: ReadCtx,
  threadId: Id<"discussionThreads">,
): Promise<Doc<"discussionMessages">[]> {
  return await ctx.db
    .query("discussionMessages")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(1);
}

/**
 * Unread count for one thread against a read marker.
 *
 * Reads only the window *newer than the marker* (`gt` on the index), so a thread
 * that is fully read costs a single empty range rather than a scan of its
 * history.
 */
async function countUnreadForThread(
  ctx: ReadCtx,
  threadId: Id<"dmThreads">,
  viewerId: Id<"users">,
  lastReadAt: number,
): Promise<{ unreadCount: number; capped: boolean }> {
  const window = await ctx.db
    .query("dmMessages")
    .withIndex("by_thread_created", (q) =>
      q.eq("threadId", threadId).gt("createdAt", lastReadAt),
    )
    .order("desc")
    .take(UNREAD_SCAN_CAP + 1);

  const capped = window.length > UNREAD_SCAN_CAP;
  const bounded = capped ? window.slice(0, UNREAD_SCAN_CAP) : window;
  return {
    unreadCount: countUnreadMessages(bounded, viewerId, lastReadAt),
    capped,
  };
}

/** Writes (or advances) a user's high-water mark for one thread. */
async function advanceReadMarker(
  ctx: WriteCtx,
  userId: Id<"users">,
  threadId: Id<"dmThreads">,
  at: number,
): Promise<void> {
  const rows = await ctx.db
    .query("dmReadMarkers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const existing = rows.find((row) => row.threadId === threadId);

  if (!existing) {
    await ctx.db.insert("dmReadMarkers", { userId, threadId, lastReadAt: at });
    return;
  }
  // A high-water mark only moves forward. A stale tab re-marking read must not
  // resurrect messages the reader has already seen.
  if (at > existing.lastReadAt) {
    await ctx.db.patch(existing._id, { lastReadAt: at });
  }
}

/**
 * Course admission — the three branches from `discussions.ts:verifyAccess`:
 * admin → allowed, the course's own instructor → allowed, otherwise an
 * `enrollments` row.
 *
 * Returns a boolean rather than throwing because `listDiscussionActivity`
 * *filters* on it: a thread in a course the caller has since lost access to is
 * simply not shown, rather than an error that breaks the whole feed.
 */
async function canAccessCourseDiscussion(
  ctx: ReadCtx,
  user: UserDoc,
  courseId: Id<"courses">,
): Promise<boolean> {
  if (user.role === "admin") return true;

  const course = await ctx.db.get(courseId);
  if (!course) return false;
  if (course.instructorId === user._id) return true;

  const enrollment = await ctx.db
    .query("enrollments")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", user._id).eq("courseId", courseId),
    )
    .unique();
  return enrollment !== null;
}

/**
 * Thread ids in `discussionThreads` opened by `userId`.
 *
 * `discussionThreads` is only indexed `by_course`, and `discussionMessages` only
 * `by_thread` — neither is keyed by author, and adding an index to an existing
 * table is out of scope for this module. So this is a bounded scan of the table
 * rather than a filtered index range: `take()` rather than `paginate()`, because
 * Convex allows only one paginated query per function execution and this module
 * scans two tables. The consequence, stated plainly rather than papered over: a
 * learner with more than {@link ACTIVITY_SCAN_CAP} documents of discussion
 * history could have older activity omitted.
 */
async function scanThreadsCreatedBy(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Set<Id<"discussionThreads">>> {
  const found = new Set<Id<"discussionThreads">>();
  const rows = await ctx.db.query("discussionThreads").take(ACTIVITY_SCAN_CAP);
  for (const thread of rows) {
    if (thread.createdBy === userId) found.add(thread._id);
  }
  return found;
}

/** Thread ids in `discussionMessages` that `userId` has posted in. */
async function scanThreadsWithMessageBy(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Set<Id<"discussionThreads">>> {
  const found = new Set<Id<"discussionThreads">>();
  const rows = await ctx.db.query("discussionMessages").take(ACTIVITY_SCAN_CAP);
  for (const message of rows) {
    if (message.userId === userId) found.add(message.threadId);
  }
  return found;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * The caller's DM threads, newest activity first, with the other participant
 * resolved and an unread count per thread.
 */
export const listThreads = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const cap = clamp(args.limit, THREAD_LIST_CAP, THREAD_LIST_CAP);

    const threads = (await loadParticipantThreads(ctx, user._id)).slice(0, cap);
    const markers = await loadReadMarkers(ctx, user._id);

    const summaries: ThreadSummary[] = [];
    for (const thread of threads) {
      const other = await ctx.db.get(otherParticipantId(thread, user._id));
      // A participant whose Clerk account was deleted leaves an unresolvable
      // id. Skip the row rather than rendering a thread with nobody in it.
      if (!other) continue;

      const lastReadAt = markers.get(thread._id) ?? 0;
      const newest = thread.lastMessageAt
        ? await latestDmMessages(ctx, thread._id, 1)
        : [];

      let unreadCount = 0;
      let unreadCapped = false;
      if (
        thread.lastMessageAt !== undefined &&
        thread.lastMessageAt > lastReadAt
      ) {
        const unread = await countUnreadForThread(
          ctx,
          thread._id,
          user._id,
          lastReadAt,
        );
        unreadCount = unread.unreadCount;
        unreadCapped = unread.capped;
      }

      summaries.push({
        ...toPersonSummary(other),
        threadId: thread._id,
        lastMessageAt: thread.lastMessageAt ?? null,
        lastMessagePreview: thread.lastMessagePreview ?? null,
        lastMessageId: newest[0]?._id ?? null,
        lastMessageIsMine: newest[0] ? newest[0].senderId === user._id : null,
        unreadCount,
        unreadCapped,
      });
    }

    return summaries;
  },
});

/**
 * One page of a conversation, oldest first for display.
 *
 * `before` is a `createdAt` cursor for walking backwards through history, and
 * `limit` is clamped — the query is strictly bounded, so a long thread can never
 * be returned whole. Participants only.
 */
export const getMessages = query({
  args: {
    threadId: v.id("dmThreads"),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MessagePage> => {
    const user = await requireUser(ctx);
    await requireParticipant(ctx, user, args.threadId);
    const limit = clamp(args.limit, 50, MESSAGE_PAGE_CAP);

    // One extra row tells us whether an older page exists without a second read.
    const window = await ctx.db
      .query("dmMessages")
      .withIndex("by_thread_created", (q) => {
        const scoped = q.eq("threadId", args.threadId);
        return args.before === undefined
          ? scoped
          : scoped.lt("createdAt", args.before);
      })
      .order("desc")
      .take(limit + 1);

    const hasMore = window.length > limit;
    const page = hasMore ? window.slice(0, limit) : window;

    // Two participants means at most two profile reads for a whole page, so the
    // sender profiles are memoised rather than read per message. The memo holds
    // just the profile fields — the per-message fields are attached below.
    const profiles = new Map<Id<"users">, PersonSummary>();
    const messages: MessageView[] = [];

    for (const raw of page) {
      let profile = profiles.get(raw.senderId);
      if (!profile) {
        const senderDoc = await ctx.db.get(raw.senderId);
        profile = senderDoc
          ? toPersonSummary(senderDoc)
          : // A sender whose Clerk account was deleted must not blank the
            // message — the text still happened.
            {
              id: raw.senderId,
              name: "Glypha learner",
              imageUrl: null,
              role: "student" as Role,
            };
        profiles.set(raw.senderId, profile);
      }

      messages.push({
        id: raw._id,
        senderId: raw.senderId,
        senderName: profile.name,
        senderImageUrl: profile.imageUrl,
        senderRole: profile.role,
        body: raw.body,
        createdAt: raw.createdAt,
        isMine: raw.senderId === user._id,
      });
    }

    return {
      // Reversed into reading order — the index hands them over newest first.
      messages: messages.reverse(),
      hasMore,
      nextBefore: hasMore ? (page[page.length - 1]?.createdAt ?? null) : null,
    };
  },
});

/**
 * The caller's notification feed, newest first.
 *
 * `unreadOnly` switches to `by_user_unread` and an equality on the missing
 * `readAt`, so "unread" is a range read rather than a filter over everything.
 */
export const listNotifications = query({
  args: {
    limit: v.optional(v.number()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const cap = clamp(args.limit, 50, 200);

    const rows =
      args.unreadOnly === true
        ? await ctx.db
            .query("notifications")
            .withIndex("by_user_unread", (q) =>
              q.eq("userId", user._id).eq("readAt", undefined),
            )
            .order("desc")
            .take(cap)
        : await ctx.db
            .query("notifications")
            .withIndex("by_user_created", (q) => q.eq("userId", user._id))
            .order("desc")
            .take(cap);

    // Actor profiles are resolved once each, so a feed of 50 items from the same
    // course instructor costs a single profile read.
    const actors = new Map<Id<"users">, PersonSummary | null>();
    const views: NotificationView[] = [];

    for (const row of rows) {
      let actor: PersonSummary | null = null;
      if (row.actorId) {
        if (!actors.has(row.actorId)) {
          const actorDoc = await ctx.db.get(row.actorId);
          // A deleted actor must not blank the row — the event still happened.
          actors.set(row.actorId, actorDoc ? toPersonSummary(actorDoc) : null);
        }
        actor = actors.get(row.actorId) ?? null;
      }

      views.push({
        id: row._id,
        type: row.type,
        title: row.title,
        body: row.body ?? null,
        href: row.href ?? null,
        createdAt: row.createdAt,
        isRead: row.readAt !== undefined,
        actor,
      });
    }

    return views;
  },
});

/**
 * Both badge counts in one call — the header polls exactly this, so splitting it
 * into two queries would double the subscription traffic for no benefit.
 */
export const getUnreadCounts = query({
  args: {},
  handler: async (ctx): Promise<UnreadCounts> => {
    const user = await requireUser(ctx);

    const threads = (await loadParticipantThreads(ctx, user._id)).slice(
      0,
      BADGE_THREAD_CAP,
    );
    const markers = await loadReadMarkers(ctx, user._id);

    let messages = 0;
    for (const thread of threads) {
      const lastReadAt = markers.get(thread._id) ?? 0;
      // Short-circuit: a thread whose last activity predates the marker cannot
      // hold anything unread, so it costs no further reads.
      if (
        thread.lastMessageAt === undefined ||
        thread.lastMessageAt <= lastReadAt
      ) {
        continue;
      }
      const unread = await countUnreadForThread(
        ctx,
        thread._id,
        user._id,
        lastReadAt,
      );
      messages += unread.unreadCount;
    }

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("readAt", undefined),
      )
      .take(UNREAD_SCAN_CAP);

    return { messages, notifications: notifications.length };
  },
});

/**
 * Course discussion threads the caller has posted in or opened, newest activity
 * first, each linked at the course's existing discussions page.
 *
 * Read-only against `discussionThreads` / `discussionMessages` —
 * `discussions.ts` is untouched. Course access is re-checked per thread (see
 * {@link canAccessCourseDiscussion}), so losing access to a course removes its
 * threads from this feed.
 */
export const listDiscussionActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const cap = clamp(args.limit, ACTIVITY_RESULT_CAP, ACTIVITY_RESULT_CAP);

    const candidates = new Set<Id<"discussionThreads">>([
      ...(await scanThreadsCreatedBy(ctx, user._id)),
      ...(await scanThreadsWithMessageBy(ctx, user._id)),
    ]);

    const views: DiscussionActivityView[] = [];
    for (const threadId of [...candidates].slice(0, ACTIVITY_CANDIDATE_CAP)) {
      const thread = await ctx.db.get(threadId);
      if (!thread) continue;
      if (!(await canAccessCourseDiscussion(ctx, user, thread.courseId))) continue;

      const course = await ctx.db.get(thread.courseId);
      // Access already proved the course exists; this second read is because the
      // link we render is built from its slug.
      if (!course) continue;

      const newest = (await latestDiscussionMessages(ctx, threadId))[0];
      let lastMessageAuthorName: string | null = null;
      if (newest) {
        const author = await ctx.db.get(newest.userId);
        if (author) lastMessageAuthorName = toPersonSummary(author).name;
      }

      views.push({
        threadId: thread._id,
        courseId: course._id,
        courseTitle: course.title,
        courseSlug: course.slug,
        title: thread.title,
        createdByMe: thread.createdBy === user._id,
        lastMessageAt: newest?.createdAt ?? null,
        lastMessagePreview: newest ? buildMessagePreview(newest.body) : null,
        lastMessageAuthorName,
      });
    }

    // Threads nobody has replied to yet sort to the bottom rather than jumping
    // to the top on an arbitrary creation timestamp.
    views.sort((left, right) => {
      const leftAt = left.lastMessageAt ?? -1;
      const rightAt = right.lastMessageAt ?? -1;
      return rightAt - leftAt;
    });

    return views.slice(0, cap);
  },
});

/**
 * Recipient search for the "new message" picker.
 *
 * Matches on **display name only** and returns no email. Two reasons, both about
 * other people's data: the picker renders a name and an avatar and nothing else,
 * and matching on email would turn this into an account-enumeration oracle —
 * "is this address registered here?" — for anyone who can sign up.
 *
 * `users` has no search index and its only index is `by_clerk_id`, so this is a
 * bounded {@link PEOPLE_SCAN_CAP} scan via `take()`.
 */
export const searchPeople = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const term = args.query.trim().toLowerCase();
    const cap = clamp(args.limit, 8, 20);
    // One or two letters match most of the directory and help nobody find anyone.
    if (term.length < 2) return [];

    // Existing conversations, so an already-open thread can be labelled as such
    // instead of quietly creating a second one.
    const mine = await loadParticipantThreads(ctx, user._id);
    const threadByOther = new Map<Id<"users">, Id<"dmThreads">>();
    for (const thread of mine) {
      threadByOther.set(otherParticipantId(thread, user._id), thread._id);
    }

    const matches: PersonOption[] = [];
    const candidates = await ctx.db.query("users").take(PEOPLE_SCAN_CAP);

    for (const candidate of candidates) {
      // Talking to yourself is rejected by `startThread`; do not offer it.
      if (candidate._id === user._id) continue;
      if (!(candidate.name ?? "").toLowerCase().includes(term)) continue;
      matches.push({
        ...toPersonSummary(candidate),
        existingThreadId: threadByOther.get(candidate._id) ?? null,
      });
      if (matches.length >= cap) break;
    }

    return matches;
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Get-or-create the conversation with `recipientId`.
 *
 * Idempotent: two calls for the same pair return the same thread. Two callers
 * racing to open the same conversation is safe because Convex mutations are
 * serializable transactions — the second retries against the committed state and
 * takes the "already exists" branch rather than inserting a duplicate.
 */
export const startThread = mutation({
  args: { recipientId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (args.recipientId === user._id) {
      throw new Error("You cannot start a conversation with yourself");
    }

    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) throw new Error("That person is no longer on this platform");

    // `dmThreads` has no index on the (userA, userB) pair, so an existing thread
    // is found by scanning the caller's own side of the index — which the picker
    // already reads — and filtering in memory.
    const [low, high] = pairOrder(user._id, recipient._id);
    const candidates = await ctx.db
      .query("dmThreads")
      .withIndex("by_user_a", (q) => q.eq("userA", low))
      .take(PAIR_SCAN_CAP);

    const existing = candidates.find(
      (thread) => thread.userA === low && thread.userB === high,
    );
    // Returned before the rate limit below: re-opening a conversation you
    // already have is what the button on the picker does, and it is not spam.
    if (existing) return { threadId: existing._id, created: false };

    // Opening a conversation is far rarer than replying in one, so the budget is
    // tighter than `sendMessage`'s — otherwise a client could pre-create a
    // thread with every user in the directory.
    await requireRateLimit(
      ctx,
      `inbox:startThread:${user._id}`,
      START_THREADS_PER_HOUR,
      60 * 60 * 1000,
    );

    const threadId = await ctx.db.insert("dmThreads", {
      userA: low,
      userB: high,
      createdAt: Date.now(),
    });

    return { threadId, created: true };
  },
});

/**
 * Post to a conversation the caller is part of.
 *
 * Updates the thread's `lastMessageAt` / `lastMessagePreview` so the list can
 * render without reading the newest message body, and advances the *sender's*
 * own read marker in the same transaction — otherwise your own message would sit
 * above your marker and show up as unread to you.
 */
export const sendMessage = mutation({
  args: {
    threadId: v.id("dmThreads"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const thread = await requireParticipant(ctx, user, args.threadId);

    const body = args.body.trim();
    if (body.length === 0) {
      throw new Error("Message cannot be empty");
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Message is too long — the limit is ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    const now = Date.now();

    // Per-thread cooldown first. Both limits below run in the same transaction,
    // so a throw rolls the increment back and a rejected attempt never burns
    // quota.
    const recent = await latestDmMessages(ctx, args.threadId, 5);
    const lastMine = recent.find((message) => message.senderId === user._id);
    if (lastMine && now - lastMine.createdAt < SEND_THREAD_COOLDOWN_MS) {
      throw new Error(
        "You're sending messages too quickly — please wait a moment",
      );
    }

    // Global per-user budget, in addition to the cooldown. The cooldown alone
    // only slows someone down *within one conversation*; it does nothing about a
    // client walking through every thread in the inbox and posting once in each,
    // which is exactly the shape of a spam flood.
    await requireRateLimit(
      ctx,
      `inbox:sendMessage:${user._id}`,
      SEND_PER_MINUTE,
      60 * 1000,
    );

    const messageId = await ctx.db.insert("dmMessages", {
      threadId: args.threadId,
      senderId: user._id,
      body,
      createdAt: now,
    });

    await ctx.db.patch(args.threadId, {
      lastMessageAt: now,
      lastMessagePreview: buildMessagePreview(body),
    });

    // The sender has implicitly read what they just wrote.
    await advanceReadMarker(ctx, user._id, args.threadId, now);

    const recipientId = otherParticipantId(thread, user._id);
    await createNotification(ctx, {
      userId: recipientId,
      type: "direct_message",
      title: `New message from ${user.name?.trim() || "A learner"}`,
      body: buildMessagePreview(body),
      href: `/dashboard/inbox?tab=messages&threadId=${args.threadId}`,
      actorId: user._id,
    });

    return { messageId, sentAt: now };
  },
});

/**
 * Mark one conversation read.
 *
 * The marker is set to *now* rather than to the newest message's timestamp: the
 * reader has demonstrably seen everything that existed when they looked. It only
 * ever moves forward, so a stale tab cannot un-read anything.
 */
export const markThreadRead = mutation({
  args: { threadId: v.id("dmThreads") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requireParticipant(ctx, user, args.threadId);
    const lastReadAt = Date.now();
    await advanceReadMarker(ctx, user._id, args.threadId, lastReadAt);

    const unreadDmNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("readAt", undefined),
      )
      .filter((q) => q.eq(q.field("type"), "direct_message"))
      .collect();

    for (const notif of unreadDmNotifications) {
      if (notif.href?.includes(args.threadId)) {
        await ctx.db.patch(notif._id, { readAt: lastReadAt });
      }
    }

    return { threadId: args.threadId, lastReadAt };
  },
});

/**
 * Mark every conversation read — the inbox's "mark all read" action.
 *
 * One row per thread rather than a write per message. Threads with no activity
 * are skipped: there is nothing there to have read.
 */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    // Bulk writes, so budgeted like a bulk write: a client looping this would
    // otherwise patch a row per thread as fast as it could.
    await requireRateLimit(
      ctx,
      `inbox:markAllRead:${user._id}`,
      BULK_READ_PER_MINUTE,
      60 * 1000,
    );

    const threads = await loadParticipantThreads(ctx, user._id);
    const now = Date.now();
    let marked = 0;
    for (const thread of threads) {
      if (thread.lastMessageAt === undefined) continue;
      await advanceReadMarker(ctx, user._id, thread._id, now);
      marked += 1;
    }

    return { threadsMarked: marked };
  },
});

/** Mark one notification read. Ownership is enforced — ids are not a secret. */
export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");
    // Cross-user isolation: another account's notification id must not be
    // markable, or the feed leaks who has events pending.
    if (notification.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (notification.readAt === undefined) {
      await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    }
    return { notificationId: args.notificationId };
  },
});

/**
 * Mark every unread notification read.
 *
 * Reads only the unread window via `by_user_unread`, then patches it — a feed
 * with a thousand already-read items costs nothing here.
 */
export const markAllNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    await requireRateLimit(
      ctx,
      `inbox:markAllNotificationsRead:${user._id}`,
      BULK_READ_PER_MINUTE,
      60 * 1000,
    );

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("readAt", undefined),
      )
      .take(SCAN_PAGE_SIZE);

    const readAt = Date.now();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { readAt });
    }

    return { updated: unread.length };
  },
});

/**
 * Enqueue a notification, for another module to call.
 *
 * `internalMutation`, so it is unreachable from a client — the feed is written by
 * the system, never by the person reading it. Intended call site:
 *
 * ```ts
 * await ctx.runMutation(internal.inbox.internalNotification, {
 *   userId: learner._id,
 *   type: "certificate_earned",
 *   title: "Your certificate is ready",
 *   body: course.title,
 *   href: "/dashboard/certificates",
 * });
 * ```
 *
 * The producer is `certificates.issueIfEligible`, which every issuance funnels
 * through — it notifies only on the branch that actually issues, so the
 * idempotency check upstream already prevents duplicate notifications.
 */
export const internalNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: notificationTypeValidator,
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
    actorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Fail loudly rather than writing a row nobody can render: a recipient that
    // does not exist is a bug in the caller, not something to paper over.
    if (!(await ctx.db.get(args.userId))) {
      throw new Error("Notification recipient not found");
    }

    const title = args.title.trim();
    if (title.length === 0) {
      throw new Error("Notification title cannot be empty");
    }

    // `href` becomes a link the reader clicks, so it has to stay inside the app.
    // "//evil.com" and "/\evil.com" are protocol-relative URLs that would leave
    // the origin despite starting with a slash.
    let href: string | undefined;
    if (args.href !== undefined) {
      const trimmed = args.href.trim();
      const isInternal =
        trimmed.startsWith("/") &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("/\\");
      if (!isInternal) {
        throw new Error("Notification href must be an in-app path");
      }
      href = trimmed;
    }

    return await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title,
      body: args.body?.trim(),
      href,
      actorId: args.actorId,
      createdAt: Date.now(),
    });
  },
});
