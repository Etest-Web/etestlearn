"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { Bell, Mail, Search } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

import { api } from "@/convex/_generated/api";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { inboxApi } from "@/lib/inbox-api";

import { Button, Input, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui";

/**
 * The dashboard chrome: sidebar on the left, page header above the content.
 *
 * The nav itself lives in `components/dashboard-sidebar.tsx` and its routes in
 * `components/dashboard-nav.ts`. This file keeps the two jobs that genuinely
 * belong to a layout — owning the provider, and the search / messages /
 * notifications strip, which spans every dashboard route and so has no other
 * home.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
    const { user } = useUser();
    const dbUser = useQuery(api.users.getCurrentUser);

    // Drives the header's Messages / Notifications badges. One query for both
    // counts rather than two, so the header costs a single subscription.
    //
    // Gated on `dbUser` because this `requireUser`s, which throws until the
    // Convex `users` row exists — see the sidebar for the longer version of
    // this note. Skipping is also correct for a suspended account.
    const unread = useQuery(inboxApi.getUnreadCounts, dbUser ? {} : "skip");

    return (
        <SidebarProvider>
            <DashboardSidebar />

            <SidebarInset className="min-h-dvh bg-background">
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
                        {/* Below md the search form above is hidden, so the trigger
                            has to live in the icon cluster instead — and the
                            search page carries its own field, because linking to
                            a page with no input is a dead end. */}
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
                                They now deep-link into the matching inbox tab and
                                carry live counts. */}
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
                                ) : null}
                            </Button>
                        </div>
                        <div className="flex items-center gap-3 border-l border-rule pl-3 sm:pl-6">
                            <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
                            <span className="hidden font-semibold text-foreground sm:block">
                                {user?.fullName || "Student"}
                            </span>
                        </div>
                    </div>
                </header>

                <main className="p-4 pt-2 px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,3vw,2rem)] sm:p-6 sm:pt-2 lg:p-8 lg:pt-2">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}