"use client";

/**
 * The mode switch — "Learning / Instructor / Admin".
 *
 * Staff here are also learners, and deliberately so: `convex/enrollments.ts`
 * exempts instructors and admins from the paid-course purchase check, and
 * `instructorApplications.reviewApplication` promotes people who may already
 * hold enrollments, tasks and certificates. Rather than pretending otherwise and
 * hiding the learner surface from them, this makes the choice explicit and one
 * click wide.
 *
 * Selecting a mode writes the cookie *and* navigates, so switching is a single
 * action rather than "pick a mode, then find the link".
 *
 * Renders nothing at all when a role has one mode: a student has no switch to
 * make, and a one-option menu is worse than no menu.
 */
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
    landingForMode,
    modeForPath,
    modeIcon,
    modeLabel,
    modesForRole,
    roleCanUseMode,
    type DashboardMode,
    type Role,
} from "@/components/dashboard-nav";
import { writeDashboardMode } from "@/lib/dashboard-mode";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";

/**
 * Mode → icon, resolved once at module scope.
 *
 * A plain `const Icon = modeIcon(mode)` inside a component is a new component
 * identity on every render, which remounts the icon subtree each time — the
 * `react-hooks/static-components` rule exists for exactly that. A module-level
 * record of already-constructed components sidesteps it and costs one lookup.
 */
const MODE_ICONS: Record<DashboardMode, LucideIcon> = {
    student: modeIcon("student"),
    instructor: modeIcon("instructor"),
    admin: modeIcon("admin"),
};

/**
 * Renders a mode's icon.
 *
 * Its own component rather than an inline lookup, so the icon is not remounted
 * whenever the switcher re-renders on a pathname change.
 */
function ActiveIcon({
    mode,
    className,
}: {
    mode: DashboardMode;
    className?: string;
}) {
    const Icon = MODE_ICONS[mode];
    return <Icon className={className} aria-hidden />;
}

export function ModeSwitcher({ role }: { role: Role | null | undefined }) {
    const router = useRouter();
    const pathname = usePathname();
    const { state, isMobile } = useSidebar();

    const modes = modesForRole(role);
    // One mode is not a switch. Nothing renders.
    if (modes.length < 2) return null;

    // Derived from the URL, not from the cookie: the sidebar shows the console
    // you are actually standing in, even if you arrived by hand-typing the URL
    // and the cookie still says something else.
    const active = modeForPath(pathname);

    // The 48px rail has room for the icon and nothing else. `isMobile` matters
    // because the sheet renders no `data-collapsible` attribute at all, so the
    // mobile drawer must never flatten to the icon-only treatment.
    const railMode = !isMobile && state === "collapsed";

    function choose(mode: DashboardMode) {
        // The cookie is a preference, not a permission. Re-checking the role
        // here means a stale cookie from a demoted account cannot be used to
        // present a console the user can no longer open.
        if (!roleCanUseMode(role, mode)) return;
        writeDashboardMode(mode);
        router.push(landingForMode(mode));
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label={`Switch console — currently ${modeLabel(active)}`}
                className={cn(
                    "group/mode flex items-center gap-2 rounded-sm border border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    "data-[popup-open]:bg-sidebar-accent",
                    railMode ? "size-9 justify-center" : "h-9 w-full px-2.5",
                    "group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center",
                )}
            >
                <ActiveIcon mode={active} className="size-4 shrink-0" />
                {!railMode ? (
                    <>
                        {/* A sentence, so the mode is legible at a glance rather
                            than having to be inferred from an icon. */}
                        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium group-data-[collapsible=icon]:hidden">
                            {modeLabel(active)}
                        </span>
                        <ChevronDown
                            className="size-4 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden"
                            aria-hidden
                        />
                    </>
                ) : null}
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="min-w-52">
                <DropdownMenuLabel className="eyebrow">
                    Console
                </DropdownMenuLabel>
                {modes.map((mode) => {
                    const isActive = mode === active;
                    return (
                        <DropdownMenuItem
                            key={mode}
                            onClick={() => choose(mode)}
                            className="min-h-9 justify-between"
                        >
                            <span className="flex items-center gap-2.5">
                                <ActiveIcon mode={mode} className="size-4 shrink-0" />
                                {modeLabel(mode)}
                            </span>
                            {isActive ? (
                                <Check className="size-4 shrink-0 text-brand" aria-hidden />
                            ) : null}
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-[11px] leading-[1.5] text-muted-foreground">
                    You can learn and teach at the same time. This only changes
                    where you land.
                </p>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}