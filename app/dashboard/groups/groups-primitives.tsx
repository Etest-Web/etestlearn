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
 *
 * Each pill is a tinted plate plus a hairline. At 8–10% a tint alone is
 * invisible on paper, so the border is what makes the chip read as a chip.
 */

const PILL_BASE =
  "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-bold";

const MODERATOR_PILL = "border-brand/30 bg-brand/10 text-brand-ink";
const JOINED_PILL =
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
const PENDING_PILL =
  "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-400";
const NEUTRAL_PILL = "border-rule bg-surface-sunken text-muted-foreground";

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
      <span className={cn(PILL_BASE, MODERATOR_PILL, className)}>
        <ShieldCheck size={14} aria-hidden />
        Moderator
      </span>
    );
  }
  if (relationship === "member") {
    return (
      <span className={cn(PILL_BASE, JOINED_PILL, className)}>
        <UserCheck size={14} aria-hidden />
        Joined
      </span>
    );
  }
  if (relationship === "pending") {
    return (
      <span className={cn(PILL_BASE, PENDING_PILL, className)}>
        <Users size={14} aria-hidden />
        Request pending
      </span>
    );
  }
  if (relationship === "request_pending") {
    return (
      <span className={cn(PILL_BASE, NEUTRAL_PILL, className)}>
        <Users size={14} aria-hidden />
        Previously declined
      </span>
    );
  }
  return (
    <span className={cn(PILL_BASE, NEUTRAL_PILL, className)}>
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
    <span className={cn(PILL_BASE, MODERATOR_PILL, className)}>
      <Lock size={14} aria-hidden />
      Private
    </span>
  ) : (
    <span className={cn(PILL_BASE, NEUTRAL_PILL, className)}>
      <Globe2 size={14} aria-hidden />
      Open
    </span>
  );
}

/** Archived is a state, not a deletion: the messages are all still there. */
export function ArchivedPill({ className }: { className?: string }) {
  return (
    <span className={cn(PILL_BASE, NEUTRAL_PILL, className)}>
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
    <span className={cn(PILL_BASE, MODERATOR_PILL, className)}>
      <ShieldCheck size={14} aria-hidden />
      Moderator
    </span>
  ) : (
    <span className={cn(PILL_BASE, NEUTRAL_PILL, className)}>
      <Users size={14} aria-hidden />
      Member
    </span>
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
          "size-9 shrink-0 rounded-full border border-rule bg-surface-sunken object-cover",
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-surface-sunken text-xs font-bold text-muted-foreground",
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
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 border border-rule bg-card px-5 py-4"
        >
          <span className="flex size-10 shrink-0 items-center justify-center bg-brand/10 text-brand-ink">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="display-subheading tabular block text-xl leading-none text-foreground">
              {item.value}
            </span>
            <span className="eyebrow mt-1 block">{item.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatsStripSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border border-rule bg-card px-5 py-4"
        >
          <Skeleton className="size-10" />
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
    <div className="flex flex-col gap-4 border border-rule bg-card p-6">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-sm" />
        <Skeleton className="h-6 w-20 rounded-sm" />
      </div>
      <div className="flex items-center justify-between border-t border-rule pt-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-24 rounded-sm" />
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
      <Skeleton className="h-12 w-64" />
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
      className="link-quiet inline-flex items-center gap-1 rounded-sm px-1 py-2 text-sm font-semibold text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}