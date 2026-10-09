"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ShieldAlert } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Role } from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One client-side gate for the role-gated consoles.
 *
 * `AdminGuard` and `InstructorGuard` were copy-paste siblings — identical
 * loading branch, identical denied branch, differing only in the role predicate
 * and the wording of the description. They had already drifted (three words, two
 * layouts, and one of them shipped no way back to the dashboard), so the second
 * copy was a standing invitation for the same drift a third time.
 *
 * UX only. Every admin and instructor function re-checks the role server-side
 * (`convex/helpers/auth.ts` — `requireUser` / `requireAdmin`), so this exists to
 * keep someone from looking at a screen they cannot act on, not to enforce
 * anything.
 *
 * Pass a predicate rather than a list of roles so a new role is an explicit
 * decision here instead of an accident of which guard a page imported.
 */
export function RoleGuard({
    allow,
    children,
    /** Shown in the denied state. Defaults to a generic line naming `allow`. */
    deniedDescription,
}: {
    allow: (role: Role) => boolean;
    children: ReactNode;
    deniedDescription?: ReactNode;
}) {
    const user = useQuery(api.users.getCurrentUser);
    const router = useRouter();

    // Still loading. Deliberately the same shape as every page's own skeleton
    // bar so the console does not visibly restyle once the role lands.
    if (user === undefined) {
        return (
            <div className="mx-auto w-full max-w-6xl space-y-8">
                <Skeleton className="h-9 w-64" />
                <div className="grid gap-4 md:grid-cols-3">
                    <Skeleton className="h-40 rounded-2xl" />
                    <Skeleton className="h-40 rounded-2xl" />
                    <Skeleton className="h-40 rounded-2xl" />
                </div>
            </div>
        );
    }

    // `user === null` is a signed-out *or* suspended account (see
    // `getCurrentUser`), which is the same answer as the wrong role.
    if (!user || !allow(user.role)) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center">
                {/* EmptyState owns an h3; the h2 keeps the heading level this
                    guard already had in the document outline. */}
                <h2 className="sr-only">Access denied</h2>
                <EmptyState
                    icon={ShieldAlert}
                    tone="warning"
                    title="Access Denied"
                    description={
                        deniedDescription ?? (
                            <>
                                Your account does not have access to this console.
                            </>
                        )
                    }
                    action={
                        <Button onClick={() => router.push("/dashboard")}>
                            Back to Dashboard
                        </Button>
                    }
                />
            </div>
        );
    }

    return <>{children}</>;
}

/** Admin-only. */
export function AdminGuard({ children }: { children: ReactNode }) {
    return (
        <RoleGuard allow={(role) => role === "admin"}>
            {children}
        </RoleGuard>
    );
}

/** Instructors and admins — admins can teach. */
export function InstructorGuard({ children }: { children: ReactNode }) {
    return (
        <RoleGuard
            allow={(role) => role === "instructor" || role === "admin"}
            deniedDescription={
                <>
                    You don&apos;t have permission to access instructor tools. Only
                    users with the <strong>instructor</strong> or{" "}
                    <strong>admin</strong> role can manage courses and content.
                </>
            }
        >
            {children}
        </RoleGuard>
    );
}