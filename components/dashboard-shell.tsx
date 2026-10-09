import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The page container every dashboard screen sits in.
 *
 * These pages were each hand-writing their outer box, and the boxes disagreed:
 * `max-w-6xl`, `max-w-5xl`, `max-w-4xl`, `max-w-2xl`, and — on the dashboard
 * home and two admin pages — no cap at all, so the measure changed as you
 * navigated between adjacent admin routes. Half used `space-y-8` and half
 * `flex flex-col gap-8`, and one wrote the Tailwind classes in reverse order.
 *
 * More costly than the drift itself: the skeletons disagreed with their own
 * pages. `courses/page.tsx` centred its skeleton with `mx-auto` and left its
 * loaded state uncased, so the page visibly shifted sideways the moment data
 * arrived. Passing the same wrapper to both is the fix.
 *
 * `width` is for the genuinely narrow screens — single-column forms and queues
 * where a 72rem measure would stretch one line of text across the viewport —
 * not as a way to keep picking a different size.
 */
function PageShell({
    className,
    width = "wide",
    ...props
}: React.ComponentProps<"div"> & {
    /**
     * `wide` is the house measure. The narrower options are deliberate
     * exceptions, each for a reason stated below — not a way to keep picking a
     * different size.
     */
    width?: "wide" | "narrow" | "form" | "inbox";
}) {
    return (
        <div
            data-slot="page-shell"
            data-width={width}
            className={cn(
                "mx-auto flex w-full flex-col gap-8",
                width === "wide" && "max-w-6xl",
                // Categories, Discussions and a learner's own certificates: two
                // columns of short rows. A 72rem measure stranded them mid-screen.
                width === "narrow" && "max-w-4xl",
                // Settings is one form. Wider just makes the inputs harder to hit.
                width === "form" && "max-w-2xl",
                // The inbox is the one two-pane screen — thread list beside
                // message body — and needs the extra room to stay readable.
                width === "inbox" && "max-w-7xl",
                className,
            )}
            {...props}
        />
    );
}

export { PageShell };