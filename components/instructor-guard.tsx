"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

export function InstructorGuard({ children }: { children: ReactNode }) {
  const user = useQuery(api.users.getCurrentUser);
  const router = useRouter();

  // Still loading
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

  // Not an instructor or admin
  if (!user || (user.role !== "instructor" && user.role !== "admin")) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        {/* EmptyState owns an h3; the h2 keeps the heading level this guard
            already had in the document outline. */}
        <h2 className="sr-only">Access denied</h2>
        <EmptyState
          icon={ShieldAlert}
          tone="warning"
          title="Access Denied"
          description={
            <>
              You don&apos;t have permission to access instructor tools. Only
              users with the <strong>instructor</strong> or{" "}
              <strong>admin</strong> role can manage courses and content.
            </>
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
