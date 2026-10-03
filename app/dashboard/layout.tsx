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
    Users,
    EyeOff,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";

import {
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
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui";

const MOCK_FRIENDS = [
    { name: "Bagas Mahpie", role: "Friend", img: "https://i.pravatar.cc/100?u=1" },
    { name: "Sir Dandy", role: "Old Friend", img: "https://i.pravatar.cc/100?u=2" },
    { name: "Jhon Tosan", role: "Friend", img: "https://i.pravatar.cc/100?u=3" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const dbUser = useQuery(api.users.getCurrentUser);
    const isInstructor = dbUser?.role === "instructor" || dbUser?.role === "admin";
    const isAdmin = dbUser?.role === "admin";

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
                                <SidebarMenuItem>
                                    <SidebarMenuButton
                                        isActive
                                        className="bg-accent text-accent-foreground font-medium rounded-xl px-4 py-5 [&>svg]:size-5"
                                    >
                                        <LayoutDashboard className="text-[#945DA3]" />
                                        <Link href="/dashboard" className="text-[15px]">
                                            Dashboard
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>

                                <SidebarMenuItem>
                                    <Tooltip>
                                        <TooltipTrigger
                                            render={
                                                <SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground" />
                                            }
                                        >
                                            <Inbox />
                                            <span className="text-[15px] font-medium">Inbox</span>
                                        </TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="bg-foreground text-background font-medium"
                                        >
                                            Coming soon
                                        </TooltipContent>
                                    </Tooltip>
                                </SidebarMenuItem>

                                <SidebarMenuItem>
                                    <SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground">
                                        <BookOpen />
                                        <Link href="/dashboard/courses" className="text-[15px] font-medium">
                                            Lesson
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>

                                <SidebarMenuItem>
                                    <SidebarMenuButton
                                        className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5"
                                        render={<Link href="/dashboard/certificates" />}
                                    >
                                        <Award className="text-[#945DA3]" />
                                        <span className="text-[15px] font-medium">
                                            Certificates
                                        </span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>

                                <SidebarMenuItem>
                                    <Tooltip>
                                        <TooltipTrigger
                                            render={
                                                <SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground" />
                                            }
                                        >
                                            <ClipboardList />
                                            <span className="text-[15px] font-medium">Task</span>
                                        </TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="bg-foreground text-background font-medium"
                                        >
                                            Coming soon
                                        </TooltipContent>
                                    </Tooltip>
                                </SidebarMenuItem>

                                <SidebarMenuItem>
                                    <Tooltip>
                                        <TooltipTrigger
                                            render={
                                                <SidebarMenuButton className="px-4 py-5 hover:bg-accent hover:text-accent-foreground rounded-xl [&>svg]:size-5 text-muted-foreground" />
                                            }
                                        >
                                            <Users />
                                            <span className="text-[15px] font-medium">Group</span>
                                        </TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="bg-foreground text-background font-medium"
                                        >
                                            Coming soon
                                        </TooltipContent>
                                    </Tooltip>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    <SidebarGroup>
                        <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-2 px-3">
                            Friends
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu className="gap-4 mt-2">
                                {MOCK_FRIENDS.map((f, i) => (
                                    <Tooltip key={i}>
                                        <TooltipTrigger>
                                            <div className="flex items-center gap-3 px-3 cursor-pointer group">
                                                <img
                                                    src={f.img}
                                                    alt={f.name}
                                                    className="w-10 h-10 rounded-full border border-border shadow-sm"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-foreground hover:text-[#945DA3] transition-colors">
                                                        {f.name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">{f.role}</span>
                                                </div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent
                                            side="right"
                                            className="bg-foreground text-background font-medium"
                                        >
                                            Coming soon
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
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
                                className="pl-11 h-12 rounded-full border-0 bg-card shadow-sm ring-1 ring-border text-[15px] focus-visible:ring-[#945DA3]/20"
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
                            <button aria-label="Messages" className="relative w-10 h-10 flex items-center justify-center rounded-full bg-card hover:bg-accent shadow-sm border border-border transition-colors">
                                <Mail size={18} className="text-muted-foreground" />
                            </button>
                            <button aria-label="Notifications" className="relative w-10 h-10 flex items-center justify-center rounded-full bg-card hover:bg-accent shadow-sm border border-border transition-colors">
                                <Bell size={18} className="text-muted-foreground" />
                                <span className="absolute top-2.5 right-3 w-1.5 h-1.5 bg-[#FF4949] rounded-full" />
                            </button>
                        </div>
                        <div className="flex items-center gap-3 pl-3 border-l border-border sm:pl-6">
                            <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
                            <span className="font-semibold text-foreground hidden sm:block">
                                {user?.fullName || "Student"}
                            </span>
                        </div>
                    </div>
                </header>

                <main className="p-4 pt-2 sm:p-6 sm:pt-2 lg:p-8 lg:pt-2">{children}</main>
            </SidebarInset>
        </SidebarProvider>
    );
}
