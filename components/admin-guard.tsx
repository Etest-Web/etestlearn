"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Client-side gate for the admin console pages. UX only — every admin
 * function re-checks the role server-side (see convex/admin.ts and each
 * module's `requireAdmin`), so this guard exists to keep non-admins from
 * looking at a screen they cannot act on.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const user = useQuery(api.users.getCurrentUser);
  const router = useRouter();

  if (user === undefined) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <h2 className="sr-only">Access denied</h2>
        <EmptyState
          icon={ShieldAlert}
          tone="warning"
          title="Access Denied"
          description={
            <>
              This console is for administrators. Your account does not have
              access to it.
            </>
          }
          action={<Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>}
        />
      </div>
    );
  }

  return <>{children}</>;
}