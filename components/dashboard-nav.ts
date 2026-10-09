/**
 * The dashboard's navigation, declared once.
 *
 * This replaces two lists that used to disagree. `OVERVIEW_NAV` in the dashboard
 * layout held seven learner links; the footer of that same file held twelve
 * hand-rolled admin and instructor anchors with no group labels, no active
 * state and no badges. Adding an admin page meant editing a JSX block inside a
 * `isAdmin && (...)` chain, and one route (`/dashboard/admin/applications`) was
 * forgotten entirely — reachable only from an anchor buried in a sentence on the
 * Users page. Everything now derives from `NAV_GROUPS`.
 *
 * Nothing here imports React or touches the DOM. It is a pure description of
 * where the dashboard goes, which is what lets `tests/dashboard-nav.test.ts`
 * pin the prefix-matching rules that the sidebar depends on.
 */
import {
    Award,
    BarChart3,
    BookOpen,
    ClipboardList,
    EyeOff,
    FileCheck2,
    Gauge,
    Inbox,
    LayoutDashboard,
    LayoutList,
    Megaphone,
    MessagesSquare,
    Receipt,
    ScrollText,
    Search,
    Tags,
    Users,
    UserRound,
    Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The role stored on a `users` row. Mirrors the union in `convex/schema.ts`. */
export type Role = "student" | "instructor" | "admin";

/**
 * Which console the user is currently working in.
 *
 * These values are the role names, deliberately: every role can enter every mode
 * at or below its own level. An admin is also a student (see
 * `convex/enrollments.ts` — "instructors/admins exempt" from the paid-course
 * purchase check), and the mode switch exists so that being able to *choose* is
 * explicit rather than accidental.
 */
export type DashboardMode = Role;

/** Ordered least- to most-privileged. Index order is the visibility rule. */
const MODES: readonly DashboardMode[] = ["student", "instructor", "admin"];

/** A pending count the sidebar can badge this link with. */
export type NavBadge = "unread" | "friendRequests" | "pendingApplications" | "pendingUnpublish";

export type NavItem = {
    href: string;
    label: string;
    icon: LucideIcon;
    /** Omitted means "never badged". Resolved by the sidebar, not here. */
    badge?: NavBadge;
};

export type NavGroup = {
    id: "learn" | "teach" | "admin";
    label: string;
    /** Lowest mode that unlocks this group. */
    mode: DashboardMode;
    /** Where the mode switcher lands when this mode is picked. */
    landing: string;
    items: NavItem[];
};

/**
 * Every dashboard destination, grouped by console.
 *
 * Group order is deliberate: the group you are working in comes first when you
 * are staff, because an instructor's or admin's day starts in their own console,
 * not in "Continue watching". The sidebar renders only the groups a role can
 * reach, so a student never sees two of these and an admin sees all three.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
    {
        id: "learn",
        label: "Learn",
        mode: "student",
        landing: "/dashboard",
        items: [
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, badge: "unread" },
            { href: "/dashboard/courses", label: "Lessons", icon: BookOpen },
            { href: "/dashboard/certificates", label: "Certificates", icon: Award },
            { href: "/dashboard/tasks", label: "Tasks", icon: ClipboardList },
            { href: "/dashboard/groups", label: "Groups", icon: Users },
            { href: "/dashboard/friends", label: "Friends", icon: UserRound, badge: "friendRequests" },
            // Search used to have no nav entry at all, so `/dashboard/search`
            // lit up nothing in the sidebar and had no input of its own below
            // `md`. It belongs with the rest of the learner surface.
            { href: "/dashboard/search", label: "Search", icon: Search },
        ],
    },
    {
        id: "teach",
        label: "Teach",
        mode: "instructor",
        landing: "/dashboard/instructor",
        items: [
            { href: "/dashboard/instructor", label: "Overview", icon: LayoutDashboard },
            { href: "/dashboard/instructor/courses", label: "Courses", icon: LayoutList },
            { href: "/dashboard/instructor/earnings", label: "Earnings", icon: Wallet },
            { href: "/dashboard/instructor/analytics", label: "Analytics", icon: BarChart3 },
        ],
    },
    {
        id: "admin",
        label: "Admin",
        mode: "admin",
        landing: "/dashboard/admin",
        items: [
            { href: "/dashboard/admin", label: "Overview", icon: Gauge },
            { href: "/dashboard/admin/users", label: "Users", icon: Users },
            // The instructor-application review queue. This link is why it was
            // never in the sidebar: the only path to it used to be an <a> inside
            // a sentence on the Users page, which also triggered a full reload.
            { href: "/dashboard/admin/applications", label: "Applications", icon: FileCheck2, badge: "pendingApplications" },
            { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
            { href: "/dashboard/admin/payments", label: "Payments", icon: Receipt },
            { href: "/dashboard/admin/certificates", label: "Certificates", icon: Award },
            { href: "/dashboard/admin/discussions", label: "Moderation", icon: MessagesSquare },
            { href: "/dashboard/admin/categories", label: "Categories", icon: Tags },
            { href: "/dashboard/admin/announcements", label: "Announcements", icon: Megaphone },
            { href: "/dashboard/admin/unpublish-requests", label: "Unpublish requests", icon: EyeOff, badge: "pendingUnpublish" },
            { href: "/dashboard/admin/audit", label: "Audit log", icon: ScrollText },
        ],
    },
];

/** Every mode, in ascending order of privilege. */
export const ALL_MODES: readonly DashboardMode[] = MODES;

/**
 * The modes a role may switch into, least-privileged first.
 *
 * Staff get their own console plus everything below it — an admin is an
 * instructor is a student. A student gets exactly one entry, and the sidebar
 * hides the switcher entirely rather than showing a one-option menu.
 */
export function modesForRole(role: Role | null | undefined): DashboardMode[] {
    if (role === "admin") return ["student", "instructor", "admin"];
    if (role === "instructor") return ["student", "instructor"];
    return ["student"];
}

/** True when `mode` is a mode this role is allowed to enter. */
export function roleCanUseMode(role: Role | null | undefined, mode: DashboardMode): boolean {
    return modesForRole(role).includes(mode);
}

/**
 * The nav groups a role can see.
 *
 * Filtering by mode rank rather than an explicit allow-list means a new group
 * added to `NAV_GROUPS` is correctly gated the moment it is declared — the
 * failure mode is a group being invisible to a role that should see it, which is
 * noticed immediately, rather than a group being visible to a role that should
 * not, which is not.
 */
export function groupsForRole(role: Role | null | undefined): NavGroup[] {
    const ceiling = MODES.indexOf(modesForRole(role)[modesForRole(role).length - 1]);
    return NAV_GROUPS.filter((group) => MODES.indexOf(group.mode) <= ceiling);
}

/** The landing route for a mode. */
export function landingForMode(mode: DashboardMode): string {
    return NAV_GROUPS.find((group) => group.mode === mode)?.landing ?? "/dashboard";
}

/** Human label for a mode, used by the switcher and the cookie guard. */
export function modeLabel(mode: DashboardMode): string {
    switch (mode) {
        case "instructor":
            return "Instructor";
        case "admin":
            return "Admin";
        default:
            return "Learning";
    }
}

/** Icon for a mode. Matches the icon of the group's landing item. */
export function modeIcon(mode: DashboardMode): LucideIcon {
    switch (mode) {
        case "instructor":
            return LayoutList;
        case "admin":
            return Gauge;
        default:
            return LayoutDashboard;
    }
}

/**
 * Which console a URL belongs to.
 *
 * This is what makes the switcher a shortcut rather than a filter: the active
 * mode is read off the path, so the sidebar can never disagree with the page in
 * front of you. The cookie is only ever consulted for *landing* (see
 * `app/dashboard/page.tsx`), never for deciding what to paint.
 */
export function modeForPath(pathname: string): DashboardMode {
    if (pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/")) {
        return "admin";
    }
    if (pathname === "/dashboard/instructor" || pathname.startsWith("/dashboard/instructor/")) {
        return "instructor";
    }
    return "student";
}

/**
 * Whether a nav item is the current one.
 *
 * `usePathname` only names the leaf, so sub-sections prefix-match and keep their
 * sub-pages marked. `/dashboard` is the exception and the reason this function
 * exists rather than a bare `startsWith`: every dashboard route starts with
 * `/dashboard/`, so a prefix match would leave "Dashboard" lit on every page.
 */
export function isCurrentPath(href: string, pathname: string): boolean {
    return href === "/dashboard"
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The single nav item matching a pathname, or `null`.
 *
 * **Longest match wins, and that is the whole point.** Prefix matching alone is
 * not sufficient: `/dashboard/instructor` prefix-matches
 * `/dashboard/instructor/courses/new`, so a naive "first match wins" would light
 * both *Overview* and *Courses*. Sorting by href length descending and taking
 * the first hit means the most specific destination claims the route, which is
 * what a reader expects — the deepest thing they are actually looking at.
 *
 * This is the same class of bug the deleted instructor tab strip had: it used
 * `pathname.startsWith(item.href)` over a list containing both
 * `/dashboard/instructor/courses` and `/dashboard/instructor/courses/new`, and
 * lit two tabs at once. Preferring the longest match means nesting is safe by
 * construction, so the next nested route added does not reintroduce it.
 *
 * Exported for both the sidebar and `tests/dashboard-nav.test.ts`: this is pure
 * logic, and the invariant it protects ("exactly one item is current") is worth
 * pinning without needing a DOM.
 */
export function matchingItem(
    pathname: string,
    groups: readonly NavGroup[],
): NavItem | null {
    let best: NavItem | null = null;

    for (const group of groups) {
        for (const item of group.items) {
            if (!isCurrentPath(item.href, pathname)) continue;
            if (best === null || item.href.length > best.href.length) {
                best = item;
            }
        }
    }

    return best;
}

/**
 * The href of the current item within a flat list, or `null`.
 *
 * Same longest-match rule as {@link matchingItem}, for the call sites that hold
 * a flat list — the sidebar's flat rail, and each group's own items when
 * checking which link inside it is live.
 */
export function currentItemHref(
    pathname: string,
    items: readonly NavItem[],
): string | null {
    let best: NavItem | null = null;

    for (const item of items) {
        if (!isCurrentPath(item.href, pathname)) continue;
        if (best === null || item.href.length > best.href.length) {
            best = item;
        }
    }

    return best?.href ?? null;
}

/** `99+` past 99, the cap every badge in the dashboard uses. */
export function capBadge(count: number): string {
    return count > 99 ? "99+" : String(count);
}

/** The pending count for an item, given the resolved badge counts. */
export function badgeCountFor(item: NavItem, counts: Partial<Record<NavBadge, number>>): number {
    if (!item.badge) return 0;
    return counts[item.badge] ?? 0;
}