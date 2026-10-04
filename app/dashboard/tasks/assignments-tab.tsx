"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BookOpen,
  CircleCheck,
  FileText,
  Loader2,
  NotebookPen,
  Send,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import type { StudentAssignmentView } from "@/convex/tasks";
import { MAX_SUBMISSION_LENGTH, type StudentAssignmentFilter } from "@/lib/tasks";
import { listAssignmentsForStudent, saveSubmission, submitAssignment } from "./api";
import { DuePill, EmptyState, FilterPills, StatusPill } from "./primitives";

const FILTERS: ReadonlyArray<{ value: StudentAssignmentFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "To do" },
  { value: "overdue", label: "Overdue" },
  { value: "submitted", label: "Handed in" },
  { value: "graded", label: "Graded" },
];

const EMPTY_COPY: Record<StudentAssignmentFilter, { title: string; body: string }> = {
  all: {
    title: "No assignments yet",
    body: "When an instructor sets work on a course you are taking, it lands here with its deadline and your submission state.",
  },
  pending: {
    title: "Nothing outstanding",
    body: "Every assignment on your courses has been handed in. Switch to All to see what is already done.",
  },
  overdue: {
    title: "Nothing overdue",
    body: "Every deadline on your courses is still ahead of you. That is a good place to be.",
  },
  submitted: {
    title: "Nothing handed in yet",
    body: "Work you have submitted appears here so you can track it while it is being marked.",
  },
  graded: {
    title: "No marks yet",
    body: "Once an instructor marks an assignment, the score and their feedback appear on the card.",
  },
};

/**
 * The learner's side of the page: what other people set for them.
 *
 * Grouping and filtering happen on the server so each filter gets its own
 * designed empty state rather than a blank panel, and every card renders fields
 * the query already joined — this file never fetches.
 */
export function AssignmentsTab() {
  const [filter, setFilter] = useState<StudentAssignmentFilter>("all");
  const result = useQuery(listAssignmentsForStudent, { filter });

  if (result === undefined) return <AssignmentsSkeleton />;

  const copy = EMPTY_COPY[filter];

  return (
    <div className="flex flex-col gap-6">
      <FilterPills
        label="Filter assignments"
        options={FILTERS}
        value={filter}
        onChange={setFilter}
      />

      {result.groups.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={copy.title}
          body={copy.body}
          action={
            <Button render={<Link href="/courses" />}>
              Browse the catalogue
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          }
        />
      ) : (
        result.groups.map((group) => (
          <section key={group.courseId} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <BookOpen className="h-4 w-4 text-brand-ink" aria-hidden />
                {group.courseTitle}
              </h2>
              <span className="text-sm font-semibold text-muted-foreground">
                {group.assignments.length} assignment{group.assignments.length === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="grid gap-4 lg:grid-cols-2">
              {group.assignments.map((assignment) => (
                <li key={assignment.id}>
                  <AssignmentCard assignment={assignment} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function AssignmentCard({ assignment }: { assignment: StudentAssignmentView }) {
  // The dialog is owned by the card rather than hoisted, so each card keeps its
  // own composer state without a second piece of bookkeeping in the list.
  const [open, setOpen] = useState(false);
  const submission = assignment.submission;
  const graded = submission?.status === "graded";

  return (
    <article className="flex h-full flex-col rounded-[24px] border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold leading-snug text-foreground">{assignment.title}</h3>
        {assignment.isAuthor ? <StatusPill tone="neutral">Your draft</StatusPill> : null}
      </div>

      {assignment.instructions ? (
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{assignment.instructions}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DuePill
          label={assignment.dueLabel}
          overdue={assignment.isOverdue}
          dueSoon={assignment.isDueSoon}
          done={graded}
        />
        {assignment.maxPoints ? (
          <StatusPill tone="neutral">Out of {assignment.maxPoints} points</StatusPill>
        ) : null}
        {submission?.isLate ? (
          <StatusPill tone="danger" icon={<TriangleAlert />}>
            Handed in late
          </StatusPill>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <SubmissionStatePill assignment={assignment} />
        <Button size="sm" onClick={() => setOpen(true)}>
          {graded
            ? "Read feedback"
            : submission
              ? "Edit answer"
              : assignment.status === "open"
                ? "Write answer"
                : "View details"}
        </Button>
      </div>

      <SubmissionDialog
        assignment={assignment}
        open={open}
        onOpenChange={setOpen}
      />
    </article>
  );
}

/** Not started / Draft / Handed in / Graded — a word first, colour second. */
function SubmissionStatePill({ assignment }: { assignment: StudentAssignmentView }) {
  const submission = assignment.submission;

  if (submission?.status === "graded") {
    return (
      <StatusPill tone="success" icon={<CircleCheck />}>
        Graded · {submission.score}
        {assignment.maxPoints ? ` / ${assignment.maxPoints}` : ""}
      </StatusPill>
    );
  }
  if (submission?.status === "submitted") {
    return (
      <StatusPill tone="brand" icon={<Send />}>
        Handed in
      </StatusPill>
    );
  }
  if (submission?.status === "draft") {
    return (
      <StatusPill tone="warning" icon={<NotebookPen />}>
        Draft saved
      </StatusPill>
    );
  }
  if (assignment.status === "closed") {
    return (
      <StatusPill tone="neutral" icon={<FileText />}>
        Closed
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="neutral" icon={<FileText />}>
      Not started
    </StatusPill>
  );
}

/**
 * The submission composer, which doubles as the feedback reader: a graded
 * submission is shown rather than edited, because the server refuses further
 * changes once work has been handed in.
 */
function SubmissionDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: StudentAssignmentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [content, setContent] = useState(assignment.submission?.content ?? "");
  const [pending, setPending] = useState<"save" | "submit" | null>(null);
  const saveDraft = useMutation(saveSubmission);
  const handIn = useMutation(submitAssignment);

  // Re-seed the textarea each time the dialog opens, so an answer typed for one
  // card can never leak into the next one.
  useEffect(() => {
    if (open) setContent(assignment.submission?.content ?? "");
  }, [open, assignment.id, assignment.submission?.content]);

  const submission = assignment.submission;
  const graded = submission?.status === "graded";
  const closed = assignment.status === "closed";
  const editable = assignment.status === "open" && !graded;
  const overLimit = content.length > MAX_SUBMISSION_LENGTH;
  const canSend = editable && !overLimit && content.trim().length > 0;

  async function run(kind: "save" | "submit") {
    if (!canSend) return;
    setPending(kind);
    try {
      if (kind === "save") {
        await saveDraft({ assignmentId: assignment.id, content });
        toast.success("Draft saved");
      } else {
        await handIn({ assignmentId: assignment.id, content });
        toast.success("Assignment handed in");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{assignment.title}</DialogTitle>
          <DialogDescription>
            {assignment.courseTitle} · {assignment.dueLabel}
            {assignment.maxPoints ? ` · out of ${assignment.maxPoints} points` : ""}
          </DialogDescription>
        </DialogHeader>

        {assignment.instructions ? (
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Instructions
            </p>
            <p className="whitespace-pre-line text-sm text-foreground">{assignment.instructions}</p>
          </div>
        ) : null}

        {graded && submission ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success" icon={<CircleCheck />}>
                Graded · {submission.score}
                {assignment.maxPoints ? ` / ${assignment.maxPoints}` : ""}
              </StatusPill>
              {submission.scorePercent !== null ? (
                <StatusPill tone="neutral">{submission.scorePercent}%</StatusPill>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Handed in {submission.submittedAt ? formatRelativeTime(submission.submittedAt) : "—"}
              {submission.isLate ? " (late)" : ""}
              {submission.gradedAt ? ` · marked ${formatRelativeTime(submission.gradedAt)}` : ""}
            </p>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Your answer
              </p>
              <p className="whitespace-pre-line text-sm text-foreground">{submission.content}</p>
            </div>
            <div className="rounded-2xl border border-[#945DA3]/30 bg-brand/5 p-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-ink">
                Instructor feedback
              </p>
              <p className="whitespace-pre-line text-sm text-foreground">
                {submission.feedback?.trim()
                  ? submission.feedback
                  : "No written feedback on this one — the score is the whole response."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="submission-content">Your answer</Label>
            <Textarea
              id="submission-content"
              rows={8}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={!editable || pending !== null}
              placeholder="Write your answer here. Save a draft as often as you like — nothing reaches your instructor until you hand it in."
              aria-describedby="submission-help"
            />
            <p id="submission-help" className="text-xs text-muted-foreground">
              {content.length.toLocaleString("en-GB")}/{MAX_SUBMISSION_LENGTH.toLocaleString("en-GB")}{" "}
              characters
              {overLimit ? " — over the limit, trim it before saving." : ""}
            </p>
            {closed ? (
              <p className="text-sm text-muted-foreground">
                This assignment is closed, so it no longer accepts answers. Anything you saved
                earlier is still shown on the card.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {editable ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!canSend || pending !== null}
                onClick={() => void run("save")}
              >
                {pending === "save" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Save draft
              </Button>
              <Button
                type="button"
                disabled={!canSend || pending !== null}
                onClick={() => void run("submit")}
              >
                {pending === "submit" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                )}
                Hand in
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:px-0">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col rounded-[24px] border border-border bg-card p-5 shadow-sm">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-28 rounded-md" />
        <Skeleton className="h-6 w-24 rounded-md" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}