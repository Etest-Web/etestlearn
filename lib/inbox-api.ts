import { makeFunctionReference } from "convex/server";
import type {
  DiscussionActivityView,
  MessagePage,
  NotificationView,
  PersonOption,
  ThreadSummary,
  UnreadCounts,
} from "@/convex/inbox";

/**
 * Client-side bindings for `convex/inbox.ts`.
 *
 * These are `makeFunctionReference` rather than `api.inbox.*` because
 * `convex/_generated/api.d.ts` is produced by `npx convex dev` and does not list
 * the new module yet — the generated types would not compile until codegen runs
 * again. Same workaround, and same reasoning, as `lib/durable-rate-limit.ts`.
 *
 * The wire names below are exactly the ones codegen will emit
 * (`modulePath:exportName`), so once `npx convex dev` has run this whole file can
 * be deleted and every call site rewritten to `api.inbox.<fn>` with no other
 * change.
 *
 * Keeping the references in one file rather than inline at each call site means
 * the "regenerate" note has exactly one home, and the arg/result types are
 * imported from the Convex module itself instead of being copied and drifting.
 */

export const inboxApi = {
  listThreads: makeFunctionReference<
    "query",
    { limit?: number },
    ThreadSummary[]
  >("inbox:listThreads"),

  getMessages: makeFunctionReference<
    "query",
    { threadId: string; limit?: number; before?: number },
    MessagePage
  >("inbox:getMessages"),

  listNotifications: makeFunctionReference<
    "query",
    { limit?: number; unreadOnly?: boolean },
    NotificationView[]
  >("inbox:listNotifications"),

  getUnreadCounts: makeFunctionReference<"query", Record<string, never>, UnreadCounts>(
    "inbox:getUnreadCounts",
  ),

  listDiscussionActivity: makeFunctionReference<
    "query",
    { limit?: number },
    DiscussionActivityView[]
  >("inbox:listDiscussionActivity"),

  searchPeople: makeFunctionReference<
    "query",
    { query: string; limit?: number },
    PersonOption[]
  >("inbox:searchPeople"),

  startThread: makeFunctionReference<
    "mutation",
    { recipientId: string },
    { threadId: string; created: boolean }
  >("inbox:startThread"),

  sendMessage: makeFunctionReference<
    "mutation",
    { threadId: string; body: string },
    { messageId: string; sentAt: number }
  >("inbox:sendMessage"),

  markThreadRead: makeFunctionReference<
    "mutation",
    { threadId: string },
    { threadId: string; lastReadAt: number }
  >("inbox:markThreadRead"),

  markAllRead: makeFunctionReference<
    "mutation",
    Record<string, never>,
    { threadsMarked: number }
  >("inbox:markAllRead"),

  markNotificationRead: makeFunctionReference<
    "mutation",
    { notificationId: string },
    { notificationId: string }
  >("inbox:markNotificationRead"),

  markAllNotificationsRead: makeFunctionReference<
    "mutation",
    Record<string, never>,
    { updated: number }
  >("inbox:markAllNotificationsRead"),
};

export type {
  DiscussionActivityView,
  MessagePage,
  MessageView,
  NotificationView,
  NotificationType,
  PersonOption,
  PersonSummary,
  ThreadSummary,
  UnreadCounts,
} from "@/convex/inbox";
