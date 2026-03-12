"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <ShieldAlert className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          You don&apos;t have permission to access instructor tools. Only users
          with the <strong>instructor</strong> or <strong>admin</strong> role can
          manage courses and content.
        </p>
        <Button onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
