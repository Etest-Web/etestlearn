"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * The heart on a course card and on the course page: "save this for later".
 *
 * **Two shapes on purpose.** `BookmarkButton` subscribes to its own course's row
 * and is right where there is one course in play — the course page's checkout
 * card. `BookmarkListButton` takes its state from a set the page already fetched
 * and is right on a list, where fifty of these would otherwise mean fifty
 * subscriptions re-running the same lookup. The catalog uses the second so the
 * whole page answers one query.
 *
 * Both settle their state from the server's answer rather than assuming a
 * direction. The one refusal — your own course — would otherwise leave a heart
 * painted for a save that never happened.
 */
export function BookmarkButton({
  courseId,
  className,
}: {
  courseId: Id<"courses">;
  className?: string;
}) {
  const bookmarked = useQuery(api.bookmarks.isBookmarked, { courseId });
  const toggle = useMutation(api.bookmarks.toggleBookmark);

  if (bookmarked === undefined) return <BookmarkButtonFrame className={className} />;

  return (
    <BookmarkToggle
      bookmarked={bookmarked}
      onToggle={() => toggle({ courseId })}
      className={className}
    />
  );
}

/**
 * The list variant.
 *
 * `bookmarked` is `null` while the set is still loading, which renders a
 * placeholder rather than an unlit heart — an unlit heart during the first paint
 * reads as "not saved" to anyone who clicks it quickly.
 */
export function BookmarkListButton({
  courseId,
  bookmarkedIds,
  className,
}: {
  courseId: Id<"courses">;
  bookmarkedIds: Set<string> | null;
  className?: string;
}) {
  const toggle = useMutation(api.bookmarks.toggleBookmark);

  if (bookmarkedIds === null) {
    return <BookmarkButtonFrame className={className} />;
  }

  return (
    <BookmarkToggle
      bookmarked={bookmarkedIds.has(courseId)}
      onToggle={() => toggle({ courseId })}
      className={className}
    />
  );
}

/**
 * The shared button body.
 *
 * A real `<button>` with `aria-pressed` rather than a checkbox: the label a
 * screen reader needs changes with the state ("Save for later" / "Saved"), and
 * `aria-pressed` is what tells it the control is a toggle without the label
 * having to lie.
 *
 * The painted state is **local**, seeded from the server's answer and then
 * flipped optimistically. A heart that waits for a round trip feels broken, so
 * the flip happens immediately and is rolled back if the write is refused — the
 * one refusal being your own course, which would otherwise leave a filled heart
 * over a save that never happened. The `useEffect` re-syncs when the prop
 * changes underneath (a real Convex update arriving), so local state can never
 * drift away from the row that actually exists.
 */
function BookmarkToggle({
  bookmarked,
  onToggle,
  className,
}: {
  bookmarked: boolean;
  onToggle: () => Promise<unknown>;
  className?: string;
}) {
  const [painted, setPainted] = useState(bookmarked);

  useEffect(() => {
    setPainted(bookmarked);
  }, [bookmarked]);

  function flip(event: React.MouseEvent<HTMLButtonElement>) {
    // A card is usually a link; saving one must not also navigate to it.
    event.preventDefault();
    event.stopPropagation();

    const previous = painted;
    setPainted(!previous);

    onToggle().catch((error: unknown) => {
      setPainted(previous);
      toast.error(
        error instanceof Error ? error.message : "Could not save this course.",
      );
    });
  }

  return (
    <button
      type="button"
      aria-pressed={painted}
      aria-label={painted ? "Remove from saved" : "Save for later"}
      title={painted ? "Remove from saved" : "Save for later"}
      onClick={flip}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        "border border-border bg-background/80 text-muted-foreground backdrop-blur-sm",
        "transition-colors hover:text-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        painted && "border-primary/40 text-primary",
        className,
      )}
    >
      <Bookmark aria-hidden className={cn("h-4 w-4", painted && "fill-current")} />
    </button>
  );
}

/** The loading placeholder — same footprint, no control. */
function BookmarkButtonFrame({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        "border border-border bg-background/80 text-muted-foreground backdrop-blur-sm",
        className,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin opacity-40" />
    </span>
  );
}