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
  averageRating,
  formatRating,
  normalizeComment,
  reviewDraftError,
} from "@/lib/reviews";
import { formatRelativeTime, pluralize } from "@/lib/utils";

/**
 * The review block on a course page: the summary, the learner's own review if
 * they have one, and everyone else's.
 *
 * The running total it prints comes in as props rather than being read here.
 * The page already holds the course document, and `ratingSum` / `ratingCount`
 * live on it, so re-reading them would be a second source for one number — and
 * the prop form means the header stars and this summary can never disagree.
 *
 * Every rule about who may write is the server's (`convex/reviews.ts` uses the
 * same `lib/reviews.ts` policy this reads), so this component decides only how
 * to say it: the form appears exactly when `getReviewerState` says
 * `canReview`.
 */
export function CourseReviews({
  courseId,
  ratingSum,
  ratingCount,
}: {
  courseId: Id<"courses">;
  ratingSum?: number;
  ratingCount?: number;
}) {
  const reviews = useQuery(api.reviews.listForCourse, { courseId });
  const state = useQuery(api.reviews.getReviewerState, { courseId });
  const upsert = useMutation(api.reviews.upsertReview);
  const remove = useMutation(api.reviews.deleteReview);

  // `composing` is only ever set by the learner, either by opening the form to
  // write or to edit. Until then the card shows the review they already have —
  // which is why the draft fields need no effect to stay in sync with the query
  // result: they are seeded at the moment the form opens.
  const [composing, setComposing] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const average = averageRating(ratingSum, ratingCount);
  const count = ratingCount ?? 0;
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
      await upsert({ courseId, rating, comment: normalizeComment(comment) });
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
      await remove({ courseId });
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

  if (reviews === undefined || state === undefined) {
    return <Skeleton className="h-64 w-full rounded-sm" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Learner reviews</CardTitle>
        {average !== null ? (
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StarRating value={average} size="sm" />
            <span className="font-medium text-foreground">
              {formatRating(average)}
            </span>
            <span aria-hidden>·</span>
            <span>{pluralize(count, "review")}</span>
          </CardDescription>
        ) : (
          <CardDescription>
            No ratings yet. If you are enrolled, yours would be the first.
          </CardDescription>
        )}
      </CardHeader>

      {showForm ? (
        <div className="flex flex-col gap-3 border-t border-rule pt-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {myReview ? "Edit your review" : "Rate this course"}
            </span>
            <RatingInput
              value={rating}
              onChange={setRating}
              disabled={saving}
              name={`course-rating-${courseId}`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`review-comment-${courseId}`}
              className="text-sm font-medium"
            >
              What stood out?{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Textarea
              id={`review-comment-${courseId}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={REVIEW_COMMENT_MAX_LENGTH}
              disabled={saving}
              rows={4}
              placeholder="What would you tell someone deciding whether to take this course?"
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
          description="Ratings and comments from learners who finished this course will appear here."
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
                  <AvatarFallback>
                    {initials(review.authorName)}
                  </AvatarFallback>
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

      {count > reviews.length ? (
        <p className="text-xs text-muted-foreground">
          Showing the {reviews.length} most recent of {count} reviews.
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
