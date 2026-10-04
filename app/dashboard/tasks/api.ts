"use client";

import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  CourseOptionList,
  GradingQueue,
  GradingSummary,
  InstructorAssignmentList,
  StudyTaskList,
  StudyTaskStatsView,
  StudentAssignmentList,
} from "@/convex/tasks";
import type {
  AssignmentStatus,
  StudyTaskPriority,
  StudyTaskPriorityFilter,
  StudyTaskStatusFilter,
  StudentAssignmentFilter,
} from "@/lib/tasks";

/**
 * Typed handles on `convex/tasks.ts`.
 *
 * These are built with `makeFunctionReference` rather than `api.tasks.*`
 * because `convex/_generated/api.d.ts` is produced by `npx convex dev` and does
 * not list the module yet — the generated types would not compile until codegen
 * runs again. The wire names ("modulePath:exportName") are exactly the ones
 * codegen will emit, so **run `npx convex dev` and replace these with
 * `api.tasks.*`**. This is the same workaround `lib/durable-rate-limit.ts`
 * already uses for `rateLimit:consume`.
 *
 * Keeping them in one file means the regeneration is a single mechanical edit
 * rather than a sweep across four components.
 */

type CourseArgs = { courseId?: Id<"courses"> };

export const listCourseOptions = makeFunctionReference<
  "query",
  Record<string, never>,
  CourseOptionList
>("tasks:listCourseOptions");

export const listAssignmentsForStudent = makeFunctionReference<
  "query",
  CourseArgs & { filter?: StudentAssignmentFilter; limit?: number },
  StudentAssignmentList
>("tasks:listAssignmentsForStudent");

export const listAssignmentsForInstructor = makeFunctionReference<
  "query",
  CourseArgs & { limit?: number },
  InstructorAssignmentList
>("tasks:listAssignmentsForInstructor");

export const getSubmissions = makeFunctionReference<
  "query",
  { assignmentId: Id<"assignments">; limit?: number },
  GradingQueue
>("tasks:getSubmissions");

export const getGradingSummary = makeFunctionReference<
  "query",
  CourseArgs,
  GradingSummary
>("tasks:getGradingSummary");

export const listStudyTasks = makeFunctionReference<
  "query",
  {
    status?: StudyTaskStatusFilter;
    priority?: StudyTaskPriorityFilter;
    limit?: number;
  },
  StudyTaskList
>("tasks:listStudyTasks");

export const getStudyTaskStats = makeFunctionReference<
  "query",
  Record<string, never>,
  StudyTaskStatsView
>("tasks:getStudyTaskStats");

export const createAssignment = makeFunctionReference<
  "mutation",
  {
    courseId: Id<"courses">;
    lessonId?: Id<"lessons">;
    title: string;
    instructions?: string;
    dueAt?: number;
    maxPoints?: number;
    status?: Extract<AssignmentStatus, "draft" | "open">;
  },
  Id<"assignments">
>("tasks:createAssignment");

export const updateAssignment = makeFunctionReference<
  "mutation",
  {
    assignmentId: Id<"assignments">;
    lessonId?: Id<"lessons"> | null;
    title?: string;
    instructions?: string;
    dueAt?: number | null;
    maxPoints?: number | null;
  },
  Id<"assignments">
>("tasks:updateAssignment");

export const deleteAssignment = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments"> },
  { deletedSubmissions: number }
>("tasks:deleteAssignment");

export const setAssignmentStatus = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments">; status: AssignmentStatus },
  Id<"assignments">
>("tasks:setAssignmentStatus");

export const saveSubmission = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments">; content: string },
  Id<"assignmentSubmissions">
>("tasks:saveSubmission");

export const submitAssignment = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments">; content?: string },
  Id<"assignmentSubmissions">
>("tasks:submitAssignment");

export const gradeSubmission = makeFunctionReference<
  "mutation",
  { submissionId: Id<"assignmentSubmissions">; score: number; feedback?: string },
  Id<"assignmentSubmissions">
>("tasks:gradeSubmission");

export const createStudyTask = makeFunctionReference<
  "mutation",
  {
    title: string;
    notes?: string;
    courseId?: Id<"courses">;
    dueAt?: number;
    priority?: StudyTaskPriority;
  },
  Id<"studyTasks">
>("tasks:createStudyTask");

export const updateStudyTask = makeFunctionReference<
  "mutation",
  {
    id: Id<"studyTasks">;
    title?: string;
    notes?: string;
    courseId?: Id<"courses"> | null;
    dueAt?: number | null;
    priority?: StudyTaskPriority;
  },
  Id<"studyTasks">
>("tasks:updateStudyTask");

export const toggleStudyTaskComplete = makeFunctionReference<
  "mutation",
  { id: Id<"studyTasks">; completed: boolean },
  { id: Id<"studyTasks">; completed: boolean; completedAt: number | null }
>("tasks:toggleStudyTaskComplete");

export const deleteStudyTask = makeFunctionReference<
  "mutation",
  { id: Id<"studyTasks"> },
  Id<"studyTasks">
>("tasks:deleteStudyTask");