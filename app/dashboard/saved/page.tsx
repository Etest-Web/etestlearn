"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowRight, Bookmark } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/dashboard-shell";
import { StarRating } from "@/components/star-rating";
import Image from "next/image";
import { averageRating, formatRating } from "@/lib/reviews";

/**
 * "Saved for later" — the courses a learner bookmarked but has not enrolled in.
 *
 * The one place a bookmark is read back as a list, which is why
 * `bookmarks.listMyBookmarks` hydrates course fields rather than returning bare
 * ids: a saved page that fired a second query per row would be fifty round trips
 * for a grid.
 *
 * The hearts are `BookmarkListButton`s over the same id set this page already
 * fetched, so un-saving here and pressing Back does not re-fetch anything.
 */

/**
 * The saved-list projection, restated as an interface.
 *
 * Written out rather than derived from the query's inferred type so the card
 * below depends on the fields it *renders* rather than on whatever shape
 * `bookmarks.listMyBookmarks` happens to return — which is the point of the
 * hand-written projection on that query. `course: null` is a real case: a
 * bookmark whose course has gone.
 */
interface SavedCourse {
  _id: Id<"courses">;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string | null;
  category: string | null;
  level: string | null;
  price?: number;
  currency?: string;
  ratingSum?: number;
  ratingCount?: number;
  instructorName: string | null;
}

interface SavedBookmark {
  _id: Id<"bookmarks">;
  createdAt: number;
  course: SavedCourse | null;
}

export default function SavedCoursesPage() {
  const bookmarks = useQuery(api.bookmarks.listMyBookmarks, {});

  // A bookmark whose course has gone renders as nothing; see the `course: null`
  // case on the interface above.
  const saved: SavedBookmark[] = useMemo(
    () => (bookmarks ?? []).filter((bookmark) => bookmark.course !== null),
    [bookmarks],
  );

  const free = saved.filter((bookmark) => !bookmark.course!.price);
  const paid = saved.filter((bookmark) => Boolean(bookmark.course!.price));

  if (bookmarks === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-20 w-full max-w-[280px] rounded-sm" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-sm" />
          <Skeleton className="h-72 rounded-sm" />
          <Skeleton className="h-72 rounded-sm" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Saved for later"
        description={
          saved.length === 0
            ? "Courses you bookmark will wait for you here."
            : `You have saved ${saved.length} course${saved.length === 1 ? "" : "s"}. Nothing here enrolls you in anything — it is just your shortlist.`
        }
      />

      {saved.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          description="Tap the bookmark on any course to keep it here while you decide."
          action={<Button render={<Link href="/courses" />}>Explore the catalog</Button>}
        />
      ) : (
        <Tabs defaultValue="all" className="w-full">
          {/* Peer views of one list, so the segmented variant — the same call
              `app/dashboard/courses/page.tsx` makes for All / In progress /
              Completed. */}
          <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList variant="segmented" className="w-max touch-target">
              <TabsTrigger value="all" className="tabular">
                All ({saved.length})
              </TabsTrigger>
              <TabsTrigger value="free" className="tabular">
                Free ({free.length})
              </TabsTrigger>
              <TabsTrigger value="paid" className="tabular">
                Paid ({paid.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="mt-0 outline-none">
            <SavedGrid items={saved} />
          </TabsContent>
          <TabsContent value="free" className="mt-0 outline-none">
            <SavedGrid
              items={free}
              emptyTitle="No free courses saved"
              emptyMessage="Free courses you bookmark will appear here."
            />
          </TabsContent>
          <TabsContent value="paid" className="mt-0 outline-none">
            <SavedGrid
              items={paid}
              emptyTitle="No paid courses saved"
              emptyMessage="Paid courses you bookmark will appear here."
            />
          </TabsContent>
        </Tabs>
      )}
    </PageShell>
  );
}

/** A saved course with an inline un-save, since that is the likeliest action here. */
function SavedGrid({
  items,
  emptyTitle = "Nothing saved yet",
  emptyMessage = "Tap the bookmark on any course to keep it here.",
}: {
  items: SavedBookmark[];
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title={emptyTitle}
        description={emptyMessage}
        action={<Button render={<Link href="/courses" />}>Explore the catalog</Button>}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((bookmark) => (
        <SavedCard key={bookmark._id} bookmark={bookmark} />
      ))}
    </div>
  );
}

function SavedCard({
  bookmark,
}: {
  bookmark: SavedBookmark;
}) {
  const course = bookmark.course!;
  const remove = useMutation(api.bookmarks.toggleBookmark);

  const average = averageRating(course.ratingSum, course.ratingCount);

  async function unsave() {
    try {
      await remove({ courseId: course._id });
      toast.success("Removed from saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove it.",
      );
    }
  }

  return (
    <Card variant="interactive" className="flex flex-col">
      <CardHeader>
        <Image
          src={course.thumbnailUrl || "/certf.jpeg"}
          alt={course.title}
          width={500}
          height={500}
          className="mb-2 h-40 w-full rounded-sm object-cover"
        />
        <div className="flex flex-wrap gap-2">
          {course.category && <Badge variant="secondary">{course.category}</Badge>}
          {course.level && <Badge variant="outline">{course.level}</Badge>}
        </div>
        <CardTitle className="line-clamp-2">{course.title}</CardTitle>
        {average !== null && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <StarRating value={average} size="xs" />
            <span className="tabular text-xs text-muted-foreground">
              {formatRating(average)}
              {course.ratingCount ? ` · ${course.ratingCount}` : ""}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="mt-auto flex flex-1 flex-col gap-3">
        <p className="line-clamp-3 text-sm leading-body text-muted-foreground">
          {course.description}
        </p>
        {course.instructorName && (
          <p className="text-xs text-muted-foreground">
            Taught by {course.instructorName}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2">
          <Button
            className="flex-1"
            variant="outline"
            render={<Link href={`/courses/${course.slug}`} />}
          >
            View course
            <ArrowRight aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={unsave}>
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}