"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  BookOpen,
  Check,
  Clock,
  Flame,
  Loader2,
  Mail,
  Search as SearchIcon,
  Sparkles,
  UserPlus,
  UserRoundMinus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { friendsApi } from "@/lib/friends-api";
import {
  MIN_SEARCH_LENGTH,
  initialsFor,
  isSearchableTerm,
  normalizeSearchTerm,
  roleLabel,
} from "@/lib/friends";
import { formatRelativeTime } from "@/lib/utils";
import type {
  DiscoverUser,
  FriendSummary,
  FriendsActivityItem,
  RequestEntry,
  UserRole,
} from "@/lib/friends-api";

/**
 * The social graph UI.
 *
 * Tab state lives in `?tab=` so a link to somebody's Requests tab is shareable
 * and the browser's back button walks between tabs — the same `useSearchParams`
 * + Suspense pattern `app/dashboard/search` uses.
 *
 * Every relationship state is rendered as **word + icon + tint**, never tint
 * alone, so "Friends" and "Request sent" survive greyscale and colour-blindness.
 *
 * Nothing here joins on ids: the Convex module resolves names, avatars and roles
 * server-side (BRIEF §5). Friend and request rows carry a `friendshipId`
 * alongside the person because the response mutations address a `friendships`
 * row rather than a user.
 */

const TABS = ["friends", "requests", "discover"] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null): value is Tab {
  return value !== null && (TABS as readonly string[]).includes(value);
}

/** Debounce for the discover input so every keystroke is not a query. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ─── Page ─────────────────────────────────────────────────────────────────

function FriendsView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab");
  const tab: Tab = isTab(rawTab) ? rawTab : "friends";

  const setTab = (next: string) => {
    const target: Tab = isTab(next) ? next : "friends";
    if (target === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (target === "friends") {
      // Keep the canonical URL clean so the default tab has one address.
      params.delete("tab");
    } else {
      params.set("tab", target);
    }
    const query = params.toString();
    router.replace(query ? `/dashboard/friends?${query}` : "/dashboard/friends", {
      scroll: false,
    });
  };

  // Every query lives above the Tabs panels on purpose: Base UI unmounts a
  // hidden panel, so a query inside one would be torn down and refetched on
  // every tab switch.
  const friends = useQuery(friendsApi.listFriends);
  const requests = useQuery(friendsApi.listRequests);
  const pendingCount = useQuery(friendsApi.getPendingRequestCount);
  const activity = useQuery(friendsApi.getFriendsActivity, { limit: 8 });

  const sendRequest = useMutation(friendsApi.sendRequest);
  const acceptRequest = useMutation(friendsApi.acceptRequest);
  const declineRequest = useMutation(friendsApi.declineRequest);
  const cancelRequest = useMutation(friendsApi.cancelRequest);
  const removeFriend = useMutation(friendsApi.removeFriend);

  // One in-flight action at a time, keyed so the right control shows its spinner
  // while every other control is disabled — a double-tap cannot create two
  // friendship rows.
  const [busy, setBusy] = useState<string | null>(null);
  // Mirrored into a live region: a toast is visual only, so the outcome of a
  // mutation also has to reach a screen reader.
  const [announcement, setAnnouncement] = useState("");

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    message: string,
  ) => {
    setBusy(key);
    try {
      await action();
      setAnnouncement(message);
      toast.success(message);
    } catch (error: unknown) {
      const text =
        error instanceof Error ? error.message : "Something went wrong — try again.";
      setAnnouncement(text);
      toast.error(text);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      <PageHeader
        title="Friends"
        description="Study alongside the people you know. A friend request needs approval, and only accepted friends can see each other's progress."
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        {/* Three triggers need ~460px. Let them scroll horizontally instead of
            stretching the document at 375px; `touch-target` lifts them to 44px
            on touch devices. `rule` because these are three separate areas of
            the social page rather than filters over one list. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="rule" className="touch-target">
            <TabsTrigger value="friends">
              {`Friends${friends === undefined ? "" : ` (${friends.length})`}`}
            </TabsTrigger>
            <TabsTrigger value="requests">
              {`Requests${
                requests === undefined ? "" : ` (${requests.incoming.length})`
              }`}
            </TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="friends" className="mt-0 outline-none">
          <FriendsTab
            friends={friends}
            activity={activity}
            busy={busy}
            onRemove={(friend) =>
              run(
                `remove:${friend.friendshipId}`,
                () => removeFriend({ friendshipId: friend.friendshipId }),
                `You removed ${friend.name} from your friends.`,
              )
            }
            onGoToDiscover={() => setTab("discover")}
          />
        </TabsContent>

        <TabsContent value="requests" className="mt-0 outline-none">
          <RequestsTab
            requests={requests}
            pendingCount={pendingCount}
            busy={busy}
            onAccept={(entry) =>
              run(
                `accept:${entry.friendshipId}`,
                () => acceptRequest({ friendshipId: entry.friendshipId }),
                `${entry.name} is now your friend.`,
              )
            }
            onDecline={(entry) =>
              run(
                `decline:${entry.friendshipId}`,
                () => declineRequest({ friendshipId: entry.friendshipId }),
                `Request from ${entry.name} declined.`,
              )
            }
            onCancel={(entry) =>
              run(
                `cancel:${entry.friendshipId}`,
                () => cancelRequest({ friendshipId: entry.friendshipId }),
                `Request to ${entry.name} withdrawn.`,
              )
            }
            onGoToDiscover={() => setTab("discover")}
          />
        </TabsContent>

        <TabsContent value="discover" className="mt-0 outline-none">
          <DiscoverTab
            busy={busy}
            onSend={(candidate) =>
              run(
                `send:${candidate._id}`,
                () => sendRequest({ userId: candidate._id }),
                `Friend request sent to ${candidate.name}.`,
              )
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<FriendsPageSkeleton />}>
      <FriendsView />
    </Suspense>
  );
}

// ─── Loading states ───────────────────────────────────────────────────────

function FriendsPageSkeleton() {
  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full" aria-busy="true">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-5 w-full max-w-md" />
      <Skeleton className="h-12 w-72" />
      <FriendGridSkeleton />
    </div>
  );
}

/** Matches the friend-card grid so nothing shifts when the data lands. */
function FriendGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-56" />
      ))}
    </div>
  );
}

function RowSkeleton({ count = 3, height = "h-20" }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`${height} w-full rounded-sm`} />
      ))}
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────

/**
 * Renders initials when there is no picture and **never** renders an `<img>`
 * without a real `src` — no broken image, and no `pravatar.cc` placeholder.
 *
 * `alt=""` is deliberate: the person's name is always rendered as text beside the
 * avatar, so announcing the image too would read their name twice. The
 * fallback initials are hidden from assistive tech for the same reason.
 */
function PersonAvatar({
  name,
  imageUrl,
  size = "lg",
}: {
  name: string;
  imageUrl: string | null;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback aria-hidden>{initialsFor(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Role as a tinted pill — colour plus a word, never colour alone. */
function RolePill({ role }: { role: UserRole }) {
  const Icon = role === "student" ? BookOpen : role === "instructor" ? Award : Sparkles;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-bold text-brand-ink">
      <Icon size={14} aria-hidden />
      {roleLabel(role)}
    </span>
  );
}

/** Humanised timestamp; the absolute value stays available in `title`. */
function Since({ at, prefix }: { at: number; prefix: string }) {
  return (
    <span className="text-xs text-muted-foreground" title={new Date(at).toISOString()}>
      {prefix} {formatRelativeTime(at)}
    </span>
  );
}

// ─── Friends tab ──────────────────────────────────────────────────────────

function FriendsTab({
  friends,
  activity,
  busy,
  onRemove,
  onGoToDiscover,
}: {
  friends: FriendSummary[] | undefined;
  activity: FriendsActivityItem[] | undefined;
  busy: string | null;
  onRemove: (friend: FriendSummary) => void;
  onGoToDiscover: () => void;
}) {
  if (friends === undefined) {
    return <FriendGridSkeleton />;
  }

  if (friends.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No friends yet"
        description="Send your first friend request from Discover. Nothing is shared until they accept it."
        action={<Button onClick={onGoToDiscover}>Find people</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {friends.map((friend) => (
          <li key={friend.friendshipId}>
            <FriendCard
              friend={friend}
              busy={busy}
              onRemove={() => onRemove(friend)}
            />
          </li>
        ))}
      </ul>
      <ActivityFeed items={activity} />
    </div>
  );
}

function FriendCard({
  friend,
  busy,
  onRemove,
}: {
  friend: FriendSummary;
  busy: string | null;
  onRemove: () => void;
}) {
  const pending = busy === `remove:${friend.friendshipId}`;
  const { activity } = friend;

  return (
    <article className="flex h-full flex-col border border-rule bg-card transition-colors hover:border-rule-strong">
      <div className="flex items-start gap-4 p-6">
        <PersonAvatar name={friend.name} imageUrl={friend.imageUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-snug text-foreground break-words">
            {friend.name}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RolePill role={friend.role} />
            <span className="inline-flex items-center gap-1 rounded-sm border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-bold text-brand-ink">
              <Check size={14} aria-hidden />
              Friends
            </span>
          </div>
          <div className="mt-2">
            <Since at={friend.since} prefix="Friends since" />
          </div>
        </div>
      </div>

      {/* Their progress. Visible only because the friendship is accepted — that
          is enforced by `friends.listFriends`, not by this component. */}
      <dl className="grid grid-cols-3 gap-2 px-6">
        <ActivityStat
          icon={Award}
          label="Certificates"
          value={activity.certificatesEarned}
        />
        <ActivityStat
          icon={BookOpen}
          label="In progress"
          value={activity.coursesInProgress}
        />
        <ActivityStat
          icon={Flame}
          label="Day streak"
          value={activity.currentStreak}
        />
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule p-4">
        <span className="text-xs text-muted-foreground">
          {activity.lastActiveAt === null
            ? "No activity yet"
            : `Last active ${formatRelativeTime(activity.lastActiveAt)}`}
        </span>
        <AlertDialog>
          {/* Base UI composes with `render`, not `asChild`. */}
          <AlertDialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                aria-label={`Remove ${friend.name} from your friends`}
                className="shrink-0"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <UserRoundMinus className="h-4 w-4" aria-hidden />
                )}
                Remove
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {friend.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will leave your friend list and stop sharing their progress
                with you. You can send another request later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep friend</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemove} disabled={pending}>
                Remove friend
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </article>
  );
}

function ActivityStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="border border-rule bg-surface-sunken px-2 py-3 text-center">
      <Icon size={16} aria-hidden className="mx-auto mb-1 text-brand-ink" />
      <dd className="display-subheading tabular text-lg text-foreground">{value}</dd>
      <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
    </div>
  );
}

// ─── Activity feed (accepted friends only, server-enforced) ───────────────

const ACTIVITY_LABELS: Record<string, string> = {
  lesson_completed: "completed a lesson",
  quiz_passed: "passed a quiz",
  quiz_attempted: "tried a quiz",
  certificate_earned: "earned a certificate",
  course_enrolled: "enrolled in a course",
  course_completed: "completed a course",
};

function ActivityFeed({ items }: { items: FriendsActivityItem[] | undefined }) {
  if (items === undefined) {
    return (
      <section className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-7 w-72" />
        <RowSkeleton count={2} height="h-16" />
      </section>
    );
  }

  return (
    <section aria-labelledby="friends-activity-heading" className="flex flex-col gap-4">
      <h2
        id="friends-activity-heading"
        className="rule-heading display-subheading text-xl text-foreground"
      >
        <Sparkles size={18} className="shrink-0 text-brand-ink" aria-hidden />
        <span className="shrink-0">Recent activity from your friends</span>
      </h2>

      {items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nothing yet"
          description="As your friends finish lessons and pass quizzes, their progress shows up here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.activityId}
              className="flex items-center gap-3 border border-rule bg-card px-4 py-3 transition-colors hover:border-rule-strong"
            >
              <PersonAvatar
                name={item.name}
                imageUrl={item.imageUrl}
                size="default"
              />
              <p className="min-w-0 flex-1 text-sm leading-body text-foreground">
                <span className="font-bold">{item.name}</span>{" "}
                {ACTIVITY_LABELS[item.type] ?? "made progress"}
                {item.courseTitle && (
                  <>
                    {" in "}
                    <span className="font-semibold">{item.courseTitle}</span>
                  </>
                )}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(item.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Requests tab ─────────────────────────────────────────────────────────

function RequestsTab({
  requests,
  pendingCount,
  busy,
  onAccept,
  onDecline,
  onCancel,
  onGoToDiscover,
}: {
  requests: { incoming: RequestEntry[]; outgoing: RequestEntry[] } | undefined;
  pendingCount: number | undefined;
  busy: string | null;
  onAccept: (entry: RequestEntry) => void;
  onDecline: (entry: RequestEntry) => void;
  onCancel: (entry: RequestEntry) => void;
  onGoToDiscover: () => void;
}) {
  if (requests === undefined) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-40" />
          <RowSkeleton count={2} height="h-24" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-7 w-40" />
          <RowSkeleton count={1} height="h-24" />
        </div>
      </div>
    );
  }

  const { incoming, outgoing } = requests;

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No friend requests"
        description="When somebody asks to connect, it lands here for you to accept or decline."
        action={<Button onClick={onGoToDiscover}>Find people</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <RequestGroup
        id="incoming-requests"
        heading="Incoming"
        description="These people want to connect with you."
        entries={incoming}
        busy={busy}
        emptyTitle="No incoming requests"
        emptyBody="Nobody is waiting on you right now."
        pendingCount={pendingCount}
      >
        {(entry, disabled) => (
          <>
            <Button
              size="sm"
              disabled={disabled}
              onClick={() => onAccept(entry)}
              className="flex-1 sm:flex-none"
            >
              {busy === `accept:${entry.friendshipId}` ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onDecline(entry)}
              className="flex-1 sm:flex-none"
            >
              {busy === `decline:${entry.friendshipId}` ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <X className="h-4 w-4" aria-hidden />
              )}
              Decline
            </Button>
          </>
        )}
      </RequestGroup>

      <RequestGroup
        id="outgoing-requests"
        heading="Sent by you"
        description="Waiting for these people to respond."
        entries={outgoing}
        busy={busy}
        emptyTitle="No requests sent"
        emptyBody="You have not asked anybody to connect."
      >
        {(entry, disabled) => (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onCancel(entry)}
            className="flex-1 sm:flex-none"
          >
            {busy === `cancel:${entry.friendshipId}` ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <X className="h-4 w-4" aria-hidden />
            )}
            Cancel request
          </Button>
        )}
      </RequestGroup>
    </div>
  );
}

function RequestGroup({
  id,
  heading,
  description,
  entries,
  busy,
  emptyTitle,
  emptyBody,
  pendingCount,
  children,
}: {
  id: string;
  heading: string;
  description: string;
  entries: RequestEntry[];
  busy: string | null;
  emptyTitle: string;
  emptyBody: string;
  pendingCount?: number;
  children: (entry: RequestEntry, disabled: boolean) => ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-rule pb-2">
        <h2
          id={`${id}-heading`}
          className="display-subheading flex flex-wrap items-center gap-2 text-xl text-foreground"
        >
          {heading}
          {pendingCount !== undefined && pendingCount > 0 && (
            // Word plus badge, not a bare coloured dot.
            <span className="tabular inline-flex items-center gap-1 rounded-sm border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-bold text-brand-ink">
              <Mail size={14} aria-hidden />
              {pendingCount >= 200 ? "99+ waiting" : `${pendingCount} waiting`}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={Mail} title={emptyTitle} description={emptyBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.friendshipId}
              className="flex flex-col gap-4 border border-rule bg-card p-4 transition-colors hover:border-rule-strong sm:flex-row sm:items-center"
            >
              <PersonAvatar name={entry.name} imageUrl={entry.imageUrl} />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-foreground break-words">
                  {entry.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RolePill role={entry.role} />
                  <span className="inline-flex items-center gap-1 rounded-sm border border-rule bg-surface-sunken px-2 py-1 text-xs font-bold text-muted-foreground">
                    <Clock size={14} aria-hidden />
                    Request {formatRelativeTime(entry.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                {children(entry, busy !== null)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Discover tab ─────────────────────────────────────────────────────────

function DiscoverTab({
  busy,
  onSend,
}: {
  busy: string | null;
  onSend: (candidate: DiscoverUser) => void;
}) {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 300);
  const normalized = normalizeSearchTerm(debounced);
  const searchable = isSearchableTerm(normalized);

  // "skip" also resolves to `undefined`, so `searchable` — not the value —
  // decides whether this is loading or intentionally idle.
  const results = useQuery(
    friendsApi.searchUsers,
    searchable ? { query: normalized } : "skip",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="friend-search" className="text-sm font-semibold text-foreground">
          Search for people
        </Label>
        <div className="relative">
          <SearchIcon
            size={18}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="friend-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by name or email"
            autoComplete="off"
            aria-describedby="friend-search-hint"
            className="h-12 border-rule bg-card pl-11 text-[15px]"
          />
        </div>
        <p id="friend-search-hint" className="text-xs text-muted-foreground">
          Type at least {MIN_SEARCH_LENGTH} characters. People you have already
          accepted, asked, or turned down are not listed.
        </p>
      </div>

      {term.trim().length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="Find your study people"
          description="Search the directory by name or email address to send somebody a friend request."
        />
      ) : !searchable ? (
        <EmptyState
          icon={SearchIcon}
          title="Keep typing"
          description={`Enter at least ${MIN_SEARCH_LENGTH} characters so the results are useful.`}
        />
      ) : results === undefined ? (
        <RowSkeleton />
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="Nobody found"
          description={`No account matches “${normalized}”. Check the spelling, or try part of an email address.`}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((candidate) => (
            <li
              key={candidate._id}
              className="flex flex-col gap-4 border border-rule bg-card p-4 transition-colors hover:border-rule-strong sm:flex-row sm:items-center"
            >
              <PersonAvatar name={candidate.name} imageUrl={candidate.imageUrl} />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-foreground break-words">
                  {candidate.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RolePill role={candidate.role} />
                  {candidate.email && (
                    <span className="truncate text-xs text-muted-foreground">
                      {candidate.email}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => onSend(candidate)}
                aria-label={`Send a friend request to ${candidate.name}`}
                className="flex-1 sm:flex-none"
              >
                {busy === `send:${candidate._id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden />
                )}
                Send request
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
