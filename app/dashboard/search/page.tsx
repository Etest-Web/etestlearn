"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search as SearchIcon, ArrowRight, PlayCircle, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/dashboard-shell";

/** How many results to show before offering to narrow the search. */
const RESULT_LIMIT = 24;

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q")?.trim() ?? "";

  // The dashboard header's search form is `hidden md:block`, and below `md` the
  // only affordance is an icon linking here. Without a field on the page itself,
  // a phone user arrived at a page that could not be searched — so this is a
  // real input, not a decorative echo of the header.
  const [draft, setDraft] = useState(query);

  const searchedCourses = useQuery(
    api.courses.searchCourses,
    query ? { query } : "skip",
  );
  const allCourses = useQuery(api.courses.listPublishedCourses);

  const loading =
    searchedCourses === undefined ||
    (query ? false : allCourses === undefined);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    // Pushing rather than replacing keeps the previous search reachable with the
    // back button, which is what someone who mis-spelled a word wants.
    router.push(next ? `/dashboard/search?q=${encodeURIComponent(next)}` : "/dashboard/search");
  }

  function clear() {
    setDraft("");
    router.push("/dashboard/search");
  }

  return (
    <PageShell>
      <PageHeader
        // Kept in plain quotes rather than a template with typographic quotes:
        // the header's display face already carries the voice, and a template
        // literal here was the source of a parse error that no editor flagged.
        title={query ? `Search results for "${query}"` : "Search"}
        description={resultSummary(query, searchedCourses, allCourses)}
      />

      <form onSubmit={submit} role="search" className="relative w-full max-w-xl">
        <SearchIcon
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={18}
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search your courses…"
          aria-label="Search courses"
          className="h-12 rounded-sm border-rule pl-11 pr-24 text-[15px]"
        />
        {draft ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-20 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          Search
        </Button>
      </form>

      {loading ? (
        // A skeleton in the same grid as the settled state, so results do not
        // reflow the page when they land. The previous fallback here was a bare
        // "Searching..." string, the only one in the dashboard.
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredCourses(searchedCourses, allCourses, query).length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title={query ? "No courses found" : "Nothing published yet"}
          description={
            query
              ? `Nothing matches “${query}”. Try fewer or different keywords.`
              : "There are no published courses to search yet."
          }
          // An empty state with no next step is a dead end. Two exits: drop the
          // query, or leave for the public catalog.
          action={
            query ? (
              <Button variant="outline" onClick={clear}>
                Clear search
              </Button>
            ) : (
              <Button render={<Link href="/courses" />}>Browse the catalog</Button>
            )
          }
        />
      ) : (
        <SearchResultsGrid courses={filteredCourses(searchedCourses, allCourses, query)} />
      )}
    </PageShell>
  );
}

/** The result rows. Extracted so the cards are not re-created inline. */
function SearchResultsGrid({ courses }: { courses: CourseRow[] }) {
  const shown = courses.slice(0, RESULT_LIMIT);
  const hidden = courses.length - shown.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((course) => (
          // The Card carries the surface — a hairline, no shadow — and the
          // thumbnail sits flush against it.
          <Card key={course._id} className="group gap-0 overflow-hidden p-0">
            <div className="relative h-44 overflow-hidden bg-surface-sunken">
              <img
                src={course.thumbnailUrl || "/hero-backdrop.jpg"}
                alt={course.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              {course.category ? (
                <Badge
                  variant="outline"
                  className="absolute left-4 top-4 border-0 bg-background/80 backdrop-blur-sm"
                >
                  {course.category}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col p-6">
              <h3 className="mb-4 line-clamp-2 text-xl font-semibold leading-snug text-foreground">
                {course.title}
              </h3>
              <p className="mb-6 line-clamp-2 text-sm leading-[1.6] text-muted-foreground">
                {course.description}
              </p>
              <div className="mt-auto flex items-center justify-between border-t border-rule pt-4">
                <Badge className="gap-1">
                  <PlayCircle />
                  Available
                </Badge>
                {/* Goes to the enrolled-course route, which is also where an
                    unenrolled learner is sent to enrol. */}
                <Button
                  variant="outline"
                  size="icon"
                  render={<Link href={`/dashboard/courses/${course.slug}`} />}
                  aria-label={`View ${course.title}`}
                  className="hover:border-brand hover:bg-brand hover:text-brand-foreground"
                >
                  <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Saying how many are hidden beats silently truncating: a bare visit to
          this page dumps the whole catalog with no end in sight. */}
      {hidden > 0 ? (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {courses.length}.{" "}
          <span className="text-foreground">
            Add a keyword to narrow the list.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** One course row, as the catalog queries return it. */
type CourseRow = {
  _id: string;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl?: string;
  category?: string;
};

/**
 * Server-side full-text search across title, description and category.
 *
 * Without a `?q`, the page shows the whole catalog rather than an empty state,
 * which is what makes the field on this page necessary: a bare visit used to be
 * a dead end on mobile.
 */
function filteredCourses(
  searched: CourseRow[] | undefined,
  all: CourseRow[] | undefined,
  query: string,
) {
  return query ? (searched ?? []) : (all ?? []);
}

/** "3 courses matching your search." — the count is part of the sentence. */
function resultSummary(
  query: string,
  searched: CourseRow[] | undefined,
  all: CourseRow[] | undefined,
) {
  if (!query) return "Search every published course by title, description or category.";
  const n = filteredCourses(searched, all, query).length;
  return `${n} course${n === 1 ? "" : "s"} matching your search.`;
}

export default function DashboardSearchPage() {
  return (
    <PageShell aria-busy>
      <Suspense
        fallback={
          <div className="flex flex-col gap-8">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-12 w-full max-w-xl rounded-sm" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-80 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        }
      >
        <SearchResults />
      </Suspense>
    </PageShell>
  );
}