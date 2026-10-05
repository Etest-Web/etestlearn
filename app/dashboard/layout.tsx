"use client";

import { api } from "@/convex/_generated/api";
import { UserButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import {
    Award,
    Bell,
    BookOpen,
    ClipboardList,
    Gauge,
    GraduationCap,
    Inbox,
    LayoutDashboard,
    LogOut,
    Mail,
    Megaphone,
    MessagesSquare,
    ScrollText,
    Search,
    Settings,
    Tags,
    UserCircle2,
    UserRound,
    Users,
    Wallet,
    EyeOff,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { friendsApi } from "@/lib/friends-api";
import { inboxApi } from "@/lib/inbox-api";
import { cn } from "@/lib/utils";

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    Input,
    ModeToggle,
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui";

/**
 * The overview nav, declared once. This list used to be six hand-copied blocks
 * with a "Coming soon" tooltip bolted onto whichever routes did not exist yet,
 * which meant every new section needed the same edit in four places and the
 * "coming soon" markers outlived the gaps they described. Adding a route is now
 * one entry here.
 */
const OVERVIEW_NAV = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
    { href: "/dashboard/courses", label: "Lesson", icon: BookOpen },
    { href: "/dashboard/certificates", label: "Certificates", icon: Award },
    { href: "/dashboard/tasks", label: "Task", icon: ClipboardList },
    { href: "/dashboard/groups", label: "Group", icon: Users },
    { href: "/dashboard/friends", label: "Friends", icon: UserRound },
] as const;

/**
 * The sidebar's footer rows (Instructor Tools, Admin Console, Settings, …) are
 * hand-rolled anchors rather than `SidebarMenuButton`s, so they get one shared
 * treatment instead of six copies of it: quiet label, sidebar-accent lift on
 * hover, brand bar reserved for the section nav above.
 */
const FOOTER_LINK =
    "flex items-center gap-3 rounded-sm px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-ring";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const dbUser = useQuery(api.users.getCurrentUser);
    const isInstructor = dbUser?.role === "instructor" || dbUser?.role === "admin";
    const isAdmin = dbUser?.role === "admin";

    // Real friends now, replacing a hardcoded pravatar.cc placeholder list.
    // The sidebar is chrome, so this is capped and cheap; the full list and
    // every activity summary live on /dashboard/friends.
    // Gated on `dbUser`: these three all `requireUser`, which throws until the
    // Convex `users` row exists. That row is created by the Clerk webhook, or
    // by `EnsureCurrentUser` a beat after first paint — so subscribing before it
    // lands logs "Not authenticated" for every dashboard load. Skipping is also
    // correct for a suspended account, which reads as signed out everywhere.
    const friends = useQuery(
        friendsApi.listSidebarFriends,
        dbUser ? { limit: 6 } : "skip",
    );
    const pendingFriendRequests = useQuery(
        friendsApi.getPendingRequestCount,
        dbUser ? {} : "skip",
    );
    // Drives the header's Messages / Notifications badges. One query for both
    // counts rather than two, so the header costs a single subscription.
    const unread = useQuery(inboxApi.getUnreadCounts, dbUser ? {} : "skip");

    // Navigation state is read here because the sidebar renders on every
    // dashboard route, so it is the one place that can mark the current item.
    // `usePathname` only tells us the section, hence the prefix match — except
    // for "/dashboard" itself: every route starts with "/dashboard/", so a
    // prefix match would keep the Dashboard entry lit on every page. Its
    // highlight is exact-match only; sub-sections keep the prefix match so
    // their sub-pages stay marked.
    const pathname = usePathname();
    const isCurrent = (href: string) =>
        href === "/dashboard"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);

    return (
        <SidebarProvider>
            <Sidebar className="border-r border-rule bg-sidebar" collapsible="icon">
                {/* The 48px collapsed rail (data-collapsible=icon) has no room for
                    the wordmark, so the padding tightens and the compact brand
                    mark takes over. On mobile the sheet renders no
                    `data-collapsible` at all, so the wordmark always shows there. */}
                <SidebarHeader className="py-5 px-4 group-data-[collapsible=icon]:px-2">
                    <Link
                        href="/dashboard"
                        aria-label="Glypha Learn — dashboard home"
                        className="flex items-center justify-center rounded-sm focus-ring"
                    >
                        {/* The mark ships as the flat brand purple, which drops to
                            2.6:1 on the sidebar's dark surface (it gets 3.2:1 on
                            the navbar's darker one). `brightness` lifts it without
                            swapping in a second asset — there is no dark variant
                            in public/, so the raw hex cannot simply be re-tinted
                            here. */}
                        <Image
                            src="/Logo.svg"
                            alt="Glypha Learn"
                            width={112}
                            height={56}
                            className="h-auto w-28 shrink-0 dark:brightness-[1.35] group-data-[collapsible=icon]:hidden"
                        />
                        {/* Same purple graduation-cap mark used on the verify
                            page and 404 — it is the compact brand glyph in this
                            codebase, so it keeps the collapsed rail legible. */}
                        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-brand text-brand-foreground group-data-[collapsible=icon]:flex">
                            <GraduationCap size={16} />
                        </span>
                    </Link>
                </SidebarHeader>

                <SidebarContent className="px-3 gap-6">
                    <SidebarGroup>
                        <SidebarGroupLabel className="eyebrow mb-2 px-3">
                            Overview
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu className="gap-2">
                                {OVERVIEW_NAV.map((item) => {
                                    const active = isCurrent(item.href);
                                    const badge =
                                        item.href === "/dashboard/inbox"
                                            ? (unread?.messages ?? 0) +
                                              (unread?.notifications ?? 0)
                                            : 0;

                                    return (
                                        <SidebarMenuItem key={item.href}>
                                            <SidebarMenuButton
                                                isActive={active}
                                                className={cn(
                                                    "relative rounded-sm px-4 py-5 [&>svg]:size-5",
                                                    // The primitive marks the current
                                                    // item with a filled plate; this
                                                    // design marks it the way
                                                    // `Tabs variant="rule"` does — a
                                                    // brand bar at the inline-start
                                                    // edge plus weight. Suppressing
                                                    // the plate needs `!important`,
                                                    // because both declarations carry
                                                    // equal specificity and source
                                                    // order would otherwise decide.
                                                    "data-active:!bg-transparent",
                                                    active
                                                        ? "font-semibold text-foreground after:absolute after:inset-y-2 after:left-0 after:w-0.5 after:bg-brand"
                                                        : "text-muted-foreground",
                                                )}
                                                render={
                                                    <Link
                                                        href={item.href}
                                                        aria-current={
                                                            active
                                                                ? "page"
                                                                : undefined
                                                        }
                                                    />
                                                }
                                            >
                                                <item.icon
                                                    className={
                                                        active
                                                            ? "text-brand"
                                                            : undefined
                                                    }
                                                />
                                                <span className="text-[15px] font-medium">
                                                    {item.label}
                                                </span>
                                                {badge > 0 && (
                                                    <SidebarMenuBadge
                                                        // Not colour-only: the
                                                        // count is text, so a
                                                        // screen reader announces
                                                        // "3 unread" too.
                                                        aria-label={`${badge} unread`}
                                                        className="ml-auto bg-brand text-brand-foreground tabular"
                                                    >
                                                        {badge > 99
                                                            ? "99+"
                                                            : badge}
                                                    </SidebarMenuBadge>
                                                )}
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    <SidebarGroup>
                        <SidebarGroupLabel className="eyebrow mb-2 px-3">
                            Friends
                            {pendingFriendRequests ? (
                                /* A sentence, so it stays in the body face at a
                                   readable size instead of inheriting the display
                                   face the label is set in. */
                                <span className="ml-2 font-sans text-[12px] font-semibold text-brand tabular">
                                    {pendingFriendRequests} pending
                                </span>
                            ) : null}
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu className="gap-4 mt-2">
                                {/* Empty until the learner actually befriends
                                    someone. An empty list would collapse the
                                    whole group, so the label alone is the
                                    affordance until there is a row to show. */}
                                {friends && friends.length > 0 ? (
                                    friends.map((friend) => (
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
                                                        {friend.name
                                                            .slice(0, 2)
                                                            .toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-semibold text-foreground hover:text-brand transition-colors truncate">
                                                        {friend.name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground capitalize">
                                                        {friend.role}
                                                    </span>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                side="right"
                                                className="bg-foreground text-background font-medium"
                                            >
                                                View friends
                                            </TooltipContent>
                                        </Tooltip>
                                    ))
                                ) : (
                                    <li className="px-3 text-sm text-muted-foreground">
                                        No friends yet.{" "}
                                        <Link
                                            href="/dashboard/friends?tab=discover"
                                            className="font-semibold text-brand hover:underline"
                                        >
                                            Find learners
                                        </Link>
                                    </li>
                                )}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>

                <SidebarFooter className="p-4 mt-auto space-y-2">
                    {isInstructor && (
                        <Link
                            href="/dashboard/instructor"
                            className={FOOTER_LINK}
                        >
                            <UserCircle2 size={20} />
                            Instructor Tools
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin"
                            className={FOOTER_LINK}
                        >
                            <Gauge size={20} />
                            Admin Overview
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/users"
                            className={FOOTER_LINK}
                        >
                            <Users size={20} />
                            Admin Users
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/courses"
                            className={FOOTER_LINK}
                        >
                            <BookOpen size={20} />
                            Admin Courses
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/payments"
                            className={FOOTER_LINK}
                        >
                            <Wallet size={20} />
                            Payments
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/discussions"
                            className={FOOTER_LINK}
                        >
                            <MessagesSquare size={20} />
                            Moderation
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/announcements"
                            className={FOOTER_LINK}
                        >
                            <Megaphone size={20} />
                            Announcements
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/categories"
                            className={FOOTER_LINK}
                        >
                            <Tags size={20} />
                            Categories
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/audit"
                            className={FOOTER_LINK}
                        >
                            <ScrollText size={20} />
                            Audit Log
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/certificates"
                            className={FOOTER_LINK}
                        >
                            <Award size={20} />
                            Certificates
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/unpublish-requests"
                            className={FOOTER_LINK}
                        >
                            <EyeOff size={20} />
                            Unpublish Requests
                        </Link>
                    )}
                    <SidebarGroup className="flex items-center gap-2 px-3">
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Link
                                        href="/dashboard/settings"
                                        className={FOOTER_LINK}
                                    />
                                }
                            >
                                <Settings size={15} />
                                Settings
                            </TooltipTrigger>
                            <TooltipContent side="right" className="bg-foreground text-background font-medium">
                                Customize your dashboard and your account
                            </TooltipContent>
                        </Tooltip>
                        <ModeToggle />
                    </SidebarGroup>
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <button
                                    type="button"
                                    className={cn(FOOTER_LINK, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
                                />
                            }
                        >
                            <LogOut size={20} />
                            Logout
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-foreground text-background font-medium">
                            Sign out via profile
                        </TooltipContent>
                    </Tooltip>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset className="bg-background min-h-dvh">
                <header className="flex h-20 items-center justify-between gap-3 px-4 bg-transparent sm:px-6 lg:px-8">
                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                        <SidebarTrigger className="lg:hidden" />
                        <form
                            action="/dashboard/search"
                            method="get"
                            className="relative max-w-md w-full hidden md:block"
                        >
                            <Search
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                                size={18}
                            />
                            <Input
                                name="q"
                                type="search"
                                placeholder="Search your course...."
                                className="h-12 rounded-sm border-rule pl-11 text-[15px]"
                            />
                        </form>
                        {/* Below md the search form above is hidden, so the
                            trigger has to live in the icon cluster instead. */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="md:hidden"
                            aria-label="Search your courses"
                            render={<Link href="/dashboard/search" />}
                        >
                            <Search className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="flex shrink-0 items-center gap-3 sm:gap-4 lg:gap-6">
                        <div className="flex items-center gap-2 sm:gap-3">
                            {/* These were two inert <button>s with no handler.
                                They now deep-link into the matching inbox tab
                                and carry live counts. */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative border border-rule"
                                render={<Link href="/dashboard/inbox?tab=messages" />}
                                aria-label={
                                    unread?.messages
                                        ? `Messages, ${unread.messages} unread`
                                        : "Messages"
                                }
                            >
                                <Mail
                                    size={18}
                                    className="text-muted-foreground"
                                />
                                {unread?.messages ? (
                                    <span
                                        aria-hidden
                                        className="tabular absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-sm bg-brand px-1 text-[10px] font-bold text-brand-foreground"
                                    >
                                        {unread.messages > 99
                                            ? "99+"
                                            : unread.messages}
                                    </span>
                                ) : null}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative border border-rule"
                                render={
                                    <Link href="/dashboard/inbox?tab=notifications" />
                                }
                                aria-label={
                                    unread?.notifications
                                        ? `Notifications, ${unread.notifications} unread`
                                        : "Notifications"
                                }
                            >
                                <Bell
                                    size={18}
                                    className="text-muted-foreground"
                                />
                                {unread?.notifications ? (
                                    <span
                                        aria-hidden
                                        className="tabular absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-sm border border-destructive/30 bg-destructive/10 px-1 text-[10px] font-bold text-destructive"
                                    >
                                        {unread.notifications > 99
                                            ? "99+"
                                            : unread.notifications}
                                    </span>
                                ) : (
                                    <span
                                        aria-hidden
                                        className="absolute right-3 top-2.5 size-1.5 rounded-full bg-destructive"
                                    />
                                )}
                            </Button>
                        </div>
                        <div className="flex items-center gap-3 border-l border-rule pl-3 sm:pl-6">
                            <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
                            <span className="font-semibold text-foreground hidden sm:block">
                                {user?.fullName || "Student"}
                            </span>
                        </div>
                    </div>
                </header>

                <main className="p-4 pt-2 sm:p-6 sm:pt-2 lg:p-8 lg:pt-2 px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,3vw,2rem)]">{children}</main>
            </SidebarInset>
        </SidebarProvider>
    );
}
