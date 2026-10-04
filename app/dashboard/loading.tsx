import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-sm" />
        <Skeleton className="h-28 rounded-sm" />
        <Skeleton className="h-28 rounded-sm" />
      </div>
      <Skeleton className="h-72 rounded-sm" />
    </div>
  );
}
