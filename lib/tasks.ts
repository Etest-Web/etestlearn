/**
 * Pure logic for the unified Task page.
 *
 * Two unrelated things share that page — graded assignments an instructor
 * authors and private study tasks a learner sets for themselves — so this file
 * holds the rules both of them share and the UI needs to render honestly:
 * due-date urgency, lateness, grading arithmetic, and the assignment status
 * machine.
 *
 * Kept out of `convex/` (which imports it as `../lib/tasks`) for two reasons,
 * matching `lib/certificates.ts` and `lib/publishing.ts`: the maths is unit
 * testable, and the client renders the same labels the server derived instead of
 * re-deriving them — two copies of "is this overdue" would eventually disagree.
 *
 * Nothing here touches Convex, `Date.now()` defaults are threaded in as `now`,
 * and all formatting is locale-independent: server and browser must produce
 * byte-identical strings or React will report a hydration mismatch.
 */

export const DAY_MS = 86_400_000;

/**
 * How close a due date has to be before we warn about it. Three days is the
 * longest lead time a learner can realistically act on, and the same window the
 * "due this week" study-task stat uses (see {@link WEEK_MS} there).
 */
export const DUE_SOON_WINDOW_MS = 3 * DAY_MS;

export const WEEK_MS = 7 * DAY_MS;

export type AssignmentStatus = "draft" | "open" | "closed";
export type SubmissionStatus = "draft" | "submitted" | "graded";
export type StudyTaskPriority = "low" | "medium" | "high";

// ── Due dates ──────────────────────────────────────────────────────────────

/**
 * Whole days between `from` and `to`, rounded *toward* the deadline in both
 * directions: an hour before the due date is still "0 days left", and an hour
 * after it is "0 days late". Plain `Math.floor` would report the first as 0 and
 * the second as −1, so a submission handed in one minute late would read
 * "Overdue by 1 day" — a rounding artefact dressed up as a fact.
 */
export function daysUntil(from: number, to: number): number {
  const delta = (from - to) / DAY_MS;
  const rounded = delta < 0 ? Math.ceil(delta) : Math.floor(delta);
  // Math.ceil returns -0 for a fractionally negative delta, and `-0 === 0` but
  // `Object.is(-0, 0)` is false — which would break both the `days < 0` overdue
  // branch below and any consumer comparing with Object.is.
  return rounded === 0 ? 0 : rounded;
}

export interface DueState {
  /** False when the record has no due date at all — never rendered as "due". */
  hasDueDate: boolean;
  /** Past the deadline *and* still outstanding. A finished task is never late. */
  overdue: boolean;
  /** Still outstanding, due within the warning window. */
  dueSoon: boolean;
  /** Whole days until the deadline; negative once past it. Null without a due date. */
  daysRemaining: number | null;
}

export interface DueStateInput {
  dueAt?: number | null;
  /** Epoch ms to evaluate against. Passed in so the derivation stays pure. */
  now: number;
  /** Set false for records that are already done — they cannot be overdue. */
  completed?: boolean;
  dueSoonWindowMs?: number;
}

/**
 * The one place "overdue" is defined.
 *
 * A completed task is never overdue even if its due date has passed, so
 * `completed` is part of the input rather than applied by callers afterwards —
 * forgetting that check is how finished work ends up flagged red forever.
 */
export function deriveDueState(input: DueStateInput): DueState {
  const hasDueDate = typeof input.dueAt === "number" && Number.isFinite(input.dueAt);
  if (!hasDueDate) {
    return { hasDueDate: false, overdue: false, dueSoon: false, daysRemaining: null };
  }

  const dueAt = input.dueAt as number;
  const window = input.dueSoonWindowMs ?? DUE_SOON_WINDOW_MS;
  const outstanding = input.completed !== true;
  const daysRemaining = daysUntil(dueAt, input.now);
  const msRemaining = dueAt - input.now;

  return {
    hasDueDate: true,
    overdue: outstanding && msRemaining < 0,
    dueSoon: outstanding && msRemaining >= 0 && msRemaining <= window,
    daysRemaining,
  };
}

/** A submission counts as late when it landed after the deadline. */
export function isLateSubmission(
  submittedAt?: number | null,
  dueAt?: number | null,
): boolean {
  if (typeof submittedAt !== "number" || !Number.isFinite(submittedAt)) return false;
  if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) return false;
  return submittedAt > dueAt;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * A fixed month table rather than `toLocaleDateString`, because the server and
 * the browser must agree on the string exactly — a locale-dependent format here
 * renders on the server and re-renders differently on hydration.
 */
function formatDueDate(timestamp: number, now: number): string {
  const date = new Date(timestamp);
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date(now).getFullYear()
    ? base
    : `${base} ${date.getFullYear()}`;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/**
 * The word that sits next to the due-date treatment. Always explicit about
 * urgency ("Overdue by 3 days") rather than relying on the pill's colour, per
 * the accessibility rule that status is never colour-only.
 */
export function dueLabel(
  dueAt: number | undefined | null,
  now: number,
  completed = false,
): string {
  if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) return "No due date";

  if (completed) return `Done · was due ${formatDueDate(dueAt, now)}`;

  const msRemaining = dueAt - now;

  if (msRemaining < 0) {
    const late = -msRemaining;
    // Judged in milliseconds, not days: rounding first would report a
    // submission handed in one minute late as "Overdue by 1 day".
    if (late < DAY_MS) return "Overdue · today";
    return `Overdue by ${plural(Math.round(late / DAY_MS), "day")}`;
  }

  const days = daysUntil(dueAt, now);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${plural(days, "day")}`;
  return `Due ${formatDueDate(dueAt, now)}`;
}

// ── Grading ────────────────────────────────────────────────────────────────

export interface GradingCounts {
  /** Every submission row, drafts included. */
  total: number;
  /** Rows still in draft — never handed in, so never gradeable. */
  drafts: number;
  /** Rows the learner actually handed in (`submitted` + `graded`). */
  submitted: number;
  /** Handed in and still waiting on a grader. */
  ungraded: number;
  /** Handed in and marked. */
  graded: number;
}

/**
 * Rolls submission statuses up into the four numbers every grading surface
 * shows. `submitted` counts a graded row too — it *was* submitted — and
 * `ungraded` is the inverse of `graded`, so `ungraded + graded === submitted`
 * always holds.
 */
export function countSubmissionStatuses(
  statuses: readonly SubmissionStatus[],
): GradingCounts {
  let drafts = 0;
  let submitted = 0;
  let graded = 0;

  for (const status of statuses) {
    if (status === "draft") {
      drafts += 1;
      continue;
    }
    submitted += 1;
    if (status === "graded") graded += 1;
  }

  return { total: statuses.length, drafts, submitted, ungraded: submitted - graded, graded };
}

/** Sums per-assignment counts into a course-level or account-level total. */
export function aggregateGradingCounts(
  groups: readonly GradingCounts[],
): GradingCounts {
  return groups.reduce<GradingCounts>(
    (acc, counts) => ({
      total: acc.total + counts.total,
      drafts: acc.drafts + counts.drafts,
      submitted: acc.submitted + counts.submitted,
      ungraded: acc.ungraded + counts.ungraded,
      graded: acc.graded + counts.graded,
    }),
    { total: 0, drafts: 0, submitted: 0, ungraded: 0, graded: 0 },
  );
}

/**
 * Percentage of the assignment's points a score represents, or null when the
 * assignment has no maximum (an ungraded-scale assignment shows a raw number
 * instead of a misleading percentage).
 */
export function scorePercent(
  score: number | undefined | null,
  maxPoints: number | undefined | null,
): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (typeof maxPoints !== "number" || !Number.isFinite(maxPoints) || maxPoints <= 0) {
    return null;
  }
  const percent = (score / maxPoints) * 100;
  if (percent < 0) return 0;
  if (percent > 100) return 100;
  return Math.round(percent);
}

/**
 * Scores are bounded so a grade means something. Convex has no numeric range
 * validator (`v.number()` only has `.optional()`), so the bounds live here and
 * are called before anything is written.
 *
 * `maxPoints` is required rather than assumed: with no maximum there is nothing
 * to bound the score against, and a percentage the learner can read off an
 * uncalibrated number is worse than no percentage at all.
 */
export function assertScoreWithinMaxPoints(
  score: number,
  maxPoints: number | undefined | null,
): void {
  if (!Number.isFinite(score)) {
    throw new Error("Score must be a number");
  }
  if (typeof maxPoints !== "number" || !Number.isFinite(maxPoints) || maxPoints <= 0) {
    throw new Error(
      "Set a maximum points value on this assignment before grading it",
    );
  }
  if (score < 0) {
    throw new Error("Score cannot be below zero");
  }
  if (score > maxPoints) {
    throw new Error(`Score cannot be higher than the maximum of ${maxPoints}`);
  }
}

// ── Assignment status machine ──────────────────────────────────────────────

/**
 * `draft → open` publishes; `open → closed` stops accepting work; going back to
 * `draft` unpublishes; `closed → open` reopens. A draft cannot jump straight to
 * closed because it was never visible to anyone, and no transition to the status
 * a row is already in is legal — a silent no-op write would be indistinguishable
 * from a success in the UI and would hide a broken caller.
 */
const ALLOWED_ASSIGNMENT_TRANSITIONS: Record<
  AssignmentStatus,
  readonly AssignmentStatus[]
> = {
  draft: ["open"],
  open: ["draft", "closed"],
  closed: ["draft", "open"],
};

export function canTransitionAssignmentStatus(
  from: AssignmentStatus,
  to: AssignmentStatus,
): boolean {
  return ALLOWED_ASSIGNMENT_TRANSITIONS[from].includes(to);
}

export function assertAssignmentStatusTransition(
  from: AssignmentStatus,
  to: AssignmentStatus,
): void {
  if (!canTransitionAssignmentStatus(from, to)) {
    throw new Error(`An assignment cannot move from ${from} to ${to}`);
  }
}

/** The forward step of the machine, or null when there is none (a draft). */
export function nextAssignmentStatus(
  from: AssignmentStatus,
): AssignmentStatus | null {
  return ALLOWED_ASSIGNMENT_TRANSITIONS[from].find((s) => s !== "draft") ?? null;
}

/**
 * Publishing is an explicit operation, so `open`ing something students can see
 * requires instructions. A blank assignment that suddenly appears in a
 * learner's task list is the accident this prevents: the author typed a title,
 * hit publish, and nobody was told what to hand in.
 */
export function assertOpenable(instructions: string | undefined | null): void {
  if (!instructions || instructions.trim().length === 0) {
    throw new Error("Add instructions before opening this assignment for submissions");
  }
}

// ── Student assignment filters ─────────────────────────────────────────────

export type StudentAssignmentFilter =
  | "all"
  | "pending"
  | "overdue"
  | "submitted"
  | "graded";

/**
 * What a learner sees in the Assignments tab. The filters run on the server so
 * each one gets a designed empty state rather than an already-filtered blank
 * panel, and they are derived from the *submission* — "pending" means "not yet
 * marked", which includes a graded submission being resubmitted — never from
 * colour.
 */
export function matchesStudentAssignmentFilter(
  assignment: {
    status: AssignmentStatus;
    isOverdue: boolean;
    submission: { status: SubmissionStatus } | null;
  },
  filter: StudentAssignmentFilter,
): boolean {
  // A draft is only ever visible to its own author, and drafts are not work the
  // learner owes anybody, so they stay out of every filter except "all".
  if (filter === "all") return true;

  const submissionStatus = assignment.submission?.status ?? null;

  switch (filter) {
    case "pending":
      return submissionStatus !== "graded";
    case "overdue":
      return assignment.isOverdue && submissionStatus !== "graded";
    case "submitted":
      return submissionStatus === "submitted" || submissionStatus === "graded";
    case "graded":
      return submissionStatus === "graded";
  }
}

// ── Study tasks ────────────────────────────────────────────────────────────

export type StudyTaskStatusFilter = "all" | "outstanding" | "completed";
export type StudyTaskPriorityFilter = "all" | StudyTaskPriority;

export interface StudyTaskStats {
  outstanding: number;
  completed: number;
  /** Outstanding *and* past its due date. */
  overdue: number;
  /** Outstanding and due inside the next 7 days, overdue included. */
  dueThisWeek: number;
}

/** Counts for the study-task stat strip. `overdue` is a subset of `dueThisWeek`. */
export function studyTaskStats(
  tasks: readonly { dueAt?: number | null; completedAt?: number | null }[],
  now: number,
): StudyTaskStats {
  let outstanding = 0;
  let completed = 0;
  let overdue = 0;
  let dueThisWeek = 0;

  for (const task of tasks) {
    if (typeof task.completedAt === "number") {
      completed += 1;
      continue;
    }
    outstanding += 1;
    if (typeof task.dueAt !== "number" || !Number.isFinite(task.dueAt)) continue;
    if (task.dueAt < now) {
      overdue += 1;
      dueThisWeek += 1;
    } else if (task.dueAt <= now + WEEK_MS) {
      dueThisWeek += 1;
    }
  }

  return { outstanding, completed, overdue, dueThisWeek };
}

export function matchesStudyTaskFilter(
  task: {
    completed: boolean;
    priority: StudyTaskPriority;
  },
  filter: { status: StudyTaskStatusFilter; priority: StudyTaskPriorityFilter },
): boolean {
  if (filter.status !== "all" && task.completed !== (filter.status === "completed")) {
    return false;
  }
  if (filter.priority !== "all" && task.priority !== filter.priority) {
    return false;
  }
  return true;
}

/** high → medium → low, the order the priority filter and lists sort by. */
export const PRIORITY_RANK: Record<StudyTaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// ── Field validation ───────────────────────────────────────────────────────

export const MAX_TITLE_LENGTH = 160;
export const MAX_NOTES_LENGTH = 2_000;
export const MAX_SUBMISSION_LENGTH = 20_000;

function requireText(
  value: string | undefined | null,
  field: string,
  max: number,
): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    throw new Error(`${field} is required`);
  }
  if (trimmed.length > max) {
    throw new Error(`${field} must be ${max} characters or fewer`);
  }
  return trimmed;
}

/** Assignment and study-task titles share one cap and one trim. */
export function normalizeTitle(
  value: string | undefined | null,
  field = "Title",
): string {
  return requireText(value, field, MAX_TITLE_LENGTH);
}

/** Optional free text: trimmed, length-capped, and absent when empty. */
export function normalizeOptionalText(
  value: string | undefined | null,
  field: string,
  max: number,
): string | undefined {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) {
    throw new Error(`${field} must be ${max} characters or fewer`);
  }
  return trimmed;
}

/**
 * Submission content. An empty string is refused rather than stored, because a
 * `draft` row with no content would show up in the grader's queue as work the
 * learner is apparently doing.
 */
export function normalizeSubmissionContent(value: string | undefined | null): string {
  return requireText(value, "Your answer", MAX_SUBMISSION_LENGTH);
}

/** Due dates are future-or-present; a due date in the past is a typo, not data. */
export function assertDueDateInFuture(
  dueAt: number | undefined | null,
  now: number,
): void {
  if (dueAt === undefined || dueAt === null) return;
  if (!Number.isFinite(dueAt)) {
    throw new Error("Due date must be a valid date");
  }
  if (dueAt < now) {
    throw new Error("Due date cannot be in the past");
  }
}