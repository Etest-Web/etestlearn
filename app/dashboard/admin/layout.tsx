"use client";

import { ReactNode } from "react";

import { AdminGuard } from "@/components/role-guard";

/**
 * The admin console's frame: the role gate and nothing else.
 *
 * Mirrors `app/dashboard/instructor/layout.tsx`. The guard used to sit at the
 * top of each of the eleven admin pages, which held only as long as every new
 * page remembered to add it — and one admin route was already forgotten once
 * before (see `components/dashboard-nav.ts`). A segment layout is the one place
 * the gate cannot be left out: a student who hand-types `/dashboard/admin/...`
 * is stopped here, before any page in the console mounts.
 *
 * UX only, like every guard. Each admin function re-checks the role server-side
 * (`convex/helpers/auth.ts`), so this keeps someone from *looking* at a console
 * they cannot act on rather than being the thing that protects it.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
    return <AdminGuard>{children}</AdminGuard>;
}
