"use client";

import { Suspense } from "react";
import { GroupsPageSkeleton } from "./groups-primitives";
import { GroupsScreen } from "./groups-screen";

/**
 * `/dashboard/groups` — course-scoped study groups.
 *
 * The screen reads `?tab=`, `?course=` and `?group=`, so it needs a Suspense
 * boundary above it: `useSearchParams` opts a client component out of static
 * prerendering, and Next throws at build time without one. The fallback is the
 * real page skeleton rather than a spinner, so the first paint already has the
 * final layout's shape.
 */
export default function GroupsPage() {
  return (
    <Suspense fallback={<GroupsPageSkeleton />}>
      <GroupsScreen />
    </Suspense>
  );
}