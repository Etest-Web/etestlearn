"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BadgeCheck,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Flame,
  GraduationCap,
  Loader2,
  Mail,
  MessageSquare,
  MessagesSquare,
  PencilLine,
  Search,
  Send,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";

import { inboxApi } from "@/lib/inbox-api";
import type {
  DiscussionActivityView,
  MessageView,
  NotificationType,
  NotificationView,
  PersonOption,
  ThreadSummary,
} from "@/lib/inbox-api";
import { buildNotificationPreview, formatUnreadBadge, groupNotificationsByDay } from "@/lib/inbox";
import { cn, formatRelativeTime } from "@/lib/utils";
import { PageShell } from "@/components/dashboard-shell";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Tab keys, kept in one place because they are also the `?tab=` values. */
const TABS = ["messages", "notifications", "replies"] as const;
type TabKey = (typeof TABS)[number];

const DEFAULT_TAB: TabKey = "messages";

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TABS as readonly string[]).includes(value);
}

const MESSAGE_PAGE_SIZE = 50;
const FEED_PAGE_SIZE = 50;
/** Mirrors `MAX_MESSAGE_LENGTH` in convex/inbox.ts — the client refuses first. */
const MAX_DRAFT_LENGTH = 2000;

const ROLE_LABELS: Record<"student" | "instructor" | "admin", string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Admin",
};

/**
 * One icon per notification type, so the feed is scannable and the type is
 * legible to a screen reader through the item's label rather than the picture
 * alone.
 */
const NOTIFICATION_ICONS: Record<
  NotificationType,
  { icon: typeof Award; tint: string; verb: string }
> = {
  certificate_earned: {
    icon: Award,
    tint: "text-brand-ink bg-brand/10",
    verb: "Certificate earned",
  },
  course_completed: {
    icon: GraduationCap,
    tint: "text-emerald-500 bg-emerald-500/10",
    verb: "Course completed",
  },
  quiz_graded: {
    icon: ClipboardCheck,
    tint: "text-blue-500 bg-blue-500/10",
    verb: "Quiz graded",
  },
  streak_milestone: {
    icon: Flame,
    tint: "text-orange-500 bg-orange-500/10",
    verb: "Streak milestone",
  },
  discussion_reply: {
    icon: MessagesSquare,
    tint: "text-sky-500 bg-sky-500/10",
    verb: "Discussion reply",
  },
  task_assigned: {
    icon: ClipboardList,
    tint: "text-amber-500 bg-amber-500/10",
    verb: "Task assigned",
  },
  task_graded: {
    icon: CheckCircle2,
    tint: "text-emerald-500 bg-emerald-500/10",
    verb: "Task graded",
  },
  group_invite: {
    icon: Users,
    tint: "text-indigo-500 bg-indigo-500/10",
    verb: "Group invite",
  },
  friend_request: {
    icon: UserPlus,
    tint: "text-brand-ink bg-brand/10",
    verb: "Friend request",
  },
  friend_accepted: {
    icon: UserCheck,
    tint: "text-emerald-500 bg-emerald-500/10",
    verb: "Friend accepted",
  },
  course_purchased: {
    icon: BookOpen,
    tint: "text-brand-ink bg-brand/10",
    verb: "Course enrolled",
  },
  course_reminder: {
    icon: Clock,
    tint: "text-amber-500 bg-amber-500/10",
    verb: "Course reminder",
  },
  direct_message: {
    icon: MessageSquare,
    tint: "text-violet-500 bg-violet-500/10",
    verb: "New message",
  },
  instructor_application_reviewed: {
    icon: BadgeCheck,
    // Success rather than the neutral plate: this is the outcome an applicant
    // has been waiting on, and it should not read like routine activity.
    tint: "text-success bg-success/10",
    verb: "Instructor application reviewed",
  },
};

// ─── Small shared pieces ────────────────────────────────────────────────────

/** Tinted square holding a type icon — the feed's list treatment. */
function IconTile({
  icon: Icon,
  tint,
  className,
}: {
  icon: typeof Award;
  tint: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-sm",
        tint,
        className,
      )}
    >
      <Icon size={20} />
    </span>
  );
}

function PersonAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

/** Role as a word, never colour alone. */
function RolePill({ role }: { role: "student" | "instructor" | "admin" }) {
  return (
    <span className="rounded-sm border border-rule bg-surface-sunken px-2 py-1 text-xs font-bold text-muted-foreground">
      {ROLE_LABELS[role]}
    </span>
  );
}

/** Humanised timestamp with the machine-readable value kept in `dateTime`. */
function TimeAgo({ at, className }: { at: number; className?: string }) {
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={new Date(at).toLocaleString()}
      className={className}
    >
      {formatRelativeTime(at)}
    </time>
  );
}

/**
 * A thread that has never had a message has no timestamp — formatting epoch 0
 * would print "1 Jan 1970", so the absence is stated instead.
 */
function ThreadTime({
  at,
  className,
}: {
  at: number | null;
  className?: string;
}) {
  if (at === null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>New</span>;
  }
  return <TimeAgo at={at} className={className} />;
}

// ─── Page ───────────────────────────────────────────────────────────────────

function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab and selected thread live in the URL, so back/forward and a shared link
  // both land on the same view. Invalid values fall back rather than rendering
  // an empty panel.
  const tabParam = searchParams.get("tab");
  const tab: TabKey = isTabKey(tabParam) ? tabParam : DEFAULT_TAB;
  const selectedThreadId = searchParams.get("thread");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // `requireUser` in every inbox query, so they stay unsubscribed until the
  // Convex `users` row exists — otherwise a first load (webhook still in flight,
  // or `EnsureCurrentUser` about to create it) throws "Not authenticated".
  const dbUser = useQuery(api.users.getCurrentUser);
  const counts = useQuery(inboxApi.getUnreadCounts, dbUser ? {} : "skip");
  const threads = useQuery(inboxApi.listThreads, dbUser ? { limit: 50 } : "skip");

  const unreadMessages = counts?.messages ?? 0;
  const unreadNotifications = counts?.notifications ?? 0;

  // `push` for the tab so the browser Back button steps between tabs; `replace`
  // for the thread so opening a conversation does not bury the previous tab
  // under a dozen identical history entries.
  const selectTab = (next: string) => {
    const key = isTabKey(next) ? next : DEFAULT_TAB;
    if (key === tab) return;
    router.push(`/dashboard/inbox?tab=${key}`, { scroll: false });
  };

  const selectThread = (threadId: string | null) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (threadId) params.set("thread", threadId);
    router.replace(`/dashboard/inbox?${params.toString()}`, { scroll: false });
  };

  const closeConversation = () => selectThread(null);

  const unreadSummary =
    unreadMessages + unreadNotifications === 0
      ? "You are all caught up across messages, notifications and course replies."
      : `${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"} and ${unreadNotifications} unread notification${
          unreadNotifications === 1 ? "" : "s"
        }.`;

  return (
    // The house shell is `max-w-6xl`; the `inbox` width is `max-w-7xl` because
    // a two-pane mailbox needs the room — at 6xl the conversation pane collapses
    // to roughly the width of a phone on a desktop screen.
    <PageShell width="inbox">
      <PageHeader
        title="Inbox"
        description={<span className="tabular">{unreadSummary}</span>}
      />

      {/* Both badge counts change in place, so they are announced politely
          rather than only being visible. */}
      <p aria-live="polite" className="sr-only">
        {unreadMessages} unread messages. {unreadNotifications} unread
        notifications.
      </p>

      <Tabs value={tab} onValueChange={selectTab}>
        {/* Three triggers with badges do not fit 375px. Let them scroll
            horizontally inside the page padding instead of widening the
            document. `segmented` because these are peer views of the same
            mailbox rather than separate sections of the page. */}
        <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="segmented" className="touch-target">
            <TabsTrigger value="messages">
              <Mail size={16} />
              Messages
              {unreadMessages > 0 ? (
                <UnreadCount count={unreadMessages} label="unread messages" />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell size={16} />
              Notifications
              {unreadNotifications > 0 ? (
                <UnreadCount
                  count={unreadNotifications}
                  label="unread notifications"
                />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="replies">
              <MessagesSquare size={16} />
              Course replies
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="messages" className="mt-0 outline-none">
          <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] items-start">
            <ThreadListPane
              threads={threads}
              unreadTotal={unreadMessages}
              selectedThreadId={selectedThreadId}
              onSelect={selectThread}
              onNewMessage={() => setDialogOpen(true)}
            />
            <ConversationPane
              threadId={selectedThreadId}
              threads={threads}
              onBack={closeConversation}
              onNewMessage={() => setDialogOpen(true)}
            />
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-0 outline-none">
          <NotificationsPane
            unreadOnly={unreadOnly}
            onUnreadOnlyChange={setUnreadOnly}
            unreadCount={unreadNotifications}
            onNavigate={(href) => router.push(href)}
          />
        </TabsContent>

        <TabsContent value="replies" className="mt-0 outline-none">
          <RepliesPane />
        </TabsContent>
      </Tabs>

      <NewMessageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onOpened={(threadId) => selectThread(threadId)}
      />
    </PageShell>
  );
}

/** Count chip inside a tab trigger. The dot is decorative; the label is text. */
function UnreadCount({ count, label }: { count: number; label: string }) {
  return (
    <Badge variant="secondary" className="tabular gap-1.5">
      <span aria-hidden className="size-1.5 rounded-full bg-brand" />
      {formatUnreadBadge(count)}
      <span className="sr-only"> {label}</span>
    </Badge>
  );
}

// ─── Messages tab ───────────────────────────────────────────────────────────

function ThreadListPane({
  threads,
  unreadTotal,
  selectedThreadId,
  onSelect,
  onNewMessage,
}: {
  threads: ThreadSummary[] | undefined;
  /** The authoritative badge count, not a sum over the loaded page. */
  unreadTotal: number;
  selectedThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNewMessage: () => void;
}) {
  const markAllRead = useMutation(inboxApi.markAllRead);
  const [markingAll, setMarkingAll] = useState(false);

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const result = await markAllRead({});
      toast.success(
        result.threadsMarked === 0
          ? "Nothing left to mark as read"
          : `Marked ${result.threadsMarked} conversation${result.threadsMarked === 1 ? "" : "s"} as read`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not mark conversations as read",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  // On mobile only one pane is on screen: opening a conversation replaces the
  // list, and the conversation's own header carries the way back (this pane is
  // hidden at that width, so a second back button here would be unreachable).
  const visibility = selectedThreadId ? "hidden md:flex" : "flex";

  return (
    <section
      aria-label="Conversations"
      className={cn(
        "flex-col overflow-hidden border border-rule bg-card",
        visibility,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule p-4">
        <h2 className="display-subheading text-base text-foreground">Messages</h2>
        <div className="flex items-center gap-2">
          {unreadTotal > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Mark all read
            </Button>
          ) : null}
          <Button size="sm" onClick={onNewMessage} aria-label="New message">
            <PencilLine size={14} />
            <span className="hidden sm:inline">New message</span>
          </Button>
        </div>
      </header>

      {threads === undefined ? (
        <ThreadListSkeleton />
      ) : threads.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Mail}
            title="No conversations yet"
            description="Message a classmate, an instructor or an admin directly — everyone on Glypha Learn can be reached from here."
            action={
              <Button onClick={onNewMessage}>
                <PencilLine size={16} />
                Start a conversation
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="max-h-[32rem] flex-1 overflow-y-auto">
          {threads.map((thread) => {
            const isSelected = thread.threadId === selectedThreadId;
            const unread = thread.unreadCount > 0;
            return (
              <li key={thread.threadId} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(thread.threadId)}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                    isSelected
                      ? "bg-brand/10"
                      : "hover:bg-surface-sunken",
                  )}
                >
                  <PersonAvatar
                    name={thread.name}
                    imageUrl={thread.imageUrl}
                    className={cn(unread && "ring-2 ring-brand ring-offset-2 ring-offset-card")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          unread ? "font-bold text-foreground" : "font-semibold text-foreground",
                        )}
                      >
                        {thread.name}
                      </span>
                      <ThreadTime
                        at={thread.lastMessageAt}
                        className="shrink-0 text-xs text-muted-foreground"
                      />
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm text-muted-foreground",
                          unread && "font-medium text-foreground",
                        )}
                      >
                        {thread.lastMessagePreview ? (
                          <>
                            {thread.lastMessageIsMine ? "You: " : ""}
                            {thread.lastMessagePreview}
                          </>
                        ) : (
                          "No messages yet — say hello"
                        )}
                      </span>
                      {unread ? (
                        <span className="tabular flex shrink-0 items-center gap-1 text-xs font-bold text-brand-ink">
                          <span
                            aria-hidden
                            className="size-2 rounded-full bg-brand"
                          />
                          {thread.unreadCapped
                            ? `${formatUnreadBadge(thread.unreadCount)}+`
                            : `${thread.unreadCount} new`}
                          <span className="sr-only">
                            {" "}
                            unread messages in this conversation
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ThreadListSkeleton() {
  return (
    <ul className="divide-y divide-rule" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2 rounded-sm" />
            <Skeleton className="h-3 w-4/5 rounded-sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConversationPane({
  threadId,
  threads,
  onBack,
  onNewMessage,
}: {
  threadId: string | null;
  threads: ThreadSummary[] | undefined;
  onBack: () => void;
  onNewMessage: () => void;
}) {
  // The header needs the other participant, which only `listThreads` resolves —
  // and it doubles as the ownership check: a thread id in the URL that is not in
  // this list is not ours, so `getMessages` is never even called for it (the
  // server would refuse, and a thrown query error would replace the page with an
  // error boundary instead of this message).
  const thread = threads?.find((candidate) => candidate.threadId === threadId) ?? null;
  const visible = threadId ? "flex" : "hidden md:flex";

  const paneClass = cn(
    "flex-col overflow-hidden border border-rule bg-card",
    visible,
  );

  if (!threadId) {
    return (
      <section aria-label="Conversation" className={paneClass}>
        <div className="p-6">
          <EmptyState
            icon={MessageSquare}
            title="Pick a conversation"
            description="Choose a thread on the left to read it and reply, or start a new one with anyone on the platform."
            action={
              <Button onClick={onNewMessage}>
                <PencilLine size={16} />
                New message
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  if (threads === undefined) {
    return (
      <section
        aria-label="Conversation"
        className={cn(paneClass, "overflow-hidden")}
        aria-busy
      >
        <header className="flex items-center gap-3 border-b border-rule p-4">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-3.5 w-32 rounded-sm" />
        </header>
        <ConversationSkeleton />
        <span className="sr-only">Loading conversation…</span>
      </section>
    );
  }

  if (!thread) {
    return (
      <section aria-label="Conversation" className={paneClass}>
        <div className="p-6">
          <EmptyState
            icon={MessageSquare}
            title="Conversation not found"
            description="This conversation is no longer available to you. It may have been opened with the wrong link."
            tone="warning"
            action={
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft size={16} />
                Back to conversations
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Conversation"
      className={cn(paneClass, "overflow-hidden")}
    >
      <header className="flex items-center gap-3 border-b border-rule p-4">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label="Back to conversations"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </Button>
        <PersonAvatar name={thread.name} imageUrl={thread.imageUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-foreground">{thread.name}</p>
          <div className="flex items-center gap-2">
            <RolePill role={thread.role} />
            <ThreadTime at={thread.lastMessageAt} className="text-xs text-muted-foreground" />
          </div>
        </div>
      </header>

      <Conversation threadId={threadId} unreadCount={thread.unreadCount} />
    </section>
  );
}

type OptimisticMessage = {
  key: string;
  body: string;
  createdAt: number;
  /** True once the server accepted it; retired when the query delivers it. */
  settled: boolean;
};

function Conversation({
  threadId,
  unreadCount,
}: {
  threadId: string;
  /** Passed down from the page's single `listThreads` subscription. */
  unreadCount: number;
}) {
  // Mark the thread read whenever it is open and has something unread. The ref
  // stops a repeat while one is already in flight; resetting it per thread means
  // coming back to a conversation re-checks rather than trusting a stale answer.
  const markThreadRead = useMutation(inboxApi.markThreadRead);
  const markingRef = useRef<string | null>(null);

  useEffect(() => {
    markingRef.current = null;
  }, [threadId]);

  useEffect(() => {
    if (unreadCount === 0) return;
    if (markingRef.current === threadId) return;
    markingRef.current = threadId;
    // A failed auto-mark is not worth a toast — the badge simply stays lit,
    // which is honest feedback and lets the reader retry by re-opening.
    void markThreadRead({ threadId }).catch(() => undefined);
  }, [threadId, unreadCount, markThreadRead]);

  // Newest page is always live; older pages are pulled in on demand and
  // accumulated here, because a query hook cannot page on its own.
  const [olderBefore, setOlderBefore] = useState<number | null>(null);
  const [olderMessages, setOlderMessages] = useState<MessageView[]>([]);
  const latest = useQuery(inboxApi.getMessages, {
    threadId,
    limit: MESSAGE_PAGE_SIZE,
  });
  const older = useQuery(
    inboxApi.getMessages,
    olderBefore === null
      ? "skip"
      : { threadId, before: olderBefore, limit: MESSAGE_PAGE_SIZE },
  );

  // A new conversation starts a fresh history.
  useEffect(() => {
    setOlderBefore(null);
    setOlderMessages([]);
  }, [threadId]);

  useEffect(() => {
    if (!older) return;
    setOlderMessages((previous) => {
      const seen = new Set(previous.map((message) => message.id));
      const added = older.messages.filter((message) => !seen.has(message.id));
      // Returning the same array when nothing is new keeps this from
      // re-rendering on every unrelated query update.
      return added.length > 0 ? [...previous, ...added] : previous;
    });
  }, [older]);

  const messages = useMemo(() => {
    const newest = latest?.messages ?? [];
    const seen = new Set(newest.map((message) => message.id));
    return [...olderMessages.filter((message) => !seen.has(message.id)), ...newest];
  }, [olderMessages, latest]);

  const sendMessage = useMutation(inboxApi.sendMessage);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);

  // Retire bubbles the server has caught up with, so the optimistic render does
  // not duplicate the real message.
  useEffect(() => {
    if (!latest || latest.messages.length === 0) return;
    const serverTimes = latest.messages.map((message) => message.createdAt);
    setOptimistic((previous) => {
      const next = previous.filter(
        (entry) =>
          !(entry.settled && serverTimes.some((createdAt) => createdAt >= entry.createdAt)),
      );
      return next.length === previous.length ? previous : next;
    });
  }, [latest]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0 || sending) return;

    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const createdAt = Date.now();
    // Optimistic: the bubble appears before the round trip, which is the whole
    // point of a message composer.
    setOptimistic((previous) => [...previous, { key, body, createdAt, settled: false }]);
    setDraft("");
    setSending(true);

    try {
      await sendMessage({ threadId, body });
      setOptimistic((previous) =>
        previous.map((entry) => (entry.key === key ? { ...entry, settled: true } : entry)),
      );
      // Deliberately no success toast: the bubble landing *is* the confirmation,
      // and a toast per message would teach people to dismiss them. Failures
      // below are loud, and the text is handed back.
    } catch (error) {
      setOptimistic((previous) => previous.filter((entry) => entry.key !== key));
      setDraft(body);
      toast.error(
        error instanceof Error ? error.message : "Your message could not be sent",
      );
    } finally {
      setSending(false);
    }
  }

  if (latest === undefined) {
    return <ConversationSkeleton />;
  }

  // The oldest page loaded so far is what decides whether a further one exists:
  // `latest` while nothing has been paged in, then the page we last asked for.
  const oldestPage = olderBefore === null ? latest : older;
  const canLoadOlder =
    (oldestPage?.hasMore ?? false) && (oldestPage?.nextBefore ?? null) !== null;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 max-h-[26rem] sm:max-h-[30rem] md:max-h-[32rem]">
        {messages.length === 0 && optimistic.length === 0 ? (
          <EmptyState
            icon={PencilLine}
            title="No messages yet"
            description="Say hello — this conversation has not started. Whoever you message will see it in their inbox straight away."
          />
        ) : (
          <>
            {canLoadOlder ? (
              <div className="flex justify-center pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOlderBefore(oldestPage?.nextBefore ?? null)}
                  disabled={older !== undefined && older.messages.length === 0}
                >
                  Load earlier messages
                </Button>
              </div>
            ) : null}
            <ul className="space-y-3">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const startsRun = !previous || previous.senderId !== message.senderId;
                return (
                  <li
                    key={message.id}
                    className={cn(
                      "flex items-end gap-2",
                      message.isMine ? "justify-end" : "justify-start",
                    )}
                  >
                    {!message.isMine ? (
                      <span className="w-8 shrink-0">
                        {startsRun ? (
                          <PersonAvatar
                            name={message.senderName}
                            imageUrl={message.senderImageUrl}
                            className="size-8"
                          />
                        ) : null}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-md px-4 py-2.5 sm:max-w-[70%]",
                        message.isMine
                          ? "rounded-br-sm bg-brand text-brand-foreground"
                          : "rounded-bl-sm bg-surface-sunken text-foreground",
                      )}
                    >
                      {!message.isMine && startsRun ? (
                        <p className="mb-1 flex items-center gap-2 text-xs font-bold text-muted-foreground">
                          {message.senderName}
                          <RolePill role={message.senderRole} />
                        </p>
                      ) : null}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.body}
                      </p>
                      <TimeAgo
                        at={message.createdAt}
                        className={cn(
                          "mt-1 block text-[11px]",
                          message.isMine
                            ? "text-brand-foreground/70"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                  </li>
                );
              })}
              {optimistic.map((entry) => (
                <li key={entry.key} className="flex justify-end">
                  <div className="max-w-[85%] rounded-md rounded-br-sm bg-brand/70 px-4 py-2.5 text-brand-foreground sm:max-w-[70%]">
                    <p className="text-sm whitespace-pre-wrap break-words">{entry.body}</p>
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-brand-foreground/80">
                      <Loader2 size={11} className="animate-spin" />
                      Sending…
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <span aria-live="polite" className="sr-only">
              {messages.length} message{messages.length === 1 ? "" : "s"} in this
              conversation.
            </span>
          </>
        )}
      </div>

      <Separator />

      <form onSubmit={handleSubmit} className="p-3 flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="dm-composer" className="sr-only">
            Write a message
          </Label>
          <Textarea
            id="dm-composer"
            value={draft}
            rows={1}
            maxLength={MAX_DRAFT_LENGTH}
            placeholder="Write a message…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line — the convention every
              // other messenger uses. `isComposing` stops it firing while an IME
              // is mid-word, and `handleSubmit` ignores Enter while a send is in
              // flight, so neither can produce a duplicate.
              if (event.key === "Enter" && !event.shiftKey) {
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="min-h-11 max-h-32 resize-none"
          />
        </div>
        {/* The send button is the control that fires the mutation, so it is what
            disables while pending. The composer deliberately stays live so the
            next message can be typed while this one is in flight. */}
        <Button
          type="submit"
          aria-label="Send message"
          disabled={sending || draft.trim().length === 0}
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          {/* `hidden` is display:none, which is stripped from the accessibility
              tree — hence the explicit aria-label above rather than relying on
              this text at small widths. */}
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
      <p className="px-3 pb-3 text-xs text-muted-foreground">
        {draft.length}/{MAX_DRAFT_LENGTH} characters. Enter sends, Shift + Enter
        adds a line break.
      </p>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex-1 space-y-4 p-4" aria-hidden>
      <div className="flex justify-start">
        <Skeleton className="h-14 w-52 rounded-sm" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-14 w-40 rounded-sm" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-14 w-64 rounded-sm" />
      </div>
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

// ─── Notifications tab ──────────────────────────────────────────────────────

function NotificationsPane({
  unreadOnly,
  onUnreadOnlyChange,
  unreadCount,
  onNavigate,
}: {
  unreadOnly: boolean;
  onUnreadOnlyChange: (next: boolean) => void;
  unreadCount: number;
  onNavigate: (href: string) => void;
}) {
  // Same `requireUser` gate as the page: identical query, so Convex shares the
  // subscription rather than adding one.
  const dbUser = useQuery(api.users.getCurrentUser);
  const notifications = useQuery(
    inboxApi.listNotifications,
    dbUser ? { limit: FEED_PAGE_SIZE, unreadOnly } : "skip",
  );
  const markNotificationRead = useMutation(inboxApi.markNotificationRead);
  const markAllNotificationsRead = useMutation(inboxApi.markAllNotificationsRead);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  // `Date.now()` is read once per render pass rather than per item, so every
  // "5m ago" in a group is measured against the same instant. Grouping is O(n)
  // over a capped page, so it is not worth memoising against a value that
  // changes every render.
  const groups = groupNotificationsByDay(notifications ?? [], Date.now());

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const result = await markAllNotificationsRead({});
      toast.success(
        result.updated === 0
          ? "You have no unread notifications"
          : `Marked ${result.updated} notification${result.updated === 1 ? "" : "s"} as read`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not mark notifications as read",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleOpen(item: NotificationView) {
    if (markingId) return;
    // Already read: just follow the link, and say nothing — a toast claiming
    // something was marked would be a lie.
    if (item.isRead) {
      if (item.href) onNavigate(item.href);
      return;
    }

    setMarkingId(item.id);
    try {
      await markNotificationRead({ notificationId: item.id });
      // The row is read by the time the route changes, so coming back to the tab
      // shows it in the right state rather than re-toasting.
      if (item.href) onNavigate(item.href);
      else toast.success("Marked as read");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not mark as read",
      );
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter pills, not tabs — so they carry `aria-pressed` rather than
            `aria-selected`. */}
        <div className="flex items-center gap-2" role="group" aria-label="Filter notifications">
          <FilterPill
            active={!unreadOnly}
            onClick={() => onUnreadOnlyChange(false)}
            label="All"
          />
          <FilterPill
            active={unreadOnly}
            onClick={() => onUnreadOnlyChange(true)}
            label={`Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={markingAll || unreadCount === 0}
        >
          {markingAll ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Mark all read
        </Button>
      </div>

      {notifications === undefined ? (
        <NotificationSkeleton />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? "Nothing unread" : "No notifications yet"}
          description={
            unreadOnly
              ? "You have read everything. Switch to All to look back through your history."
              : "Course completions, quiz grades, certificates and replies to your discussions land here as they happen."
          }
          action={
            unreadOnly ? (
              <Button variant="outline" onClick={() => onUnreadOnlyChange(false)}>
                Show all notifications
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              <h2 id={`group-${group.key}`} className="rule-heading eyebrow mb-3">
                <span className="shrink-0">{group.label}</span>
              </h2>
              <ul className="divide-y divide-rule overflow-hidden border border-rule bg-card">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NotificationRow
                      item={item}
                      busy={markingId === item.id}
                      onOpen={() => handleOpen(item)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-sm border px-3 py-1.5 text-sm font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90"
          : "border-rule bg-card text-muted-foreground hover:bg-surface-sunken",
      )}
    >
      {label}
    </button>
  );
}

function NotificationRow({
  item,
  busy,
  onOpen,
}: {
  item: NotificationView;
  busy: boolean;
  onOpen: () => void;
}) {
  const { icon, tint, verb } = NOTIFICATION_ICONS[item.type] ?? NOTIFICATION_ICONS.friend_request;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      aria-label={`${item.isRead ? "Read" : "Unread"}: ${verb}. ${item.title}. ${item.href ? "Open" : "Mark as read"}.`}
      className={cn(
        "flex w-full items-start gap-4 p-4 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-60",
        // Unread is carried by the tinted row *and* a dot *and* the sr-only
        // word in the label — never by colour on its own.
        !item.isRead && "bg-brand/5",
      )}
    >
      <IconTile icon={icon} tint={tint} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="eyebrow">{verb}</span>
          {item.actor ? (
            <PersonAvatar
              name={item.actor.name}
              imageUrl={item.actor.imageUrl}
              className="size-5"
            />
          ) : null}
          <TimeAgo at={item.createdAt} className="text-xs text-muted-foreground" />
        </span>
        <span
          className={cn(
            "mt-1 block text-sm leading-body text-foreground",
            item.isRead ? "font-medium" : "font-bold",
          )}
        >
          {item.title}
        </span>
        {item.body ? (
          <span className="mt-1 block text-sm leading-body text-muted-foreground line-clamp-2">
            {buildNotificationPreview(item.body)}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 pt-1">
        {!item.isRead ? (
          <span className="text-xs font-bold text-brand-ink">
            <span aria-hidden className="me-1 inline-block size-2 rounded-full bg-brand align-middle" />
            New
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Read</span>
        )}
        {item.href ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-brand-ink">
            Open
            <ArrowRight size={12} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

function NotificationSkeleton() {
  return (
    <ul aria-hidden className="divide-y divide-rule overflow-hidden border border-rule bg-card">
      {[0, 1, 2, 3, 4].map((index) => (
        <li key={index} className="flex items-start gap-4 p-4">
          <Skeleton className="size-10 rounded-sm" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3 rounded-sm" />
            <Skeleton className="h-3.5 w-3/4 rounded-sm" />
            <Skeleton className="h-3 w-1/2 rounded-sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Course replies tab ─────────────────────────────────────────────────────

function RepliesPane() {
  const activity = useQuery(inboxApi.listDiscussionActivity, { limit: 25 });

  if (activity === undefined) {
    return (
      <ul aria-hidden className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="space-y-3 border border-rule bg-card p-5"
          >
            <Skeleton className="h-3 w-1/3 rounded-sm" />
            <Skeleton className="h-4 w-2/3 rounded-sm" />
            <Skeleton className="h-3 w-4/5 rounded-sm" />
          </li>
        ))}
      </ul>
    );
  }

  if (activity.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="No course replies yet"
        description="Start a thread in a course you are enrolled in, or reply to one, and it will show up here with the latest message."
        action={
          <Button render={<Link href="/dashboard/courses" />}>
            Go to my lessons
            <ArrowRight size={14} />
          </Button>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {activity.map((item) => (
        <li key={item.threadId}>
          <ReplyCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ReplyCard({ item }: { item: DiscussionActivityView }) {
  return (
    <Link
      href={`/dashboard/courses/${item.courseSlug}/discussions`}
      className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <article className="border border-rule bg-card p-5 transition-colors hover:border-rule-strong">
        <div className="flex items-start gap-3">
          <IconTile icon={MessagesSquare} tint="text-sky-500 bg-sky-500/10" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{item.courseTitle}</p>
            <h3 className="display-subheading mt-1 text-lg leading-snug text-foreground">
              {item.title}
            </h3>
            {item.lastMessagePreview ? (
              <p className="mt-2 text-sm leading-body text-muted-foreground line-clamp-2">
                <span className="font-semibold text-foreground">
                  {item.lastMessageAuthorName ?? "Someone"}:
                </span>{" "}
                {item.lastMessagePreview}
              </p>
            ) : (
              <p className="mt-2 text-sm leading-body italic text-muted-foreground">
                No replies yet — be the first to answer.
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
          <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1",
                item.createdByMe
                  ? "border-brand/30 bg-brand/10 text-brand-ink"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-500/90",
              )}
            >
              {item.createdByMe ? <PencilLine size={14} /> : <MessagesSquare size={14} />}
              {item.createdByMe ? "You started this" : "You replied"}
            </span>
            {item.lastMessageAt ? (
              <TimeAgo at={item.lastMessageAt} />
            ) : null}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-brand-ink">
            Open discussion
            <ArrowRight size={14} />
          </span>
        </div>
      </article>
    </Link>
  );
}

// ─── New message dialog ─────────────────────────────────────────────────────

function NewMessageDialog({
  open,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: (threadId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const startThread = useMutation(inboxApi.startThread);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // "skip" rather than an empty-string query: the server rejects anything under
  // two characters, and this keeps the client from asking at all.
  const results = useQuery(
    inboxApi.searchPeople,
    term.trim().length >= 2 ? { query: term, limit: 8 } : "skip",
  );

  // Reopening should not come back with the previous search still in the box.
  useEffect(() => {
    if (open) setTerm("");
  }, [open]);

  async function handlePick(person: PersonOption) {
    if (openingId) return;
    setOpeningId(person.id);
    try {
      if (person.existingThreadId) {
        onOpened(person.existingThreadId);
        onOpenChange(false);
        return;
      }
      const result = await startThread({ recipientId: person.id });
      toast.success(`Conversation with ${person.name} ready`);
      onOpened(result.threadId);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open that conversation",
      );
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="display-subheading text-lg">New message</DialogTitle>
          <DialogDescription>
            Search for a learner, instructor or admin by name. Type at least two
            characters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dm-search">Search by name</Label>
            <div className="relative">
              <Search
                aria-hidden
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="dm-search"
                type="search"
                value={term}
                autoFocus
                onChange={(event) => setTerm(event.target.value)}
                placeholder="e.g. Ada"
                className="pl-10"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {term.trim().length < 2 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Start typing to find someone to message.
              </p>
            ) : results === undefined ? (
              <ul aria-hidden className="space-y-2">
                {[0, 1, 2].map((index) => (
                  <li key={index} className="flex items-center gap-3 p-2">
                    <Skeleton className="size-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-1/2 rounded-sm" />
                      <Skeleton className="h-3 w-1/4 rounded-sm" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nobody named &ldquo;{term.trim()}&rdquo; on this platform yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {results.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(person)}
                      disabled={openingId !== null}
                      className="flex w-full items-center gap-3 rounded-sm p-2 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
                    >
                      <PersonAvatar
                        name={person.name}
                        imageUrl={person.imageUrl}
                        className="size-9"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {person.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {ROLE_LABELS[person.role]}
                        </span>
                      </span>
                      {openingId === person.id ? (
                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                      ) : (
                        <span className="shrink-0 text-xs font-bold text-brand-ink">
                          {person.existingThreadId ? "Open" : "Message"}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Route ──────────────────────────────────────────────────────────────────

export default function DashboardInboxPage() {
  return (
    // `useSearchParams` needs a Suspense boundary; the fallback mirrors the real
    // layout so the page does not jump when the data arrives.
    <Suspense fallback={<InboxSkeleton />}>
      <InboxPage />
    </Suspense>
  );
}

function InboxSkeleton() {
  return (
    <PageShell width="inbox" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-72" />
      </div>
      <Skeleton className="h-11 w-64" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] items-start">
        <div className="overflow-hidden border border-rule bg-card">
          <div className="flex items-center justify-between border-b border-rule p-4">
            <Skeleton className="h-4 w-24 rounded-sm" />
            <Skeleton className="h-8 w-28 rounded-sm" />
          </div>
          <ul aria-hidden>
            {[0, 1, 2, 3].map((index) => (
              <li
                key={index}
                className="flex items-center gap-3 border-b border-rule p-4 last:border-b-0"
              >
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2 rounded-sm" />
                  <Skeleton className="h-3 w-4/5 rounded-sm" />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden border border-rule bg-card">
          <div className="flex items-center gap-3 border-b border-rule p-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-32 rounded-sm" />
          </div>
          <div className="space-y-4 p-4">
            <Skeleton className="h-14 w-52 rounded-sm" />
            <div className="flex justify-end">
              <Skeleton className="h-14 w-40 rounded-sm" />
            </div>
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading your inbox…</span>
    </PageShell>
  );
}
