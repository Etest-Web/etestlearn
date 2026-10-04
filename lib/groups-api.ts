import { makeFunctionReference } from "convex/server";
import type {
  AccessibleCourse,
  BrowseGroupSummary,
  GroupDetail,
  GroupJoinRequestItem,
  GroupMemberItem,
  GroupMessageCursor,
  GroupMessagePage,
  GroupPrimaryAction,
  GroupRelationship,
  JoinGroupResult,
  LeaveGroupResult,
  MyGroupStats,
  MyGroupSummary,
  ReviewJoinRequestResult,
} from "./groups";

/**
 * Typed bindings for `convex/groups.ts`.
 *
 * The rest of the dashboard reaches Convex through `api.<module>.<fn>`, but
 * `convex/_generated/api` is produced by `npx convex dev` and does not list this
 * module yet, so those references would not compile. `makeFunctionReference`
 * builds the identical wire reference from a string — the same workaround
 * `lib/durable-rate-limit.ts` already uses — and pins the argument and return
 * types from `lib/groups.ts`, which is the same contract the Convex handlers
 * are annotated against.
 *
 * Run `npx convex dev` and delete this file once codegen has caught up; the
 * page and the test suite then go back to `api.groups.*`.
 */

type Args = Record<string, unknown>;

export const groupsApi = {
  listMyGroups: makeFunctionReference<
    "query",
    { limit?: number },
    MyGroupSummary[]
  >("groups:listMyGroups"),

  listMyAccessibleCourses: makeFunctionReference<
    "query",
    { limit?: number },
    AccessibleCourse[]
  >("groups:listMyAccessibleCourses"),

  browseGroupsForCourse: makeFunctionReference<
    "query",
    { courseId: string },
    BrowseGroupSummary[]
  >("groups:browseGroupsForCourse"),

  getGroup: makeFunctionReference<"query", { groupId: string }, GroupDetail>(
    "groups:getGroup",
  ),

  getGroupRelationship: makeFunctionReference<
    "query",
    { groupId: string },
    {
      relationship: GroupRelationship;
      action: GroupPrimaryAction;
      badgeLabel: string;
    }
  >("groups:getGroupRelationship"),

  listMembers: makeFunctionReference<
    "query",
    { groupId: string; limit?: number },
    { members: GroupMemberItem[] }
  >("groups:listMembers"),

  listMessages: makeFunctionReference<
    "query",
    { groupId: string; limit?: number; after?: GroupMessageCursor },
    GroupMessagePage
  >("groups:listMessages"),

  listPendingRequests: makeFunctionReference<
    "query",
    { groupId: string; limit?: number },
    { requests: GroupJoinRequestItem[] }
  >("groups:listPendingRequests"),

  getMyGroupStats: makeFunctionReference<
    "query",
    Record<string, never>,
    MyGroupStats
  >("groups:getMyGroupStats"),

  createGroup: makeFunctionReference<
    "mutation",
    {
      courseId: string;
      name: string;
      description?: string;
      isPrivate?: boolean;
    },
    string
  >("groups:createGroup"),

  updateGroup: makeFunctionReference<
    "mutation",
    { groupId: string; name?: string; description?: string },
    null
  >("groups:updateGroup"),

  joinGroup: makeFunctionReference<
    "mutation",
    { groupId: string; message?: string },
    JoinGroupResult
  >("groups:joinGroup"),

  cancelJoinRequest: makeFunctionReference<
    "mutation",
    { requestId: string },
    null
  >("groups:cancelJoinRequest"),

  reviewJoinRequest: makeFunctionReference<
    "mutation",
    { requestId: string; decision: "approve" | "decline" },
    ReviewJoinRequestResult
  >("groups:reviewJoinRequest"),

  leaveGroup: makeFunctionReference<"mutation", Args, LeaveGroupResult>(
    "groups:leaveGroup",
  ),

  promoteMember: makeFunctionReference<"mutation", Args, null>(
    "groups:promoteMember",
  ),

  demoteMember: makeFunctionReference<"mutation", Args, null>(
    "groups:demoteMember",
  ),

  postMessage: makeFunctionReference<
    "mutation",
    { groupId: string; body: string },
    string
  >("groups:postMessage"),

  archiveGroup: makeFunctionReference<"mutation", Args, null>(
    "groups:archiveGroup",
  ),

  unarchiveGroup: makeFunctionReference<"mutation", Args, null>(
    "groups:unarchiveGroup",
  ),
} as const;