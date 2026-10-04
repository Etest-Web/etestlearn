"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  CheckCheck,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  TriangleAlert,
  Trash2,
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
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { StudyTaskView } from "@/convex/tasks";
import type {
  StudyTaskPriority,
  StudyTaskPriorityFilter,
  StudyTaskStatusFilter,
} from "@/lib/tasks";
import { MAX_NOTES_LENGTH, MAX_TITLE_LENGTH, PRIORITY_RANK } from "@/lib/tasks";
import {
  createStudyTask,
  deleteStudyTask,
  listCourseOptions,
  listStudyTasks,
  toggleStudyTaskComplete,
  updateStudyTask,
} from "./api";
import { DuePill, EmptyState, FilterPills, SectionHeading, StatCard, StatusPill } from "./primitives";
import { dateToInputValue, inputValueToTimestamp } from "./dates";

const NO_COURSE = "none";

const STATUS_FILTERS: ReadonlyArray<{ value: StudyTaskStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "outstanding", label: "Outstanding" },
  { value: "completed", label: "Completed" },
];

const PRIORITY_FILTERS: ReadonlyArray<{ value: StudyTaskPriorityFilter; label: string }> = [
  { value: "all", label: "Any priority" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const PRIORITY_PILL: Record<
  StudyTaskPriority,
  { tone: "danger" | "warning" | "neutral"; label: string }
> = {
  high: { tone: "danger", label: "High priority" },
  medium: { tone: "warning", label: "Medium priority" },
  low: { tone: "neutral", label: "Low priority" },
};

/**
 * The learner's private checklist. Nobody else — including an admin — can read
 * these rows; the server filters on the caller's own id and there is no override.
 */
export function MyTasksTab() {
  const [status, setStatus] = useState<StudyTaskStatusFilter>("all");
  const [priority, setPriority] = useState<StudyTaskPriorityFilter>("all");
  const result = useQuery(listStudyTasks, { status, priority });
  const toggleComplete = useMutation(toggleStudyTaskComplete);

  // Local overrides for the checkbox toggle, so the box moves the instant it is
  // clicked. Cleared on success (the query revalidates) and on failure (the row
  // snaps back).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  // Every hook runs before the loading branch, so the hook order is stable
  // across the undefined → array transition.
  if (result === undefined) return <MyTasksSkeleton />;

  const resolved = result.tasks.map((task) => ({
    ...task,
    completed: overrides[task.id] ?? task.completed,
  }));
  const outstanding = resolved.filter((task) => !task.completed);
  const completed = resolved.filter((task) => task.completed);
  outstanding.sort(byPriorityThenDeadline);
  completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  async function toggle(task: StudyTaskView, next: boolean) {
    setOverrides((prev) => ({ ...prev, [task.id]: next }));
    setPendingIds((prev) => [...prev, task.id]);
    try {
      await toggleComplete({ id: task.id, completed: next });
      // Drop the override and let the server value show through.
      setOverrides((prev) => {
        const next_ = { ...prev };
        delete next_[task.id];
        return next_;
      });
    } catch (error) {
      // Rollback: drop the override, so the row snaps back to the real state.
      setOverrides((prev) => {
        const next_ = { ...prev };
        delete next_[task.id];
        return next_;
      });
      toast.error(error instanceof Error ? error.message : "Could not update that task");
    } finally {
      setPendingIds((prev) => prev.filter((id) => id !== task.id));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <TaskStats
        outstanding={result.stats.outstanding}
        dueThisWeek={result.stats.dueThisWeek}
        overdue={result.stats.overdue}
        completed={result.stats.completed}
      />

      <TaskComposer />

      <section className="flex flex-col gap-4">
        <SectionHeading title="Your checklist" count={resolved.length}>
          <Select
            value={priority}
            onValueChange={(value) => setPriority((value ?? "all") as StudyTaskPriorityFilter)}
          >
            <SelectTrigger className="h-10 min-w-[10rem]" aria-label="Filter by priority">
              <SelectValue placeholder="Any priority" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SectionHeading>

        <FilterPills
          label="Filter tasks by completion"
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
        />

        {resolved.length === 0 ? (
          <EmptyState
            icon={<ListTodo />}
            title={
              status === "completed"
                ? "Nothing completed yet"
                : priority !== "all"
                  ? "No tasks at this priority"
                  : "No tasks yet"
            }
            body={
              status === "completed"
                ? "Tick something off in the outstanding list and it lands here."
                : priority !== "all"
                  ? "No tasks of that priority. Clear the filter to see the rest."
                  : "Add what you are going to work on — revision, a reading, an essay deadline — and tick it off as you go. Only you can see this list."
            }
          />
        ) : (
          <div className="flex flex-col gap-8">
            {outstanding.length > 0 ? (
              <TaskList
                heading="Outstanding"
                tasks={outstanding}
                pendingIds={pendingIds}
                onToggle={toggle}
              />
            ) : null}
            {completed.length > 0 ? (
              <TaskList
                heading="Completed"
                tasks={completed}
                pendingIds={pendingIds}
                onToggle={toggle}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function byPriorityThenDeadline(a: StudyTaskView, b: StudyTaskView): number {
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priority !== 0) return priority;
  return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
}

function TaskStats({
  outstanding,
  dueThisWeek,
  overdue,
  completed,
}: {
  outstanding: number;
  dueThisWeek: number;
  overdue: number;
  completed: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-live="polite">
      <StatCard label="Outstanding" value={outstanding} icon={<ListTodo />} tone="brand" />
      <StatCard
        label="Due this week"
        value={dueThisWeek}
        hint="Overdue tasks are included"
        icon={<CalendarClock />}
        tone={dueThisWeek > 0 ? "warning" : "neutral"}
      />
      <StatCard
        label="Overdue"
        value={overdue}
        icon={<TriangleAlert />}
        tone={overdue > 0 ? "danger" : "neutral"}
      />
      <StatCard label="Completed" value={completed} icon={<CheckCheck />} tone="success" />
    </div>
  );
}

function TaskList({
  heading,
  tasks,
  pendingIds,
  onToggle,
}: {
  heading: string;
  tasks: StudyTaskView[];
  pendingIds: string[];
  onToggle: (task: StudyTaskView, next: boolean) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {heading} ({tasks.length})
      </h3>
      <ul className="flex flex-col gap-3">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            pending={pendingIds.includes(task.id)}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({
  task,
  pending,
  onToggle,
}: {
  task: StudyTaskView;
  pending: boolean;
  onToggle: (task: StudyTaskView, next: boolean) => Promise<void>;
}) {
  const remove = useMutation(deleteStudyTask);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [editing, setEditing] = useState(false);

  const pill = PRIORITY_PILL[task.priority];

  async function handleDelete() {
    setDeletePending(true);
    try {
      await remove({ id: task.id });
      toast.success("Task deleted");
      setDeleteOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that task");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <li className="rounded-[24px] border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="pt-1">
          <Checkbox
            checked={task.completed}
            disabled={pending}
            aria-label={
              task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`
            }
            onCheckedChange={(checked) => void onToggle(task, checked)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={
              task.completed
                ? "text-base font-semibold text-muted-foreground line-through"
                : "text-base font-semibold text-foreground"
            }
          >
            {task.title}
          </p>

          {task.notes ? (
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{task.notes}</p>
          ) : null}

          {task.courseTitle ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Course:</span> {task.courseTitle}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DuePill
              label={task.dueLabel}
              overdue={task.overdue}
              dueSoon={task.dueSoon}
              done={task.completed}
            />
            <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
            <span className="text-xs text-muted-foreground">
              Added {formatRelativeTime(task.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Edit "${task.title}"`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-[#FF4949] hover:bg-red-50 dark:hover:bg-red-500/10"
                  aria-label={`Delete "${task.title}"`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{task.title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes it from your checklist. It cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletePending}>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deletePending}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleDelete();
                  }}
                >
                  {deletePending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Delete task
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <TaskEditDialog task={task} open={editing} onOpenChange={setEditing} />
    </li>
  );
}

/** Add form. Always visible, because the common case is adding one thing. */
function TaskComposer() {
  const options = useQuery(listCourseOptions, {});
  const create = useMutation(createStudyTask);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [courseId, setCourseId] = useState<string>(NO_COURSE);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<StudyTaskPriority>("medium");
  const [pending, setPending] = useState(false);

  const enrolled = options?.enrolled ?? [];
  const canAdd = title.trim().length > 0 && !pending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canAdd) return;
    setPending(true);
    try {
      await create({
        title: title.trim(),
        notes: notes.trim() || undefined,
        courseId: courseId === NO_COURSE ? undefined : (courseId as Id<"courses">),
        dueAt: inputValueToTimestamp(dueDate),
        priority,
      });
      toast.success("Task added");
      setTitle("");
      setNotes("");
      setCourseId(NO_COURSE);
      setDueDate("");
      setPriority("medium");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that task");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-foreground">Add a task</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-title">What do you need to do?</Label>
          <Input
            id="task-title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            disabled={pending}
            placeholder="Revise the half-life notes"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="task-notes">Notes (optional)</Label>
          <Textarea
            id="task-notes"
            rows={3}
            value={notes}
            disabled={pending}
            maxLength={MAX_NOTES_LENGTH}
            placeholder="Anything you want to remember about it."
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-course">Course (optional)</Label>
            <Select
              value={courseId}
              onValueChange={(value) => setCourseId(value ?? NO_COURSE)}
              disabled={pending}
            >
              <SelectTrigger id="task-course" className="h-10 w-full">
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COURSE}>Not linked to a course</SelectItem>
                {enrolled.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-due">Due date (optional)</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              disabled={pending}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority((value ?? "medium") as StudyTaskPriority)}
              disabled={pending}
            >
              <SelectTrigger id="task-priority" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!canAdd}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="mr-2 h-4 w-4" aria-hidden />
            )}
            Add task
          </Button>
        </div>
      </form>
    </section>
  );
}

function TaskEditDialog({
  task,
  open,
  onOpenChange,
}: {
  task: StudyTaskView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const options = useQuery(listCourseOptions, {});
  const update = useMutation(updateStudyTask);

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [courseId, setCourseId] = useState<string>(task.courseId ?? NO_COURSE);
  const [dueDate, setDueDate] = useState(dateToInputValue(task.dueAt));
  const [priority, setPriority] = useState<StudyTaskPriority>(task.priority);
  const [pending, setPending] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Forget the seed once the dialog closes, so reopening it always starts from
  // the stored row rather than whatever was last typed.
  useEffect(() => {
    if (!open) setSeededFor(null);
  }, [open]);

  // Re-seed whenever this dialog opens on a task it has not seen yet.
  if (open && seededFor !== task.id) {
    setSeededFor(task.id);
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setCourseId(task.courseId ?? NO_COURSE);
    setDueDate(dateToInputValue(task.dueAt));
    setPriority(task.priority);
  }

  const enrolled = options?.enrolled ?? [];
  const canSave = title.trim().length > 0 && !pending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setPending(true);
    try {
      const dueAt = inputValueToTimestamp(dueDate);
      await update({
        id: task.id,
        title: title.trim(),
        notes: notes.trim(),
        courseId: courseId === NO_COURSE ? null : (courseId as Id<"courses">),
        dueAt: dueAt ?? null,
        priority,
      });
      toast.success("Task updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that task");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>Only you can see this list, so change whatever you need.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-title-${task.id}`}>Title</Label>
            <Input
              id={`edit-title-${task.id}`}
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              disabled={pending}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-notes-${task.id}`}>Notes</Label>
            <Textarea
              id={`edit-notes-${task.id}`}
              rows={4}
              value={notes}
              disabled={pending}
              maxLength={MAX_NOTES_LENGTH}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`edit-course-${task.id}`}>Course</Label>
            <Select
              value={courseId}
              onValueChange={(value) => setCourseId(value ?? NO_COURSE)}
              disabled={pending}
            >
              <SelectTrigger id={`edit-course-${task.id}`} className="w-full">
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COURSE}>Not linked to a course</SelectItem>
                {enrolled.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-due-${task.id}`}>Due date</Label>
              <Input
                id={`edit-due-${task.id}`}
                type="date"
                value={dueDate}
                disabled={pending}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-priority-${task.id}`}>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as StudyTaskPriority)}
                disabled={pending}
              >
                <SelectTrigger id={`edit-priority-${task.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Pencil className="mr-2 h-4 w-4" aria-hidden />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MyTasksSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-[24px]" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-[24px]" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}