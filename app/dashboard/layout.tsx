"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { Bell, Mail, Search } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

import { api } from "@/convex/_generated/api";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { TourProvider } from "@/components/product-tour";
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
 *
 * It also owns the product tour's provider, since the tour spans every
 * dashboard route the same way the header does. The `data-tour` attributes
 * below are the anchors its steps point at; see `lib/tutorial.ts`.
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
        <TourProvider role={dbUser?.role} completedAt={dbUser?.tourCompletedAt}>
            <SidebarProvider>
                <DashboardSidebar />

                <SidebarInset className="min-h-dvh bg-background">
                    {/*
                      Three columns, and the two flanks are *equal* (`flex-1`)
                      rather than content-sized — that equality is what puts the
                      middle column, and the search inside it, on the header's
                      true centre no matter how much heavier the right flank
                      (mail / bell / avatar) is than the left (the sidebar
                      trigger, nothing at all above lg).

                      The middle is `flex-[2]` because a search field plus the
                      student CTA needs half the header, not a third. All three
                      are `min-w-0`, so a column whose content outruns its share
                      spills sideways into the empty middle instead of widening
                      the document — which is what keeps a long name or a
                      320px viewport from producing a horizontal scrollbar.

                      Two consequences of that share-maths, deliberately not
                      "fixed" elsewhere:
                      · The header name waits until `xl`. Below it, the name's
                        ~100px would take the right flank past its quarter of
                        the header and it would collide with the search.
                      · The student CTA waits until `md`, where the search form
                        itself appears — below that the middle column has to
                        stay empty or the CTA and the right flank overlap.
                    */}
                    <header className="flex h-20 items-center gap-3 px-4 bg-transparent sm:px-6 lg:px-8">
                        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                            <SidebarTrigger className="lg:hidden" />
                            {/* Below md the search form in the middle column is
                                hidden, so the affordance lives here instead —
                                and the search page carries its own field,
                                because linking to a page with no input is a
                                dead end. */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="md:hidden"
                                aria-label="Search courses, instructors and people"
                                render={<Link href="/dashboard/search" />}
                            >
                                <Search className="h-5 w-5" />
                            </Button>
                        </div>

                        <div className="flex min-w-0 flex-[2] items-center justify-center gap-2">
                            <form
                                action="/dashboard/search"
                                method="get"
                                data-tour="search"
                                className="relative hidden w-full max-w-md min-w-0 md:block"
                            >
                                <Search
                                    className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    size={18}
                                />
                                <Input
                                    name="q"
                                    type="search"
                                    placeholder="Search courses, instructors, people..."
                                    className="h-12 rounded-sm border-rule pl-11 text-[15px]"
                                />
                            </form>
                            {/* Students only: instructors and admins already
                                have the console, and `/become-instructor`
                                answers the pending / approved / rejected case
                                itself. */}
                            {dbUser?.role === "student" ? (
                                <Button
                                    variant="outline"
                                    className="hidden md:inline-flex"
                                    render={<Link href="/become-instructor" />}
                                >
                                    Become an instructor
                                </Button>
                            ) : null}
                        </div>

                        <div
                            data-tour="header-actions"
                            className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:gap-4 lg:gap-6"
                        >
                            <div className="flex items-center gap-2 sm:gap-3">
                                {/* These were two inert <button>s with no
                                    handler. They now deep-link into the matching
                                    inbox tab and carry live counts. */}
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
                            <div className="flex min-w-0 items-center gap-3 border-l border-rule pl-3 sm:pl-6">
                                <UserButton appearance={{ elements: { avatarBox: "w-10 h-10" } }} />
                                {/* Capped and late: see the note above the
                                    header — this text is the whole reason the
                                    right flank is the wide one. */}
                                <span className="hidden max-w-24 truncate font-semibold text-foreground xl:block">
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
        </TourProvider>
    );
}
