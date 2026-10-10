"use client";

/**
 * The dashboard sidebar: brand, mode switch, grouped nav, friends, footer.
 *
 * Extracted out of `app/dashboard/layout.tsx` because the file was doing three
 * jobs at once — the provider, the nav, and the page header — and the nav alone
 * was most of it. What changed here is *structure*, not taste:
 *
 * · Twelve hand-rolled `isAdmin && <Link>` anchors in the footer become three
 *   declared groups (`components/dashboard-nav.ts`). The footer links had no
 *   group labels, no active state and no badges, and `/dashboard/admin/applications`
 *   was missing from them entirely.
 * · Groups are collapsible, and the group containing the current route is
 *   forced open. A student therefore sees seven items; an admin on
 *   `/dashboard/admin` sees their eleven without the learner noise.
 * · The 48px collapsed rail gets its own flat branch. `SidebarGroupLabel`
 *   collapses to `opacity-0` in rail mode, so a grouped sidebar would otherwise
 *   show an admin literally nothing — see `railMode` below.
 */
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import {
    ChevronDown,
    GraduationCap,
    LogOut,
    Settings,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import {
    badgeCountFor,
    capBadge,
    currentItemHref,
    groupsForRole,
    activeGroupFor,
    modeForPath,
    type NavBadge,
    type NavGroup,
    type NavItem,
    type Role,
} from "@/components/dashboard-nav";
import { friendsApi, type SidebarFriend } from "@/lib/friends-api";
import { inboxApi } from "@/lib/inbox-api";
import { cn } from "@/lib/utils";

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    ModeToggle,
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModeSwitcher } from "@/components/mode-switcher";

type BadgeCounts = Partial<Record<NavBadge, number>>;

/* ── links ───────────────────────────────────────────────────────────────── */

/**
 * One nav row.
 *
 * The active treatment is a brand bar at the inline-start edge plus weight, the
 * same vocabulary as `Tabs variant="rule"` — not the filled plate the primitive
 * ships. Suppressing that plate needs `!important` because both declarations
 * carry equal specificity and source order would otherwise decide.
 */
function NavLink({
    item,
    count,
    allItems,
    className,
}: {
    item: NavItem;
    count: number;
    /**
     * Every item in scope, so the active one can be resolved as the *longest*
     * matching href rather than a bare prefix test. Without this,
     * `/dashboard/instructor` would claim `/dashboard/instructor/courses` and
     * two items would light at once. See `matchingItem`.
     */
    allItems: NavItem[];
    className?: string;
}) {
    const pathname = usePathname();
    const active = currentItemHref(pathname, allItems) === item.href;

    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                isActive={active}
                // Self-hides unless the rail is actually collapsed — the
                // primitive checks the same two conditions internally.
                tooltip={item.label}
                className={cn(
                    "relative rounded-sm px-4 py-5 [&>svg]:size-5",
                    "data-active:!bg-transparent",
                    active
                        ? "font-semibold text-foreground after:absolute after:inset-y-2 after:left-0 after:w-0.5 after:bg-brand"
                        : "text-muted-foreground",
                    className,
                )}
                render={
                    <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                    />
                }
            >
                <item.icon
                    className={active ? "text-brand" : undefined}
                    aria-hidden
                />
                <span className="text-[15px] font-medium">{item.label}</span>
                {count > 0 ? (
                    <SidebarMenuBadge
                        // Not colour-only: the count is text, so a screen reader
                        // announces "3 unread" too.
                        aria-label={`${count} pending`}
                        className="ml-auto bg-brand text-brand-foreground tabular"
                    >
                        {capBadge(count)}
                    </SidebarMenuBadge>
                ) : null}
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

/* ── groups ──────────────────────────────────────────────────────────────── */

/**
 * A collapsible group of links.
 *
 * Open state is seeded from whether the current route is inside the group, and
 * re-forced whenever that becomes true — so the group you are standing in is
 * never collapsed out from under you, and no other group opens by accident. A
 * student sees one open group of seven; an admin sees their own open and the
 * other two closed to a label and a chevron.
 */
function SidebarNavGroup({
    group,
    allItems,
    counts,
    children,
}: {
    group: NavGroup;
    allItems: NavItem[];
    counts: BadgeCounts;
    /** Rendered after the links — the friends list lives under Learn. */
    children?: React.ReactNode;
}) {
    const pathname = usePathname();
    // "Contains the current route" has to use the same longest-match resolution
    // as the links themselves, or a group could open for a page that no link in
    // it actually highlights.
    const current = currentItemHref(pathname, allItems);
    const containsCurrent = group.items.some((item) => item.href === current);
    const [open, setOpen] = useState(containsCurrent);

    // Adjusting state during render rather than in an effect: navigating into
    // this group re-opens it immediately, in the same commit, with no cascading
    // render and no frame where the current page has no visible link. The
    // previous value is tracked so this only runs on an actual change.
    const [wasContainingCurrent, setWasContainingCurrent] =
        useState(containsCurrent);
    if (containsCurrent !== wasContainingCurrent) {
        setWasContainingCurrent(containsCurrent);
        if (containsCurrent) setOpen(true);
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <SidebarGroup>
                <SidebarGroupLabel
                    className="eyebrow group/collapse mb-2 cursor-pointer px-3 transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    render={<CollapsibleTrigger />}
                >
                    {group.label}
                    <ChevronDown
                        aria-hidden
                        className="ml-auto size-3.5 -rotate-90 transition-transform group-data-[open]/collapse:rotate-0"
                    />
                </SidebarGroupLabel>

                <CollapsibleContent>
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-2">
                            {group.items.map((item) => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    count={badgeCountFor(item, counts)}
                                    allItems={allItems}
                                />
                            ))}
                        </SidebarMenu>
                        {children}
                    </SidebarGroupContent>
                </CollapsibleContent>
            </SidebarGroup>
        </Collapsible>
    );
}

/* ── friends ─────────────────────────────────────────────────────────────── */

/**
 * Real friends, capped — the sidebar is chrome, so this is deliberately small;
 * the full list and every activity summary live on /dashboard/friends.
 *
 * It sits inside the Learn group rather than beside it so it collapses with the
 * group instead of nesting a second disclosure inside the first, and the pending
 * request count moved from the group label onto the Friends link, where it now
 * badges the one item it describes.
 */
function FriendsBlock({
    friends,
}: {
    friends: SidebarFriend[] | undefined;
}) {
    return (
        <div className="mt-4 border-t border-sidebar-border pt-3">
            {/* Empty until the learner actually befriends someone. An empty list
                would collapse the whole block, so the line alone is the
                affordance until there is a row to show. */}
            {friends && friends.length > 0 ? (
                <SidebarMenu className="gap-4">
                    {friends.map((friend) => (
                        <Tooltip key={friend._id}>
                            <TooltipTrigger
                                render={
                                    <Link
                                        href="/dashboard/friends"
                                        className="flex items-center gap-3 rounded-sm px-3 focus-ring"
                                    />
                                }
                            >
                                <Avatar className="w-10 h-10 border border-rule">
                                    {friend.imageUrl ? (
                                        <AvatarImage
                                            src={friend.imageUrl}
                                            alt=""
                                        />
                                    ) : null}
                                    <AvatarFallback
                                        aria-hidden
                                        className="bg-brand/15 text-brand-ink"
                                    >
                                        {friend.name.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col min-w-0">
                                    <span className="truncate text-sm font-semibold text-foreground transition-colors hover:text-brand">
                                        {friend.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground capitalize">
                                        {friend.role}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent
                                side="right"
                                className="bg-foreground font-medium text-background"
                            >
                                View friends
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </SidebarMenu>
            ) : (
                <p className="px-3 text-sm text-muted-foreground">
                    No friends yet.{" "}
                    <Link
                        href="/dashboard/friends?tab=discover"
                        className="font-semibold text-brand hover:underline"
                    >
                        Find learners
                    </Link>
                </p>
            )}
        </div>
    );
}

/* ── sidebar ─────────────────────────────────────────────────────────────── */

export function DashboardSidebar() {
    const { signOut } = useClerk();
    const dbUser = useQuery(api.users.getCurrentUser);
    const role: Role | undefined = dbUser?.role;

    // The mobile Sheet renders no `data-collapsible` attribute at all, so the
    // drawer must keep its groups even when the desktop sidebar is collapsed.
    // Branching on `state` alone would flatten the mobile nav for anyone who
    // ever collapsed the rail on desktop.
    const { state, isMobile } = useSidebar();
    const railMode = !isMobile && state === "collapsed";

    // Every one of these `requireUser` (or `requireAdmin`), which throws until
    // the Convex `users` row exists — that row is created by the Clerk webhook,
    // or by `EnsureCurrentUser` a beat after first paint. Subscribing before it
    // lands logs "Not authenticated" on every dashboard load. Skipping is also
    // correct for a suspended account, which reads as signed out everywhere.
    const friends = useQuery(
        friendsApi.listSidebarFriends,
        dbUser ? { limit: 6 } : "skip",
    );
    const isAdmin = role === "admin";
    const pendingApplications = useQuery(
        api.instructorApplications.countPendingApplications,
        isAdmin ? {} : "skip",
    );
    const pendingUnpublish = useQuery(
        api.courses.countPendingUnpublishRequests,
        isAdmin ? {} : "skip",
    );

    // One query drives both header counts rather than two, so the header costs a
    // single subscription.
    const unread = useQuery(inboxApi.getUnreadCounts, dbUser ? {} : "skip");

    const counts: BadgeCounts = {
        unread: (unread?.messages ?? 0) + (unread?.notifications ?? 0),
        pendingApplications: pendingApplications ?? 0,
        pendingUnpublish: pendingUnpublish ?? 0,
    };

    /**
     * One set of items at a time, taken from the console you are standing in.
     *
     * The nav used to render every group the role could reach, stacked, which
     * made switching mode look like the new console had been appended *below* the
     * learner pages rather than replacing them. The mode switcher now swaps the
     * whole sidebar instead: the URL decides the mode, and exactly that mode's
     * group is on screen.
     *
     * `groupsForRole` is still the gate, so this never reveals a console the
     * role cannot open — a student who hand-types /dashboard/admin gets the
     * learner items back, and the page itself says "Access Denied".
     */
    const accessibleGroups = groupsForRole(role);
    const pathname = usePathname();
    const activeMode = modeForPath(pathname);
    // One group at a time — the URL decides which, and `activeGroupFor` keeps the
    // role filter applied so a console is never shown to someone who cannot
    // open it.
    const activeGroup = activeGroupFor(accessibleGroups, pathname);

    // A console route before the role has resolved: showing the learner items
    // would flash the wrong nav and then swap it. Hold a skeleton instead — the
    // path already says which mode this is, we just cannot yet promise the
    // links are addressable.
    const resolvingConsole = dbUser === undefined && activeMode !== "student";

    // Only the active group's items, in nav order. The collapsed rail and the
    // group body both read this, so they can never disagree about what is on
    // screen.
    const allItems = activeGroup?.items ?? [];

    return (
        <Sidebar className="border-r border-rule bg-sidebar" collapsible="icon">
            {/* The 48px collapsed rail (data-collapsible=icon) has no room for
                the wordmark, so the padding tightens and the compact brand mark
                takes over. On mobile the sheet renders no `data-collapsible` at
                all, so the wordmark always shows there. */}
            <SidebarHeader className="gap-3 py-5 px-4 group-data-[collapsible=icon]:px-2">
                <Link
                    href="/dashboard"
                    aria-label="Glypha Learn — dashboard home"
                    className="flex items-center justify-center rounded-sm focus-ring"
                >
                    {/* The mark ships as the flat brand purple, which drops to
                        2.6:1 on the sidebar's dark surface. `brightness` lifts
                        it without swapping in a second asset — there is no dark
                        variant in public/. */}
                    <Image
                        src="/Logo.svg"
                        alt="Glypha Learn"
                        width={112}
                        height={56}
                        className="h-auto w-28 shrink-0 dark:brightness-[1.35] group-data-[collapsible=icon]:hidden"
                    />
                    {/* Same purple graduation-cap mark used on the verify page
                        and 404 — the compact brand glyph in this codebase. */}
                    <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-brand text-brand-foreground group-data-[collapsible=icon]:flex">
                        <GraduationCap size={16} />
                    </span>
                </Link>

                <ModeSwitcher role={role} />
            </SidebarHeader>

            <SidebarContent className="px-3 gap-4">
                {railMode ? (
                    // Flat rail: every item as an icon, each with its label on
                    // hover. Group structure has no 48px to live in. Still only
                    // the active mode's items — the rail is the same nav.
                    <SidebarMenu className="gap-2">
                        {allItems.map((item) => (
                            <NavLink
                                key={item.href}
                                item={item}
                                count={badgeCountFor(item, counts)}
                                allItems={allItems}
                            />
                        ))}
                    </SidebarMenu>
                ) : resolvingConsole ? (
                    // Role still loading on a console route. Hold the shape
                    // rather than showing the learner items and swapping.
                    <SidebarGroup>
                        <Skeleton className="ml-3 h-3 w-16" />
                        <div className="mt-3 space-y-2">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <Skeleton
                                    key={i}
                                    className="h-11 w-full rounded-sm"
                                />
                            ))}
                        </div>
                    </SidebarGroup>
                ) : activeGroup ? (
                    <SidebarNavGroup
                        group={activeGroup}
                        allItems={allItems}
                        counts={counts}
                    >
                        {activeGroup.id === "learn" ? (
                            <FriendsBlock friends={friends} />
                        ) : null}
                    </SidebarNavGroup>
                ) : null}
            </SidebarContent>

            <SidebarFooter className="mt-auto space-y-1 p-4">
                <div className="flex items-center gap-2 px-3">
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Link
                                    href="/dashboard/settings"
                                    className="flex min-h-[44px] flex-1 items-center gap-3 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-ring"
                                />
                            }
                        >
                            <Settings size={20} aria-hidden />
                            Settings
                        </TooltipTrigger>
                        <TooltipContent
                            side="right"
                            className="bg-foreground font-medium text-background"
                        >
                            Customize your dashboard and your account
                        </TooltipContent>
                    </Tooltip>
                    <ModeToggle />
                </div>

                <Tooltip>
                    <TooltipTrigger
                        render={
                            <button
                                type="button"
                                className="flex min-h-[44px] w-full items-center gap-3 rounded-sm text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus-ring"
                                onClick={() => signOut()}
                            />
                        }
                    >
                        <LogOut size={20} aria-hidden />
                        Logout
                    </TooltipTrigger>
                    <TooltipContent
                        side="right"
                        className="bg-foreground font-medium text-background"
                    >
                        Sign out of Glypha Learn
                    </TooltipContent>
                </Tooltip>
            </SidebarFooter>
        </Sidebar>
    );
}