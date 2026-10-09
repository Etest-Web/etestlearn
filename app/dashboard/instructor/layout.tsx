"use client";

import { ReactNode } from "react";

import { InstructorGuard } from "@/components/role-guard";

/**
 * The instructor console's frame: the role gate and nothing else.
 *
 * This used to carry a five-tab horizontal nav strip — Overview, Courses,
 * Earnings, Analytics, New Course — under an "Instructor Panel" eyebrow. The
 * sidebar's **Teach** group (`components/dashboard-nav.ts`) is that same nav,
 * and having both meant every instructor page carried the same five links twice
 * on screen.
 *
 * The strip was also wrong. `NAV_ITEMS` held both `/dashboard/instructor/courses`
 * and `/dashboard/instructor/courses/new`, and active state was
 * `pathname.startsWith(item.href)`, so on the new-course page *both* matched and
 * two tabs rendered selected at once. The sidebar keeps exact-match discipline
 * for exactly this reason (`isCurrentPath`).
 *
 * "New Course" survives as the primary action on the Courses page, where it is
 * a button rather than a fifth destination competing with the four sections.
 */
export default function InstructorLayout({ children }: { children: ReactNode }) {
    return <InstructorGuard>{children}</InstructorGuard>;
}