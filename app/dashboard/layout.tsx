"use client";

import { api } from "@/convex/_generated/api";
import { UserButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import {
    Award,
    Bell,
    BookOpen,
    ClipboardList,
    FileStack,
    GraduationCap,
    Inbox,
    LayoutDashboard,
    LogOut,
    Mail,
    Search,
    Settings,
    UserCircle2,
    UserRound,
    Users,
    EyeOff,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

import { friendsApi } from "@/lib/friends-api";
import { inboxApi } from "@/lib/inbox-api";

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

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const dbUser = useQuery(api.users.getCurrentUser);
    const isInstructor = dbUser?.role === "instructor" || dbUser?.role === "admin";
    const isAdmin = dbUser?.role === "admin";

    // Real friends now, replacing a hardcoded pravatar.cc placeholder list.
    // The sidebar is chrome, so this is capped and cheap; the full list and
    // every activity summary live on /dashboard/friends.
    const friends = useQuery(friendsApi.listSidebarFriends, { limit: 6 });
    const pendingFriendRequests = useQuery(friendsApi.getPendingRequestCount);
    // Drives the header's Messages / Notifications badges. One query for both
    // counts rather than two, so the header costs a single subscription.
    const unread = useQuery(inboxApi.getUnreadCounts);

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
            <Sidebar className="border-r bg-sidebar" collapsible="icon">
                {/* The 48px collapsed rail (data-collapsible=icon) has no room for
                    the wordmark, so the padding tightens and the compact brand
                    mark takes over. On mobile the sheet renders no
                    `data-collapsible` at all, so the wordmark always shows there. */}
                <SidebarHeader className="py-5 px-4 group-data-[collapsible=icon]:px-2">
                    <Link
                        href="/dashboard"
                        aria-label="Glypha Learn — dashboard home"
                        className="flex items-center justify-center rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    >
                        {/* The mark ships as flat #945DA3, which drops to 2.6:1 on
                            the sidebar's dark surface (it gets 3.2:1 on the
                            navbar's darker one). `brightness` lifts it without
                            swapping in a second asset — there is no dark
                            variant in public/. */}
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
                        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-md group-data-[collapsible=icon]:flex">
                            <GraduationCap size={16} />
                        </span>
                    </Link>
                </SidebarHeader>

                <SidebarContent className="px-3 gap-6">
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-2 px-3">
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
                                                className={`px-4 py-5 rounded-xl [&>svg]:size-5 ${
                                                    active
                                                        ? "bg-accent text-accent-foreground font-medium"
                                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                                }`}
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
                                                        className="ml-auto bg-brand text-brand-foreground"
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
                        <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-2 px-3">
                            Friends
                            {pendingFriendRequests ? (
                                <span className="ml-2 font-semibold text-brand">
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
                                                        className="flex items-center gap-3 px-3 rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                                                    />
                                                }
                                            >
                                                <Avatar className="w-10 h-10 border border-border shadow-sm">
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
                            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"
                        >
                            <UserCircle2 size={20} />
                            Instructor Tools
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/users"
                            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"
                        >
                            <Users size={20} />
                            Admin Console
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/certificates"
                            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"
                        >
                            <Award size={20} />
                            Certificates
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/certificate-templates"
                            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"
                        >
                            <FileStack size={20} />
                            Templates
                        </Link>
                    )}
                    {isAdmin && (
                        <Link
                            href="/dashboard/admin/unpublish-requests"
                            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"
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
                                        className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl transition-colors"
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
                                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-[#FF4949] hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
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
                                className="pl-11 h-12 rounded-full border-0 bg-card shadow-sm ring-1 ring-border text-[15px] focus-visible:ring-brand/20"
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
                                className="relative w-10 h-10 rounded-full bg-card hover:bg-accent shadow-sm border border-border transition-colors"
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
                                        className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center"
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
                                className="relative w-10 h-10 rounded-full bg-card hover:bg-accent shadow-sm border border-border transition-colors"
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
                                        className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#FF4949] text-white text-[10px] font-bold grid place-items-center"
                                    >
                                        {unread.notifications > 99
                                            ? "99+"
                                            : unread.notifications}
                                    </span>
                                ) : (
                                    <span
                                        aria-hidden
                                        className="absolute top-2.5 right-3 w-1.5 h-1.5 bg-[#FF4949] rounded-full"
                                    />
                                )}
                            </Button>
                        </div>
                        <div className="flex items-center gap-3 pl-3 border-l border-border sm:pl-6">
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
