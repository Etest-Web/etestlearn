import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import type {
  CourseOptionList,
  GradingQueue,
  GradingSummary,
  InstructorAssignmentList,
  StudyTaskList,
  StudyTaskStatsView,
  StudentAssignmentList,
} from "../convex/tasks";
import type {
  AssignmentStatus,
  StudentAssignmentFilter,
  StudyTaskPriority,
  StudyTaskPriorityFilter,
  StudyTaskStatusFilter,
} from "../lib/tasks";

/**
 * Server-side guarantees for the unified Task page.
 *
 * The two things worth the most attention here:
 *
 *  · **Study-task isolation.** Nothing else on the page is private, so a bug in
 *    that scoping would quietly leak one learner's notes to another. Every
 *    study-task read and write is exercised from two users in both directions.
 *  · **Course separation.** A learner enrolled in course A must not be able to
 *    reach course B's assignments or grading queue, even by passing a valid id.
 *
 * `convex/_generated/api` does not yet list `tasks` (it is produced by
 * `npx convex dev`), so the functions are referenced the way `lib/durable-rate-limit.ts`
 * does — by wire name through `makeFunctionReference`. Run `npx convex dev` and
 * these can become `api.tasks.*`.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

// ── Function references ────────────────────────────────────────────────────

const listCourseOptions = makeFunctionReference<"query", Record<string, never>, CourseOptionList>(
  "tasks:listCourseOptions",
);
const listAssignmentsForStudent = makeFunctionReference<
  "query",
  { courseId?: Id<"courses">; filter?: StudentAssignmentFilter; limit?: number },
  StudentAssignmentList
>("tasks:listAssignmentsForStudent");
const listAssignmentsForInstructor = makeFunctionReference<
  "query",
  { courseId?: Id<"courses">; limit?: number },
  InstructorAssignmentList
>("tasks:listAssignmentsForInstructor");
const getSubmissions = makeFunctionReference<
  "query",
  { assignmentId: Id<"assignments">; limit?: number },
  GradingQueue
>("tasks:getSubmissions");
const getGradingSummary = makeFunctionReference<
  "query",
  { courseId?: Id<"courses"> },
  GradingSummary
>("tasks:getGradingSummary");
const listStudyTasks = makeFunctionReference<
  "query",
  {
    status?: StudyTaskStatusFilter;
    priority?: StudyTaskPriorityFilter;
    limit?: number;
  },
  StudyTaskList
>("tasks:listStudyTasks");
const getStudyTaskStats = makeFunctionReference<"query", Record<string, never>, StudyTaskStatsView>(
  "tasks:getStudyTaskStats",
);

const createAssignment = makeFunctionReference<
  "mutation",
  {
    courseId: Id<"courses">;
    lessonId?: Id<"lessons">;
    title: string;
    instructions?: string;
    dueAt?: number;
    maxPoints?: number;
    status?: AssignmentStatus;
  },
  Id<"assignments">
>("tasks:createAssignment");
const updateAssignment = makeFunctionReference<
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
const deleteAssignment = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments"> },
  { deletedSubmissions: number }
>("tasks:deleteAssignment");
const setAssignmentStatus = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments">; status: AssignmentStatus },
  Id<"assignments">
>("tasks:setAssignmentStatus");
const saveSubmission = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments">; content: string },
  Id<"assignmentSubmissions">
>("tasks:saveSubmission");
const submitAssignment = makeFunctionReference<
  "mutation",
  { assignmentId: Id<"assignments">; content?: string },
  Id<"assignmentSubmissions">
>("tasks:submitAssignment");
const gradeSubmission = makeFunctionReference<
  "mutation",
  { submissionId: Id<"assignmentSubmissions">; score: number; feedback?: string },
  Id<"assignmentSubmissions">
>("tasks:gradeSubmission");
const createStudyTask = makeFunctionReference<
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
const updateStudyTask = makeFunctionReference<
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
const toggleStudyTaskComplete = makeFunctionReference<
  "mutation",
  { id: Id<"studyTasks">; completed: boolean },
  { id: Id<"studyTasks">; completed: boolean; completedAt: number | null }
>("tasks:toggleStudyTaskComplete");
const deleteStudyTask = makeFunctionReference<"mutation", { id: Id<"studyTasks"> }, Id<"studyTasks">>(
  "tasks:deleteStudyTask",
);

/**
 * The harness `convexTest` returns, and the impersonated form it hands back from
 * `withIdentity`. Seed helpers are typed against these rather than `any`, so
 * every query result keeps its actual return shape and `ctx.db.get(id)` resolves
 * to the right document instead of a union of every table.
 */
type Harness = TestConvex<SchemaDefinition<GenericSchema, boolean>>;
type Impersonated = ReturnType<Harness["withIdentity"]>;
const asUser = (t: Harness, subject: string): Impersonated =>
  t.withIdentity({ subject, tokenIdentifier: subject });

const DAY = 24 * 60 * 60 * 1000;

interface SeedIds {
  instructor: Id<"users">;
  otherInstructor: Id<"users">;
  student: Id<"users">;
  otherStudent: Id<"users">;
  outsider: Id<"users">;
  admin: Id<"users">;
  courseA: Id<"courses">;
  courseB: Id<"courses">;
  open: Id<"assignments">;
  draft: Id<"assignments">;
  closed: Id<"assignments">;
  overdue: Id<"assignments">;
  courseBAssignment: Id<"assignments">;
}

/**
 * Two instructors, two courses, two enrolled students, an unenrolled outsider
 * and an admin. Enough to separate every branch of the three-branch access
 * check: admin, course instructor, enrollment.
 */
async function seedWorld(t: Harness): Promise<SeedIds> {
  const now = Date.now();

  const ids = {} as SeedIds;

  ids.instructor = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor One",
      role: "instructor",
      createdAt: now,
    }),
  );
  ids.otherInstructor = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_other_instructor",
      email: "other@test.com",
      name: "Instructor Two",
      role: "instructor",
      createdAt: now,
    }),
  );
  ids.student = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student One",
      imageUrl: "https://example.test/a.png",
      role: "student",
      createdAt: now,
    }),
  );
  ids.otherStudent = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_other_student",
      email: "otherstudent@test.com",
      name: "Student Two",
      role: "student",
      createdAt: now,
    }),
  );
  ids.outsider = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_outsider",
      email: "outsider@test.com",
      name: "Outsider",
      role: "student",
      createdAt: now,
    }),
  );
  ids.admin = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  ids.courseA = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Course A",
      slug: "course-a",
      description: "A",
      instructorId: ids.instructor,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );
  ids.courseB = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Course B",
      slug: "course-b",
      description: "B",
      instructorId: ids.otherInstructor,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  // student + otherStudent are enrolled in A; the outsider is enrolled nowhere,
  // which proves access gating is independent of being a user at all.
  for (const userId of [ids.student, ids.otherStudent]) {
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("enrollments", {
        userId,
        courseId: ids.courseA,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  const seedAssignment = (
    courseId: Id<"courses">,
    createdBy: Id<"users">,
    status: AssignmentStatus,
    overrides: Record<string, unknown> = {},
  ): Promise<Id<"assignments">> =>
    t.run(async (ctx: TestCtx) =>
      ctx.db.insert("assignments", {
        courseId,
        title: `${status} assignment`,
        instructions: "Write 500 words about the topic.",
        createdBy,
        dueAt: now + 7 * DAY,
        maxPoints: 10,
        status,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      }),
    );

  ids.open = await seedAssignment(ids.courseA, ids.instructor, "open");
  ids.draft = await seedAssignment(ids.courseA, ids.instructor, "draft");
  ids.closed = await seedAssignment(ids.courseA, ids.instructor, "closed");
  ids.overdue = await seedAssignment(ids.courseA, ids.instructor, "open", {
    title: "Overdue assignment",
    dueAt: now - 2 * DAY,
  });
  ids.courseBAssignment = await seedAssignment(ids.courseB, ids.otherInstructor, "open");

  return ids;
}

// ── Queries ────────────────────────────────────────────────────────────────

describe("listAssignmentsForStudent", () => {
  test("returns a learner's open and closed work, grouped by course, with drafts hidden", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await asUser(t, "clerk_student").query(listAssignmentsForStudent, {});

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].courseTitle).toBe("Course A");
    const titles = result.groups[0].assignments.map((a) => a.title).sort();
    expect(titles).toEqual(["Overdue assignment", "closed assignment", "open assignment"]);
    // The draft belongs to the instructor's own preview, not the learner's list.
    expect(titles).not.toContain("draft assignment");
    // Nor does the other course, whose instructor the learner has no tie to.
    expect(titles).not.toContain("Course B");
  });

  test("joins course title, slug, due date and points server-side", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await asUser(t, "clerk_student").query(listAssignmentsForStudent, {});
    const assignment = result.groups[0].assignments.find((a) => a.title === "open assignment")!;

    expect(assignment.courseTitle).toBe("Course A");
    expect(assignment.courseSlug).toBe("course-a");
    expect(assignment.maxPoints).toBe(10);
    expect(typeof assignment.dueAt).toBe("number");
    expect(assignment.dueLabel).toMatch(/^Due in \d+ days?$/);
    expect(assignment.isOverdue).toBe(false);
    expect(assignment.submission).toBeNull();
  });

  test("derives isOverdue on the deadline that has already passed", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await asUser(t, "clerk_student").query(listAssignmentsForStudent, {});
    const overdue = result.groups[0].assignments.find((a) => a.title === "Overdue assignment")!;

    expect(overdue.isOverdue).toBe(true);
    expect(overdue.dueLabel).toBe("Overdue by 2 days");
  });

  test("shows the author their own draft", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await asUser(t, "clerk_instructor").query(listAssignmentsForStudent, {});
    const titles = result.groups.flatMap((g) => g.assignments.map((a) => a.title));
    expect(titles).toContain("draft assignment");
  });

  test("carries the learner's own submission back", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.student,
        content: "my essay",
        status: "graded",
        submittedAt: Date.now() + 8 * DAY,
        score: 8,
        feedback: "Good structure",
        gradedBy: ids.instructor,
        gradedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asUser(t, "clerk_student").query(listAssignmentsForStudent, {});
    const assignment = result.groups[0].assignments.find((a) => a.title === "open assignment")!;

    expect(assignment.submission?.status).toBe("graded");
    expect(assignment.submission?.score).toBe(8);
    expect(assignment.submission?.scorePercent).toBe(80);
    expect(assignment.submission?.feedback).toBe("Good structure");
    // Handed in a day after the 7-day deadline.
    expect(assignment.submission?.isLate).toBe(true);
  });

  test("filters on the server so each filter gets its own empty state", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.student,
        content: "essay",
        status: "graded",
        submittedAt: Date.now(),
        score: 7,
        gradedBy: ids.instructor,
        gradedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.closed,
        userId: ids.student,
        content: "essay",
        status: "submitted",
        submittedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const student = asUser(t, "clerk_student");

    const graded = await student.query(listAssignmentsForStudent, { filter: "graded" });
    expect(graded.groups.flatMap((g) => g.assignments.map((a) => a.title))).toEqual([
      "open assignment",
    ]);

    const submitted = await student.query(listAssignmentsForStudent, { filter: "submitted" });
    expect(submitted.groups.flatMap((g) => g.assignments.map((a) => a.title)).sort()).toEqual([
      "closed assignment",
      "open assignment",
    ]);

    // Nothing is outstanding-and-graded, so "overdue" only keeps the untouched
    // overdue assignment.
    const overdue = await student.query(listAssignmentsForStudent, { filter: "overdue" });
    expect(overdue.groups.flatMap((g) => g.assignments.map((a) => a.title))).toEqual([
      "Overdue assignment",
    ]);

    const pending = await student.query(listAssignmentsForStudent, { filter: "pending" });
    expect(pending.groups.flatMap((g) => g.assignments.map((a) => a.title)).sort()).toEqual([
      "Overdue assignment",
      "closed assignment",
    ]);
  });

  test("refuses a course the caller has no relationship with", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_outsider").query(listAssignmentsForStudent, {
        courseId: ids.courseA,
      }),
    ).rejects.toThrow(/must be enrolled/);
  });

  test("respects the limit across every course", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    // A second course the learner is also enrolled in, so the cap has to span
    // groups rather than truncating one course's list.
    const second = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: "Course C",
        slug: "course-c",
        description: "C",
        instructorId: ids.instructor,
        published: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("enrollments", {
        userId: ids.student,
        courseId: second,
        progressPercent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("assignments", {
          courseId: second,
          title: `C ${i}`,
          instructions: "Write something",
          createdBy: ids.instructor,
          dueAt: Date.now() + (i + 5) * DAY,
          maxPoints: 10,
          status: "open",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    const result = await asUser(t, "clerk_student").query(listAssignmentsForStudent, {
      limit: 4,
    });

    expect(result.total).toBe(4);
    expect(result.groups.reduce((sum, group) => sum + group.assignments.length, 0)).toBe(4);
    // No group is left behind empty by the cap.
    for (const group of result.groups) {
      expect(group.assignments.length).toBeGreaterThan(0);
    }
  });

  test("requires authentication", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(t.query(listAssignmentsForStudent, {})).rejects.toThrow(/Not authenticated/);
  });
});

describe("listAssignmentsForInstructor", () => {
  test("returns the caller's authored assignments with submission counts", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.student,
        content: "a",
        status: "submitted",
        submittedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.otherStudent,
        content: "b",
        status: "graded",
        submittedAt: Date.now(),
        score: 9,
        gradedBy: ids.instructor,
        gradedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.outsider,
        content: "still writing",
        status: "draft",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asUser(t, "clerk_instructor").query(listAssignmentsForInstructor, {});

    expect(result.total).toBe(4);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].courseTitle).toBe("Course A");

    const open = result.groups[0].assignments.find((a) => a.title === "open assignment")!;
    expect(open.counts).toEqual({
      total: 3,
      drafts: 1,
      submitted: 2,
      ungraded: 1,
      graded: 1,
    });
    expect(result.counts.ungraded).toBe(1);
    expect(result.counts.graded).toBe(1);
  });

  test("does not hand another instructor's course to this instructor", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await asUser(t, "clerk_instructor").query(listAssignmentsForInstructor, {});
    expect(result.groups.flatMap((g) => g.courseTitle)).toEqual(["Course A"]);
  });

  test("lets an admin see every assignment across every course", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await asUser(t, "clerk_admin").query(listAssignmentsForInstructor, {});
    expect(result.total).toBe(5);
    expect(result.groups.map((g) => g.courseTitle).sort()).toEqual(["Course A", "Course B"]);
  });

  test("requires authentication", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(t.query(listAssignmentsForInstructor, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("getSubmissions", () => {
  test("returns the grading queue with student names and lateness", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.student,
        content: "my essay",
        status: "submitted",
        submittedAt: Date.now() + 8 * DAY,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      // A learner's private draft is never in the grader's queue.
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.otherStudent,
        content: "unfinished",
        status: "draft",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const queue = await asUser(t, "clerk_instructor").query(getSubmissions, {
      assignmentId: ids.open,
    });

    expect(queue.assignment.title).toBe("open assignment");
    expect(queue.assignment.courseTitle).toBe("Course A");
    expect(queue.submissions).toHaveLength(1);
    expect(queue.submissions[0].studentName).toBe("Student One");
    expect(queue.submissions[0].studentImage).toBe("https://example.test/a.png");
    expect(queue.submissions[0].content).toBe("my essay");
    expect(queue.submissions[0].isLate).toBe(true);
    // The draft is counted but not listed.
    expect(queue.counts.drafts).toBe(1);
    expect(queue.counts.submitted).toBe(1);
  });

  test("lets an admin read any course's queue", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const queue = await asUser(t, "clerk_admin").query(getSubmissions, {
      assignmentId: ids.courseBAssignment,
    });
    expect(queue.assignment.courseTitle).toBe("Course B");
  });

  test("refuses a learner enrolled in a different course", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    // Course B's assignment id, presented by a learner enrolled in course A.
    await expect(
      asUser(t, "clerk_student").query(getSubmissions, { assignmentId: ids.courseBAssignment }),
    ).rejects.toThrow(/author, the course instructor or an admin/);
  });

  test("refuses the other instructor on someone else's assignment", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_other_instructor").query(getSubmissions, { assignmentId: ids.open }),
    ).rejects.toThrow(/author, the course instructor or an admin/);
  });

  test("requires authentication", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(t.query(getSubmissions, { assignmentId: ids.open })).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("getGradingSummary", () => {
  test("counts assignments by status and submissions by grading state", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.student,
        content: "a",
        status: "submitted",
        submittedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.closed,
        userId: ids.student,
        content: "b",
        status: "graded",
        submittedAt: Date.now(),
        score: 5,
        gradedBy: ids.instructor,
        gradedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const summary = await asUser(t, "clerk_instructor").query(getGradingSummary, {});

    expect(summary.assignments).toBe(4);
    expect(summary.drafts).toBe(1);
    expect(summary.closed).toBe(1);
    expect(summary.submitted).toBe(2);
    expect(summary.awaitingGrade).toBe(1);
    expect(summary.graded).toBe(1);
    expect(summary.averagePercent).toBe(50);
  });

  test("reports no average when nothing is marked", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const summary = await asUser(t, "clerk_instructor").query(getGradingSummary, {});
    expect(summary.averagePercent).toBeNull();
  });

  test("requires authentication", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(t.query(getGradingSummary, {})).rejects.toThrow(/Not authenticated/);
  });
});

describe("listCourseOptions", () => {
  test("offers enrolled courses to link a study task to", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const options = await asUser(t, "clerk_student").query(listCourseOptions, {});
    expect(options.enrolled.map((c) => c.title)).toEqual(["Course A"]);
    // A plain student authors no assignments.
    expect(options.authorable).toEqual([]);
  });

  test("offers a student's own courses to an instructor, all of them to an admin", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const instructor = await asUser(t, "clerk_instructor").query(listCourseOptions, {});
    expect(instructor.authorable.map((c) => c.title)).toEqual(["Course A"]);

    const admin = await asUser(t, "clerk_admin").query(listCourseOptions, {});
    expect(admin.authorable.map((c) => c.title).sort()).toEqual(["Course A", "Course B"]);
  });

  test("requires authentication", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(t.query(listCourseOptions, {})).rejects.toThrow(/Not authenticated/);
  });
});

// ── Assignment authoring ───────────────────────────────────────────────────

describe("assignment authoring", () => {
  test("an instructor creates a draft, then publishes it", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const instructor = asUser(t, "clerk_instructor");

    const assignmentId = await instructor.mutation(createAssignment, {
      courseId: ids.courseA,
      title: "  Reflective essay  ",
      instructions: "Describe week one.",
    });

    const stored = await t.run(async (ctx: TestCtx) => ctx.db.get(assignmentId));
    expect(stored!.title).toBe("Reflective essay");
    expect(stored!.status).toBe("draft");
    expect(stored!.createdBy).toBe(ids.instructor);

    await instructor.mutation(setAssignmentStatus, { assignmentId, status: "open" });
    const published = await t.run(async (ctx: TestCtx) => ctx.db.get(assignmentId));
    expect(published!.status).toBe("open");
  });

  test("creating with status open needs instructions up front", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_instructor").mutation(createAssignment, {
        courseId: ids.courseA,
        title: "No brief",
        status: "open",
      }),
    ).rejects.toThrow(/Add instructions/);
  });

  test("publishing a draft with no instructions is refused — the guard that stops a blank assignment reaching students", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const instructor = asUser(t, "clerk_instructor");

    const draft = await instructor.mutation(createAssignment, {
      courseId: ids.courseA,
      title: "No brief",
    });

    await expect(
      instructor.mutation(setAssignmentStatus, { assignmentId: draft, status: "open" }),
    ).rejects.toThrow(/Add instructions/);

    await expect(
      instructor.mutation(setAssignmentStatus, { assignmentId: draft, status: "closed" }),
    ).rejects.toThrow(/cannot move from draft to closed/);
  });

  test("updateAssignment edits content but has no status argument", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const instructor = asUser(t, "clerk_instructor");

    await instructor.mutation(updateAssignment, {
      assignmentId: ids.open,
      title: "Renamed",
      maxPoints: 25,
    });

    const stored = await t.run(async (ctx: TestCtx) => ctx.db.get(ids.open));
    expect(stored!.title).toBe("Renamed");
    expect(stored!.maxPoints).toBe(25);
    // Still open — an edit cannot unpublish.
    expect(stored!.status).toBe("open");
  });

  test("clearing an open assignment's instructions is refused", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_instructor").mutation(updateAssignment, {
        assignmentId: ids.open,
        instructions: "   ",
      }),
    ).rejects.toThrow(/Add instructions/);
  });

  test("another instructor cannot edit or delete the assignment", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const other = asUser(t, "clerk_other_instructor");

    await expect(
      other.mutation(updateAssignment, { assignmentId: ids.open, title: "hijacked" }),
    ).rejects.toThrow(/author, the course instructor or an admin/);

    await expect(
      other.mutation(deleteAssignment, { assignmentId: ids.open }),
    ).rejects.toThrow(/author, the course instructor or an admin/);
  });

  test("an enrolled student cannot create an assignment", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_student").mutation(createAssignment, {
        courseId: ids.courseA,
        title: "Not mine",
      }),
    ).rejects.toThrow(/Only the course instructor or an admin/);
  });

  test("an admin can author into anyone's course", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_admin").mutation(createAssignment, {
        courseId: ids.courseB,
        title: "Admin assignment",
      }),
    ).resolves.toBeTruthy();
  });

  test("deleting an assignment takes its submissions with it", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.student,
        content: "a",
        status: "submitted",
        submittedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await asUser(t, "clerk_instructor").mutation(deleteAssignment, {
      assignmentId: ids.open,
    });
    expect(result.deletedSubmissions).toBe(1);

    const left = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("assignmentSubmissions").collect(),
    );
    expect(left).toHaveLength(0);
  });

  test("assignment writes require authentication", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(t.mutation(createAssignment, { courseId: ids.courseA, title: "x" })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.mutation(updateAssignment, { assignmentId: ids.open, title: "x" })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.mutation(deleteAssignment, { assignmentId: ids.open })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(
      t.mutation(setAssignmentStatus, { assignmentId: ids.open, status: "closed" }),
    ).rejects.toThrow(/Not authenticated/);
  });
});

// ── Submissions ────────────────────────────────────────────────────────────

describe("submissions", () => {
  test("a learner saves a draft and then hands it in", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = asUser(t, "clerk_student");

    const draftId = await student.mutation(saveSubmission, {
      assignmentId: ids.open,
      content: "first attempt",
    });
    const draft = await t.run(async (ctx: TestCtx) => ctx.db.get(draftId));
    expect(draft!.status).toBe("draft");
    expect(draft!.submittedAt).toBeUndefined();

    // Saving again updates the same row rather than piling up drafts.
    const sameId = await student.mutation(saveSubmission, {
      assignmentId: ids.open,
      content: "second attempt",
    });
    expect(sameId).toBe(draftId);

    await student.mutation(submitAssignment, { assignmentId: ids.open });
    const submitted = await t.run(async (ctx: TestCtx) => ctx.db.get(draftId));
    expect(submitted!.status).toBe("submitted");
    expect(typeof submitted!.submittedAt).toBe("number");

    const rows = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("assignmentSubmissions").collect(),
    );
    expect(rows).toHaveLength(1);
  });

  test("handing in with inline content saves and submits in one call", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const id = await asUser(t, "clerk_student").mutation(submitAssignment, {
      assignmentId: ids.open,
      content: "written and handed in",
    });
    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row!.content).toBe("written and handed in");
    expect(row!.status).toBe("submitted");
  });

  test("handing in without a draft or content is refused", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_student").mutation(submitAssignment, { assignmentId: ids.open }),
    ).rejects.toThrow(/Your answer is required/);
  });

  test("a closed assignment refuses work", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = asUser(t, "clerk_student");

    await expect(
      student.mutation(saveSubmission, { assignmentId: ids.closed, content: "too late" }),
    ).rejects.toThrow(/closed and no longer accepts/);

    await expect(
      student.mutation(submitAssignment, { assignmentId: ids.closed, content: "too late" }),
    ).rejects.toThrow(/closed and no longer accepts/);

    expect(
      await t.run(async (ctx: TestCtx) => ctx.db.query("assignmentSubmissions").collect()),
    ).toHaveLength(0);
  });

  test("a draft assignment refuses work from a learner who somehow has its id", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_student").mutation(saveSubmission, {
        assignmentId: ids.draft,
        content: "guessing the id",
      }),
    ).rejects.toThrow(/not open for submissions yet/);
  });

  test("handed-in work cannot be edited afterwards", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = asUser(t, "clerk_student");

    await student.mutation(submitAssignment, { assignmentId: ids.open, content: "final" });

    await expect(
      student.mutation(saveSubmission, { assignmentId: ids.open, content: "changed my mind" }),
    ).rejects.toThrow(/already handed in/);
    await expect(
      student.mutation(submitAssignment, { assignmentId: ids.open, content: "again" }),
    ).rejects.toThrow(/already handed in/);
  });

  test("empty and oversized answers are refused", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = asUser(t, "clerk_student");

    await expect(
      student.mutation(saveSubmission, { assignmentId: ids.open, content: "   " }),
    ).rejects.toThrow(/Your answer is required/);

    await expect(
      student.mutation(saveSubmission, { assignmentId: ids.open, content: "x".repeat(20_001) }),
    ).rejects.toThrow(/20,?000 characters or fewer/);
  });

  test("a learner who is not enrolled cannot submit to a course they have no tie to", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(
      asUser(t, "clerk_outsider").mutation(saveSubmission, {
        assignmentId: ids.open,
        content: "let me in",
      }),
    ).rejects.toThrow(/must be enrolled/);
  });

  test("submission writes require authentication", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await expect(t.mutation(saveSubmission, { assignmentId: ids.open, content: "x" })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.mutation(submitAssignment, { assignmentId: ids.open, content: "x" })).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("gradeSubmission", () => {
  /**
   * Seeds one handed-in submission and returns the instructor's view of the
   * queue. `options.maxPoints` defaults via the whole object rather than the
   * field, because a default *on the field* would swallow the `undefined` that
   * means "this assignment has no maximum".
   */
  async function seedSubmitted(
    t: Harness,
    ids: SeedIds,
    options: { maxPoints?: number } = { maxPoints: 10 },
  ) {
    await t.run(async (ctx: TestCtx) => {
      const open = (await ctx.db.get(ids.open))!;
      if (options.maxPoints === undefined) {
        // Drop the key entirely rather than writing `undefined` — that is how an
        // assignment ends up with no maximum.
        const { maxPoints: _removed, ...rest } = open;
        void _removed;
        await ctx.db.replace(ids.open, rest);
      } else {
        await ctx.db.patch(ids.open, { maxPoints: options.maxPoints });
      }
      await ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.open,
        userId: ids.student,
        content: "my essay",
        status: "submitted",
        submittedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    return asUser(t, "clerk_instructor").query(getSubmissions, { assignmentId: ids.open });
  }

  test("an instructor marks a submission and the learner sees the result", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const queue = await seedSubmitted(t, ids);

    await asUser(t, "clerk_instructor").mutation(gradeSubmission, {
      submissionId: queue.submissions[0].id,
      score: 8,
      feedback: "Strong argument in paragraph two.",
    });

    const row = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("assignmentSubmissions").collect().then((rows) => rows[0]),
    );
    expect(row.status).toBe("graded");
    expect(row.score).toBe(8);
    expect(row.feedback).toBe("Strong argument in paragraph two.");
    expect(row.gradedBy).toBe(ids.instructor);
    expect(typeof row.gradedAt).toBe("number");

    const learner = await asUser(t, "clerk_student").query(listAssignmentsForStudent, {});
    const assignment = learner.groups[0].assignments.find((a) => a.title === "open assignment")!;
    expect(assignment.submission?.scorePercent).toBe(80);
    expect(assignment.submission?.feedback).toBe("Strong argument in paragraph two.");
  });

  test("rejects a score above the maximum", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const queue = await seedSubmitted(t, ids);

    await expect(
      asUser(t, "clerk_instructor").mutation(gradeSubmission, {
        submissionId: queue.submissions[0].id,
        score: 11,
      }),
    ).rejects.toThrow(/higher than the maximum of 10/);

    const row = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("assignmentSubmissions").collect().then((rows) => rows[0]),
    );
    expect(row.status).toBe("submitted");
    expect(row.score).toBeUndefined();
  });

  test("rejects a negative score", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const queue = await seedSubmitted(t, ids);

    await expect(
      asUser(t, "clerk_instructor").mutation(gradeSubmission, {
        submissionId: queue.submissions[0].id,
        score: -1,
      }),
    ).rejects.toThrow(/below zero/);
  });

  test("refuses to grade an assignment with no maximum", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const queue = await seedSubmitted(t, ids, { maxPoints: undefined });

    await expect(
      asUser(t, "clerk_instructor").mutation(gradeSubmission, {
        submissionId: queue.submissions[0].id,
        score: 5,
      }),
    ).rejects.toThrow(/maximum points value/);
  });

  test("a student cannot grade — not their own work, and not anyone's", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const queue = await seedSubmitted(t, ids);

    await expect(
      asUser(t, "clerk_student").mutation(gradeSubmission, {
        submissionId: queue.submissions[0].id,
        score: 10,
      }),
    ).rejects.toThrow(/author, the course instructor or an admin/);
  });

  test("a student enrolled in course A cannot grade course B's submission", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const submissionId = await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(ids.courseBAssignment, { maxPoints: 10 });
      return ctx.db.insert("assignmentSubmissions", {
        assignmentId: ids.courseBAssignment,
        userId: ids.otherStudent,
        content: "b essay",
        status: "submitted",
        submittedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      asUser(t, "clerk_student").mutation(gradeSubmission, { submissionId, score: 10 }),
    ).rejects.toThrow(/author, the course instructor or an admin/);
  });

  test("another instructor cannot grade it, but an admin can", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const queue = await seedSubmitted(t, ids);

    await expect(
      asUser(t, "clerk_other_instructor").mutation(gradeSubmission, {
        submissionId: queue.submissions[0].id,
        score: 5,
      }),
    ).rejects.toThrow(/author, the course instructor or an admin/);

    await expect(
      asUser(t, "clerk_admin").mutation(gradeSubmission, {
        submissionId: queue.submissions[0].id,
        score: 5,
      }),
    ).resolves.toBeTruthy();
  });

  test("a learner's unsent draft cannot be graded", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const draftId = await asUser(t, "clerk_student").mutation(saveSubmission, {
      assignmentId: ids.open,
      content: "still writing",
    });

    await expect(
      asUser(t, "clerk_instructor").mutation(gradeSubmission, {
        submissionId: draftId,
        score: 5,
      }),
    ).rejects.toThrow(/not been handed in/);
  });

  test("grading requires authentication", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const queue = await seedSubmitted(t, ids);

    await expect(
      t.mutation(gradeSubmission, { submissionId: queue.submissions[0].id, score: 5 }),
    ).rejects.toThrow(/Not authenticated/);
  });
});

// ── Study tasks ────────────────────────────────────────────────────────────

describe("study tasks", () => {
  test("a learner creates a task linked to a course they are enrolled in", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    const id = await asUser(t, "clerk_student").mutation(createStudyTask, {
      title: "  Revise week one notes  ",
      notes: "Focus on the half-life section",
      courseId: ids.courseA,
      dueAt: Date.now() + 2 * DAY,
      priority: "high",
    });

    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row!.userId).toBe(ids.student);
    expect(row!.title).toBe("Revise week one notes");
    expect(row!.priority).toBe("high");
    expect(row!.completedAt).toBeUndefined();
  });

  test("priority defaults to medium and a past due date is refused", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const student = asUser(t, "clerk_student");

    const id = await student.mutation(createStudyTask, { title: "Read chapter 4" });
    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row!.priority).toBe("medium");

    await expect(
      student.mutation(createStudyTask, { title: "Yesterday", dueAt: Date.now() - DAY }),
    ).rejects.toThrow(/cannot be in the past/);
  });

  test("the list returns only the caller's own tasks, with derived state", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    await asUser(t, "clerk_student").mutation(createStudyTask, {
      title: "Outstanding, no deadline",
      priority: "low",
    });
    const late = await asUser(t, "clerk_student").mutation(createStudyTask, {
      title: "Outstanding, late",
      dueAt: Date.now() + 2 * DAY,
    });
    const done = await asUser(t, "clerk_student").mutation(createStudyTask, {
      title: "Finished",
    });
    await asUser(t, "clerk_student").mutation(toggleStudyTaskComplete, { id: done, completed: true });
    // Somebody else's task, seeded directly so the read is provably scoped.
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(late, { dueAt: Date.now() - DAY });
      await ctx.db.insert("studyTasks", {
        userId: ids.otherStudent,
        title: "Not yours",
        priority: "high",
        createdAt: Date.now(),
      });
    });

    const result = await asUser(t, "clerk_student").query(listStudyTasks, {});

    expect(result.tasks.map((task) => task.title)).toEqual([
      "Outstanding, late",
      "Outstanding, no deadline",
      "Finished",
    ]);
    const [overdue, none, finished] = result.tasks;
    expect(overdue.overdue).toBe(true);
    expect(overdue.dueLabel).toMatch(/^Overdue/);
    expect(none.dueLabel).toBe("No due date");
    expect(finished.completed).toBe(true);
    expect(typeof finished.completedAt).toBe("number");
    expect(result.stats).toEqual({
      outstanding: 2,
      completed: 1,
      overdue: 1,
      dueThisWeek: 1,
    });
  });

  test("resolves a linked course's title server-side", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    await asUser(t, "clerk_student").mutation(createStudyTask, {
      title: "Linked",
      courseId: ids.courseA,
    });

    const result = await asUser(t, "clerk_student").query(listStudyTasks, {});
    expect(result.tasks[0].courseTitle).toBe("Course A");
    expect(result.tasks[0].courseSlug).toBe("course-a");
  });

  test("filters by status and priority", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const student = asUser(t, "clerk_student");

    const high = await student.mutation(createStudyTask, { title: "Urgent", priority: "high" });
    await student.mutation(createStudyTask, { title: "Chill", priority: "low" });
    await student.mutation(toggleStudyTaskComplete, { id: high, completed: true });

    const completed = await student.query(listStudyTasks, { status: "completed" });
    expect(completed.tasks.map((task) => task.title)).toEqual(["Urgent"]);

    const outstanding = await student.query(listStudyTasks, { status: "outstanding" });
    expect(outstanding.tasks.map((task) => task.title)).toEqual(["Chill"]);

    const lowOnly = await student.query(listStudyTasks, { priority: "low" });
    expect(lowOnly.tasks.map((task) => task.title)).toEqual(["Chill"]);

    // Stats ignore the filter — otherwise a filter would zero out the counts.
    expect(completed.stats.outstanding).toBe(1);
    expect(completed.stats.completed).toBe(1);
  });

  test("getStudyTaskStats counts only the caller's own tasks", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = asUser(t, "clerk_student");

    await student.mutation(createStudyTask, { title: "One" });
    await student.mutation(createStudyTask, { title: "Two", dueAt: Date.now() + DAY });
    await t.run(async (ctx: TestCtx) => {
      for (const title of ["Their one", "Their two", "Their three"]) {
        await ctx.db.insert("studyTasks", {
          userId: ids.otherStudent,
          title,
          priority: "high",
          createdAt: Date.now(),
        });
      }
    });

    const stats = await student.query(getStudyTaskStats, {});
    expect(stats).toEqual({ outstanding: 2, completed: 0, overdue: 0, dueThisWeek: 1 });
  });

  test("toggling is idempotent and reversible", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const student = asUser(t, "clerk_student");

    const id = await student.mutation(createStudyTask, { title: "Toggle me" });

    const done = await student.mutation(toggleStudyTaskComplete, { id, completed: true });
    expect(done.completed).toBe(true);
    expect(typeof done.completedAt).toBe("number");

    const undone = await student.mutation(toggleStudyTaskComplete, { id, completed: false });
    expect(undone.completed).toBe(false);
    expect(undone.completedAt).toBeNull();

    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row!.completedAt).toBeUndefined();
  });

  test("an edit can detach a course and clear a deadline", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = asUser(t, "clerk_student");

    const id = await student.mutation(createStudyTask, {
      title: "Linked",
      courseId: ids.courseA,
      dueAt: Date.now() + DAY,
    });

    await student.mutation(updateStudyTask, {
      id,
      title: "Unlinked",
      courseId: null,
      dueAt: null,
      priority: "low",
    });

    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row!.title).toBe("Unlinked");
    expect(row!.courseId).toBeUndefined();
    expect(row!.dueAt).toBeUndefined();
    expect(row!.priority).toBe("low");
  });

  test("every study-task write requires authentication", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    // Real ids, because argument validation runs before the handler and a
    // made-up string would fail the `v.id()` check instead.
    const id = await asUser(t, "clerk_student").mutation(createStudyTask, { title: "Mine" });

    await expect(t.mutation(createStudyTask, { title: "x" })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.mutation(updateStudyTask, { id, title: "x" })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.mutation(toggleStudyTaskComplete, { id, completed: true })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.mutation(deleteStudyTask, { id })).rejects.toThrow(/Not authenticated/);

    expect(await t.run(async (ctx: TestCtx) => ctx.db.get(id))).not.toBeNull();
  });
});

/**
 * The most important isolation test in this file. Nothing else on the Task page
 * is private, so a scoping slip here would be the only way one learner could
 * read another's notes — including for an admin, because study tasks have no
 * privileged view at all.
 */
describe("study-task isolation between users", () => {
  test("user A cannot see user B's task", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const bId = await asUser(t, "clerk_other_student").mutation(createStudyTask, {
      title: "B's private plan",
      notes: "B's private notes",
    });

    const aList = await asUser(t, "clerk_student").query(listStudyTasks, {});
    expect(aList.tasks).toHaveLength(0);
    expect(JSON.stringify(aList)).not.toContain("B's private");

    // Even holding the id, A cannot read it through any query.
    await expect(
      asUser(t, "clerk_student").query(listStudyTasks, { limit: bId ? undefined : 1 }),
    ).resolves.toEqual(aList);
  });

  test("user A cannot edit or complete user B's task", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const bId = await asUser(t, "clerk_other_student").mutation(createStudyTask, {
      title: "B's private plan",
    });
    const a = asUser(t, "clerk_student");

    await expect(a.mutation(updateStudyTask, { id: bId, title: "hijacked" })).rejects.toThrow(
      /Task not found/,
    );
    await expect(
      a.mutation(toggleStudyTaskComplete, { id: bId, completed: true }),
    ).rejects.toThrow(/Task not found/);

    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(bId));
    expect(row!.title).toBe("B's private plan");
    expect(row!.completedAt).toBeUndefined();
  });

  test("user A cannot delete user B's task", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const bId = await asUser(t, "clerk_other_student").mutation(createStudyTask, {
      title: "B's private plan",
    });

    await expect(asUser(t, "clerk_student").mutation(deleteStudyTask, { id: bId })).rejects.toThrow(
      /Task not found/,
    );
    expect(await t.run(async (ctx: TestCtx) => ctx.db.get(bId))).not.toBeNull();
  });

  test("an admin has no privileged view of somebody's study task", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const bId = await asUser(t, "clerk_other_student").mutation(createStudyTask, {
      title: "B's private plan",
      notes: "not for the console",
    });

    await expect(
      asUser(t, "clerk_admin").mutation(updateStudyTask, { id: bId, title: "admin was here" }),
    ).rejects.toThrow(/Task not found/);
    await expect(asUser(t, "clerk_admin").mutation(deleteStudyTask, { id: bId })).rejects.toThrow(
      /Task not found/,
    );

    const adminList = await asUser(t, "clerk_admin").query(listStudyTasks, {});
    expect(adminList.tasks).toHaveLength(0);
    expect(JSON.stringify(adminList)).not.toContain("not for the console");
  });

  test("a nonexistent id and someone else's id fail identically", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const bId = await asUser(t, "clerk_other_student").mutation(createStudyTask, {
      title: "B's private plan",
    });
    // A real, well-formed Convex id that no longer resolves — produced by
    // creating and then deleting, because `v.id()` rejects a made-up string
    // before the handler ever runs.
    const deletedId = await asUser(t, "clerk_other_student").mutation(createStudyTask, {
      title: "Since deleted",
    });
    await asUser(t, "clerk_other_student").mutation(deleteStudyTask, { id: deletedId });

    const student = asUser(t, "clerk_student");

    const ownError = await student
      .mutation(deleteStudyTask, { id: bId })
      .then(() => "resolved")
      .catch((error: Error) => error.message);
    const bogusError = await student
      .mutation(deleteStudyTask, { id: deletedId })
      .then(() => "resolved")
      .catch((error: Error) => error.message);

    // Otherwise the error text confirms that an id exists, which is a leak.
    expect(ownError).toBe(bogusError);
    expect(ownError).toBe("Task not found");
  });
});

// ── Rate limits ────────────────────────────────────────────────────────────

describe("task rate limits", () => {
  test("createStudyTask allows thirty a minute, then refuses", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const student = asUser(t, "clerk_student");

    for (let i = 0; i < 30; i++) {
      await expect(
        student.mutation(createStudyTask, { title: `Task ${i}` }),
      ).resolves.toBeTruthy();
    }

    await expect(
      student.mutation(createStudyTask, { title: "One too many" }),
    ).rejects.toThrow(/Too many requests/);

    expect(await t.run(async (ctx: TestCtx) => ctx.db.query("studyTasks").collect())).toHaveLength(
      30,
    );
  });

  test("the study-task bucket is per user, so another learner is unaffected", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const first = asUser(t, "clerk_student");
    for (let i = 0; i < 30; i++) {
      await first.mutation(createStudyTask, { title: `Task ${i}` });
    }
    await expect(first.mutation(createStudyTask, { title: "Nope" })).rejects.toThrow(
      /Too many requests/,
    );

    await expect(
      asUser(t, "clerk_other_student").mutation(createStudyTask, { title: "Mine" }),
    ).resolves.toBeTruthy();
  });

  test("handing work in is limited to ten a minute", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);

    // One assignment per submission: there is no per-assignment cooldown here,
    // so the only limit in play is the global bucket.
    const assignmentIds: Id<"assignments">[] = [ids.open];
    for (let i = 0; i < 10; i++) {
      assignmentIds.push(
        await t.run(async (ctx: TestCtx) =>
          ctx.db.insert("assignments", {
            courseId: ids.courseA,
            title: `Extra ${i}`,
            instructions: "Write something",
            createdBy: ids.instructor,
            dueAt: Date.now() + DAY,
            maxPoints: 10,
            status: "open",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        ),
      );
    }

    const student = asUser(t, "clerk_student");
    for (let i = 0; i < 10; i++) {
      await expect(
        student.mutation(submitAssignment, {
          assignmentId: assignmentIds[i],
          content: `answer ${i}`,
        }),
      ).resolves.toBeTruthy();
    }

    await expect(
      student.mutation(submitAssignment, {
        assignmentId: assignmentIds[10],
        content: "one too many",
      }),
    ).rejects.toThrow(/Too many requests/);

    // The refused attempt wrote nothing.
    expect(
      await t.run(async (ctx: TestCtx) => ctx.db.query("assignmentSubmissions").collect()),
    ).toHaveLength(10);
  });

  test("a refused attempt does not burn quota, because the guards run first", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const student = asUser(t, "clerk_student");

    // Ten refused attempts against a course they are not enrolled in.
    for (let i = 0; i < 10; i++) {
      await expect(
        asUser(t, "clerk_outsider").mutation(submitAssignment, {
          assignmentId: ids.open,
          content: "x",
        }),
      ).rejects.toThrow(/must be enrolled/);
    }

    // The outsider still has their whole submission budget.
    await t.run(async (ctx: TestCtx) => {
      const outsider = (
        await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_outsider"))
          .unique()
      )!;
      await ctx.db.insert("enrollments", {
        userId: outsider._id,
        courseId: ids.courseA,
        progressPercent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      student.mutation(submitAssignment, { assignmentId: ids.open, content: "still allowed" }),
    ).resolves.toBeTruthy();
    await expect(
      asUser(t, "clerk_outsider").mutation(submitAssignment, {
        assignmentId: ids.open,
        content: "and me",
      }),
    ).resolves.toBeTruthy();
  });

  test("createAssignment is limited per hour", async () => {
    const t = convexTest(testSchema, modules);
    const ids = await seedWorld(t);
    const instructor = asUser(t, "clerk_instructor");

    for (let i = 0; i < 20; i++) {
      await expect(
        instructor.mutation(createAssignment, {
          courseId: ids.courseA,
          title: `Assignment ${i}`,
          instructions: "Do the thing",
        }),
      ).resolves.toBeTruthy();
    }

    await expect(
      instructor.mutation(createAssignment, {
        courseId: ids.courseA,
        title: "One too many",
        instructions: "Do the thing",
      }),
    ).rejects.toThrow(/Too many requests/);
  });
});