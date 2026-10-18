"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, MessageSquareQuote, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { RatingInput, StarRating } from "@/components/star-rating";
import {
  REVIEW_COMMENT_MAX_LENGTH,
  formatRating,
  normalizeComment,
  reviewDraftError,
} from "@/lib/reviews";
import { formatRelativeTime, pluralize } from "@/lib/utils";

/**
 * The review block on a public instructor profile.
 *
 * A structural sibling of `CourseReviews`, and deliberately so: the same
 * summary, the same write-or-edit-or-refused decision, the same delete. The
 * review system is the platform's, and a second dialect of it would be two
 * places to fix every rule change.
 *
 * What differs is only *where the total comes from*. The course version takes
 * `ratingSum` / `ratingCount` as props because the page already holds the course
 * document; here the instructor's total is behind a query, so it is read rather
 * than passed — one round trip for the summary and the list together, rather
 * than two.
 *
 * Who may write is entirely the server's (`convex/instructorReviews.ts` uses the
 * same `lib/reviews.ts` policy this reads), so this component decides only how
 * to say it. In particular it does not try to work out whether the viewer took
 * a course: `getReviewerState` has already answered that.
 */
export function InstructorReviews({ instructorId }: { instructorId: Id<"users"> }) {
  const data = useQuery(api.instructorReviews.listForInstructor, { instructorId });
  const state = useQuery(api.instructorReviews.getReviewerState, { instructorId });
  const upsert = useMutation(api.instructorReviews.upsertInstructorReview);
  const remove = useMutation(api.instructorReviews.deleteInstructorReview);

  const [composing, setComposing] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const myReview = state?.review ?? null;
  const canReview = state?.canReview ?? false;
  const showForm = composing || (canReview && myReview === null);

  function openForm() {
    setRating(myReview?.rating ?? null);
    setComment(myReview?.comment ?? "");
    setComposing(true);
  }

  async function submit() {
    if (rating === null || saving) return;
    const draftError = reviewDraftError({ rating, comment });
    if (draftError) {
      toast.error(draftError);
      return;
    }

    setSaving(true);
    try {
      await upsert({
        instructorId,
        rating,
        comment: normalizeComment(comment),
      });
      toast.success(
        myReview ? "Your review was updated." : "Thanks — your review is up.",
      );
      setComposing(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your review.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (saving) return;
    setSaving(true);
    try {
      await remove({ instructorId });
      toast.success("Your review was removed.");
      setComposing(false);
      setRating(null);
      setComment("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove your review.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (data === undefined || state === undefined) {
    return <Skeleton className="h-64 w-full rounded-sm" />;
  }

  // Null means the server considers this id unpublishable — a learner, a missing
  // account, or a suspended one. The page has already 404'd on that; reaching
  // here means the two disagreed, so render nothing rather than a broken block.
  if (data === null) return null;

  const { average, ratingCount, reviews } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instructor reviews</CardTitle>
        {average !== null ? (
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StarRating value={average} size="sm" />
            <span className="font-medium text-foreground">
              {formatRating(average)}
            </span>
            <span aria-hidden>·</span>
            <span>{pluralize(ratingCount, "review")}</span>
          </CardDescription>
        ) : (
          <CardDescription>
            No ratings yet. Reviews come from learners who took one of this
            instructor&apos;s courses.
          </CardDescription>
        )}
      </CardHeader>

      {showForm ? (
        <div className="flex flex-col gap-3 border-t border-rule pt-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {myReview ? "Edit your review" : "Rate this instructor"}
            </span>
            <RatingInput
              value={rating}
              onChange={setRating}
              disabled={saving}
              name={`instructor-rating-${instructorId}`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`instructor-review-comment-${instructorId}`}
              className="text-sm font-medium"
            >
              What stood out?{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Textarea
              id={`instructor-review-comment-${instructorId}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={REVIEW_COMMENT_MAX_LENGTH}
              disabled={saving}
              rows={4}
              placeholder="What would you tell someone deciding whether to learn from them?"
            />
            <p className="text-xs text-muted-foreground">
              {comment.trim().length}/{REVIEW_COMMENT_MAX_LENGTH} characters
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={submit} disabled={rating === null || saving}>
              {saving && <Loader2 aria-hidden className="animate-spin" />}
              {myReview ? "Save changes" : "Publish review"}
            </Button>
            {composing && (
              <Button
                variant="ghost"
                onClick={() => setComposing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {!showForm && myReview ? (
        <div className="flex flex-col gap-3 border-t border-rule pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StarRating value={myReview.rating} size="sm" />
              <span className="text-sm font-medium">Your review</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={openForm}>
                <Pencil aria-hidden />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={destroy}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden />
                )}
                Delete
              </Button>
            </div>
          </div>
          {myReview.comment ? (
            <p className="text-sm leading-[1.7] whitespace-pre-line text-muted-foreground">
              {myReview.comment}
            </p>
          ) : null}
        </div>
      ) : null}

      {!showForm && !myReview && state.reason ? (
        <p className="border-t border-rule pt-5 text-sm text-muted-foreground">
          {state.reason}
        </p>
      ) : null}

      {reviews.length === 0 ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="No written reviews yet"
          description="Ratings and comments from learners who took this instructor's courses will appear here."
        />
      ) : (
        <ul className="flex flex-col border-t border-rule">
          {reviews.map((review) => (
            <li
              key={review._id}
              className="flex flex-col gap-3 border-b border-rule py-5 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  {review.authorImageUrl ? (
                    <AvatarImage
                      src={review.authorImageUrl}
                      alt=""
                      className="rounded-full"
                    />
                  ) : null}
                  <AvatarFallback>{initials(review.authorName)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {review.authorName}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <StarRating
                      value={review.rating}
                      size="xs"
                      label={`${review.rating} out of 5 stars`}
                    />
                    <span aria-hidden>·</span>
                    <span>{formatRelativeTime(review.createdAt)}</span>
                    {review.edited ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>edited</span>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
              {review.comment ? (
                <p className="text-sm leading-[1.7] whitespace-pre-line">
                  {review.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ratingCount > reviews.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the {reviews.length} most recent of {ratingCount} reviews.
        </p>
      ) : null}
    </Card>
  );
}

/** First letter of the first two words — enough for an avatar fallback. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}