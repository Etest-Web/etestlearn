import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  canManageCourse,
  requireUser,
  type Id,
  type ReadCtx,
  type UserDoc,
} from "./helpers/auth";
import { requireRateLimit } from "./helpers/rateLimit";
import { createNotification } from "./helpers/notifications";
import {
  aggregateGradingCounts,
  assertAssignmentStatusTransition,
  assertDueDateInFuture,
  assertOpenable,
  assertScoreWithinMaxPoints,
  countSubmissionStatuses,
  deriveDueState,
  dueLabel,
  isLateSubmission,
  matchesStudyTaskFilter,
  matchesStudentAssignmentFilter,
  normalizeOptionalText,
  normalizeSubmissionContent,
  normalizeTitle,
  scorePercent,
  studyTaskStats,
  type AssignmentStatus,
  type GradingCounts,
  type StudentAssignmentFilter,
  type StudyTaskPriority,
  type StudyTaskPriorityFilter,
  type StudyTaskStatusFilter,
  type SubmissionStatus,
} from "../lib/tasks";

/**
 * The Task page: graded assignments and private study tasks in one place.
 *
 * Two rules shape everything below.
 *
 * 1. **Access is by relationship to the course, never by role.** The same three
 *    branches as `discussions.ts:verifyAccess` decide whether a caller may read
 *    or write a course's assignments — admin, then the course's instructor, then
 *    an `enrollments` row. Instructors and admins participate in this page (they
 *    grade, and they keep personal study tasks too), so a role check would be
 *    both too strict for them and not strong enough for anyone else.
 *
 * 2. **Study tasks are private to their owner, unconditionally.** Every study
 *    task read and write is filtered on the caller's own `userId` and *nothing*
 *    else — no admin override, because there is nothing for an admin to do here
 *    that the owner cannot do themselves. That is the whole point of the
 *    feature, and it is asserted in `tests/tasks.test.ts`.
 *
 * Every list resolves its joins server-side (course title, slug, instructor
 * name, the caller's own submission) so the client renders and never fetches.
 */

// ── Rate limits ────────────────────────────────────────────────────────────
//
// Fixed-window buckets on the `rateLimits` table. The reasoning is the same one
// in `discussions.ts`: a per-item rule alone does not stop a client walking
// every item and writing once in each, so anything a user *generates* also gets
// a per-user global budget. Each is placed after its authorization checks —
// Convex mutations are transactions, so a rejected attempt rolls the increment
// back and cannot burn quota.
const RATE_LIMITS = {
  createAssignment: { max: 20, windowMs: 60 * 60 * 1000 },
  updateAssignment: { max: 60, windowMs: 60 * 1000 },
  deleteAssignment: { max: 20, windowMs: 60 * 60 * 1000 },
  setAssignmentStatus: { max: 60, windowMs: 60 * 1000 },
  // Drafts are saved as the learner types, so this is generous — but bounded,
  // because an unbounded autosave endpoint is a free database-fill primitive.
  saveSubmission: { max: 40, windowMs: 60 * 1000 },
  // Handing work in is the consequential act (it enters the grader's queue), so
  // it gets the tighter budget of the two submission paths.
  submitAssignment: { max: 10, windowMs: 60 * 1000 },
  gradeSubmission: { max: 60, windowMs: 60 * 1000 },
  createStudyTask: { max: 30, windowMs: 60 * 1000 },
  updateStudyTask: { max: 60, windowMs: 60 * 1000 },
  toggleStudyTaskComplete: { max: 60, windowMs: 60 * 1000 },
  deleteStudyTask: { max: 30, windowMs: 60 * 1000 },
} as const;

/** Hard ceiling on any list a learner can page through, so a busy course cannot ship an unbounded response. */
const MAX_PAGE = 100;

const assignmentStatus = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
);

const studyTaskPriority = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

// ── Result shapes ──────────────────────────────────────────────────────────
//
// Declared here (not inferred from the query) so the client can import them
// when calling these functions through `makeFunctionReference` — see the note on
// the page's function references about `convex/_generated` not yet knowing this
// module.

export interface CourseOption {
  id: Id<"courses">;
  title: string;
  slug: string;
}

export interface CourseOptionList {
  /** Courses the caller is enrolled in — the study-task link picker. */
  enrolled: CourseOption[];
  /** Courses the caller may author assignments in. Empty for a plain student. */
  authorable: CourseOption[];
}

/** The caller's own submission, denormalized for the student view. */
export interface StudentSubmissionView {
  id: Id<"assignmentSubmissions">;
  status: SubmissionStatus;
  content: string;
  submittedAt?: number;
  score?: number;
  feedback?: string;
  gradedAt?: number;
  /** Handed in after the deadline. */
  isLate: boolean;
  /** null when the assignment carries no maximum, or nothing has been marked. */
  scorePercent: number | null;
}

export interface StudentAssignmentView {
  id: Id<"assignments">;
  courseId: Id<"courses">;
  courseTitle: string;
  courseSlug: string;
  title: string;
  instructions?: string;
  dueAt?: number;
  maxPoints?: number;
  status: AssignmentStatus;
  /** Derived server-side so the client never re-implements the due-date rule. */
  isOverdue: boolean;
  isDueSoon: boolean;
  dueLabel: string;
  /** True when the caller authored it, so a draft is visible to them alone. */
  isAuthor: boolean;
  submission: StudentSubmissionView | null;
}

export interface StudentAssignmentGroup {
  courseId: Id<"courses">;
  courseTitle: string;
  courseSlug: string;
  assignments: StudentAssignmentView[];
}

export interface StudentAssignmentList {
  groups: StudentAssignmentGroup[];
  /** Across every group, after the filter. */
  total: number;
  filter: StudentAssignmentFilter;
}

export interface InstructorAssignmentView {
  id: Id<"assignments">;
  courseId: Id<"courses">;
  title: string;
  instructions?: string;
  dueAt?: number;
  maxPoints?: number;
  status: AssignmentStatus;
  createdAt: number;
  updatedAt: number;
  counts: GradingCounts;
  isAuthor: boolean;
}

export interface InstructorAssignmentGroup {
  courseId: Id<"courses">;
  courseTitle: string;
  courseSlug: string;
  coursePublished: boolean;
  assignments: InstructorAssignmentView[];
}

export interface InstructorAssignmentList {
  groups: InstructorAssignmentGroup[];
  total: number;
  counts: GradingCounts;
}

export interface SubmissionView {
  id: Id<"assignmentSubmissions">;
  userId: Id<"users">;
  studentName: string;
  studentImage?: string;
  content: string;
  status: SubmissionStatus;
  submittedAt?: number;
  isLate: boolean;
  score?: number;
  scorePercent: number | null;
  feedback?: string;
  gradedAt?: number;
  gradedByName?: string;
}

export interface GradingQueue {
  assignment: {
    id: Id<"assignments">;
    courseId: Id<"courses">;
    courseTitle: string;
    courseSlug: string;
    title: string;
    instructions?: string;
    dueAt?: number;
    maxPoints?: number;
    status: AssignmentStatus;
  };
  submissions: SubmissionView[];
  counts: GradingCounts;
}

export interface GradingSummary {
  assignments: number;
  drafts: number;
  open: number;
  closed: number;
  /** Handed in at some point, graded or not. */
  submitted: number;
  /** Waiting on a grader — the number the queue headline shows. */
  awaitingGrade: number;
  graded: number;
  /** Mean of every graded submission's percentage, or null when none are marked. */
  averagePercent: number | null;
}

export interface StudyTaskView {
  id: Id<"studyTasks">;
  title: string;
  notes?: string;
  courseId?: Id<"courses">;
  courseTitle?: string;
  courseSlug?: string;
  dueAt?: number;
  priority: StudyTaskPriority;
  completed: boolean;
  completedAt?: number;
  overdue: boolean;
  dueSoon: boolean;
  dueLabel: string;
  createdAt: number;
}

/** The study-task stat strip. Re-exported from the pure helper so both ends agree. */
export type StudyTaskStatsView = ReturnType<typeof studyTaskStats>;

export interface StudyTaskList {
  tasks: StudyTaskView[];
  filter: { status: StudyTaskStatusFilter; priority: StudyTaskPriorityFilter };
  stats: StudyTaskStatsView;
}

// ── Shared access helpers ──────────────────────────────────────────────────

/**
 * The three-branch course admission check, in the shape used by
 * `discussions.ts:verifyAccess`. Deliberately not exported: this module's
 * callers have an assignment id or a course id in hand and want a decision plus
 * an error, not a boolean they then have to explain.
 */
async function assertCourseAccess(
  ctx: ReadCtx,
  user: UserDoc,
  courseId: Id<"courses">,
): Promise<void> {
  if (user.role === "admin") return;

  const course = await ctx.db.get(courseId);
  if (course && course.instructorId === user._id) return;

  const enrollment = await ctx.db
    .query("enrollments")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", user._id).eq("courseId", courseId),
    )
    .unique();

  if (!enrollment) {
    throw new Error("You must be enrolled in this course to work with its assignments");
  }
}

/**
 * Who may author, edit, retitle, publish or grade an assignment.
 *
 * Broader than course admission: the author keeps control of the thing they
 * wrote even if the course is handed to another instructor, and the course's
 * instructor can fix an assignment they inherited. Everyone else — including an
 * enrolled student — is refused. This is the only place that rule is decided,
 * so no mutation can drift from the queries.
 */
async function assertCanManageAssignment(
  ctx: ReadCtx,
  user: UserDoc,
  assignment: { _id: Id<"assignments">; courseId: Id<"courses">; createdBy: Id<"users"> },
): Promise<void> {
  if (assignment.createdBy === user._id) return;
  const course = await ctx.db.get(assignment.courseId);
  if (await canManageCourse(ctx, user, course)) return;
  throw new Error("Only the assignment's author, the course instructor or an admin can do that");
}

async function loadAssignment(ctx: ReadCtx, assignmentId: Id<"assignments">) {
  const assignment = await ctx.db.get(assignmentId);
  if (!assignment) throw new Error("Assignment not found");
  return assignment;
}

/** Statuses of every submission row for an assignment, in one indexed read. */
async function loadSubmissionStatuses(
  ctx: ReadCtx,
  assignmentId: Id<"assignments">,
): Promise<SubmissionStatus[]> {
  const submissions = await ctx.db
    .query("assignmentSubmissions")
    .withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId))
    .collect();
  return submissions.map((s) => s.status);
}

/**
 * Private by construction: the only place a study-task read is scoped to its
 * owner. An admin gets their own tasks here and nobody else's — see the module
 * comment.
 */
async function loadOwnStudyTask(ctx: ReadCtx, userId: Id<"users">, id: Id<"studyTasks">) {
  const task = await ctx.db.get(id);
  if (!task || task.userId !== userId) {
    // Same message whether the row is missing or someone else's, so the error
    // cannot be used to confirm that an id exists.
    throw new Error("Task not found");
  }
  return task;
}

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Course pickers for the two authoring/link forms: enrolled (study-task link)
 * and authorable (assignment authoring). One query so the page does not have to
 * know which of the two the caller's role permits.
 */
export const listCourseOptions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const enrolledDocs = await Promise.all(
      enrollments
        .slice(0, MAX_PAGE)
        .map((enrollment) => ctx.db.get(enrollment.courseId)),
    );

    const enrolled: CourseOption[] = enrolledDocs
      .filter((course): course is NonNullable<typeof course> => course !== null)
      .map((course) => ({ id: course._id, title: course.title, slug: course.slug }));

    let authorable: CourseOption[] = [];
    if (user.role === "admin") {
      // An admin can act across every course, so offer all of them (bounded).
      const courses = await ctx.db.query("courses").take(MAX_PAGE);
      authorable = courses.map((course) => ({
        id: course._id,
        title: course.title,
        slug: course.slug,
      }));
    } else if (user.role === "instructor") {
      const courses = await ctx.db
        .query("courses")
        .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
        .take(MAX_PAGE);
      authorable = courses.map((course) => ({
        id: course._id,
        title: course.title,
        slug: course.slug,
      }));
    }

    return { enrolled, authorable };
  },
});

/**
 * Everything the caller owes work on, grouped by course.
 *
 * A `draft` is included only for its own author, which is why the status filter
 * cannot be pushed into the index read: the same index range holds visible and
 * hidden rows and only the author can tell them apart. Everything else is
 * `open` or `closed` — students never see drafts, not even as a disabled row.
 */
export const listAssignmentsForStudent = query({
  args: {
    courseId: v.optional(v.id("courses")),
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("pending"),
        v.literal("overdue"),
        v.literal("submitted"),
        v.literal("graded"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const filter: StudentAssignmentFilter = args.filter ?? "all";
    const limit = clampLimit(args.limit);

    // Courses whose assignments this caller may see: the ones they are enrolled
    // in, plus the ones they teach. Admins see every course, which the
    // per-course admission check below would allow anyway.
    const courseIds = await visibleCourseIds(ctx, user, args.courseId);

    // `limit` bounds the whole response, not each course, so a learner on many
    // courses gets one predictable page. Remaining budget is decremented as
    // groups are filled, which is why it lives outside the loop.
    const groups: StudentAssignmentGroup[] = [];
    let remaining = limit;

    for (const courseId of courseIds) {
      const course = await ctx.db.get(courseId);
      if (!course) continue;

      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_course", (q) => q.eq("courseId", courseId))
        .collect();

      const views: StudentAssignmentView[] = [];

      for (const assignment of assignments) {
        const isAuthor = assignment.createdBy === user._id;
        if (assignment.status === "draft" && !isAuthor) continue;

        const submissionRow = (
          await ctx.db
            .query("assignmentSubmissions")
            .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
            .collect()
        ).find((row) => row.userId === user._id) ?? null;

        const due = deriveDueState({
          dueAt: assignment.dueAt,
          now,
          completed: submissionRow?.status === "graded",
        });

        const submission: StudentSubmissionView | null = submissionRow
          ? {
              id: submissionRow._id,
              status: submissionRow.status,
              content: submissionRow.content,
              submittedAt: submissionRow.submittedAt,
              score: submissionRow.score,
              feedback: submissionRow.feedback,
              gradedAt: submissionRow.gradedAt,
              isLate: isLateSubmission(submissionRow.submittedAt, assignment.dueAt),
              scorePercent: scorePercent(submissionRow.score, assignment.maxPoints),
            }
          : null;

        const view: StudentAssignmentView = {
          id: assignment._id,
          courseId: assignment.courseId,
          courseTitle: course.title,
          courseSlug: course.slug,
          title: assignment.title,
          instructions: assignment.instructions,
          dueAt: assignment.dueAt,
          maxPoints: assignment.maxPoints,
          status: assignment.status,
          isOverdue: due.overdue,
          isDueSoon: due.dueSoon,
          dueLabel: dueLabel(assignment.dueAt, now, submission?.status === "graded"),
          isAuthor,
          submission,
        };

        if (!matchesStudentAssignmentFilter(view, filter)) continue;
        views.push(view);
      }

      if (views.length === 0) continue;

      // Soonest deadline first, so the cap drops the furthest-away work rather
      // than an arbitrary slice of the course's history.
      views.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));

      const kept = views.slice(0, remaining);
      remaining -= kept.length;
      if (kept.length === 0) break;

      groups.push({
        courseId: course._id,
        courseTitle: course.title,
        courseSlug: course.slug,
        assignments: kept,
      });

      if (remaining <= 0) break;
    }

    groups.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));

    return {
      groups,
      total: groups.reduce((sum, group) => sum + group.assignments.length, 0),
      filter,
    } satisfies StudentAssignmentList;
  },
});

/**
 * The instructor's authoring surface: their own assignments, grouped by course,
 * with the submission counts each card shows.
 *
 * An admin additionally sees *every* assignment, because the product decision is
 * that an admin can act across all courses — without that they could grade
 * nobody else's work and could not even find the row to grade.
 */
export const listAssignmentsForInstructor = query({
  args: {
    courseId: v.optional(v.id("courses")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const limit = clampLimit(args.limit);

    const authored = await ctx.db
      .query("assignments")
      .filter((q) => q.eq(q.field("createdBy"), user._id))
      .take(limit);

    let candidates = authored;
    if (user.role === "admin") {
      const all = await ctx.db.query("assignments").take(limit);
      candidates = all;
    }

    const byCourse = new Map<Id<"courses">, InstructorAssignmentView[]>();
    let total = 0;

    for (const assignment of candidates) {
      if (args.courseId && assignment.courseId !== args.courseId) continue;

      const counts = countSubmissionStatuses(await loadSubmissionStatuses(ctx, assignment._id));
      const view: InstructorAssignmentView = {
        id: assignment._id,
        courseId: assignment.courseId,
        title: assignment.title,
        instructions: assignment.instructions,
        dueAt: assignment.dueAt,
        maxPoints: assignment.maxPoints,
        status: assignment.status,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
        counts,
        isAuthor: assignment.createdBy === user._id,
      };

      const bucket = byCourse.get(assignment.courseId);
      if (bucket) bucket.push(view);
      else byCourse.set(assignment.courseId, [view]);
      total += 1;
    }

    const groups: InstructorAssignmentGroup[] = [];
    for (const [courseId, assignments] of byCourse) {
      const course = await ctx.db.get(courseId);
      groups.push({
        courseId,
        courseTitle: course?.title ?? "Unknown course",
        courseSlug: course?.slug ?? "",
        coursePublished: course?.published ?? false,
        assignments: assignments.sort((a, b) => b.createdAt - a.createdAt),
      });
    }
    groups.sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));

    return {
      groups,
      total,
      counts: aggregateGradingCounts(
        groups.flatMap((group) => group.assignments.map((a) => a.counts)),
      ),
    } satisfies InstructorAssignmentList;
  },
});

/**
 * One assignment's submissions, for grading. Instructor-of-the-course, the
 * author, or an admin — see {@link assertCanManageAssignment}.
 *
 * Drafts are excluded: the grader's queue is work that was actually handed in,
 * and a draft is private working that the learner has not submitted.
 */
export const getSubmissions = query({
  args: {
    assignmentId: v.id("assignments"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await loadAssignment(ctx, args.assignmentId);
    await assertCanManageAssignment(ctx, user, assignment);

    const course = await ctx.db.get(assignment.courseId);
    const rows = await ctx.db
      .query("assignmentSubmissions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
      .order("desc")
      .take(clampLimit(args.limit));

    const submissions: SubmissionView[] = [];
    for (const row of rows) {
      if (row.status === "draft") continue;

      const student = await ctx.db.get(row.userId);
      let gradedByName: string | undefined;
      if (row.gradedBy) {
        const grader = await ctx.db.get(row.gradedBy);
        gradedByName = grader?.name ?? undefined;
      }

      submissions.push({
        id: row._id,
        userId: row.userId,
        studentName: student?.name ?? student?.email ?? "Learner",
        studentImage: student?.imageUrl ?? undefined,
        content: row.content,
        status: row.status,
        submittedAt: row.submittedAt,
        isLate: isLateSubmission(row.submittedAt, assignment.dueAt),
        score: row.score,
        scorePercent: scorePercent(row.score, assignment.maxPoints),
        feedback: row.feedback,
        gradedAt: row.gradedAt,
        gradedByName,
      });
    }

    const allStatuses = await loadSubmissionStatuses(ctx, assignment._id);

    return {
      assignment: {
        id: assignment._id,
        courseId: assignment.courseId,
        courseTitle: course?.title ?? "Unknown course",
        courseSlug: course?.slug ?? "",
        title: assignment.title,
        instructions: assignment.instructions,
        dueAt: assignment.dueAt,
        maxPoints: assignment.maxPoints,
        status: assignment.status,
      },
      submissions,
      counts: countSubmissionStatuses(allStatuses),
    } satisfies GradingQueue;
  },
});

/** Headline counts for the grading tab's stat strip. */
export const getGradingSummary = query({
  args: { courseId: v.optional(v.id("courses")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const authored = await ctx.db
      .query("assignments")
      .filter((q) => q.eq(q.field("createdBy"), user._id))
      .collect();
    const scoped = user.role === "admin" ? await ctx.db.query("assignments").collect() : authored;

    const summary: GradingSummary = {
      assignments: 0,
      drafts: 0,
      open: 0,
      closed: 0,
      submitted: 0,
      awaitingGrade: 0,
      graded: 0,
      averagePercent: null,
    };

    const percents: number[] = [];

    for (const assignment of scoped) {
      if (args.courseId && assignment.courseId !== args.courseId) continue;
      summary.assignments += 1;
      if (assignment.status === "draft") summary.drafts += 1;
      else if (assignment.status === "open") summary.open += 1;
      else summary.closed += 1;

      const rows = await ctx.db
        .query("assignmentSubmissions")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
        .collect();
      const counts = countSubmissionStatuses(rows.map((r) => r.status));
      summary.submitted += counts.submitted;
      summary.awaitingGrade += counts.ungraded;
      summary.graded += counts.graded;

      for (const row of rows) {
        const percent = scorePercent(row.score, assignment.maxPoints);
        if (percent !== null) percents.push(percent);
      }
    }

    if (percents.length > 0) {
      const total = percents.reduce((sum, value) => sum + value, 0);
      summary.averagePercent = Math.round(total / percents.length);
    }

    return summary;
  },
});

/**
 * The caller's personal study tasks. Private to the owner — there is no
 * `userId` argument to widen the read with, on purpose.
 */
export const listStudyTasks = query({
  args: {
    status: v.optional(
      v.union(v.literal("all"), v.literal("outstanding"), v.literal("completed")),
    ),
    priority: v.optional(v.union(v.literal("all"), v.literal("low"), v.literal("medium"), v.literal("high"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const filter = {
      status: (args.status ?? "all") as StudyTaskStatusFilter,
      priority: (args.priority ?? "all") as StudyTaskPriorityFilter,
    };

    const rows = await ctx.db
      .query("studyTasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(clampLimit(args.limit));

    const tasks: StudyTaskView[] = [];

    for (const row of rows) {
      const completed = typeof row.completedAt === "number";
      if (!matchesStudyTaskFilter({ completed, priority: row.priority }, filter)) continue;

      let courseTitle: string | undefined;
      let courseSlug: string | undefined;
      if (row.courseId) {
        const course = await ctx.db.get(row.courseId);
        courseTitle = course?.title;
        courseSlug = course?.slug;
      }

      const due = deriveDueState({ dueAt: row.dueAt, now, completed });

      tasks.push({
        id: row._id,
        title: row.title,
        notes: row.notes,
        courseId: row.courseId,
        courseTitle,
        courseSlug,
        dueAt: row.dueAt,
        priority: row.priority,
        completed,
        completedAt: row.completedAt,
        overdue: due.overdue,
        dueSoon: due.dueSoon,
        dueLabel: dueLabel(row.dueAt, now, completed),
        createdAt: row.createdAt,
      });
    }

    // Stats are always computed over *all* the caller's tasks, never the
    // filtered slice — a filter that zeroed the counts would be useless.
    const stats = studyTaskStats(rows, now);

    // Outstanding first (soonest deadline at the top), then finished.
    tasks.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueAt !== b.dueAt) return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
      return a.createdAt - b.createdAt;
    });

    return { tasks, filter, stats } satisfies StudyTaskList;
  },
});

/** Stat-strip counts for the study-task tab. Always over every task. */
export const getStudyTaskStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("studyTasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return studyTaskStats(rows, Date.now()) satisfies StudyTaskStatsView;
  },
});

// ── Assignment authoring ───────────────────────────────────────────────────

export const createAssignment = mutation({
  args: {
    courseId: v.id("courses"),
    lessonId: v.optional(v.id("lessons")),
    title: v.string(),
    instructions: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    maxPoints: v.optional(v.number()),
    /** Omit for a draft. "closed" is not creatable — nothing has been given out yet. */
    status: v.optional(v.union(v.literal("draft"), v.literal("open"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");
    if (!(await canManageCourse(ctx, user, course))) {
      throw new Error("Only the course instructor or an admin can add assignments");
    }

    await requireRateLimit(
      ctx,
      `createAssignment:${user._id}`,
      RATE_LIMITS.createAssignment.max,
      RATE_LIMITS.createAssignment.windowMs,
    );

    const now = Date.now();
    const title = normalizeTitle(args.title, "Assignment title");
    const instructions = normalizeOptionalText(
      args.instructions,
      "Instructions",
      10_000,
    );
    const status: AssignmentStatus = args.status ?? "draft";

    // Same guard as the draft → open transition: nothing reaches a learner
    // without instructions.
    if (status === "open") assertOpenable(instructions);
    assertDueDateInFuture(args.dueAt, now);
    if (args.maxPoints !== undefined) assertMaxPoints(args.maxPoints);

    const id = await ctx.db.insert("assignments", {
      courseId: args.courseId,
      lessonId: args.lessonId,
      title,
      instructions,
      createdBy: user._id,
      dueAt: args.dueAt,
      maxPoints: args.maxPoints,
      status,
      createdAt: now,
      updatedAt: now,
    });

    if (status === "open") {
      const course = await ctx.db.get(args.courseId);
      const enrollments = await ctx.db
        .query("enrollments")
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
        .take(100);
      for (const enrollment of enrollments) {
        if (enrollment.userId !== user._id) {
          await createNotification(ctx, {
            userId: enrollment.userId,
            type: "task_assigned",
            title: `New assignment: ${title}`,
            body: course?.title,
            href: "/dashboard/tasks",
            actorId: user._id,
          });
        }
      }
    }

    return id;
  },
});

/**
 * Edit an assignment's content.
 *
 * There is deliberately **no** `status` argument: publishing is an operation
 * (`setAssignmentStatus`), the same split `courses.updateCourse` / `publishCourse`
 * makes for course visibility. A one-argument edit that could also publish
 * would hand every future caller a way to make a draft visible without the
 * instructions guard running.
 */
export const updateAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
    lessonId: v.optional(v.union(v.id("lessons"), v.null())),
    title: v.optional(v.string()),
    instructions: v.optional(v.string()),
    /** null clears the deadline. */
    dueAt: v.optional(v.union(v.number(), v.null())),
    maxPoints: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await loadAssignment(ctx, args.assignmentId);
    await assertCanManageAssignment(ctx, user, assignment);

    await requireRateLimit(
      ctx,
      `updateAssignment:${user._id}`,
      RATE_LIMITS.updateAssignment.max,
      RATE_LIMITS.updateAssignment.windowMs,
    );

    const patch: Partial<typeof assignment> = { updatedAt: Date.now() };

    if (args.title !== undefined) patch.title = normalizeTitle(args.title, "Assignment title");

    if (args.instructions !== undefined) {
      patch.instructions = normalizeOptionalText(args.instructions, "Instructions", 10_000);
      // Removing the instructions off an already-open assignment would leave
      // learners holding a task they cannot act on.
      if (assignment.status === "open") assertOpenable(patch.instructions);
    }

    if (args.lessonId !== undefined) patch.lessonId = args.lessonId ?? undefined;

    if (args.dueAt !== undefined) {
      const dueAt = args.dueAt ?? undefined;
      if (dueAt !== undefined) assertDueDateInFuture(dueAt, Date.now());
      patch.dueAt = dueAt;
    }

    if (args.maxPoints !== undefined) {
      const maxPoints = args.maxPoints ?? undefined;
      if (maxPoints !== undefined) assertMaxPoints(maxPoints);
      patch.maxPoints = maxPoints;
    }

    await ctx.db.patch(assignment._id, patch);
    return assignment._id;
  },
});

export const deleteAssignment = mutation({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await loadAssignment(ctx, args.assignmentId);
    await assertCanManageAssignment(ctx, user, assignment);

    await requireRateLimit(
      ctx,
      `deleteAssignment:${user._id}`,
      RATE_LIMITS.deleteAssignment.max,
      RATE_LIMITS.deleteAssignment.windowMs,
    );

    // Submissions go with it: an orphaned row would keep a learner's grade
    // visible in a queue for an assignment that no longer exists.
    const submissions = await ctx.db
      .query("assignmentSubmissions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
      .collect();
    for (const submission of submissions) {
      await ctx.db.delete(submission._id);
    }

    await ctx.db.delete(assignment._id);
    return { deletedSubmissions: submissions.length };
  },
});

/**
 * draft → open → closed, and back again for an unpublish or a reopen. The only
 * path that makes an assignment visible, and the only one that stops accepting
 * work.
 */
export const setAssignmentStatus = mutation({
  args: {
    assignmentId: v.id("assignments"),
    status: assignmentStatus,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await loadAssignment(ctx, args.assignmentId);
    await assertCanManageAssignment(ctx, user, assignment);

    await requireRateLimit(
      ctx,
      `setAssignmentStatus:${user._id}`,
      RATE_LIMITS.setAssignmentStatus.max,
      RATE_LIMITS.setAssignmentStatus.windowMs,
    );

    assertAssignmentStatusTransition(assignment.status, args.status);
    // The publish guard: a blank assignment must never appear in a learner's
    // task list by accident.
    if (args.status === "open") assertOpenable(assignment.instructions);

    await ctx.db.patch(assignment._id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    if (args.status === "open" && assignment.status !== "open") {
      const course = await ctx.db.get(assignment.courseId);
      const enrollments = await ctx.db
        .query("enrollments")
        .withIndex("by_course", (q) => q.eq("courseId", assignment.courseId))
        .take(100);
      for (const enrollment of enrollments) {
        if (enrollment.userId !== user._id) {
          await createNotification(ctx, {
            userId: enrollment.userId,
            type: "task_assigned",
            title: `New assignment: ${assignment.title}`,
            body: course?.title,
            href: "/dashboard/tasks",
            actorId: user._id,
          });
        }
      }
    }

    return assignment._id;
  },
});

// ── Submissions ────────────────────────────────────────────────────────────

/** Save a draft answer. Upsert — one submission row per learner per assignment. */
export const saveSubmission = mutation({
  args: {
    assignmentId: v.id("assignments"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await loadAssignment(ctx, args.assignmentId);
    await assertCourseAccess(ctx, user, assignment.courseId);

    await requireRateLimit(
      ctx,
      `saveSubmission:${user._id}`,
      RATE_LIMITS.saveSubmission.max,
      RATE_LIMITS.saveSubmission.windowMs,
    );

    assertAssignmentAcceptsWork(assignment.status);
    const content = normalizeSubmissionContent(args.content);

    const existing = await findOwnSubmission(ctx, assignment._id, user._id);
    assertNotAlreadyHandedIn(existing?.status);

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { content, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("assignmentSubmissions", {
      assignmentId: assignment._id,
      userId: user._id,
      content,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Hand the draft in. Stamps `submittedAt`, which is what "late" is measured against. */
export const submitAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
    /** Optional inline edit applied before submitting. */
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const assignment = await loadAssignment(ctx, args.assignmentId);
    await assertCourseAccess(ctx, user, assignment.courseId);

    await requireRateLimit(
      ctx,
      `submitAssignment:${user._id}`,
      RATE_LIMITS.submitAssignment.max,
      RATE_LIMITS.submitAssignment.windowMs,
    );

    assertAssignmentAcceptsWork(assignment.status);

    const existing = await findOwnSubmission(ctx, assignment._id, user._id);
    assertNotAlreadyHandedIn(existing?.status);

    const content =
      args.content !== undefined
        ? normalizeSubmissionContent(args.content)
        : existing?.content?.trim()
          ? existing.content
          : normalizeSubmissionContent("");

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        content,
        status: "submitted",
        submittedAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("assignmentSubmissions", {
      assignmentId: assignment._id,
      userId: user._id,
      content,
      status: "submitted",
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Mark a handed-in submission. Re-grading is allowed (an instructor fixing a
 * mis-marked score) but a *draft* is refused: there is nothing submitted to
 * grade, and marking one would put a score on work the learner never handed in.
 */
export const gradeSubmission = mutation({
  args: {
    submissionId: v.id("assignmentSubmissions"),
    score: v.number(),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found");

    const assignment = await loadAssignment(ctx, submission.assignmentId);
    await assertCanManageAssignment(ctx, user, assignment);

    await requireRateLimit(
      ctx,
      `gradeSubmission:${user._id}`,
      RATE_LIMITS.gradeSubmission.max,
      RATE_LIMITS.gradeSubmission.windowMs,
    );

    if (submission.status === "draft") {
      throw new Error("This submission has not been handed in yet");
    }
    assertScoreWithinMaxPoints(args.score, assignment.maxPoints);

    const feedback = normalizeOptionalText(args.feedback, "Feedback", 5_000);
    const now = Date.now();

    await ctx.db.patch(submission._id, {
      score: args.score,
      feedback,
      status: "graded",
      gradedBy: user._id,
      gradedAt: now,
      updatedAt: now,
    });

    await createNotification(ctx, {
      userId: submission.userId,
      type: "task_graded",
      title: `Assignment graded: ${assignment.title}`,
      body: `Score: ${args.score}${assignment.maxPoints !== undefined ? `/${assignment.maxPoints}` : ""}`,
      href: "/dashboard/tasks",
      actorId: user._id,
    });

    return submission._id;
  },
});

// ── Study tasks ────────────────────────────────────────────────────────────

export const createStudyTask = mutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    courseId: v.optional(v.id("courses")),
    dueAt: v.optional(v.number()),
    priority: v.optional(studyTaskPriority),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    await requireRateLimit(
      ctx,
      `createStudyTask:${user._id}`,
      RATE_LIMITS.createStudyTask.max,
      RATE_LIMITS.createStudyTask.windowMs,
    );

    const now = Date.now();
    assertDueDateInFuture(args.dueAt, now);

    return await ctx.db.insert("studyTasks", {
      userId: user._id,
      title: normalizeTitle(args.title, "Task title"),
      notes: normalizeOptionalText(args.notes, "Notes", 2_000),
      courseId: args.courseId,
      dueAt: args.dueAt,
      priority: args.priority ?? "medium",
      createdAt: now,
    });
  },
});

export const updateStudyTask = mutation({
  args: {
    id: v.id("studyTasks"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** null detaches the course. */
    courseId: v.optional(v.union(v.id("courses"), v.null())),
    /** null clears the due date. */
    dueAt: v.optional(v.union(v.number(), v.null())),
    priority: v.optional(studyTaskPriority),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Ownership gate: another user's task is "not found", not "forbidden".
    const task = await loadOwnStudyTask(ctx, user._id, args.id);

    await requireRateLimit(
      ctx,
      `updateStudyTask:${user._id}`,
      RATE_LIMITS.updateStudyTask.max,
      RATE_LIMITS.updateStudyTask.windowMs,
    );

    const patch: Partial<typeof task> = {};

    if (args.title !== undefined) patch.title = normalizeTitle(args.title, "Task title");
    if (args.notes !== undefined) patch.notes = normalizeOptionalText(args.notes, "Notes", 2_000);
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.courseId !== undefined) patch.courseId = args.courseId ?? undefined;
    if (args.dueAt !== undefined) {
      const dueAt = args.dueAt ?? undefined;
      if (dueAt !== undefined) assertDueDateInFuture(dueAt, Date.now());
      patch.dueAt = dueAt;
    }

    await ctx.db.patch(task._id, patch);
    return task._id;
  },
});

/**
 * Optimistic-toggle endpoint: the UI flips the checkbox immediately and rolls
 * it back if this throws, which is why it takes the target state explicitly
 * rather than flipping whatever it finds.
 */
export const toggleStudyTaskComplete = mutation({
  args: {
    id: v.id("studyTasks"),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const task = await loadOwnStudyTask(ctx, user._id, args.id);

    await requireRateLimit(
      ctx,
      `toggleStudyTaskComplete:${user._id}`,
      RATE_LIMITS.toggleStudyTaskComplete.max,
      RATE_LIMITS.toggleStudyTaskComplete.windowMs,
    );

    const now = Date.now();
    await ctx.db.patch(task._id, {
      completedAt: args.completed ? now : undefined,
    });

    return { id: task._id, completed: args.completed, completedAt: args.completed ? now : null };
  },
});

export const deleteStudyTask = mutation({
  args: { id: v.id("studyTasks") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const task = await loadOwnStudyTask(ctx, user._id, args.id);

    await requireRateLimit(
      ctx,
      `deleteStudyTask:${user._id}`,
      RATE_LIMITS.deleteStudyTask.max,
      RATE_LIMITS.deleteStudyTask.windowMs,
    );

    await ctx.db.delete(task._id);
    return task._id;
  },
});

// ── Small local helpers ────────────────────────────────────────────────────

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return MAX_PAGE;
  if (!Number.isFinite(limit) || limit <= 0) return 1;
  return Math.min(Math.floor(limit), MAX_PAGE);
}

function assertMaxPoints(maxPoints: number): void {
  if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
    throw new Error("Maximum points must be greater than zero");
  }
  if (maxPoints > 1_000_000) {
    throw new Error("Maximum points must be 1,000,000 or fewer");
  }
}

/**
 * The courses whose assignments the caller may see in the student view: the
 * ones they are enrolled in, plus the ones they teach (an instructor is not
 * enrolled in their own course, but still needs to see what they published).
 * An admin sees everything.
 */
async function visibleCourseIds(
  ctx: ReadCtx,
  user: UserDoc,
  courseIdFilter: Id<"courses"> | undefined,
): Promise<Id<"courses">[]> {
  if (user.role === "admin") {
    const all = await ctx.db.query("courses").take(MAX_PAGE);
    return all.map((course) => course._id).filter((id) => !courseIdFilter || id === courseIdFilter);
  }

  const ids = new Set<Id<"courses">>();

  // A caller cannot smuggle in a course they have no relationship with: the
  // `courseId` filter only narrows what the caller already had. (Admins
  // returned above.)
  if (courseIdFilter && !(await hasCourseRelationship(ctx, user, courseIdFilter))) {
    throw new Error("You must be enrolled in this course to see its assignments");
  }

  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(MAX_PAGE);
  for (const enrollment of enrollments) ids.add(enrollment.courseId);

  const taught = await ctx.db
    .query("courses")
    .withIndex("by_instructor", (q) => q.eq("instructorId", user._id))
    .take(MAX_PAGE);
  for (const course of taught) ids.add(course._id);

  return [...ids].filter((id) => !courseIdFilter || id === courseIdFilter);
}

/** Enrolled in it, or teaches it. Admins are handled by the caller. */
async function hasCourseRelationship(
  ctx: ReadCtx,
  user: UserDoc,
  courseId: Id<"courses">,
): Promise<boolean> {
  const enrollment = await ctx.db
    .query("enrollments")
    .withIndex("by_user_course", (q) => q.eq("userId", user._id).eq("courseId", courseId))
    .unique();
  if (enrollment) return true;
  const course = await ctx.db.get(courseId);
  return course?.instructorId === user._id;
}

/** The caller's own row for an assignment, if they have one. */
async function findOwnSubmission(
  ctx: ReadCtx,
  assignmentId: Id<"assignments">,
  userId: Id<"users">,
) {
  const rows = await ctx.db
    .query("assignmentSubmissions")
    .withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId))
    .collect();
  return rows.find((row) => row.userId === userId) ?? null;
}

/**
 * Both submission paths refuse a `draft` (nothing to submit) and a `closed`
 * assignment (the deadline the instructor set). Note this also refuses work on a
 * draft assignment — a learner cannot submit to something they cannot see, and
 * admitting it would let anyone who guessed the id hand in work.
 */
function assertAssignmentAcceptsWork(status: AssignmentStatus): void {
  if (status === "closed") {
    throw new Error("This assignment is closed and no longer accepts submissions");
  }
  if (status === "draft") {
    throw new Error("This assignment is not open for submissions yet");
  }
}

function assertNotAlreadyHandedIn(status: SubmissionStatus | undefined): void {
  if (status === "submitted" || status === "graded") {
    throw new Error("You have already handed in this assignment");
  }
}