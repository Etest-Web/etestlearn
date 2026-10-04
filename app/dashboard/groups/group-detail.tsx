"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BookOpen,
  Clock,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Pencil,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { groupsApi } from "@/lib/groups-api";
import { GROUP_POST_COOLDOWN_MS } from "@/lib/groups";
import type { GroupDetail, GroupMessageCursor, GroupMessageItem } from "@/lib/groups";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ArchivedPill,
  MemberAvatar,
  MemberRoleBadge,
  PrivacyPill,
} from "./groups-primitives";

/**
 * One group's detail: conversation, roster, approval queue.
 *
 * Everything about what is allowed here arrives in `getGroup.permissions`,
 * computed on the server from the caller's seats. The buttons do not re-ask the
 * database whether they should exist — they ask the payload it already sent.
 */
export function GroupDetail({
  groupId,
  onBack,
}: {
  groupId: string;
  onBack: () => void;
}) {
  const detail = useQuery(groupsApi.getGroup, { groupId });

  if (detail === undefined) return <GroupDetailSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 self-start text-muted-foreground"
        >
          <ArrowLeft size={16} aria-hidden />
          All groups
        </Button>

        <PageHeader
          title={detail.name}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/dashboard/courses/${detail.course.slug}`}
                className="link-quiet inline-flex items-center gap-1 hover:text-brand-ink"
              >
                <BookOpen size={15} aria-hidden />
                {detail.course.title}
              </Link>
              <span aria-hidden>·</span>
              <span className="tabular">
                Started by {detail.createdBy.name} {formatRelativeTime(detail.createdAt)}
              </span>
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <PrivacyPill isPrivate={detail.isPrivate} />
            {detail.isArchived ? <ArchivedPill /> : null}
            {detail.myRole ? (
              <MemberRoleBadge role={detail.myRole} />
            ) : detail.hasPendingRequest ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-800 dark:text-amber-400">
                <Clock size={14} aria-hidden />
                Request pending
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-sm border border-rule bg-surface-sunken px-2 py-1 text-xs font-bold text-muted-foreground">
                <Users size={14} aria-hidden />
                Not a member
              </span>
            )}
          </div>
          {detail.description ? (
            <p className="max-w-[62ch] text-sm leading-body text-muted-foreground">
              {detail.description}
            </p>
          ) : null}
        </PageHeader>
      </div>

      <GroupActions detail={detail} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <MessageFeed
          groupId={groupId}
          canRead={detail.permissions.canReadMessages}
          canPost={detail.permissions.canPost}
          isArchived={detail.isArchived}
        />
        <div className="flex flex-col gap-6">
          <MembersPanel groupId={groupId} />
          {detail.permissions.canApprove ? (
            <PendingRequestsPanel groupId={groupId} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GroupActions({ detail }: { detail: GroupDetail }) {
  const { permissions } = detail;
  const archive = useMutation(groupsApi.archiveGroup);
  const unarchive = useMutation(groupsApi.unarchiveGroup);
  const leave = useMutation(groupsApi.leaveGroup);
  const join = useMutation(groupsApi.joinGroup);
  const [pending, setPending] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinNote, setJoinNote] = useState("");

  async function run(
    key: string,
    action: () => Promise<unknown>,
    ok: string,
  ): Promise<boolean> {
    setPending(key);
    try {
      await action();
      toast.success(ok);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
      return false;
    } finally {
      setPending(null);
    }
  }

  const blocked = pending !== null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {detail.myRole === null && !detail.hasPendingRequest ? (
        detail.isPrivate ? (
          <Button
            onClick={() => setJoinOpen(true)}
            disabled={detail.isArchived || blocked}
          >
            <UserPlus size={16} aria-hidden />
            Request to join
          </Button>
        ) : (
          <Button
            disabled={detail.isArchived || blocked}
            onClick={() =>
              run(
                "join",
                async () => {
                  await join({ groupId: detail._id });
                },
                "You have joined this group",
              )
            }
          >
            {pending === "join" ? (
              <Loader2 size={16} aria-hidden className="animate-spin" />
            ) : (
              <UserPlus size={16} aria-hidden />
            )}
            Join group
          </Button>
        )
      ) : null}

      {detail.hasPendingRequest ? (
        <p className="text-xs text-muted-foreground">
          Your request is waiting on a moderator of this group.
        </p>
      ) : null}

      {permissions.canEdit ? (
        <EditGroupButton
          groupId={detail._id}
          name={detail.name}
          description={detail.description}
        />
      ) : null}

      {permissions.canArchive ? (
        detail.isArchived ? (
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() =>
              run(
                "unarchive",
                async () => {
                  await unarchive({ groupId: detail._id });
                },
                "Group reopened",
              )
            }
          >
            {pending === "unarchive" ? (
              <Loader2 size={16} aria-hidden className="animate-spin" />
            ) : (
              <ArchiveRestore size={16} aria-hidden />
            )}
            Reopen group
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() =>
              run(
                "archive",
                async () => {
                  await archive({ groupId: detail._id });
                },
                "Group archived — its messages are safe",
              )
            }
          >
            {pending === "archive" ? (
              <Loader2 size={16} aria-hidden className="animate-spin" />
            ) : (
              <Archive size={16} aria-hidden />
            )}
            Archive group
          </Button>
        )
      ) : null}

      {detail.myRole !== null ? (
        permissions.canLeave ? (
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() =>
              run(
                "leave",
                async () => {
                  const result = await leave({ groupId: detail._id });
                  if (result.outcome === "promoted_and_left") {
                    toast.success(
                      "You left — the longest-standing member took over as moderator",
                    );
                  }
                },
                "You have left this group",
              )
            }
          >
            {pending === "leave" ? (
              <Loader2 size={16} aria-hidden className="animate-spin" />
            ) : (
              <LogOut size={16} aria-hidden />
            )}
            Leave group
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground max-w-sm">
            You are the last member of this group. Ask the course instructor to
            archive it rather than leaving it empty.
          </p>
        )
      ) : null}

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to join</DialogTitle>
            <DialogDescription>
              {detail.name} is private, so a moderator has to approve you. Add a
              line if you would like to say why.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(
                "join",
                async () => {
                  await join({
                    groupId: detail._id,
                    message: joinNote.trim() || undefined,
                  });
                },
                "Request sent to the moderators",
              );
              if (ok) {
                setJoinOpen(false);
                setJoinNote("");
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="join-note">Note (optional)</Label>
              <Textarea
                id="join-note"
                value={joinNote}
                maxLength={400}
                onChange={(event) => setJoinNote(event.target.value)}
                placeholder="I am working through week 3 and would love to join in."
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setJoinOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={blocked}
              >
                {pending === "join" ? (
                  <Loader2 size={16} aria-hidden className="animate-spin" />
                ) : null}
                Send request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditGroupButton({
  groupId,
  name,
  description,
}: {
  groupId: string;
  name: string;
  description: string | null;
}) {
  const update = useMutation(groupsApi.updateGroup);
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [saving, setSaving] = useState(false);

  // Re-seed the form each time it opens so an edit that was saved (or changed
  // by somebody else) is not silently overwritten by a stale draft.
  useEffect(() => {
    if (open) {
      setDraftName(name);
      setDraftDescription(description ?? "");
    }
  }, [open, name, description]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={16} aria-hidden />
        Edit details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit group</DialogTitle>
            <DialogDescription>
              Group moderators and the course instructor can change these details.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              try {
                await update({
                  groupId,
                  name: draftName,
                  description: draftDescription.trim() || undefined,
                });
                toast.success("Group updated");
                setOpen(false);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Something went wrong",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  value={draftName}
                  maxLength={80}
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="group-description">Description</Label>
                <Textarea
                  id="group-description"
                  value={draftDescription}
                  maxLength={500}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="What this group is for, and when it meets."
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 size={16} aria-hidden className="animate-spin" />
                ) : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageFeed({
  groupId,
  canRead,
  canPost,
  isArchived,
}: {
  groupId: string;
  canRead: boolean;
  canPost: boolean;
  isArchived: boolean;
}) {
  // The newest page is a live subscription; older pages are frozen snapshots the
  // reader pulled deliberately, which is exactly what "Load older" means.
  const [cursor, setCursor] = useState<GroupMessageCursor | null>(null);
  const [older, setOlder] = useState<GroupMessageItem[]>([]);

  const page = useQuery(
    groupsApi.listMessages,
    canRead
      ? cursor
        ? { groupId, after: cursor }
        : { groupId }
      : "skip",
  );

  const messages = useMemo(() => {
    const byId = new Map<string, GroupMessageItem>();
    for (const message of page?.messages ?? []) byId.set(message._id, message);
    for (const message of older) byId.set(message._id, message);
    // Newest last, the way a conversation reads.
    return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [page?.messages, older]);

  return (
    <section
      aria-label="Group conversation"
      className="flex flex-col overflow-hidden border border-rule bg-card"
    >
      <header className="flex items-center gap-2 border-b border-rule px-5 py-4">
        <MessageSquare size={18} aria-hidden className="text-brand-ink" />
        <h2 className="display-subheading text-base text-foreground">Conversation</h2>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4 min-h-[220px] sm:px-5">
        {!canRead ? (
          <EmptyState
            icon={Lock}
            title="Members only"
            description="The conversation in a group is for its members. Join above to read and reply."
          />
        ) : page === undefined ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-12 w-3/4 rounded-sm" />
            <Skeleton className="h-12 w-1/2 self-end rounded-sm" />
            <Skeleton className="h-12 w-2/3 rounded-sm" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Be the first to post. Questions, links to useful notes and half-formed ideas are all welcome."
          />
        ) : (
          <>
            {page.hasMore && page.nextCursor ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start -ml-2 text-muted-foreground"
                onClick={() => {
                  if (!page.nextCursor) return;
                  setOlder((prev) => [...prev, ...page.messages]);
                  setCursor(page.nextCursor);
                }}
              >
                Load older messages
              </Button>
            ) : null}

            <ul className="flex flex-col gap-4">
              {messages.map((message) => (
                <li key={message._id}>
                  <MessageBubble message={message} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-rule px-4 py-4 sm:px-5">
        {canPost ? (
          <Composer groupId={groupId} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            {isArchived
              ? "This group is archived — the conversation is closed to new messages, but everything already said is still here."
              : "Join this group to take part in the conversation."}
          </p>
        )}
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: GroupMessageItem }) {
  return (
    <article
      className={cn(
        "flex flex-col gap-1 max-w-[88%] sm:max-w-[75%]",
        message.isMine && "self-end items-end",
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{message.authorName ?? "Former member"}</span>
        {message.authorRole === "instructor" ||
        message.authorRole === "admin" ? (
          <span className="inline-flex items-center gap-1 rounded-sm border border-brand/30 bg-brand/10 px-1.5 py-0.5 font-bold text-brand-ink">
            <ShieldCheck size={11} aria-hidden />
            {message.authorRole === "admin" ? "Admin" : "Instructor"}
          </span>
        ) : null}
      </span>
      <div
        className={cn(
          "rounded-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
          message.isMine
            ? "bg-brand text-brand-foreground"
            : "bg-surface-sunken text-foreground",
        )}
      >
        {message.body}
      </div>
      <time
        dateTime={new Date(message.createdAt).toISOString()}
        className="text-[11px] text-muted-foreground"
      >
        {formatRelativeTime(message.createdAt)}
      </time>
    </article>
  );
}

function Composer({ groupId }: { groupId: string }) {
  const post = useMutation(groupsApi.postMessage);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // The server enforces a per-group cooldown; mirroring it here turns a
  // guaranteed rejection into a button that is simply not ready yet.
  useEffect(() => {
    if (cooldownUntil === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const remaining = Math.max(0, cooldownUntil - now);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim() || sending || remaining > 0) return;
        setSending(true);
        try {
          await post({ groupId, body: body.trim() });
          setBody("");
          setNow(Date.now());
          setCooldownUntil(Date.now() + GROUP_POST_COOLDOWN_MS);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not post that message",
          );
        } finally {
          setSending(false);
        }
      }}
    >
      <Label htmlFor="group-message" className="sr-only">
        Write a message
      </Label>
      <Textarea
        id="group-message"
        value={body}
        maxLength={2000}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Share a question, a resource, or a thought…"
        className="min-h-[80px]"
      />
      <div className="flex items-center justify-between gap-3">
        <p aria-live="polite" className="tabular text-xs text-muted-foreground">
          {remaining > 0
            ? `You can post again in ${Math.ceil(remaining / 1000)}s.`
            : `${body.trim().length} of 2000 characters`}
        </p>
        <Button
          type="submit"
          disabled={sending || remaining > 0 || body.trim().length === 0}
        >
          {sending ? (
            <Loader2 size={16} aria-hidden className="animate-spin" />
          ) : (
            <Send size={16} aria-hidden />
          )}
          Post message
        </Button>
      </div>
    </form>
  );
}

function MembersPanel({ groupId }: { groupId: string }) {
  const members = useQuery(groupsApi.listMembers, { groupId });
  const detail = useQuery(groupsApi.getGroup, { groupId });
  const promote = useMutation(groupsApi.promoteMember);
  const demote = useMutation(groupsApi.demoteMember);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Role changes are the course instructor's alone (see `promoteMember`), so the
  // control only exists for them.
  const canManage = detail?.permissions.canManageMembers === true;

  return (
    <section
      aria-label="Group members"
      className="flex flex-col overflow-hidden border border-rule bg-card"
    >
      <header className="flex items-center gap-2 border-b border-rule px-5 py-4">
        <Users size={18} aria-hidden className="text-brand-ink" />
        <h2 className="display-subheading text-base text-foreground">Members</h2>
        <span className="tabular ml-auto text-xs font-bold text-muted-foreground">
          {members ? members.members.length : "—"}
        </span>
      </header>

      <div className="px-4 py-4 sm:px-5">
        {members === undefined ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : members.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has joined yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {members.members.map((member) => (
              <li key={member._id} className="flex items-center gap-3 py-2">
                <MemberAvatar name={member.name} imageUrl={member.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {member.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined {formatRelativeTime(member.joinedAt)}
                  </p>
                </div>
                <MemberRoleBadge role={member.role} className="hidden sm:inline-flex" />
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pendingId !== null}
                    aria-label={
                      member.role === "moderator"
                        ? `Demote ${member.name} to an ordinary member`
                        : `Promote ${member.name} to moderator`
                    }
                    className="text-muted-foreground shrink-0"
                    onClick={async () => {
                      setPendingId(member._id);
                      try {
                        if (member.role === "moderator") {
                          await promote({ groupId, userId: member.userId });
                          toast.success(`${member.name} is now a moderator`);
                        } else {
                          await demote({ groupId, userId: member.userId });
                          toast.success(`${member.name} is now an ordinary member`);
                        }
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Something went wrong",
                        );
                      } finally {
                        setPendingId(null);
                      }
                    }}
                  >
                    {pendingId === member._id ? (
                      <Loader2 size={12} aria-hidden className="animate-spin" />
                    ) : member.role === "moderator" ? (
                      <X size={12} aria-hidden />
                    ) : (
                      <ShieldCheck size={12} aria-hidden />
                    )}
                    {member.role === "moderator" ? "Demote" : "Make moderator"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PendingRequestsPanel({ groupId }: { groupId: string }) {
  const requests = useQuery(groupsApi.listPendingRequests, { groupId });
  const review = useMutation(groupsApi.reviewJoinRequest);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function decide(
    requestId: string,
    decision: "approve" | "decline",
    requesterName: string,
  ) {
    setPendingId(requestId);
    try {
      await review({ requestId, decision });
      toast.success(
        decision === "approve"
          ? `${requesterName} can now post`
          : "Request declined",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section
      aria-label="Pending join requests"
      className="flex flex-col overflow-hidden border border-rule bg-card"
    >
      <header className="flex items-center gap-2 border-b border-rule px-5 py-4">
        <Inbox size={18} aria-hidden className="text-brand-ink" />
        <h2 className="display-subheading text-base text-foreground">Join requests</h2>
        <span className="tabular ml-auto text-xs font-bold text-muted-foreground">
          {requests ? requests.requests.length : "—"}
        </span>
      </header>

      <div className="px-4 py-4 sm:px-5" aria-live="polite">
        {requests === undefined ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-16 w-full rounded-sm" />
            <Skeleton className="h-16 w-full rounded-sm" />
          </div>
        ) : requests.requests.length === 0 ? (
          <p className="text-sm leading-body text-muted-foreground">
            Nothing waiting. Requests from people who want into a private group
            land here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.requests.map((request) => (
              <li
                key={request._id}
                className="flex flex-col gap-2 rounded-sm border border-rule p-3"
              >
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    name={request.requesterName}
                    imageUrl={request.requesterImageUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {request.requesterName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Asked {formatRelativeTime(request.createdAt)}
                    </p>
                  </div>
                </div>
                {request.message ? (
                  <p className="rounded-sm bg-surface-sunken px-3 py-2 text-sm leading-body text-muted-foreground">
                    {request.message}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pendingId !== null}
                    onClick={() =>
                      decide(request._id, "approve", request.requesterName)
                    }
                  >
                    {pendingId === request._id ? (
                      <Loader2 size={14} aria-hidden className="animate-spin" />
                    ) : null}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingId !== null}
                    onClick={() =>
                      decide(request._id, "decline", request.requesterName)
                    }
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function GroupDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}