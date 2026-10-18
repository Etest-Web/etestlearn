"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  CornerDownRight,
  Loader2,
  MessageSquareQuote,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  CardDescription,
  EmptyState,
  Skeleton,
  Textarea,
} from "@/components/ui";
import {
  CLASS_COMMENT_BODY_MAX_LENGTH,
  classCommentDraftError,
  normalizeCommentBody,
} from "@/lib/class-discussion";
import { formatRelativeTime, pluralize } from "@/lib/utils";

/**
 * The class discussion: "how did this course actually go?", from people who
 * finished it.
 *
 * The third learner-voice surface, and the one that earns its keep *here* —
 * inside the Reviews tab, below the stars. `CourseReviews` covers the rating and
 * a short justification; this covers the longer account and, critically, the
 * instructor's answer to it. A prospective buyer is not persuaded by a 5-star
 * average alone, they are persuaded by "the teacher replied to a learner and the
 * reply was useful" — and that exchange cannot be expressed in a one-row-per-
 * learner review table.
 *
 * Every eligibility rule is the server's (`convex/courseComments.ts` runs the
 * same `lib/class-discussion.ts` policy this reads, and the same
 * `evaluateCertificateCompletion` that issues a certificate), so this component
 * decides only how to say it. It does not attempt to check whether the viewer
 * finished anything — `getViewerState` has already answered that, and
 * recomputing it in the browser would mean a second opinion from a page that
 * already trusts the server on everything else.
 *
 * Renders nothing when the course has no posts **and** the viewer cannot write,
 * so an empty section never sits under the stars of a course nobody has
 * finished yet. A "0 posts, be the first" heading on a course with 200 enrolled
 * is an invitation that looks like evidence.
 */
export function CourseClassDiscussion({ courseId }: { courseId: Id<"courses"> }) {
  const data = useQuery(api.courseComments.listForCourse, { courseId });
  const viewer = useQuery(api.courseComments.getViewerState, { courseId });
  const postComment = useMutation(api.courseComments.postComment);
  const deleteComment = useMutation(api.courseComments.deleteComment);

  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  // `replyingTo` holds the id of the comment whose reply box is open. One at a
  // time on purpose: two open boxes on a mobile screen is two keyboards' worth
  // of page.
  const [replyingTo, setReplyingTo] = useState<Id<"courseComments"> | null>(null);

  /**
   * Opens the box on one comment and closes any other.
   *
   * One box at a time is deliberate: two open reply boxes on a phone is two
   * textareas fighting over the same scroll position, and the conversation reads
   * worse with every node offering a caret.
   */
  function openReplyBox(commentId: Id<"courseComments">) {
    setReplyingTo((current) => (current === commentId ? null : commentId));
  }

  async function submit() {
    if (posting) return;
    const draftError = classCommentDraftError({ body });
    if (draftError) {
      toast.error(draftError);
      return;
    }

    setPosting(true);
    try {
      const result = await postComment({
        courseId,
        body: normalizeCommentBody(body) ?? "",
      });
      setBody("");
      toast.success(
        result.created
          ? "Thanks — your experience is now on the course page."
          : "You have already shared your experience of this course.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post.");
    } finally {
      setPosting(false);
    }
  }

  async function destroy(commentId: Id<"courseComments">) {
    try {
      await deleteComment({ commentId });
      toast.success("Post removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove it.");
    }
  }

  if (data === undefined || viewer === undefined) {
    return <Skeleton className="h-40 w-full rounded-sm" />;
  }

  const { posts, totalTopLevel, truncated } = data;
  const canPost = viewer.canPost;

  // Nothing to show and nobody to invite: render nothing at all.
  if (posts.length === 0 && !canPost) return null;

  return (
    <section aria-labelledby="class-discussion-heading" className="flex flex-col gap-5">
      <div className="space-y-1">
        <h3
          id="class-discussion-heading"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <MessageSquareQuote aria-hidden className="h-4 w-4 text-primary" />
          What former students say
        </h3>
        <CardDescription>
          Written by learners who completed this course, with the instructor&apos;s
          replies.
        </CardDescription>
      </div>

      {canPost ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4">
          <label htmlFor="class-comment-body" className="text-sm font-medium">
            How was this course for you?
          </label>
          <Textarea
            id="class-comment-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={CLASS_COMMENT_BODY_MAX_LENGTH}
            rows={4}
            placeholder="What clicked, what didn't, and whether it was worth your time."
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {body.trim().length}/{CLASS_COMMENT_BODY_MAX_LENGTH} characters
            </p>
            <Button onClick={submit} disabled={posting}>
              {posting ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Send aria-hidden />
              )}
              Share
            </Button>
          </div>
        </div>
      ) : viewer.myPostId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            You have shared your experience of this course.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => destroy(viewer.myPostId!)}
          >
            <Trash2 aria-hidden />
            Remove my post
          </Button>
        </div>
      ) : viewer.reason ? (
        <p className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          {viewer.reason}
        </p>
      ) : null}

      {posts.length === 0 ? (
        <EmptyState
          icon={MessageSquareQuote}
          tone="neutral"
          title="No posts yet"
          description="Nobody who has finished this course has written about it yet."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post._id}>
              <CommentNode
                comment={post}
                canReply={viewer.canReply}
                canRemove={viewer.myPostId === post._id}
                replyingTo={replyingTo}
                onReply={openReplyBox}
              />
            </li>
          ))}
        </ul>
      )}

      {totalTopLevel > posts.length || truncated ? (
        <p className="text-xs text-muted-foreground">
          Showing the {posts.length} most recent of {pluralize(totalTopLevel, "post")}.
          {truncated ? " This thread is long — older replies are not loaded." : ""}
        </p>
      ) : null}
    </section>
  );
}

/**
 * One comment's shape, recursively.
 *
 * Declared as an interface rather than inlined at each use because the reply tree
 * is genuinely recursive — a top-level post and a reply five levels down are the
 * same type — and an inline copy would be wrong the moment a branch nests.
 */
interface CommentNodeData {
  _id: Id<"courseComments">;
  body: string | null;
  deleted: boolean;
  depth: number;
  createdAt: number;
  authorName: string;
  authorImageUrl: string | null;
  isInstructor: boolean;
  replies: CommentNodeData[];
}

/**
 * One post and its replies, at any depth.
 *
 * The same component renders a top-level post and a reply five levels down —
 * only the indentation and the reply button change. That is what keeps threading
 * honest: there is no second "reply" renderer that could disagree about what a
 * reply looks like.
 *
 * `onReply` takes the id of the node being answered rather than closing over it,
 * so a reply box opens on the comment that was actually clicked. The alternative
 * — capturing the parent's `onReply` — silently opens the *parent's* box when
 * someone answers a reply, which is invisible in a flat thread and obvious in a
 * deep one.
 *
 * Indentation is capped at {@link MAX_INDENT_STEPS} regardless of the stored
 * depth. An unbounded `depth * 4` on a five-deep branch walks a reply off the
 * right edge of a phone, and the conversation is still legible without it.
 */
function CommentNode({
  comment,
  canReply,
  canRemove,
  replyingTo,
  onReply,
}: {
  comment: CommentNodeData;
  canReply: boolean;
  canRemove: boolean;
  replyingTo: Id<"courseComments"> | null;
  onReply: (commentId: Id<"courseComments">) => void;
}) {
  const reply = useMutation(api.courseComments.replyToComment);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (sending) return;
    const draftError = classCommentDraftError({ body });
    if (draftError) {
      toast.error(draftError);
      return;
    }

    setSending(true);
    try {
      await reply({ parentId: comment._id, body: normalizeCommentBody(body) ?? "" });
      setBody("");
      onReply(comment._id);
      toast.success("Reply posted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reply.");
    } finally {
      setSending(false);
    }
  }

  const indent = Math.min(comment.depth, MAX_INDENT_STEPS);
  const isOpen = replyingTo === comment._id;

  return (
    <div
      className={
        indent > 0
          ? "border-l-2 border-border pl-3 sm:pl-4"
          : "rounded-xl border border-border bg-card p-4"
      }
    >
      <div className="flex items-center gap-2">
        <Avatar size="sm">
          {comment.authorImageUrl ? (
            <AvatarImage
              src={comment.authorImageUrl}
              alt=""
              className="rounded-full"
            />
          ) : null}
          <AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
        </Avatar>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{comment.authorName}</span>
          {comment.isInstructor && (
            /* The badge is the feature. A learner's account of a class and the
               teacher's own answer to it are worth very different amounts of
               reassurance, and the reader cannot tell them apart without this. */
            <Badge variant="secondary" className="gap-1 text-xs">
              <BadgeCheck aria-hidden className="h-3 w-3" />
              Instructor
            </Badge>
          )}
          {comment.depth > 0 && (
            <CornerDownRight aria-hidden className="h-3 w-3 text-muted-foreground" />
          )}
        </span>

        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {formatRelativeTime(comment.createdAt)}
        </span>
      </div>

      {comment.deleted ? (
        <p className="mt-2 text-sm italic text-muted-foreground">
          This post was removed.
        </p>
      ) : (
        /* whitespace-pre-line rather than Markdown: a retrospective is prose, and
           a learner pasting something they did not write should not be able to
           inject formatting into a public page. */
        <p className="mt-2 whitespace-pre-line text-sm leading-[1.7]">
          {comment.body}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1">
        {canReply && !isOpen ? (
          <Button variant="ghost" size="sm" onClick={() => onReply(comment._id)}>
            <CornerDownRight aria-hidden />
            Reply
          </Button>
        ) : null}
        {canRemove ? <RemoveButton commentId={comment._id} /> : null}
      </div>

      {isOpen ? (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={CLASS_COMMENT_BODY_MAX_LENGTH}
            aria-label={`Reply to ${comment.authorName}`}
            placeholder={`Reply to ${comment.authorName}…`}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={send} disabled={sending}>
              {sending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Send aria-hidden />
              )}
              Reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onReply(comment._id)} disabled={sending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {comment.replies.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3">
          {comment.replies.map((child) => (
            <li key={child._id}>
              <CommentNode
                comment={child}
                canReply={canReply}
                canRemove={false}
                replyingTo={replyingTo}
                onReply={onReply}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RemoveButton({ commentId }: { commentId: Id<"courseComments"> }) {
  const remove = useMutation(api.courseComments.deleteComment);
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await remove({ commentId });
          toast.success("Reply removed.");
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not remove it.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
      Remove
    </Button>
  );
}

/** Indentation steps, not pixels, so it reads the same on every breakpoint. */
const MAX_INDENT_STEPS = 3;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}