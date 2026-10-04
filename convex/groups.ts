import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./helpers/auth";
import type { Doc, Id, ReadCtx, UserDoc } from "./helpers/auth";
import { requireRateLimit } from "./helpers/rateLimit";
import { logAudit } from "./helpers/audit";
import {
  ACCESSIBLE_COURSES_LIMIT,
  ACCESSIBLE_COURSES_SCAN_LIMIT,
  BROWSE_GROUPS_LIMIT,
  BROWSE_GROUPS_SCAN_LIMIT,
  GROUP_CREATE_PER_HOUR,
  GROUP_POST_COOLDOWN_MS,
  GROUP_POSTS_PER_MINUTE,
  MESSAGES_LIMIT,
  MEMBERS_LIMIT,
  MY_GROUPS_LIMIT,
  MY_GROUPS_SCAN_LIMIT,
  PENDING_REQUESTS_LIMIT,
  POST_COOLDOWN_SCAN,
  clampLimit,
  compareMembers,
  decideLeave,
  derivePermissions,
  deriveRelationship,
  displayName,
  groupPrimaryAction,
  isBeforeCursor,
  lastMemberBlockedMessage,
  messagePreview,
  relationshipBadgeLabel,
  splitPage,
  validateGroupDescription,
  validateGroupName,
  validateJoinRequestMessage,
  validateMessageBody,
} from "../lib/groups";
import type {
  AccessibleCourse,
  BrowseGroupSummary,
  GroupDetail,
  GroupJoinRequestItem,
  GroupMemberItem,
  GroupMemberRole,
  GroupMessageItem,
  GroupMessagePage,
  GroupPrimaryAction,
  GroupRelationship,
  JoinGroupResult,
  LeaveGroupResult,
  MyGroupStats,
  MyGroupSummary,
  ReviewJoinRequestResult,
} from "../lib/groups";

/**
 * Course-scoped study groups.
 *
 * A group is not a standalone space: it belongs to a course, and every read and
 * write starts by re-running that course's access branch — admin, then the
 * course instructor, then an enrolled learner. Nothing here trusts the browser,
 * which is why `browseGroupsForCourse` resolves each group's relationship and
 * `getGroup` resolves its permissions on the server: the client renders what it
 * is told instead of re-deriving a rule and getting it subtly wrong.
 *
 * Roles do not gate participation — students, instructors and admins all take
 * part. What gates is the relationship to the *group* and to its course.
 */

// ─── Access helpers ─────────────────────────────────────────────────────────

/**
 * The three-branch course-access gate, same shape as `discussions.ts:verifyAccess`
 * so both features read the same way: admin, else the course's own instructor,
 * else an enrolled learner.
 */
async function requireCourseAccess(
  ctx: ReadCtx,
  user: UserDoc,
  courseId: Id<"courses">,
): Promise<Doc<"courses">> {
  const course = await ctx.db.get(courseId);
  if (!course) throw new Error("Course not found");
  if (user.role === "admin") return course;
  if (course.instructorId === user._id) return course;

  const enrollment = await ctx.db
    .query("enrollments")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", user._id).eq("courseId", courseId),
    )
    .unique();
  if (!enrollment) {
    throw new Error(
      "You must be enrolled in this course to take part in its study groups",
    );
  }
  return course;
}

async function loadGroup(
  ctx: ReadCtx,
  groupId: Id<"studyGroups">,
): Promise<Doc<"studyGroups">> {
  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Group not found");
  return group;
}

/**
 * The caller's seat in a group, if any.
 *
 * `studyGroupMembers` has `by_group` but no `by_group_user`, so this reads the
 * group's roster and filters it in memory. That is bounded by the roster size a
 * real study group has; a composite index would be the fix if that ever stops
 * being true.
 */
async function findMembership(
  ctx: ReadCtx,
  groupId: Id<"studyGroups">,
  userId: Id<"users">,
): Promise<Doc<"studyGroupMembers"> | null> {
  return await ctx.db
    .query("studyGroupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .filter((q) => q.eq(q.field("userId"), userId))
    .unique();
}

async function countGroupMembers(
  ctx: ReadCtx,
  groupId: Id<"studyGroups">,
): Promise<number> {
  const rows = await ctx.db
    .query("studyGroupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  return rows.length;
}

/**
 * Pending join requests for a group, oldest first — the queue reads
 * chronologically, so the longest-waiting person is at the top.
 */
async function listPendingRequestsFor(
  ctx: ReadCtx,
  groupId: Id<"studyGroups">,
): Promise<Doc<"studyGroupJoinRequests">[]> {
  return await ctx.db
    .query("studyGroupJoinRequests")
    .withIndex("by_group_status", (q) =>
      q.eq("groupId", groupId).eq("status", "pending"),
    )
    .order("asc")
    .take(PENDING_REQUESTS_LIMIT);
}

/** The caller's own request history against a group, newest first. */
async function findLatestRequestFor(
  ctx: ReadCtx,
  groupId: Id<"studyGroups">,
  userId: Id<"users">,
): Promise<Doc<"studyGroupJoinRequests"> | null> {
  return await ctx.db
    .query("studyGroupJoinRequests")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("groupId"), groupId))
    .order("desc")
    .first();
}

/**
 * Whether the caller may work a group's join-request queue: its moderators, the
 * course instructor, or an admin. Mirrors `canManageCourse`, widened to include
 * group moderators.
 */
function canApproveRequests(
  user: UserDoc,
  course: Doc<"courses">,
  membership: Doc<"studyGroupMembers"> | null,
): boolean {
  if (user.role === "admin") return true;
  if (course.instructorId === user._id) return true;
  return membership?.role === "moderator";
}

/** Whether the caller owns the course (instructor or admin). */
function isCourseOwner(user: UserDoc, course: Doc<"courses">): boolean {
  return user.role === "admin" || course.instructorId === user._id;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export const listMyGroups = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<MyGroupSummary[]> => {
    const user = await requireUser(ctx);
    const limit = clampLimit(args.limit, MY_GROUPS_LIMIT);

    // One index read gets every seat this user holds. The scan is capped so a
    // pathological account cannot turn a list page into an unbounded read; the
    // result is then sorted and truncated to `limit`.
    const memberships = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MY_GROUPS_SCAN_LIMIT);

    const summaries: MyGroupSummary[] = [];
    for (const membership of memberships) {
      const group = await ctx.db.get(membership.groupId);
      if (!group) continue;
      const course = await ctx.db.get(group.courseId);
      if (!course) continue;

      const memberCount = await countGroupMembers(ctx, group._id);
      // Read the newest message straight off `by_group_created` rather than
      // collecting the feed and picking the max in memory.
      const latest = await ctx.db
        .query("studyGroupMessages")
        .withIndex("by_group_created", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();
      const author = latest ? await ctx.db.get(latest.userId) : null;

      summaries.push({
        _id: group._id as string,
        name: group.name,
        description: group.description ?? null,
        isPrivate: group.isPrivate,
        isArchived: group.isArchived === true,
        course: { _id: course._id as string, title: course.title, slug: course.slug },
        memberCount,
        myRole: membership.role,
        createdAt: group.createdAt,
        lastActivityAt: latest?.createdAt ?? group.createdAt,
        latestMessage: latest
          ? {
              body: messagePreview(latest.body),
              at: latest.createdAt,
              authorName: displayName(author),
            }
          : null,
      });
    }

    summaries.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return summaries.slice(0, limit);
  },
});

export const listMyAccessibleCourses = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<AccessibleCourse[]> => {
    const user = await requireUser(ctx);
    const limit = clampLimit(args.limit, ACCESSIBLE_COURSES_LIMIT);

    // Courses they study plus courses they teach. Admins are not enrolled in
    // anything and own nothing, so they get published courses — bounded,
    // because the catalogue picker must not become the catalogue.
    const enrolled = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(ACCESSIBLE_COURSES_SCAN_LIMIT);
    const taught = await ctx.db
      .query("courses")
      .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
      .take(ACCESSIBLE_COURSES_SCAN_LIMIT);

    const picked = new Map<string, AccessibleCourse["access"]>();
    for (const course of taught) picked.set(course._id as string, "instructor");
    for (const enrollment of enrolled) {
      if (!picked.has(enrollment.courseId as string)) {
        picked.set(enrollment.courseId as string, "enrolled");
      }
    }

    const isAdmin = user.role === "admin";
    const published = isAdmin
      ? await ctx.db
          .query("courses")
          .withIndex("by_published", (q) => q.eq("published", true))
          .take(ACCESSIBLE_COURSES_SCAN_LIMIT)
      : [];

    const courseIds = isAdmin
      ? [...picked.keys(), ...published.map((c) => c._id as string)]
      : [...picked.keys()];

    const results: AccessibleCourse[] = [];
    const seen = new Set<string>();
    for (const courseId of courseIds) {
      if (seen.has(courseId)) continue;
      seen.add(courseId);
      const course = await ctx.db.normalizeId("courses", courseId);
      if (!course) continue;
      const doc = await ctx.db.get(course);
      if (!doc) continue;
      const groups = await ctx.db
        .query("studyGroups")
        .withIndex("by_course", (q) => q.eq("courseId", doc._id))
        .take(BROWSE_GROUPS_SCAN_LIMIT);
      results.push({
        _id: doc._id as string,
        title: doc.title,
        slug: doc.slug,
        published: doc.published,
        access: picked.get(courseId) ?? "enrolled",
        groupCount: groups.filter((g) => g.isArchived !== true).length,
      });
      if (results.length >= limit) break;
    }

    results.sort((a, b) => a.title.localeCompare(b.title));
    return results.slice(0, limit);
  },
});

export const browseGroupsForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args): Promise<BrowseGroupSummary[]> => {
    const user = await requireUser(ctx);
    const course = await requireCourseAccess(ctx, user, args.courseId);

    const groups = await ctx.db
      .query("studyGroups")
      .withIndex("by_course", (q) => q.eq("courseId", course._id))
      .take(BROWSE_GROUPS_SCAN_LIMIT);

    const courseRefValue = {
      _id: course._id as string,
      title: course.title,
      slug: course.slug,
    };
    const owner = isCourseOwner(user, course);

    const summaries: BrowseGroupSummary[] = [];
    for (const group of groups) {
      // Archived groups stay readable (their members' messages are the point)
      // but they are not browsable — a closed group is not an invitation.
      if (group.isArchived === true) continue;

      const membership = await findMembership(ctx, group._id, user._id);
      const latestRequest = membership
        ? null
        : await findLatestRequestFor(ctx, group._id, user._id);
      const canSeeQueue =
        owner || membership?.role === "moderator" || user.role === "admin";
      const pendingRequestCount = canSeeQueue
        ? (await listPendingRequestsFor(ctx, group._id)).length
        : 0;

      const lastMessage = await ctx.db
        .query("studyGroupMessages")
        .withIndex("by_group_created", (q) => q.eq("groupId", group._id))
        .order("desc")
        .first();

      summaries.push({
        _id: group._id as string,
        name: group.name,
        description: group.description ?? null,
        isPrivate: group.isPrivate,
        isArchived: false,
        course: courseRefValue,
        memberCount: await countGroupMembers(ctx, group._id),
        pendingRequestCount,
        relationship: deriveRelationship({
          memberRole: membership?.role ?? null,
          hasPendingRequest: latestRequest?.status === "pending",
          wasDeclined: latestRequest?.status === "declined",
        }),
        myPendingRequestId:
          latestRequest?.status === "pending" ? (latestRequest._id as string) : null,
        lastActivityAt: lastMessage?.createdAt ?? group.createdAt,
      });
    }

    summaries.sort(
      (a, b) =>
        b.lastActivityAt - a.lastActivityAt || a.name.localeCompare(b.name),
    );
    return summaries.slice(0, BROWSE_GROUPS_LIMIT);
  },
});

export const getGroup = query({
  args: { groupId: v.id("studyGroups") },
  handler: async (ctx, args): Promise<GroupDetail> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);

    const membership = await findMembership(ctx, group._id, user._id);
    const ownRequest = await findLatestRequestFor(ctx, group._id, user._id);
    const owner = isCourseOwner(user, course);
    const pendingRequestCount =
      canApproveRequests(user, course, membership)
        ? (await listPendingRequestsFor(ctx, group._id)).length
        : 0;

    const members = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const moderators = members.filter((m) => m.role === "moderator").length;
    const creator = await ctx.db.get(group.createdBy);

    const permissions = derivePermissions({
      memberRole: membership?.role ?? null,
      isArchived: group.isArchived === true,
      isCourseOwner: owner,
      leaveBlocked:
        decideLeave({
          memberRole: membership?.role ?? null,
          memberCount: members.length,
          moderatorCount: moderators,
        }) === "blocked_last_member",
    });

    return {
      _id: group._id as string,
      name: group.name,
      description: group.description ?? null,
      isPrivate: group.isPrivate,
      isArchived: group.isArchived === true,
      createdAt: group.createdAt,
      course: {
        _id: course._id as string,
        title: course.title,
        slug: course.slug,
      },
      createdBy: {
        name: displayName(creator),
        imageUrl: creator?.imageUrl ?? null,
      },
      memberCount: members.length,
      pendingRequestCount,
      myRole: membership?.role ?? null,
      hasPendingRequest: ownRequest?.status === "pending",
      wasDeclined: ownRequest?.status === "declined",
      permissions,
    };
  },
});

export const listMembers = query({
  args: {
    groupId: v.id("studyGroups"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ members: GroupMemberItem[] }> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    // Course access is the gate here, not membership: who is studying a course
    // is not private inside that course. The conversation is the thing that
    // requires a seat (see `listMessages`).
    await requireCourseAccess(ctx, user, group.courseId);

    const limit = clampLimit(args.limit, MEMBERS_LIMIT);
    const memberships = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .take(MEMBERS_LIMIT);

    const rows: GroupMemberItem[] = [];
    for (const membership of memberships) {
      const member = await ctx.db.get(membership.userId);
      rows.push({
        _id: membership._id as string,
        userId: membership.userId as string,
        name: displayName(member),
        imageUrl: member?.imageUrl ?? null,
        role: membership.role,
        joinedAt: membership.joinedAt,
      });
    }

    rows.sort(compareMembers);
    return { members: rows.slice(0, limit) };
  },
});

/**
 * How many rows one page scan may fetch beyond `limit`. The cursor is a
 * (createdAt, _id) pair but the index range builder can only bound one index
 * field, so the tie group around the cursor is fetched with `lte` and then
 * filtered in memory. `TIE_SLACK` bounds how much of that group we pull; past
 * it, a page may come back short rather than unbounded, which the client copes
 * with by asking again with the same cursor.
 */
const TIE_SLACK = 32;

/**
 * One page of the message feed, newest first, walked backwards from `after`.
 *
 * `by_group_created` is [groupId, createdAt]; descending order plus `lte` on
 * `createdAt` reaches the cursor's millisecond *and everything older*, which is
 * exactly the region we want. The `_id` comparison then drops the cursor itself
 * and any sibling message sharing its millisecond that was already delivered.
 *
 * Returns up to `limit + 1` rows (the extra one is how `hasMore` is computed),
 * never more — the feed is paginated, not collected.
 */
async function readMessagePage(
  ctx: ReadCtx,
  groupId: Id<"studyGroups">,
  after: { createdAt: number; id: string } | null,
  limit: number,
): Promise<Doc<"studyGroupMessages">[]> {
  const scan = limit + 1 + TIE_SLACK;
  const rows = await ctx.db
    .query("studyGroupMessages")
    .withIndex("by_group_created", (q) =>
      after
        ? q.eq("groupId", groupId).lte("createdAt", after.createdAt)
        : q.eq("groupId", groupId),
    )
    .order("desc")
    .take(scan);

  const eligible = after
    ? rows.filter((row) =>
        isBeforeCursor(
          { createdAt: row.createdAt, _id: row._id as string },
          { createdAt: after.createdAt, id: after.id },
        ),
      )
    : rows;
  return eligible.slice(0, limit + 1);
}

export const listMessages = query({
  args: {
    groupId: v.id("studyGroups"),
    limit: v.optional(v.number()),
    // Cursor for the next (older) page: the oldest message already delivered.
    // A composite cursor rather than a bare timestamp because Convex breaks
    // `createdAt` ties by `_id`, and two messages can share a millisecond.
    after: v.optional(
      v.object({
        createdAt: v.number(),
        id: v.id("studyGroupMessages"),
      }),
    ),
  },
  handler: async (ctx, args): Promise<GroupMessagePage> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);

    // Reading the conversation needs a seat. The course instructor and admins
    // are the exception — they can already see every message through their own
    // course tools, and a moderator of a group they do not belong to is not a
    // thing.
    const membership = await findMembership(ctx, group._id, user._id);
    if (!membership && !isCourseOwner(user, course)) {
      throw new Error("Join this group to read its messages");
    }

    const limit = clampLimit(args.limit, MESSAGES_LIMIT);
    const cursor = args.after
      ? { createdAt: args.after.createdAt, id: args.after.id as string }
      : null;
    const collected = await readMessagePage(ctx, group._id, cursor, limit);
    const { items, hasMore } = splitPage(collected, limit);

    const messages: GroupMessageItem[] = [];
    for (const row of items) {
      const author = await ctx.db.get(row.userId);
      messages.push({
        _id: row._id as string,
        body: row.body,
        createdAt: row.createdAt,
        authorName: author ? displayName(author) : null,
        authorImageUrl: author?.imageUrl ?? null,
        authorRole: author?.role ?? null,
        isMine: row.userId === user._id,
      });
    }

    const oldest = items[items.length - 1];
    return {
      messages,
      hasMore,
      nextCursor: oldest
        ? { createdAt: oldest.createdAt, id: oldest._id as string }
        : null,
    };
  },
});

export const listPendingRequests = query({
  args: {
    groupId: v.id("studyGroups"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ requests: GroupJoinRequestItem[] }> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);
    const membership = await findMembership(ctx, group._id, user._id);

    if (!canApproveRequests(user, course, membership)) {
      throw new Error("Only group moderators can review join requests");
    }

    const limit = clampLimit(args.limit, PENDING_REQUESTS_LIMIT);
    const requests = await listPendingRequestsFor(ctx, group._id);

    const items: GroupJoinRequestItem[] = [];
    for (const request of requests) {
      if (items.length >= limit) break;
      const requester = await ctx.db.get(request.userId);
      items.push({
        _id: request._id as string,
        groupId: group._id as string,
        groupName: group.name,
        requesterName: displayName(requester),
        requesterImageUrl: requester?.imageUrl ?? null,
        message: request.message ?? null,
        createdAt: request.createdAt,
      });
    }

    return { requests: items };
  },
});

export const getMyGroupStats = query({
  args: {},
  handler: async (ctx): Promise<MyGroupStats> => {
    const user = await requireUser(ctx);

    const memberships = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(MY_GROUPS_SCAN_LIMIT);

    let totalMembersAcrossMyGroups = 0;
    // Groups whose queue this caller owns: the ones they moderate.
    const queueGroupIds = new Set<string>();
    for (const membership of memberships) {
      totalMembersAcrossMyGroups += await countGroupMembers(
        ctx,
        membership.groupId,
      );
      if (membership.role === "moderator") {
        queueGroupIds.add(membership.groupId as string);
      }
    }

    // …plus every group in a course they teach, since the course instructor can
    // approve any of them. Admins moderate everything, so they get every group
    // in the deployment.
    if (user.role === "instructor" || user.role === "admin") {
      const owned = await ctx.db
        .query("courses")
        .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
        .take(MY_GROUPS_SCAN_LIMIT);
      for (const course of owned) {
        const groups = await ctx.db
          .query("studyGroups")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .take(BROWSE_GROUPS_SCAN_LIMIT);
        for (const group of groups) queueGroupIds.add(group._id as string);
      }
    }
    if (user.role === "admin") {
      const all = await ctx.db
        .query("studyGroups")
        .take(MY_GROUPS_SCAN_LIMIT);
      for (const group of all) queueGroupIds.add(group._id as string);
    }

    let pendingRequestsToReview = 0;
    let scanned = 0;
    for (const groupId of queueGroupIds) {
      if (scanned >= MY_GROUPS_SCAN_LIMIT) break;
      scanned += 1;
      const normalized = await ctx.db.normalizeId("studyGroups", groupId);
      if (!normalized) continue;
      pendingRequestsToReview += (
        await listPendingRequestsFor(ctx, normalized)
      ).length;
    }

    return {
      myGroups: memberships.length,
      pendingRequestsToReview,
      totalMembersAcrossMyGroups,
    };
  },
});

/**
 * The relationship plus the button to offer, resolved in one payload.
 *
 * The browse list needs both and the rule for the second is a function of the
 * first; deriving it here keeps the client from hand-writing four `if`s that
 * have to stay in step with `deriveRelationship`.
 */
export const getGroupRelationship = query({
  args: { groupId: v.id("studyGroups") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    relationship: GroupRelationship;
    action: GroupPrimaryAction;
    badgeLabel: string;
  }> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    await requireCourseAccess(ctx, user, group.courseId);

    const membership = await findMembership(ctx, group._id, user._id);
    const ownRequest = await findLatestRequestFor(ctx, group._id, user._id);
    const relationship = deriveRelationship({
      memberRole: membership?.role ?? null,
      hasPendingRequest: ownRequest?.status === "pending",
      wasDeclined: ownRequest?.status === "declined",
    });

    return {
      relationship,
      action: groupPrimaryAction({ relationship, isPrivate: group.isPrivate }),
      badgeLabel: relationshipBadgeLabel(relationship),
    };
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

export const createGroup = mutation({
  args: {
    courseId: v.id("courses"),
    name: v.string(),
    description: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await requireUser(ctx);
    // Students and instructors alike may open a group in a course they can
    // reach — this is the same gate as joining one, so "enrolled" is enough.
    await requireCourseAccess(ctx, user, args.courseId);

    const nameError = validateGroupName(args.name);
    if (nameError) throw new Error(nameError);
    const descriptionError = validateGroupDescription(args.description);
    if (descriptionError) throw new Error(descriptionError);

    // Durable (DB-backed) budget so it survives cold starts, unlike an
    // in-process counter. Opening a group is rare; opening ten a minute is a
    // spam loop, not a study group.
    await requireRateLimit(
      ctx,
      `createGroup:${user._id}`,
      GROUP_CREATE_PER_HOUR,
      60 * 60 * 1000,
    );

    const now = Date.now();
    const groupId = await ctx.db.insert("studyGroups", {
      courseId: args.courseId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      createdBy: user._id,
      isPrivate: args.isPrivate === true,
      createdAt: now,
    });

    // The creator owns what they just made, so they start as its moderator —
    // otherwise a private group could be opened and then locked shut with no
    // one able to approve anybody into it.
    await ctx.db.insert("studyGroupMembers", {
      groupId,
      userId: user._id,
      role: "moderator",
      joinedAt: now,
    });

    return groupId as string;
  },
});

export const updateGroup = mutation({
  args: {
    groupId: v.id("studyGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);

    const membership = await findMembership(ctx, group._id, user._id);
    if (membership?.role !== "moderator" && !isCourseOwner(user, course)) {
      throw new Error("Only group moderators can edit this group");
    }

    const patch: {
      name?: string;
      description?: string | undefined;
    } = {};
    if (args.name !== undefined) {
      const nameError = validateGroupName(args.name);
      if (nameError) throw new Error(nameError);
      patch.name = args.name.trim();
    }
    if (args.description !== undefined) {
      const descriptionError = validateGroupDescription(args.description);
      if (descriptionError) throw new Error(descriptionError);
      patch.description = args.description.trim() || undefined;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("Nothing to update");
    }

    await ctx.db.patch(group._id, patch);
    return null;
  },
});

export const joinGroup = mutation({
  args: {
    groupId: v.id("studyGroups"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<JoinGroupResult> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);

    if (group.isArchived === true) {
      throw new Error("This group is archived — it is no longer accepting members");
    }

    const membership = await findMembership(ctx, group._id, user._id);
    if (membership) {
      throw new Error("You're already a member of this group");
    }

    const latestRequest = await findLatestRequestFor(ctx, group._id, user._id);
    if (latestRequest?.status === "pending") {
      throw new Error("You already have a request waiting on this group");
    }
    const messageError = validateJoinRequestMessage(args.message);
    if (messageError) throw new Error(messageError);

    const now = Date.now();
    // A private group takes a request; a public one takes the seat directly.
    // The course instructor (and admins) are exempt — they can already see
    // every group in their course, so making them queue for their own class
    // would be theatre.
    const bypassesQueue = isCourseOwner(user, course);
    if (group.isPrivate && !bypassesQueue) {
      const requestId = await ctx.db.insert("studyGroupJoinRequests", {
        groupId: group._id,
        userId: user._id,
        message: args.message?.trim() || undefined,
        status: "pending",
        createdAt: now,
      });
      return { outcome: "request_created", requestId: requestId as string };
    }

    const membershipId = await ctx.db.insert("studyGroupMembers", {
      groupId: group._id,
      userId: user._id,
      role: "member" as GroupMemberRole,
      joinedAt: now,
    });
    return { outcome: "joined", membershipId: membershipId as string };
  },
});

export const reviewJoinRequest = mutation({
  args: {
    requestId: v.id("studyGroupJoinRequests"),
    decision: v.union(v.literal("approve"), v.literal("decline")),
  },
  handler: async (ctx, args): Promise<ReviewJoinRequestResult> => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Join request not found");

    const group = await loadGroup(ctx, request.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);
    const membership = await findMembership(ctx, group._id, user._id);
    if (!canApproveRequests(user, course, membership)) {
      throw new Error("Only group moderators can review join requests");
    }
    if (request.status !== "pending") {
      throw new Error("That request has already been reviewed");
    }
    if (group.isArchived === true) {
      throw new Error("This group is archived — it is no longer accepting members");
    }

    const now = Date.now();
    if (args.decision === "decline") {
      await ctx.db.patch(request._id, {
        status: "declined" as const,
        reviewedAt: now,
        reviewedBy: user._id,
      });
      return { membershipId: null };
    }

    // Approving somebody who joined in the meantime (the course instructor let
    // them in directly, say) must not fail the whole review — the request is
    // still resolved, we just have no membership to create.
    const existing = await findMembership(ctx, group._id, request.userId);
    const membershipId = existing
      ? (existing._id as string)
      : ((await ctx.db.insert("studyGroupMembers", {
          groupId: group._id,
          userId: request.userId,
          role: "member" as GroupMemberRole,
          joinedAt: now,
        })) as string);

    await ctx.db.patch(request._id, {
      status: "approved" as const,
      reviewedAt: now,
      reviewedBy: user._id,
    });

    // Not audited on purpose: approving somebody into a study group is ordinary
    // self-service moderation, not a privileged act. `logAudit` is reserved for
    // role changes and visibility changes (`promoteMember`, `archiveGroup`),
    // where it is the only record that someone with more authority did it.
    return { membershipId };
  },
});

export const cancelJoinRequest = mutation({
  args: { requestId: v.id("studyGroupJoinRequests") },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Join request not found");
    if (request.userId !== user._id) {
      throw new Error("You can only cancel your own join request");
    }
    if (request.status !== "pending") {
      throw new Error("That request has already been reviewed");
    }
    // Cancelled rather than deleted so a moderator can still see that somebody
    // asked and then withdrew — the same reasoning as archived groups.
    await ctx.db.patch(request._id, { status: "declined" as const, reviewedAt: Date.now() });
    return null;
  },
});

export const leaveGroup = mutation({
  args: { groupId: v.id("studyGroups") },
  handler: async (ctx, args): Promise<LeaveGroupResult> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    await requireCourseAccess(ctx, user, group.courseId);

    const membership = await findMembership(ctx, group._id, user._id);
    if (!membership) throw new Error("You're not a member of this group");

    const members = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .collect();
    const moderators = members.filter((m) => m.role === "moderator");

    // The rule lives in lib/groups.ts so it is testable on its own; see
    // `decideLeave` for why the last moderator promotes and the last member is
    // refused.
    const decision = decideLeave({
      memberRole: membership.role,
      memberCount: members.length,
      moderatorCount: moderators.length,
    });
    if (decision === "blocked_last_member") {
      throw new Error(lastMemberBlockedMessage());
    }

    let promotedUserId: string | null = null;
    if (decision === "promote_then_leave") {
      // Longest-tenured other member, so the promotion is predictable for the
      // people in the room rather than arbitrary.
      const successor = members
        .filter((m) => m._id !== membership._id)
        .sort(
          (a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId),
        )[0];
      if (!successor) throw new Error(lastMemberBlockedMessage());
      await ctx.db.patch(successor._id, { role: "moderator" as const });
      promotedUserId = successor.userId as string;
    }

    await ctx.db.delete(membership._id);
    return promotedUserId
      ? { outcome: "promoted_and_left", promotedUserId }
      : { outcome: "left" };
  },
});

/**
 * Role management inside a group.
 *
 * **Course instructor or admin only — a group moderator cannot promote peers,
 * even in their own group.** The asymmetry is deliberate and it is the same one
 * `archiveGroup` draws. A group moderator is somebody a group *invited in*;
 * the course instructor is somebody the platform vouched for. If a moderator
 * could mint other moderators, then the first thing any group does is promote a
 * friend, and the tier that actually means something disappears. Group
 * moderators still run their own room — they approve join requests and edit the
 * description — which is authority over a conversation, not over membership.
 */
export const promoteMember = mutation({
  args: {
    groupId: v.id("studyGroups"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);
    if (!isCourseOwner(user, course)) {
      throw new Error(
        "Only the course instructor can promote members to moderator",
      );
    }

    const membership = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .unique();
    if (!membership) {
      throw new Error("That person is not a member of this group");
    }
    if (membership.role === "moderator") {
      throw new Error("That person is already a moderator");
    }

    await ctx.db.patch(membership._id, { role: "moderator" as const });
    await logAudit(ctx, {
      actorId: user._id,
      action: "group.promote",
      targetType: "studyGroup",
      targetId: group._id,
      details: {
        promotedUserId: args.userId,
        courseId: group.courseId,
      },
    });
    return null;
  },
});

export const demoteMember = mutation({
  args: {
    groupId: v.id("studyGroups"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);
    if (!isCourseOwner(user, course)) {
      throw new Error(
        "Only the course instructor can change moderator roles",
      );
    }

    const membership = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .unique();
    if (!membership) {
      throw new Error("That person is not a member of this group");
    }
    if (membership.role === "member") {
      throw new Error("That person is already an ordinary member");
    }

    // A group with no moderator has nobody who can approve join requests, so it
    // quietly stops working. Refuse rather than leave a group in that state.
    const moderators = await ctx.db
      .query("studyGroupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", group._id))
      .filter((q) => q.eq(q.field("role"), "moderator"))
      .collect();
    if (moderators.length <= 1) {
      throw new Error(
        "This group needs at least one moderator — promote someone else first",
      );
    }

    await ctx.db.patch(membership._id, { role: "member" as const });
    await logAudit(ctx, {
      actorId: user._id,
      action: "group.demote",
      targetType: "studyGroup",
      targetId: group._id,
      details: { demotedUserId: args.userId, courseId: group.courseId },
    });
    return null;
  },
});

export const postMessage = mutation({
  args: {
    groupId: v.id("studyGroups"),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    await requireCourseAccess(ctx, user, group.courseId);

    const membership = await findMembership(ctx, group._id, user._id);
    if (!membership) {
      throw new Error("Join this group before posting to it");
    }
    if (group.isArchived === true) {
      throw new Error(
        "This group is archived — its conversation is closed to new messages",
      );
    }
    const bodyError = validateMessageBody(args.body);
    if (bodyError) throw new Error(bodyError);

    // Per-group cooldown, read back through the very index the feed is ordered
    // by (`by_group_created`, descending) — no full-group scan.
    const recent = await ctx.db
      .query("studyGroupMessages")
      .withIndex("by_group_created", (q) => q.eq("groupId", group._id))
      .order("desc")
      .take(POST_COOLDOWN_SCAN);
    const lastMine = recent.find((m) => m.userId === user._id);
    if (lastMine && Date.now() - lastMine.createdAt < GROUP_POST_COOLDOWN_MS) {
      throw new Error("You're posting too quickly — please wait a moment");
    }

    // Global per-user budget, *in addition to* the per-group cooldown above. A
    // cooldown only slows somebody down within one group; it does nothing about
    // a client walking through every group it belongs to and writing once in
    // each, which is exactly the shape of a spam flood. Both limits share this
    // transaction, so a rejection above rolls the increment back and a refused
    // post never burns quota.
    await requireRateLimit(
      ctx,
      `groupPost:${user._id}`,
      GROUP_POSTS_PER_MINUTE,
      60 * 1000,
    );

    return (await ctx.db.insert("studyGroupMessages", {
      groupId: group._id,
      userId: user._id,
      body: args.body.trim(),
      createdAt: Date.now(),
    })) as string;
  },
});

/**
 * Closing a group's conversation.
 *
 * **Course instructor or admin only — not the group's own moderator.** Same
 * line as `promoteMember`, and for a stronger reason here: archiving is the
 * operation people cannot undo. A group is archived rather than deleted
 * precisely so members' messages survive, which means an archived group is a
 * group nobody can post in, approve into, or bring back except the person who
 * owns the course. Letting every group moderator reach that switch turns "the
 * moderator had a quiet week" into "the cohort's history is gone for good" with
 * no one to appeal to. Group moderators are trusted with the conversation;
 * closing it is the course instructor's call.
 */
export const archiveGroup = mutation({
  args: { groupId: v.id("studyGroups") },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);
    if (!isCourseOwner(user, course)) {
      throw new Error("Only the course instructor can archive this group");
    }
    if (group.isArchived === true) {
      throw new Error("This group is already archived");
    }
    await ctx.db.patch(group._id, { isArchived: true });
    await logAudit(ctx, {
      actorId: user._id,
      action: "group.archive",
      targetType: "studyGroup",
      targetId: group._id,
      details: { courseId: group.courseId },
    });
    return null;
  },
});

export const unarchiveGroup = mutation({
  args: { groupId: v.id("studyGroups") },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireUser(ctx);
    const group = await loadGroup(ctx, args.groupId);
    const course = await requireCourseAccess(ctx, user, group.courseId);
    if (!isCourseOwner(user, course)) {
      throw new Error("Only the course instructor can reopen this group");
    }
    if (group.isArchived !== true) {
      throw new Error("This group is not archived");
    }
    await ctx.db.patch(group._id, { isArchived: false });
    await logAudit(ctx, {
      actorId: user._id,
      action: "group.unarchive",
      targetType: "studyGroup",
      targetId: group._id,
      details: { courseId: group.courseId },
    });
    return null;
  },
});