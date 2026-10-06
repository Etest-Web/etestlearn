"use client";

import { Component, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BookOpen,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Plus,
  Users,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";
import { groupsApi } from "@/lib/groups-api";
import { groupPrimaryAction } from "@/lib/groups";
import type {
  AccessibleCourse,
  BrowseGroupSummary,
  MyGroupSummary,
} from "@/lib/groups";
import { cn, formatRelativeTime, pluralize } from "@/lib/utils";
import {
  ArchivedPill,
  GroupCardSkeleton,
  PrivacyPill,
  RelationshipPill,
  StatsStrip,
  StatsStripSkeleton,
} from "./groups-primitives";
import { GroupDetail } from "./group-detail";

/** The two tabs, as a union `isTab` narrows from the raw `?tab=` param. */
type Tab = "mine" | "browse";

function isTab(value: string | null): value is Tab {
  return value === "mine" || value === "browse";
}

/**
 * `/dashboard/groups` — the groups hub.
 *
 * All state lives in the URL (`?tab=`, `?course=`, `?group=`) so a group is
 * linkable and the browser's back button walks back out of it. Opening a group
 * pushes a history entry; switching tabs or courses replaces, because those are
 * not places anybody wants to come back to with the back button.
 */
export function GroupsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "mine";
  const courseParam = searchParams.get("course");
  const groupId = searchParams.get("group");

  const stats = useQuery(groupsApi.getMyGroupStats, {});
  const myGroups = useQuery(groupsApi.listMyGroups, {});
  const courses = useQuery(groupsApi.listMyAccessibleCourses, {});

  function navigate(patch: Record<string, string | null>, push = false) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (push) router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  // Header skeleton needs only `stats`; the lists each have their own. Showing
  // the whole page as one skeleton until three queries land would make a fast
  // page look slow for no reason.
  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      <PageHeader
        title="Study Groups"
        description="Study with other people on the courses you are taking. Any student enrolled in a course — or the instructor running it — can open a group."
      />

      {stats === undefined ? <StatsStripSkeleton /> : <StatsStrip stats={stats} />}

      {groupId ? (
        <GroupErrorBoundary key={groupId}>
          <GroupDetail
            key={groupId}
            groupId={groupId}
            onBack={() => navigate({ group: null })}
          />
        </GroupErrorBoundary>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => navigate({ tab: value as string })}
          className="w-full"
        >
          {/* Two triggers fit 375px; the wrapper keeps any future third one from
              widening the document, and lifts the targets to 44px on touch.
              `rule` because these are two sections of the hub — your groups and
              the course directory — rather than filters over one list. */}
          <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList variant="rule" className="touch-target">
              <TabsTrigger value="mine">
                My groups
                {myGroups ? ` (${myGroups.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="browse">
                Browse
                {courses ? ` (${courses.length})` : ""}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="mine" className="mt-0 outline-none">
            <MyGroupsPanel
              groups={myGroups}
              onOpen={(id) => navigate({ group: id, tab: null }, true)}
              onBrowse={() => navigate({ tab: "browse" })}
            />
          </TabsContent>

          <TabsContent value="browse" className="mt-0 outline-none">
            <BrowsePanel
              courses={courses}
              selectedCourseId={courseParam}
              onSelectCourse={(id) => navigate({ course: id })}
              onOpen={(id) => navigate({ group: id, course: null }, true)}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function MyGroupsPanel({
  groups,
  onOpen,
  onBrowse,
}: {
  groups: MyGroupSummary[] | undefined;
  onOpen: (id: string) => void;
  onBrowse: () => void;
}) {
  if (groups === undefined) {
    return (
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        aria-busy="true"
      >
        <GroupCardSkeleton />
        <GroupCardSkeleton />
        <GroupCardSkeleton />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="You have not joined any groups yet"
        description="Study groups are organised by course, so the fastest way in is to browse the groups in a course you are taking — or start one yourself."
        action={
          <Button onClick={onBrowse}>
            <Users size={16} aria-hidden />
            Browse groups
          </Button>
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {groups.map((group) => (
        <li key={group._id}>
          <GroupCard group={group} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

function GroupCard({
  group,
  onOpen,
}: {
  group: MyGroupSummary;
  onOpen: (id: string) => void;
}) {
  return (
    <article className="flex h-full flex-col border border-rule bg-card p-6 transition-colors hover:border-rule-strong">
      <div className="flex items-start justify-between gap-3">
        <h3 className="display-subheading line-clamp-2 text-xl leading-snug text-foreground">
          {group.name}
        </h3>
        {group.isArchived ? <ArchivedPill className="shrink-0" /> : null}
      </div>

      <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
        <BookOpen size={14} aria-hidden />
        <span className="truncate">{group.course.title}</span>
      </p>

      {group.description ? (
        <p className="mt-3 line-clamp-2 text-sm leading-body text-muted-foreground">
          {group.description}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RelationshipPill
          relationship={group.myRole === "moderator" ? "moderator" : "member"}
        />
        <PrivacyPill isPrivate={group.isPrivate} />
        <span className="tabular inline-flex items-center gap-1 rounded-sm border border-rule bg-surface-sunken px-2 py-1 text-xs font-bold text-muted-foreground">
          <Users size={14} aria-hidden />
          {pluralize(group.memberCount, "member")}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule pt-4">
        <div className="min-w-0">
          {group.latestMessage ? (
            <p className="text-xs text-muted-foreground truncate">
              {group.latestMessage.authorName}: {group.latestMessage.body}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No messages yet</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {group.latestMessage
              ? `Active ${formatRelativeTime(group.latestMessage.at)}`
              : `Created ${formatRelativeTime(group.createdAt)}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpen(group._id)}
          className="shrink-0"
        >
          <MessageSquare size={15} aria-hidden />
          Open
        </Button>
      </div>
    </article>
  );
}

function BrowsePanel({
  courses,
  selectedCourseId,
  onSelectCourse,
  onOpen,
}: {
  courses: AccessibleCourse[] | undefined;
  selectedCourseId: string | null;
  onSelectCourse: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  // Fall back to the first course when `?course=` is absent, so a bare visit to
  // the tab shows something. An id that no longer resolves (unenrolled, deleted)
  // also falls back rather than sending a query the server will refuse.
  const selected =
    courses && courses.length > 0
      ? (courses.find((c) => c._id === selectedCourseId) ?? courses[0])
      : undefined;

  const groups = useQuery(
    groupsApi.browseGroupsForCourse,
    selected ? { courseId: selected._id } : "skip",
  );

  if (courses === undefined) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-12 w-full max-w-sm" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GroupCardSkeleton />
          <GroupCardSkeleton />
        </div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No courses to browse yet"
        description="Study groups hang off a course, so you need to be enrolled in one (or teaching one) before there is anything to browse. Enrol in a course from the catalogue and its groups will appear here."
        action={
          <Button render={<Link href="/courses" />} size="lg">
            Browse the course catalogue
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 w-full sm:max-w-sm">
          <Label htmlFor="group-course">Course</Label>
          <Select
            value={selected?._id ?? null}
            onValueChange={(value) => {
              if (value) onSelectCourse(value);
            }}
          >
            <SelectTrigger id="group-course" className="h-11 w-full">
              <SelectValue placeholder="Choose a course" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((course) => (
                <SelectItem key={course._id} value={course._id}>
                  <span className="truncate">{course.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto pl-2 shrink-0">
                    {course.access === "instructor" ? "You teach this" : "Enrolled"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => setCreateOpen(true)}
          disabled={!selected}
          className="sm:w-auto"
        >
          <Plus size={16} aria-hidden />
          Create a group
        </Button>
      </div>

      <p className="max-w-[62ch] text-sm leading-body text-muted-foreground">
        Both students and instructors can create groups
        {selected ? (
          <>
            {" "}
            — anyone enrolled in{" "}
            <span className="font-medium text-foreground">{selected.title}</span>{" "}
            can open one, and you become its first moderator
          </>
        ) : (
          " — anyone enrolled in a course can open one, and you become its first moderator"
        )}
        .
      </p>

      {groups === undefined ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          aria-busy="true"
        >
          <GroupCardSkeleton />
          <GroupCardSkeleton />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="No groups in this course yet"
          description="Nobody has opened one. Starting a group takes about ten seconds — give it a name, say whether it is open or invite-only, and you are its first moderator."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden />
              Create the first group
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map((group) => (
            <li key={group._id}>
              <BrowseGroupCard group={group} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}

      {/* Nothing to create into means nothing to open the dialog for. */}
      {selected ? (
        <CreateGroupDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          courseId={selected._id}
          courseTitle={selected.title}
          onCreated={onOpen}
        />
      ) : null}
    </div>
  );
}

function BrowseGroupCard({
  group,
  onOpen,
}: {
  group: BrowseGroupSummary;
  onOpen: (id: string) => void;
}) {
  const join = useMutation(groupsApi.joinGroup);
  const cancel = useMutation(groupsApi.cancelJoinRequest);
  const leaveGroup = useMutation(groupsApi.leaveGroup);
  const [pending, setPending] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const action = groupPrimaryAction({
    relationship: group.relationship,
    isPrivate: group.isPrivate,
  });
  const isMember =
    group.relationship === "member" || group.relationship === "moderator";

  async function run(call: () => Promise<unknown>, ok: string): Promise<boolean> {
    setPending(true);
    try {
      await call();
      toast.success(ok);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="flex h-full flex-col border border-rule bg-card p-6 transition-colors hover:border-rule-strong">
      <div className="flex items-start justify-between gap-3">
        <h3 className="display-subheading line-clamp-2 text-xl leading-snug text-foreground">
          {group.name}
        </h3>
        <PrivacyPill isPrivate={group.isPrivate} className="shrink-0" />
      </div>

      {group.description ? (
        <p className="mt-2 line-clamp-2 text-sm leading-body text-muted-foreground">
          {group.description}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RelationshipPill relationship={group.relationship} />
        <span className="tabular inline-flex items-center gap-1 rounded-sm border border-rule bg-surface-sunken px-2 py-1 text-xs font-bold text-muted-foreground">
          <Users size={14} aria-hidden />
          {pluralize(group.memberCount, "member")}
        </span>
      </div>

      {group.relationship === "request_pending" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Your last request to join this group was declined. You can ask again.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 border-t border-rule pt-4">
        {group.pendingRequestCount > 0 && isMember ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpen(group._id)}
            >
              <Users size={15} aria-hidden />
              Review requests ({group.pendingRequestCount})
            </Button>
          ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {action.kind === "join" ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    await join({ groupId: group._id });
                  },
                  `You have joined ${group.name}`,
                )
              }
            >
              {pending ? (
                <Loader2 size={15} aria-hidden className="animate-spin" />
              ) : (
                <Plus size={15} aria-hidden />
              )}
              {action.label}
            </Button>
          ) : action.kind === "request" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setNoteOpen(true)}
            >
              <Plus size={15} aria-hidden />
              {action.label}
            </Button>
          ) : action.kind === "cancel_request" ? (
            // A pending relationship always carries its request id, but the
            // button is disabled rather than crashing if that ever stops being
            // true — a dead control is better than a thrown render.
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !group.myPendingRequestId}
              onClick={() => {
                const requestId = group.myPendingRequestId;
                if (!requestId) return;
                void run(
                  async () => {
                    await cancel({ requestId });
                  },
                  "Request withdrawn",
                );
              }}
            >
              {pending ? (
                <Loader2 size={15} aria-hidden className="animate-spin" />
              ) : null}
              {action.label}
            </Button>
          ) : isMember ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    const result = await leaveGroup({ groupId: group._id });
                    if (result.outcome === "promoted_and_left") {
                      toast.success(
                        "You left — the longest-standing member took over as moderator",
                      );
                    }
                  },
                  `You have left ${group.name}`,
                )
              }
            >
              {pending ? (
                <Loader2 size={15} aria-hidden className="animate-spin" />
              ) : (
                <LogOut size={15} aria-hidden />
              )}
              Leave
            </Button>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-bold",
                group.relationship === "moderator"
                  ? "border-brand/30 bg-brand/10 text-brand-ink"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500/90",
              )}
            >
              {action.label}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpen(group._id)}
            className="text-muted-foreground"
          >
            <MessageSquare size={15} aria-hidden />
            Details
          </Button>
        </div>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to join {group.name}</DialogTitle>
            <DialogDescription>
              This group is invite-only, so a moderator has to approve you first.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(
                async () => {
                  await join({
                    groupId: group._id,
                    message: note.trim() || undefined,
                  });
                },
                "Request sent to the moderators",
              );
              if (ok) {
                setNoteOpen(false);
                setNote("");
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={`note-${group._id}`}>Note (optional)</Label>
              <Textarea
                id={`note-${group._id}`}
                value={note}
                maxLength={400}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why you would like to join"
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNoteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending}
              >
                {pending ? (
                  <Loader2 size={16} aria-hidden className="animate-spin" />
                ) : null}
                Send request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  onCreated: (groupId: string) => void;
}) {
  const create = useMutation(groupsApi.createGroup);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a study group</DialogTitle>
          <DialogDescription>
            Groups belong to a course. Any student enrolled in {courseTitle} — or
            its instructor — can open one, and you become its first moderator.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              const groupId = await create({
                courseId,
                name: name.trim(),
                description: description.trim() || undefined,
                isPrivate,
              });
              toast.success("Group created — you are its first moderator");
              setName("");
              setDescription("");
              setIsPrivate(false);
              onOpenChange(false);
              onCreated(groupId);
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
              <Label htmlFor="new-group-name">Name</Label>
              <Input
                id="new-group-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Week 3 problem solvers"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-group-description">Description (optional)</Label>
              <Textarea
                id="new-group-description"
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What you will work on together, and when."
              />
            </div>
            <div className="flex items-start gap-3 rounded-sm border border-rule p-3">
              <input
                id="new-group-private"
                type="checkbox"
                checked={isPrivate}
                onChange={(event) => setIsPrivate(event.target.checked)}
                className="mt-1 size-4 accent-brand"
              />
              <Label htmlFor="new-group-private" className="leading-snug">
                Invite only
                <span className="block text-xs text-muted-foreground font-normal">
                  Open groups can be joined by any enrolled student straight
                  away. Invite-only groups need a moderator to approve each
                  person.
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || name.trim().length < 3}
            >
              {saving ? (
                <Loader2 size={16} aria-hidden className="animate-spin" />
              ) : null}
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A `?group=` id for a group the caller cannot see must not blank the page —
 * `useQuery` throws, and an unhandled throw takes the whole route with it.
 * This turns that into the same designed empty state everything else uses.
 */
class GroupErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Group unavailable"
          description="This group does not exist, or it belongs to a course you cannot reach. Study groups are only visible to people enrolled in the course, to its instructor, and to admins."
          tone="warning"
          action={
            <Button render={<Link href="/dashboard/groups" />} size="lg">
              Back to my groups
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}