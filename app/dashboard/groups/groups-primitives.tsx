"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Archive,
  Globe2,
  Lock,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { cn, pluralize } from "@/lib/utils";
import { initials } from "@/lib/groups";
import type { GroupMemberRole, GroupRelationship } from "@/lib/groups";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Small presentational pieces shared by the groups list and the group detail.
 *
 * Kept in one file because they are only meaningful together: the pill set is
 * how the page says what state something is in, and every one of them pairs its
 * colour with a word, so nothing here is ever colour-only.
 */

const PILL_BASE =
  "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold";

/**
 * The caller's seat in a group. Colour + icon + word together: a purple pill
 * that also says "Moderator" reads correctly to somebody who cannot see the
 * purple.
 */
export function RelationshipPill({
  relationship,
  className,
}: {
  relationship: GroupRelationship;
  className?: string;
}) {
  if (relationship === "moderator") {
    return (
      <span
        className={cn(PILL_BASE, "text-brand-ink bg-brand/20", className)}
      >
        <ShieldCheck size={14} aria-hidden />
        Moderator
      </span>
    );
  }
  if (relationship === "member") {
    return (
      <span className={cn(PILL_BASE, "text-emerald-600 bg-emerald-500/10", className)}>
        <UserCheck size={14} aria-hidden />
        Joined
      </span>
    );
  }
  if (relationship === "pending") {
    return (
      <span className={cn(PILL_BASE, "text-amber-600 bg-amber-500/10", className)}>
        <Users size={14} aria-hidden />
        Request pending
      </span>
    );
  }
  if (relationship === "request_pending") {
    return (
      <span className={cn(PILL_BASE, "text-muted-foreground bg-muted", className)}>
        <Users size={14} aria-hidden />
        Previously declined
      </span>
    );
  }
  return (
    <span className={cn(PILL_BASE, "text-muted-foreground bg-muted", className)}>
      <Users size={14} aria-hidden />
      Not joined
    </span>
  );
}

/** Public vs private. Private groups are listed, not hidden — see `browseGroupsForCourse`. */
export function PrivacyPill({
  isPrivate,
  className,
}: {
  isPrivate: boolean;
  className?: string;
}) {
  return isPrivate ? (
    <span
      className={cn(PILL_BASE, "text-brand-ink bg-brand/10", className)}
    >
      <Lock size={14} aria-hidden />
      Private
    </span>
  ) : (
    <span className={cn(PILL_BASE, "text-muted-foreground bg-muted", className)}>
      <Globe2 size={14} aria-hidden />
      Open
    </span>
  );
}

/** Archived is a state, not a deletion: the messages are all still there. */
export function ArchivedPill({ className }: { className?: string }) {
  return (
    <span className={cn(PILL_BASE, "text-muted-foreground bg-muted", className)}>
      <Archive size={14} aria-hidden />
      Archived
    </span>
  );
}

export function MemberRoleBadge({
  role,
  className,
}: {
  role: GroupMemberRole;
  className?: string;
}) {
  return role === "moderator" ? (
    <span className={cn(PILL_BASE, "text-brand-ink bg-brand/20", className)}>
      <ShieldCheck size={14} aria-hidden />
      Moderator
    </span>
  ) : (
    <span
      className={cn(PILL_BASE, "text-muted-foreground bg-muted", className)}
    >
      <Users size={14} aria-hidden />
      Member
    </span>
  );
}

/**
 * The empty state every list in this feature falls back to: dashed card, a
 * muted rounded square holding a 32px icon, a bold heading, a centred line of
 * copy and — when there is somewhere to go — a real button. A blank region
 * reads as "broken", not "empty".
 */
export function GroupsEmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 bg-card rounded-3xl border border-dashed border-border">
      <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4 text-muted-foreground">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2 text-center">
        {title}
      </h3>
      <p className="text-muted-foreground max-w-sm text-center text-sm">
        {body}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function MemberAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl: string | null;
  className?: string;
}) {
  if (imageUrl) {
    // A plain <img> on purpose: avatars come from Clerk/Clerk-hosted URLs and
    // next/image would demand every host be allow-listed in the CSP.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={cn(
          "size-9 rounded-full border border-border object-cover bg-muted shrink-0",
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "size-9 rounded-full border border-border bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Three numbers about your groups. Live-updating, so the values sit in a
 * polite live region — a screen-reader user should hear "3 requests to review"
 * without the focus jumping anywhere.
 */
export function StatsStrip({
  stats,
}: {
  stats: { myGroups: number; pendingRequestsToReview: number; totalMembersAcrossMyGroups: number };
}) {
  const items = [
    {
      label: "Groups you are in",
      value: pluralize(stats.myGroups, "group"),
      icon: <Users size={16} aria-hidden />,
    },
    {
      label: "Requests to review",
      value: pluralize(stats.pendingRequestsToReview, "request"),
      icon: <UserCheck size={16} aria-hidden />,
    },
    {
      label: "Members across them",
      value: pluralize(stats.totalMembersAcrossMyGroups, "member"),
      icon: <ShieldCheck size={16} aria-hidden />,
    },
  ];

  return (
    <div
      aria-live="polite"
      className="grid grid-cols-1 sm:grid-cols-3 gap-4"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 bg-card rounded-[24px] border border-border shadow-sm px-5 py-4"
        >
          <span className="w-10 h-10 rounded-2xl bg-brand/10 text-brand-ink flex items-center justify-center shrink-0">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-bold text-foreground leading-tight">
              {item.value}
            </span>
            <span className="block text-xs text-muted-foreground font-medium">
              {item.label}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatsStripSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 bg-card rounded-[24px] border border-border shadow-sm px-5 py-4"
        >
          <Skeleton className="size-10 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** One group card's worth of skeleton, so the grid does not jump on load. */
export function GroupCardSkeleton() {
  return (
    <div className="bg-card rounded-[24px] border border-border shadow-sm p-6 flex flex-col gap-4">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-md" />
        <Skeleton className="h-6 w-20 rounded-md" />
      </div>
      <div className="pt-4 border-t border-border flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
    </div>
  );
}

/** Full-page skeleton for the Suspense boundary and first paint. */
export function GroupsPageSkeleton() {
  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <StatsStripSkeleton />
      <Skeleton className="h-12 w-64 rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <GroupCardSkeleton />
        <GroupCardSkeleton />
        <GroupCardSkeleton />
      </div>
    </div>
  );
}

export function TextButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-bold text-brand-ink hover:underline focus-visible:ring-2 focus-visible:ring-[#945DA3]/20 rounded-md px-1 py-2"
    >
      {children}
    </Link>
  );
}