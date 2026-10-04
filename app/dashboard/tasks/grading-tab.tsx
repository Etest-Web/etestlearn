"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ClipboardCheck,
  Gauge,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  TriangleAlert,
  Unlock,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { GradingSummary, InstructorAssignmentView, SubmissionView } from "@/convex/tasks";
import type { AssignmentStatus } from "@/lib/tasks";
import {
  createAssignment,
  deleteAssignment,
  getGradingSummary,
  getSubmissions,
  gradeSubmission,
  listAssignmentsForInstructor,
  listCourseOptions,
  setAssignmentStatus,
  updateAssignment,
} from "./api";
import { SectionHeading, StatCard, StatusPill } from "./primitives";
import { dateToInputValue, formatHumanDate, inputValueToTimestamp } from "./dates";

const NO_COURSE = "none";

/**
 * The instructor's side of the page: author assignments, then mark what comes
 * back.
 *
 * Access is decided by relationship to the course, never by the tab being
 * visible — this component is only mounted for instructors and admins, and every
 * call it makes re-checks ownership server-side anyway.
 */
export function GradingTab() {
  const [courseId, setCourseId] = useState<Id<"courses"> | undefined>(undefined);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<InstructorAssignmentView | null>(null);
  const [openAssignmentId, setOpenAssignmentId] = useState<Id<"assignments"> | null>(null);

  const summary = useQuery(getGradingSummary, {});
  const assignments = useQuery(listAssignmentsForInstructor, {});
  const options = useQuery(listCourseOptions, {});

  if (summary === undefined || assignments === undefined || options === undefined) {
    return <GradingSkeleton />;
  }

  const canAuthor = options.authorable.length > 0;
  const groups =
    courseId === undefined
      ? assignments.groups
      : assignments.groups.filter((group) => group.courseId === courseId);

  return (
    <div className="flex flex-col gap-8">
      <GradingStats summary={summary} />

      <section className="flex flex-col gap-4">
        <SectionHeading title="Your assignments" count={assignments.total}>
          <div className="flex flex-wrap items-center gap-2">
            {options.authorable.length > 1 ? (
              <Select
                value={courseId ?? "all"}
                onValueChange={(value) => setCourseId(value && value !== "all" ? (value as Id<"courses">) : undefined)}
              >
                <SelectTrigger className="h-10 min-w-[12rem]" aria-label="Filter by course">
                  <SelectValue placeholder="All courses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All courses</SelectItem>
                  {options.authorable.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button
              disabled={!canAuthor}
              onClick={() => {
                setEditing(null);
                setComposerOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              New assignment
            </Button>
          </div>
        </SectionHeading>

        {!canAuthor ? (
          <EmptyState
            icon={Layers}
            title="No courses to author into"
            description="Assignments belong to a course, and you are not teaching one yet. Once you publish a course it shows up here and you can set work on it."
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={courseId ? "Nothing on this course" : "No assignments yet"}
            description={
              courseId
                ? "This course has no assignments yet. Create one and it will appear here for marking."
                : "Set work for your learners. Drafts stay private to you until you publish them, and submissions arrive here to be marked."
            }
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setComposerOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Create an assignment
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.courseId} className="flex flex-col gap-3">
                <h3 className="rule-heading eyebrow">
                  <span className="shrink-0">{group.courseTitle}</span>
                  {!group.coursePublished ? (
                    <StatusPill tone="neutral">Course not published</StatusPill>
                  ) : null}
                </h3>
                <ul className="flex flex-col gap-3">
                  {group.assignments.map((assignment) => (
                    <li key={assignment.id}>
                      <AssignmentRow
                        assignment={assignment}
                        expanded={openAssignmentId === assignment.id}
                        onToggle={() =>
                          setOpenAssignmentId((current) =>
                            current === assignment.id ? null : assignment.id,
                          )
                        }
                        onEdit={() => {
                          setEditing(assignment);
                          setComposerOpen(true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <AssignmentComposer
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) setEditing(null);
        }}
        assignment={editing}
        defaultCourseId={courseId ?? options.authorable[0]?.id}
      />
    </div>
  );
}

function GradingStats({ summary }: { summary: GradingSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-live="polite">
      <StatCard
        label="Assignments"
        value={summary.assignments}
        hint={`${summary.open} open · ${summary.drafts} draft · ${summary.closed} closed`}
        icon={<Layers />}
        tone="brand"
      />
      <StatCard
        label="Awaiting a mark"
        value={summary.awaitingGrade}
        hint="Handed in, not graded yet"
        icon={<Gauge />}
        tone={summary.awaitingGrade > 0 ? "warning" : "neutral"}
      />
      <StatCard label="Graded" value={summary.graded} icon={<ClipboardCheck />} tone="success" />
      <StatCard
        label="Average"
        value={summary.averagePercent === null ? "—" : `${summary.averagePercent}%`}
        hint={summary.submitted - summary.graded > 0 ? `${summary.submitted - summary.graded} still in progress` : "All handed-in work marked"}
        icon={<Send />}
      />
    </div>
  );
}

const STATUS_PILL: Record<AssignmentStatus, { tone: "brand" | "neutral" | "warning"; label: string }> = {
  draft: { tone: "neutral", label: "Draft — only you can see it" },
  open: { tone: "brand", label: "Open for submissions" },
  closed: { tone: "warning", label: "Closed to new submissions" },
};

function AssignmentRow({
  assignment,
  expanded,
  onToggle,
  onEdit,
}: {
  assignment: InstructorAssignmentView;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const setStatus = useMutation(setAssignmentStatus);
  const remove = useMutation(deleteAssignment);
  const [statusPending, setStatusPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const pill = STATUS_PILL[assignment.status];
  const awaiting = assignment.counts.ungraded;

  async function transition(status: AssignmentStatus) {
    setStatusPending(true);
    try {
      await setStatus({ assignmentId: assignment.id, status });
      toast.success(
        status === "open"
          ? "Published — learners can see and hand in this assignment"
          : status === "closed"
            ? "Closed — no further submissions are accepted"
            : "Moved back to draft",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the status");
    } finally {
      setStatusPending(false);
    }
  }

  async function handleDelete() {
    setDeletePending(true);
    try {
      const result = await remove({ assignmentId: assignment.id });
      toast.success(
        result.deletedSubmissions > 0
          ? `Assignment deleted, along with ${result.deletedSubmissions} submission${result.deletedSubmissions === 1 ? "" : "s"}`
          : "Assignment deleted",
      );
      setDeleteOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the assignment");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <article className="border border-rule bg-card transition-colors hover:border-rule-strong">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="display-subheading text-lg leading-snug text-foreground">
              {assignment.title}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatRelativeTime(assignment.createdAt)}
              {assignment.dueAt ? ` · due ${formatHumanDate(assignment.dueAt)}` : " · no deadline"}
              {assignment.maxPoints ? ` · out of ${assignment.maxPoints} points` : " · no maximum set"}
            </p>
          </div>
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
        </div>

        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <StatusPill tone="neutral">{assignment.counts.total} total</StatusPill>
          <StatusPill tone={awaiting > 0 ? "warning" : "neutral"}>
            {awaiting} awaiting a mark
          </StatusPill>
          <StatusPill tone="success">{assignment.counts.graded} graded</StatusPill>
          {assignment.counts.drafts > 0 ? (
            <StatusPill tone="neutral">{assignment.counts.drafts} in draft</StatusPill>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-4">
          <Button size="sm" variant={expanded ? "secondary" : "default"} onClick={onToggle}>
            <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden />
            {expanded ? "Hide submissions" : `Mark submissions (${assignment.counts.submitted})`}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" aria-hidden />
            Edit
          </Button>

          {/* Publishing is an operation, not a field — one control per legal
              transition, so a caller cannot ask for draft → closed. */}
          {assignment.status === "draft" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={statusPending}
              onClick={() => void transition("open")}
            >
              {statusPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-2 h-4 w-4" aria-hidden />
              )}
              Publish
            </Button>
          ) : null}
          {assignment.status === "open" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={statusPending}
                onClick={() => void transition("closed")}
              >
                {statusPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <X className="mr-2 h-4 w-4" aria-hidden />
                )}
                Close submissions
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={statusPending}
                onClick={() => void transition("draft")}
              >
                Unpublish
              </Button>
            </>
          ) : null}
          {assignment.status === "closed" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={statusPending}
              onClick={() => void transition("open")}
            >
              {statusPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Unlock className="mr-2 h-4 w-4" aria-hidden />
              )}
              Reopen
            </Button>
          ) : null}

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  Delete
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{assignment.title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the assignment and every submission under it. Grades already
                  given go with it. If you only want to stop new work coming in, close the
                  assignment instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletePending}>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deletePending}
                  onClick={(event) => {
                    // Keep the dialog open until the mutation resolves, so a
                    // failure does not look like a successful delete.
                    event.preventDefault();
                    void handleDelete();
                  }}
                >
                  {deletePending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Delete assignment
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {expanded ? <SubmissionQueue assignment={assignment} /> : null}
    </article>
  );
}

/** One assignment's handed-in work, with an inline grade form per row. */
function SubmissionQueue({ assignment }: { assignment: InstructorAssignmentView }) {
  const queue = useQuery(getSubmissions, { assignmentId: assignment.id });

  if (queue === undefined) {
    return (
      <div className="border-t border-rule px-5 pb-5 pt-4">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (queue.submissions.length === 0) {
    return (
      <div className="border-t border-rule px-5 pb-5 pt-4">
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing handed in yet"
          description={
            assignment.status === "draft"
              ? "Publish this assignment and submissions will appear here to mark."
              : "Nobody has handed this in yet. Learners still working on it keep their drafts private until they submit."
          }
        />
      </div>
    );
  }

  return (
    <div className="border-t border-rule px-5 pb-5 pt-4">
      {/* The table scrolls inside its own wrapper: at 375px it must not widen
          the document. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Table>
          {/* Names the assignment for a screen-reader user, who otherwise gets a
              table of answers with no idea which assignment they belong to. */}
          <TableCaption className="sr-only">
            Submissions for “{queue.assignment.title}” — {queue.assignment.courseTitle}
          </TableCaption>
          <TableHeader className="bg-surface-sunken">
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[12rem]">Learner</TableHead>
              <TableHead className="min-w-[18rem]">Answer</TableHead>
              <TableHead>Handed in</TableHead>
              <TableHead className="min-w-[16rem]">Grade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.submissions.map((submission) => (
              <SubmissionRow
                key={submission.id}
                submission={submission}
                maxPoints={queue.assignment.maxPoints}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SubmissionRow({
  submission,
  maxPoints,
}: {
  submission: SubmissionView;
  maxPoints?: number;
}) {
  const grade = useMutation(gradeSubmission);
  const [score, setScore] = useState(submission.score !== undefined ? String(submission.score) : "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [pending, setPending] = useState(false);

  // Seed from the server row whenever a *different* submission is shown, so a
  // score typed for one learner never appears against another's.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seededFor !== submission.id) {
    setSeededFor(submission.id);
    setScore(submission.score !== undefined ? String(submission.score) : "");
    setFeedback(submission.feedback ?? "");
  }

  const parsedScore = Number(score);
  const scoreValid =
    score.trim().length > 0 &&
    Number.isFinite(parsedScore) &&
    (maxPoints === undefined || (parsedScore >= 0 && parsedScore <= maxPoints));

  const missingMaximum = maxPoints === undefined;
  const alreadyGraded = submission.status === "graded";

  async function submitGrade() {
    if (!scoreValid) return;
    setPending(true);
    try {
      await grade({
        submissionId: submission.id,
        score: parsedScore,
        feedback: feedback.trim() || undefined,
      });
      toast.success(`${submission.studentName} marked`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the grade");
    } finally {
      setPending(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            {submission.studentImage ? (
              <AvatarImage src={submission.studentImage} alt="" />
            ) : null}
            <AvatarFallback>
              {submission.studentName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {submission.studentName}
            </p>
            {alreadyGraded ? (
              <p className="tabular text-xs text-muted-foreground">
                {submission.score}
                {maxPoints ? ` / ${maxPoints}` : ""}
                {submission.scorePercent !== null ? ` · ${submission.scorePercent}%` : ""}
              </p>
            ) : (
              <StatusPill tone="warning" icon={<TriangleAlert />}>
                Awaiting a mark
              </StatusPill>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <p className="max-h-32 overflow-y-auto whitespace-pre-line text-sm text-foreground">
          {submission.content}
        </p>
      </TableCell>

      <TableCell>
        <p className="text-sm text-muted-foreground">
          {submission.submittedAt ? formatRelativeTime(submission.submittedAt) : "—"}
        </p>
        {submission.isLate ? (
          <StatusPill tone="danger" icon={<TriangleAlert />}>
            Late
          </StatusPill>
        ) : null}
      </TableCell>

      <TableCell>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`score-${submission.id}`} className="text-xs text-muted-foreground">
              Score
            </Label>
            <Input
              id={`score-${submission.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={maxPoints ?? undefined}
              step="any"
              className="h-9 w-24"
              value={score}
              disabled={pending}
              aria-invalid={score.trim().length > 0 && !scoreValid}
              aria-describedby={`score-help-${submission.id}`}
              onChange={(event) => setScore(event.target.value)}
              placeholder={maxPoints === undefined ? "—" : `0–${maxPoints}`}
            />
          </div>
          <p id={`score-help-${submission.id}`} className="text-xs text-muted-foreground">
            {missingMaximum
              ? "Set a maximum on this assignment before marking it"
              : scoreValid
                ? `Out of ${maxPoints}`
                : `Must be between 0 and ${maxPoints}`}
          </p>

          <Label htmlFor={`feedback-${submission.id}`} className="text-xs text-muted-foreground">
            Feedback
          </Label>
          <Textarea
            id={`feedback-${submission.id}`}
            rows={3}
            className="min-h-16"
            value={feedback}
            disabled={pending}
            maxLength={5000}
            placeholder="Optional — what went well, and what to do next time."
            onChange={(event) => setFeedback(event.target.value)}
          />

          <Button size="sm" disabled={!scoreValid || pending} onClick={() => void submitGrade()}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden />
            )}
            {alreadyGraded ? "Update grade" : "Save grade"}
          </Button>

          {submission.gradedByName && submission.gradedAt ? (
            <p className="text-xs text-muted-foreground">
              Last marked by {submission.gradedByName} · {formatRelativeTime(submission.gradedAt)}
            </p>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Create / edit form. Editing deliberately cannot change the status — publishing
 * goes through the one control on the row, so an edit cannot make a draft
 * visible by accident.
 */
function AssignmentComposer({
  open,
  onOpenChange,
  assignment,
  defaultCourseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: InstructorAssignmentView | null;
  defaultCourseId?: Id<"courses">;
}) {
  const options = useQuery(listCourseOptions, {});
  const create = useMutation(createAssignment);
  const update = useMutation(updateAssignment);
  const publish = useMutation(setAssignmentStatus);

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxPoints, setMaxPoints] = useState("");
  const [courseId, setCourseId] = useState<string>(defaultCourseId ?? NO_COURSE);
  const [publishNow, setPublishNow] = useState(false);
  const [pending, setPending] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Forget the seed once the dialog closes, so reopening it always starts from
  // the stored assignment rather than whatever was last typed.
  useEffect(() => {
    if (!open) setSeededFor(null);
  }, [open]);

  const seedKey = assignment?.id ?? "new";
  if (open && seededFor !== `${seedKey}:${defaultCourseId ?? ""}`) {
    setSeededFor(`${seedKey}:${defaultCourseId ?? ""}`);
    setTitle(assignment?.title ?? "");
    setInstructions(assignment?.instructions ?? "");
    setDueDate(dateToInputValue(assignment?.dueAt));
    setMaxPoints(assignment?.maxPoints !== undefined ? String(assignment.maxPoints) : "");
    setCourseId(assignment?.courseId ?? defaultCourseId ?? NO_COURSE);
    setPublishNow(false);
  }

  const authorable = options?.authorable ?? [];
  const parsedMaxPoints = maxPoints.trim() === "" ? undefined : Number(maxPoints);
  const maxPointsValid =
    parsedMaxPoints === undefined ||
    (Number.isFinite(parsedMaxPoints) && parsedMaxPoints > 0 && parsedMaxPoints <= 1_000_000);
  const canSave = title.trim().length > 0 && courseId !== NO_COURSE && maxPointsValid;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    const dueAt = inputValueToTimestamp(dueDate);

    setPending(true);
    try {
      if (assignment) {
        await update({
          assignmentId: assignment.id,
          title: title.trim(),
          instructions: instructions.trim(),
          dueAt: dueAt ?? null,
          maxPoints: parsedMaxPoints ?? null,
        });
        toast.success("Assignment updated");
        onOpenChange(false);
        return;
      }

      const id = await create({
        courseId: courseId as Id<"courses">,
        title: title.trim(),
        instructions: instructions.trim() || undefined,
        dueAt,
        maxPoints: parsedMaxPoints,
        status: publishNow ? "open" : "draft",
      });
      // Publishing and creating are separate operations on the server, so a
      // newly created assignment is a draft first and only then opened — which
      // is what keeps the "no instructions" guard in one place.
      if (publishNow) {
        await publish({ assignmentId: id, status: "open" });
      }
      toast.success(publishNow ? "Assignment published" : "Draft assignment created");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the assignment");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{assignment ? "Edit assignment" : "New assignment"}</DialogTitle>
            <DialogDescription>
              {assignment
                ? "Changes take effect immediately for learners who have not handed in yet."
                : "It starts as a draft only you can see. Publishing it is a separate, deliberate step."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assignment-course">Course</Label>
            <Select
              value={courseId}
              onValueChange={(value) => setCourseId(value ?? NO_COURSE)}
              disabled={assignment !== null}
            >
              <SelectTrigger id="assignment-course" className="h-10 w-full">
                <SelectValue placeholder="Choose a course" />
              </SelectTrigger>
              <SelectContent>
                {authorable.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignment ? (
              <p className="text-xs text-muted-foreground">
                An assignment cannot be moved between courses — create a new one instead.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assignment-title">Title</Label>
            <Input
              id="assignment-title"
              value={title}
              maxLength={160}
              disabled={pending}
              placeholder="Reflective essay on week one"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="assignment-instructions">Instructions</Label>
            <Textarea
              id="assignment-instructions"
              rows={5}
              value={instructions}
              disabled={pending}
              maxLength={10000}
              placeholder="What learners have to do. Required before an assignment can be published."
              aria-describedby="instructions-help"
              onChange={(event) => setInstructions(event.target.value)}
            />
            <p id="instructions-help" className="text-xs text-muted-foreground">
              {instructions.trim().length === 0
                ? "An assignment cannot be published without instructions."
                : `${instructions.trim().length.toLocaleString("en-GB")}/10,000 characters`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="assignment-due">Due date</Label>
              <Input
                id="assignment-due"
                type="date"
                value={dueDate}
                disabled={pending}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Learners see the deadline at the end of the day you pick.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="assignment-max-points">Maximum points</Label>
              <Input
                id="assignment-max-points"
                type="number"
                min={1}
                max={1000000}
                step="any"
                value={maxPoints}
                disabled={pending}
                aria-invalid={!maxPointsValid}
                placeholder="10"
                onChange={(event) => setMaxPoints(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {maxPointsValid
                  ? "Grades are marked out of this. It cannot be set afterwards."
                  : "Must be a number greater than zero."}
              </p>
            </div>
          </div>

          {assignment === null ? (
            <label className="flex items-center gap-3 border border-rule bg-surface-sunken p-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-[4px] accent-brand"
                checked={publishNow}
                disabled={pending || instructions.trim().length === 0}
                onChange={(event) => setPublishNow(event.target.checked)}
              />
              <span>
                Publish straight away
                <span className="block text-xs text-muted-foreground">
                  {instructions.trim().length === 0
                    ? "Add instructions first."
                    : "Learners will see this straight away."}
                </span>
              </span>
            </label>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || pending}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden />
              )}
              {assignment ? "Save changes" : publishNow ? "Create and publish" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GradingSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}