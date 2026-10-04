"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ClipboardCheck, ListTodo, NotebookPen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { AssignmentsTab } from "./assignments-tab";
import { GradingTab } from "./grading-tab";
import { MyTasksTab } from "./my-tasks-tab";
import { getGradingSummary } from "./api";

const TABS = ["assignments", "grading", "my-tasks"] as const;
type TabValue = (typeof TABS)[number];

const DEFAULT_TAB: TabValue = "assignments";

function isTab(value: string | null): value is TabValue {
  return value !== null && (TABS as readonly string[]).includes(value);
}

/**
 * One page, two different things.
 *
 * Coursework somebody else set (graded assignments) and the study plan the
 * learner set for themselves share a URL because they share a mental model —
 * "what am I supposed to be doing" — but they are kept visually separate by
 * tab. Everything under "Assignments" belongs to an instructor; everything under
 * "My Tasks" is private.
 *
 * Everyone participates. There is no role gate on the page: a student, an
 * instructor and an admin all keep study tasks and all have assignments to
 * hand in. The Grading tab is the one exception, because only somebody who
 * teaches the course can mark work on it — and even that is re-checked on every
 * server call, so hiding the tab is convenience, not security.
 *
 * Tab state lives in `?tab=` rather than in component state, so Back and
 * Forward move between tabs the way they move between pages and a tab can be
 * linked to. An unrecognised or forbidden value falls back to Assignments rather
 * than rendering an empty panel.
 */
function TasksContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const requested = searchParams.get("tab");
  const dbUser = useQuery(api.users.getCurrentUser);

  // Role decides whether Grading exists at all, so the page cannot be the place
  // that decides what a learner is allowed to mark — that is the server's call.
  const canGrade = dbUser?.role === "instructor" || dbUser?.role === "admin";
  const activeTab: TabValue =
    isTab(requested) && (requested !== "grading" || canGrade) ? requested : DEFAULT_TAB;

  function selectTab(value: string) {
    const next = isTab(value) ? value : DEFAULT_TAB;
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `/dashboard/tasks?${query}` : "/dashboard/tasks", {
      scroll: false,
    });
  }

  // The whole page depends on the role, so wait for it rather than flashing a
  // learner layout that a staff member then sees replaced by the grading tab.
  if (dbUser === undefined) return <TasksSkeleton />;

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
        <p className="text-muted-foreground font-medium">
          Coursework your instructors set, and the study plan you set for yourself.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={selectTab} className="w-full">
        {/* Three triggers do not fit at 375px. They scroll inside their own
            wrapper rather than widening the document. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="bg-card border border-border shadow-sm p-1 rounded-2xl h-auto inline-flex gap-2 w-max touch-target">
            <TabsTrigger
              value="assignments"
              className="rounded-xl px-4 sm:px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-all data-[active]:bg-[#945DA3] data-[active]:text-white"
            >
              <NotebookPen className="h-4 w-4" aria-hidden />
              Assignments
            </TabsTrigger>
            {/* `data-[active]` is Base UI's attribute — this is not Radix, so
                `data-[state=active]` would match nothing. */}
            {canGrade ? (
              <TabsTrigger
                value="grading"
                className="rounded-xl px-4 sm:px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-all data-[active]:bg-[#945DA3] data-[active]:text-white"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                Grading
                <AwaitingGradeBadge />
              </TabsTrigger>
            ) : null}
            <TabsTrigger
              value="my-tasks"
              className="rounded-xl px-4 sm:px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-all data-[active]:bg-[#945DA3] data-[active]:text-white"
            >
              <ListTodo className="h-4 w-4" aria-hidden />
              My Tasks
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="assignments" className="mt-6 outline-none">
          <AssignmentsTab />
        </TabsContent>
        {canGrade ? (
          <TabsContent value="grading" className="mt-6 outline-none">
            <GradingTab />
          </TabsContent>
        ) : null}
        <TabsContent value="my-tasks" className="mt-6 outline-none">
          <MyTasksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The count of ungraded submissions, announced politely as it changes. */
function AwaitingGradeBadge() {
  const summary = useQuery(getGradingSummary, {});
  if (summary === undefined || summary.awaitingGrade === 0) return null;
  return (
    <span
      aria-live="polite"
      className="ml-1 rounded-md bg-brand/20 px-1.5 py-0.5 text-xs font-bold text-brand-ink"
    >
      {summary.awaitingGrade} to mark
    </span>
  );
}

function TasksSkeleton() {
  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-5 w-72 max-w-full rounded-xl" />
      </div>
      <div className="-mx-4 overflow-hidden px-4 sm:mx-0 sm:px-0">
        <Skeleton className="h-12 w-80 max-w-full rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-[24px]" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-[24px]" />
    </div>
  );
}

export default function TasksPage() {
  // `useSearchParams` needs a Suspense boundary or Next will opt the whole route
  // into client-side rendering on every navigation.
  return (
    <Suspense fallback={<TasksSkeleton />}>
      <TasksContent />
    </Suspense>
  );
}