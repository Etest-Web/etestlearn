"use client";

/**
 * A quiet note for a learner whose instructor application is under review.
 *
 * A pending applicant still holds the `student` role — `reviewApplication`
 * only promotes them once an admin approves — so they get no mode switcher at
 * all. Rather than leaving that empty space unexplained, this fills it with the
 * one fact they are waiting on, in place of the switch they cannot use yet.
 *
 * Only ever paints for a learner: once the role is `instructor` the switcher
 * itself appears, and the query is skipped so a staff account pays nothing.
 * Queried here rather than threaded through the sidebar so it can share the
 * `getMyApplication` subscription the `/become-instructor` page already uses.
 */
import Link from "next/link";
import { Clock } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Role } from "@/components/dashboard-nav";

export function PendingInstructorNote({ role }: { role: Role | null | undefined }) {
    const application = useQuery(
        api.instructorApplications.getMyApplication,
        role === "student" ? {} : "skip",
    );

    if (application?.status !== "pending") return null;

    return (
        <Link
            href="/become-instructor"
            // Hidden in the 48px rail, where the label has nowhere to go. The
            // mobile sheet renders no `data-collapsible` attribute, so it stays
            // visible there.
            className="flex items-center gap-2 rounded-sm border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-ring group-data-[collapsible=icon]:hidden"
        >
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
                Instructor application under review
            </span>
        </Link>
    );
}
