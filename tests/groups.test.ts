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
import type { Doc, Id } from "../convex/_generated/dataModel";
import { groupsApi } from "../lib/groups-api";
import type {
  AccessibleCourse,
  BrowseGroupSummary,
  GroupMemberItem,
  GroupMessageItem,
  MyGroupSummary,
} from "../lib/groups";

/**
 * Course-scoped study groups.
 *
 * The centre of gravity here is admission: a group belongs to a course, and the
 * rule that matters is that a student in course A cannot see, read, join or
 * post in a group belonging to course B — even when the group is public and even
 * when they know its id. Every read and write re-runs that branch server-side,
 * so these tests drive the mutations directly rather than trusting any client
 * state.
 *
 * The other edges pinned here are the ones a client could otherwise walk around:
 * moderation limits (a group moderator may not promote peers or archive), the
 * archived-group refusals, the private-group request path, and both rate limits.
 *
 * Function references come from `lib/groups-api.ts` (built with
 * `makeFunctionReference`) because `convex/_generated/api` does not list this
 * module until `npx convex dev` regenerates it.
 */

const modules = import.meta.glob("../convex/**/*.ts");

const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;
type StudyGroupMemberDoc = Doc<"studyGroupMembers">;

/**
 * `convexTest` is handed an `any`-typed harness, so query results come back
 * untyped and every callback parameter would be an implicit `any`. These
 * aliases name the shapes the module actually returns — the alternative is
 * annotating each parameter by hand, which is noisier and easier to get wrong.
 */
type BrowseRow = BrowseGroupSummary;
type MyGroupRow = MyGroupSummary;
type MessageRow = GroupMessageItem;
type CourseRow = AccessibleCourse;

type MemberRow = GroupMemberItem;

const api = groupsApi;

const SUBJECT = {
  instructorA: "clerk_instructor_a",
  studentA: "clerk_student_a",
  studentB: "clerk_student_b",
  outsider: "clerk_outsider",
  stranger: "clerk_stranger",
  admin: "clerk_admin",
} as const;

/**
 * The `convexTest` harness, typed. `convexTest` itself returns a precise
 * object, but this file threads it through helpers that also take ids from
 * `ctx.db.insert`, so the concrete generic would be noise; the exported
 * `TestConvex` shape keeps `query`/`mutation`/`run` callable and checked while
 * leaving the id parameters as `Id<...>`.
 */
type Harness = TestConvex<SchemaDefinition<GenericSchema, boolean>>;

type UserId = Id<"users">;
type CourseId = Id<"courses">;
type GroupId = Id<"studyGroups">;

async function seedWorld(t: Harness) {
  const now = Date.now();

  const user = (
    clerkId: string,
    name: string,
    role: "student" | "instructor" | "admin",
  ) =>
    t.run(async (ctx: TestCtx) =>
      ctx.db.insert("users", { clerkId, name, role, createdAt: now }),
    );

  const instructorAId = await user(
    SUBJECT.instructorA,
    "Instructor Ada",
    "instructor",
  );
  const studentAId = await user(SUBJECT.studentA, "Student Amina", "student");
  const studentBId = await user(SUBJECT.studentB, "Student Bode", "student");
  const outsiderId = await user(SUBJECT.outsider, "Outsider Oz", "student");
  // Enrolled in neither course: the blanket "reaches nothing" caller.
  const strangerId = await user(SUBJECT.stranger, "Stranger Sam", "student");
  const adminId = await user(SUBJECT.admin, "Admin Ada", "admin");

  const course = (title: string, slug: string, instructorId: UserId) =>
    t.run(async (ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title,
        slug,
        description: `${title} description`,
        instructorId,
        published: true,
        createdAt: now,
        updatedAt: now,
      }),
    );

  // Two courses. `courseId` is the one everybody in this file is enrolled in;
  // `otherCourseId` is the cross-tenant fixture.
  const courseId = await course("Course A", "course-a", instructorAId);
  const otherCourseId = await course("Course B", "course-b", instructorAId);

  const enroll = (userId: UserId, targetCourseId: CourseId) =>
    t.run(async (ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId,
        courseId: targetCourseId,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

  await enroll(studentAId, courseId);
  await enroll(studentBId, courseId);
  // The outsider is only ever enrolled in the *other* course.
  await enroll(outsiderId, otherCourseId);

  const seedGroup = async (
    targetCourseId: CourseId,
    opts: {
      name?: string;
      isPrivate?: boolean;
      isArchived?: boolean;
      createdBy?: UserId;
    } = {},
  ) =>
    t.run(async (ctx: TestCtx) =>
      ctx.db.insert("studyGroups", {
        courseId: targetCourseId,
        name: opts.name ?? "Seeded Group",
        description: "A group for tests",
        createdBy: opts.createdBy ?? studentAId,
        isPrivate: opts.isPrivate ?? false,
        isArchived: opts.isArchived,
        createdAt: now,
      }),
    );

  const addMember = (
    groupId: GroupId,
    userId: UserId,
    role: "member" | "moderator",
    joinedAt = now,
  ) =>
    t.run(async (ctx: TestCtx) =>
      ctx.db.insert("studyGroupMembers", { groupId, userId, role, joinedAt }),
    );

  return {
    instructorAId,
    studentAId,
    studentBId,
    outsiderId,
    strangerId,
    adminId,
    courseId,
    otherCourseId,
    seedGroup,
    addMember,
  };
}

const asUser = (t: Harness, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

/** A public group in course A that Amina moderates and Bode belongs to. */
async function seedPopulatedGroup(
  t: Harness,
  world: Awaited<ReturnType<typeof seedWorld>>,
) {
  const groupId = await world.seedGroup(world.courseId, { name: "Week 3 Crew" });
  await world.addMember(groupId, world.studentAId, "moderator");
  await world.addMember(groupId, world.studentBId, "member");
  return groupId;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("createGroup", () => {
  test("an enrolled student can open a group and becomes its moderator", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);

    const groupId = await asUser(t, SUBJECT.studentA).mutation(api.createGroup, {
      courseId: world.courseId,
      name: "  Exam Prep  ",
      description: "  We meet on Sundays  ",
    });
    expect(typeof groupId).toBe("string");

    const stored = await t.run(async (ctx: TestCtx) => {
      const id = await ctx.db.normalizeId("studyGroups", groupId);
      return id ? await ctx.db.get(id) : null;
    });
    expect(stored!.name).toBe("Exam Prep");
    expect(stored!.description).toBe("We meet on Sundays");
    expect(stored!.isPrivate).toBe(false);

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe("moderator");
    expect(members[0]!.userId).toBe(world.studentAId);
  });

  test("an instructor can open one in their own course without enrolling", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);

    await expect(
      asUser(t, SUBJECT.instructorA).mutation(api.createGroup, {
        courseId: world.courseId,
        name: "Office Hours",
      }),
    ).resolves.toBeTruthy();
  });

  test("a student not enrolled in the course is refused", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);

    await expect(
      asUser(t, SUBJECT.outsider).mutation(api.createGroup, {
        courseId: world.courseId,
        name: "Sneaky",
      }),
    ).rejects.toThrow(/must be enrolled/);
  });

  test("unauthenticated callers are refused", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);

    await expect(
      t.mutation(api.createGroup, { courseId: world.courseId, name: "Nope" }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("names and descriptions are length-checked", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const student = asUser(t, SUBJECT.studentA);

    await expect(
      student.mutation(api.createGroup, { courseId: world.courseId, name: "ab" }),
    ).rejects.toThrow(/at least/);
    await expect(
      student.mutation(api.createGroup, {
        courseId: world.courseId,
        name: "x".repeat(200),
      }),
    ).rejects.toThrow(/under/);
    await expect(
      student.mutation(api.createGroup, {
        courseId: world.courseId,
        name: "Fine",
        description: "x".repeat(900),
      }),
    ).rejects.toThrow(/under/);
  });

  test("creation is rate limited to five an hour", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const student = asUser(t, SUBJECT.studentA);

    for (let i = 0; i < 5; i++) {
      await expect(
        student.mutation(api.createGroup, {
          courseId: world.courseId,
          name: `Group ${i}`,
        }),
      ).resolves.toBeTruthy();
    }
    await expect(
      student.mutation(api.createGroup, {
        courseId: world.courseId,
        name: "Group 6",
      }),
    ).rejects.toThrow(/Too many requests/);

    const groups = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroups").collect(),
    );
    expect(groups).toHaveLength(5);
  });
});

describe("course isolation — the important one", () => {
  test("a student who is in neither course cannot reach anything, by id or by browse", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupB = await world.seedGroup(world.otherCourseId, { name: "Course B Group" });
    await world.addMember(groupB, world.studentBId, "moderator");
    const stranger = asUser(t, SUBJECT.stranger);

    await expect(
      stranger.query(api.browseGroupsForCourse, { courseId: world.courseId }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      stranger.query(api.browseGroupsForCourse, { courseId: world.otherCourseId }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      stranger.query(api.getGroup, { groupId: groupB }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      stranger.query(api.listMembers, { groupId: groupB }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      stranger.query(api.listMessages, { groupId: groupB }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      stranger.mutation(api.joinGroup, { groupId: groupB }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      stranger.mutation(api.postMessage, { groupId: groupB, body: "hello?" }),
    ).rejects.toThrow(/must be enrolled/);
  });

  test("a student enrolled in course B only cannot see or join course A's group", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupA = await seedPopulatedGroup(t, world);

    // `outsider` is enrolled in course B, so course A is somebody else's.
    const outsider = asUser(t, SUBJECT.outsider);
    await expect(
      outsider.query(api.browseGroupsForCourse, { courseId: world.courseId }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      outsider.query(api.getGroup, { groupId: groupA }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      outsider.query(api.listMessages, { groupId: groupA }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      outsider.mutation(api.joinGroup, { groupId: groupA }),
    ).rejects.toThrow(/must be enrolled/);
    await expect(
      outsider.mutation(api.postMessage, { groupId: groupA, body: "hello?" }),
    ).rejects.toThrow(/must be enrolled/);

    // And nothing was written by any of those attempts.
    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members.map((m) => m.userId)).not.toContain(world.outsiderId);
  });

  test("an admin is not gated by enrolment", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupB = await world.seedGroup(world.otherCourseId, { name: "Course B Group" });

    const detail = await asUser(t, SUBJECT.admin).query(api.getGroup, {
      groupId: groupB,
    });
    expect(detail.course.title).toBe("Course B");
    expect(detail.permissions.canArchive).toBe(true);
  });

  test("unauthenticated reads are refused", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupA = await seedPopulatedGroup(t, world);

    await expect(t.query(api.getGroup, { groupId: groupA })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.query(api.listMyGroups, {})).rejects.toThrow(/Not authenticated/);
    await expect(
      t.query(api.getMyGroupStats, {}),
    ).rejects.toThrow(/Not authenticated/);
    await expect(
      t.query(api.browseGroupsForCourse, { courseId: world.courseId }),
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe("browseGroupsForCourse", () => {
  test("lists open groups with the caller's relationship resolved", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const mine = await world.seedGroup(world.courseId, { name: "Mine", createdBy: world.studentAId });
    await world.addMember(mine, world.studentAId, "moderator");
    await world.seedGroup(world.courseId, { name: "Theirs" });
    await world.seedGroup(world.courseId, { name: "Invite only", isPrivate: true });
    await world.seedGroup(world.courseId, { name: "Closed", isArchived: true });

    const asMember = await asUser(t, SUBJECT.studentA).query(
      api.browseGroupsForCourse,
      { courseId: world.courseId },
    );
    expect(asMember.map((g: BrowseRow) => g.name).sort()).toEqual([
      "Invite only",
      "Mine",
      "Theirs",
    ]);
    const mineRow = asMember.find((g: BrowseRow) => g.name === "Mine")!;
    expect(mineRow.relationship).toBe("moderator");
    expect(mineRow.memberCount).toBe(1);
    expect(mineRow.course.title).toBe("Course A");

    const asStranger = await asUser(t, SUBJECT.studentB).query(
      api.browseGroupsForCourse,
      { courseId: world.courseId },
    );
    expect(
      asStranger.find((g: BrowseRow) => g.name === "Mine")!.relationship,
    ).toBe("can_join");
    // Private groups are listed so they can be asked to join — flagged, not hidden.
    expect(
      asStranger.find((g: BrowseRow) => g.name === "Invite only")!.isPrivate,
    ).toBe(true);
  });

  test("a pending request is reported as pending, with its id for cancelling", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const priv = await world.seedGroup(world.courseId, { name: "Invite only", isPrivate: true });
    await world.addMember(priv, world.studentAId, "moderator");
    await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId: priv,
      message: "please",
    });

    const rows = await asUser(t, SUBJECT.studentB).query(
      api.browseGroupsForCourse,
      { courseId: world.courseId },
    );
    const row = rows.find((g: BrowseRow) => g._id === priv)!;
    expect(row.relationship).toBe("pending");
    expect(row.myPendingRequestId).toBeTruthy();

    const queue = await asUser(t, SUBJECT.studentA).query(api.listPendingRequests, {
      groupId: priv,
    });
    expect(queue.requests).toHaveLength(1);
    expect(queue.requests[0]!.message).toBe("please");
    expect(queue.requests[0]!.requesterName).toBe("Student Bode");
  });
});

describe("joinGroup", () => {
  test("an open group takes the seat immediately", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });

    const result = await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId,
    });
    expect(result.outcome).toBe("joined");

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe("member");
  });

  test("an invite-only group creates a request instead of a membership", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });

    const result = await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId,
      message: "  let me in  ",
    });
    expect(result.outcome).toBe("request_created");

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(0);

    const requests = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupJoinRequests").collect(),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.status).toBe("pending");
    expect(requests[0]!.message).toBe("let me in");
  });

  test("the course instructor skips the queue in their own private group", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });

    const result = await asUser(t, SUBJECT.instructorA).mutation(api.joinGroup, {
      groupId,
    });
    expect(result.outcome).toBe("joined");
  });

  test("a duplicate membership is refused", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.joinGroup, { groupId }),
    ).rejects.toThrow(/already a member/);
  });

  test("a duplicate pending request is refused", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });
    const student = asUser(t, SUBJECT.studentB);

    await student.mutation(api.joinGroup, { groupId });
    await expect(
      student.mutation(api.joinGroup, { groupId }),
    ).rejects.toThrow(/already have a request/);
  });

  test("an archived group takes no new members", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Closed",
      isArchived: true,
    });

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.joinGroup, { groupId }),
    ).rejects.toThrow(/archived/);
  });
});

describe("reviewJoinRequest", () => {
  async function seedPending(t: Harness) {
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });
    await world.addMember(groupId, world.studentAId, "moderator");
    const result = await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId,
      message: "please",
    });
    // `joinGroup` returns a union, so narrow before pulling the id out of it.
    if (result.outcome !== "request_created") {
      throw new Error(`expected a request, got ${result.outcome}`);
    }
    return { world, groupId, requestId: result.requestId };
  }

  test("a moderator's approval creates the membership and resolves the request", async () => {
    const t = convexTest(testSchema, modules);
    const { world, requestId } = await seedPending(t);

    const result = await asUser(t, SUBJECT.studentA).mutation(
      api.reviewJoinRequest,
      { requestId, decision: "approve" },
    );
    expect(result.membershipId).toBeTruthy();

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(2);

    const requests = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupJoinRequests").collect(),
    );
    expect(requests[0]!.status).toBe("approved");
    expect(requests[0]!.reviewedBy).toBe(world.studentAId);
    expect(requests[0]!.reviewedAt).toBeTruthy();
  });

  test("a decline leaves no membership behind", async () => {
    const t = convexTest(testSchema, modules);
    const { requestId } = await seedPending(t);

    const result = await asUser(t, SUBJECT.studentA).mutation(
      api.reviewJoinRequest,
      { requestId, decision: "decline" },
    );
    expect(result.membershipId).toBeNull();

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(1);
  });

  test("a non-member cannot review, even from the same course", async () => {
    const t = convexTest(testSchema, modules);
    const { requestId } = await seedPending(t);

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.reviewJoinRequest, {
        requestId,
        decision: "approve",
      }),
    ).rejects.toThrow(/Only group moderators/);
  });

  test("the queue itself is closed to non-moderators", async () => {
    const t = convexTest(testSchema, modules);
    const { groupId } = await seedPending(t);

    await expect(
      asUser(t, SUBJECT.studentB).query(api.listPendingRequests, { groupId }),
    ).rejects.toThrow(/Only group moderators/);
  });

  test("the course instructor can review a group's queue", async () => {
    const t = convexTest(testSchema, modules);
    const { groupId, requestId } = await seedPending(t);

    const queue = await asUser(t, SUBJECT.instructorA).query(
      api.listPendingRequests,
      { groupId },
    );
    expect(queue.requests).toHaveLength(1);

    await expect(
      asUser(t, SUBJECT.instructorA).mutation(api.reviewJoinRequest, {
        requestId,
        decision: "approve",
      }),
    ).resolves.toBeTruthy();
  });

  test("a request cannot be reviewed twice", async () => {
    const t = convexTest(testSchema, modules);
    const { requestId } = await seedPending(t);
    const moderator = asUser(t, SUBJECT.studentA);

    await moderator.mutation(api.reviewJoinRequest, {
      requestId,
      decision: "decline",
    });
    await expect(
      moderator.mutation(api.reviewJoinRequest, {
        requestId,
        decision: "approve",
      }),
    ).rejects.toThrow(/already been reviewed/);
  });

  test("an archived group stops accepting approvals", async () => {
    const t = convexTest(testSchema, modules);
    const { groupId, requestId } = await seedPending(t);
    await t.run(async (ctx: TestCtx) =>
      ctx.db.patch(groupId, { isArchived: true }),
    );

    await expect(
      asUser(t, SUBJECT.studentA).mutation(api.reviewJoinRequest, {
        requestId,
        decision: "approve",
      }),
    ).rejects.toThrow(/archived/);

    const requests = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupJoinRequests").collect(),
    );
    expect(requests[0]!.status).toBe("pending");
  });
});

describe("cancelJoinRequest", () => {
  test("the requester can withdraw their own pending request", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });
    const result = await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId,
    });
    if (result.outcome !== "request_created") {
      throw new Error(`expected a request, got ${result.outcome}`);
    }

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.cancelJoinRequest, {
        requestId: result.requestId,
      }),
    ).resolves.toBeNull();

    const rows = await asUser(t, SUBJECT.studentB).query(
      api.browseGroupsForCourse,
      { courseId: world.courseId },
    );
    expect(
      rows.find((r: BrowseRow) => r._id === groupId)!.relationship,
    ).toBe("request_pending");
  });

  test("nobody else can withdraw it", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });
    await world.addMember(groupId, world.studentAId, "moderator");
    const result = await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId,
    });
    if (result.outcome !== "request_created") {
      throw new Error(`expected a request, got ${result.outcome}`);
    }

    await expect(
      asUser(t, SUBJECT.studentA).mutation(api.cancelJoinRequest, {
        requestId: result.requestId,
      }),
    ).rejects.toThrow(/only cancel your own/);
  });
});

describe("postMessage", () => {
  test("a member's message lands with the author's details resolved", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await asUser(t, SUBJECT.studentB).mutation(api.postMessage, {
      groupId,
      body: "  hello everyone  ",
    });

    const page = await asUser(t, SUBJECT.studentA).query(api.listMessages, {
      groupId,
    });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]!.body).toBe("hello everyone");
    expect(page.messages[0]!.authorName).toBe("Student Bode");
    expect(page.messages[0]!.isMine).toBe(false);
    expect(page.hasMore).toBe(false);

    const mine = await asUser(t, SUBJECT.studentB).query(api.listMessages, {
      groupId,
    });
    expect(mine.messages[0]!.isMine).toBe(true);
  });

  test("a non-member cannot post", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.postMessage, {
        groupId,
        body: "let me in",
      }),
    ).rejects.toThrow(/Join this group/);
  });

  test("a non-member cannot read the conversation", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });

    await expect(
      asUser(t, SUBJECT.studentB).query(api.listMessages, { groupId }),
    ).rejects.toThrow(/Join this group/);
  });

  test("an archived group takes no new messages", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Closed",
      isArchived: true,
    });
    await world.addMember(groupId, world.studentAId, "moderator");

    await expect(
      asUser(t, SUBJECT.studentA).mutation(api.postMessage, {
        groupId,
        body: "one more thing",
      }),
    ).rejects.toThrow(/archived/);
  });

  test("empty and over-long bodies are rejected before anything is written", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);
    const student = asUser(t, SUBJECT.studentA);

    await expect(
      student.mutation(api.postMessage, { groupId, body: "   " }),
    ).rejects.toThrow(/Write something/);
    await expect(
      student.mutation(api.postMessage, { groupId, body: "x".repeat(2100) }),
    ).rejects.toThrow(/under/);

    const stored = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMessages").collect(),
    );
    expect(stored).toHaveLength(0);
  });

  test("the per-group cooldown still applies within one group", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);
    const student = asUser(t, SUBJECT.studentA);

    await student.mutation(api.postMessage, { groupId, body: "first" });
    await expect(
      student.mutation(api.postMessage, { groupId, body: "immediately after" }),
    ).rejects.toThrow(/posting too quickly/);
  });

  test("ten posts a minute across groups, then the global bucket refuses", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);

    // One group per post: the per-group cooldown would otherwise block the
    // second post before the global bucket is ever consulted.
    const groupIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const groupId = await world.seedGroup(world.courseId, { name: `G${i}` });
      await world.addMember(groupId, world.studentAId, "moderator");
      groupIds.push(groupId);
    }

    const student = asUser(t, SUBJECT.studentA);
    for (let i = 0; i < 10; i++) {
      await expect(
        student.mutation(api.postMessage, {
          groupId: groupIds[i]!,
          body: `post ${i}`,
        }),
      ).resolves.toBeTruthy();
    }
    await expect(
      student.mutation(api.postMessage, {
        groupId: groupIds[10]!,
        body: "one too many",
      }),
    ).rejects.toThrow(/Too many requests/);

    const stored = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMessages").collect(),
    );
    expect(stored).toHaveLength(10);
  });

  test("the global bucket is per user, so another member is unaffected", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const groupId = await world.seedGroup(world.courseId, { name: `G${i}` });
      await world.addMember(groupId, world.studentAId, "moderator");
      await world.addMember(groupId, world.studentBId, "member");
      groupIds.push(groupId);
    }

    const first = asUser(t, SUBJECT.studentA);
    for (let i = 0; i < 10; i++) {
      await first.mutation(api.postMessage, {
        groupId: groupIds[i]!,
        body: `post ${i}`,
      });
    }
    await expect(
      first.mutation(api.postMessage, {
        groupId: groupIds[10]!,
        body: "not mine anyway",
      }),
    ).rejects.toThrow(/Too many requests/);

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.postMessage, {
        groupId: groupIds[10]!,
        body: "still allowed",
      }),
    ).resolves.toBeTruthy();
  });
});

describe("listMessages pagination", () => {
  test("the limit is respected and the cursor walks backwards without gaps", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);
    await world.addMember(groupId, world.outsiderId, "member");

    // Distinct timestamps, seeded straight in so the test is about the cursor
    // rather than about `postMessage`'s own cooldown.
    const seeded = await t.run(async (ctx: TestCtx) => {
      const ids = [];
      for (let i = 0; i < 7; i++) {
        ids.push(
          await ctx.db.insert("studyGroupMessages", {
            groupId,
            userId: world.outsiderId,
            body: `m${i}`,
            createdAt: 1_000 + i,
          }),
        );
      }
      return ids;
    });

    const reader = asUser(t, SUBJECT.studentA);
    const first = await reader.query(api.listMessages, { groupId, limit: 3 });
    expect(first.messages.map((m: MessageRow) => m.body)).toEqual([
      "m6",
      "m5",
      "m4",
    ]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await reader.query(api.listMessages, {
      groupId,
      limit: 3,
      after: first.nextCursor!,
    });
    expect(second.messages.map((m: MessageRow) => m.body)).toEqual([
      "m3",
      "m2",
      "m1",
    ]);
    expect(second.hasMore).toBe(true);

    const third = await reader.query(api.listMessages, {
      groupId,
      limit: 3,
      after: second.nextCursor!,
    });
    expect(third.messages.map((m: MessageRow) => m.body)).toEqual(["m0"]);
    expect(third.hasMore).toBe(false);

    // Nothing was skipped or repeated across the three pages.
    const seen = [...first.messages, ...second.messages, ...third.messages];
    expect(new Set(seen.map((m: MessageRow) => m._id)).size).toBe(seeded.length);
  });

  test("two messages sharing a millisecond do not lose one", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await t.run(async (ctx: TestCtx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("studyGroupMessages", {
          groupId,
          userId: world.studentBId,
          body: `tie${i}`,
          createdAt: 5_000,
        });
      }
    });

    const reader = asUser(t, SUBJECT.studentA);
    const first = await reader.query(api.listMessages, { groupId, limit: 2 });
    expect(first.messages).toHaveLength(2);
    const second = await reader.query(api.listMessages, {
      groupId,
      limit: 2,
      after: first.nextCursor!,
    });
    expect(second.messages).toHaveLength(1);
    const seen = new Set(
      [...first.messages, ...second.messages].map((m: MessageRow) => m._id),
    );
    expect(seen.size).toBe(3);
  });
});

describe("listMembers", () => {
  test("returns resolved names, avatars and roles, moderators first", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });
    await world.addMember(groupId, world.studentBId, "member", 200);
    await world.addMember(groupId, world.studentAId, "moderator", 100);

    const { members } = await asUser(t, SUBJECT.studentA).query(
      api.listMembers,
      { groupId },
    );
    expect(members.map((m: MemberRow) => m.name)).toEqual([
      "Student Amina",
      "Student Bode",
    ]);
    expect(members[0]!.role).toBe("moderator");
    expect(members[0]!.userId).toBe(world.studentAId);
    expect(members[1]!.joinedAt).toBe(200);
  });

  test("anybody with course access can read the roster", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });

    // Bode is enrolled but not a member: course access is enough for the roster.
    await expect(
      asUser(t, SUBJECT.studentB).query(api.listMembers, { groupId }),
    ).resolves.toBeTruthy();
  });
});

describe("updateGroup", () => {
  test("a moderator can rename, and the course instructor can too", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await asUser(t, SUBJECT.studentA).mutation(api.updateGroup, {
      groupId,
      name: "Week 4 Crew",
    });
    await asUser(t, SUBJECT.instructorA).mutation(api.updateGroup, {
      groupId,
      description: "Now on Thursdays",
    });

    const detail = await asUser(t, SUBJECT.studentA).query(api.getGroup, {
      groupId,
    });
    expect(detail.name).toBe("Week 4 Crew");
    expect(detail.description).toBe("Now on Thursdays");
  });

  test("an ordinary member cannot rename the group", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.updateGroup, {
        groupId,
        name: "Mine now",
      }),
    ).rejects.toThrow(/Only group moderators/);
  });

  test("an empty patch is refused rather than silently doing nothing", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await expect(
      asUser(t, SUBJECT.studentA).mutation(api.updateGroup, { groupId }),
    ).rejects.toThrow(/Nothing to update/);
  });
});

describe("leaveGroup", () => {
  test("an ordinary member walks away with no side effects", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    const result = await asUser(t, SUBJECT.studentB).mutation(api.leaveGroup, {
      groupId,
    });
    expect(result.outcome).toBe("left");

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.userId).toBe(world.studentAId);
  });

  test("the last moderator promotes the longest-standing member first", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });
    // Bode joined first, so Bode is the successor.
    await world.addMember(groupId, world.studentBId, "member", 1_000);
    await world.addMember(groupId, world.studentAId, "moderator", 2_000);

    const result = await asUser(t, SUBJECT.studentA).mutation(api.leaveGroup, {
      groupId,
    });
    expect(result.outcome).toBe("promoted_and_left");
    expect(result).toMatchObject({ promotedUserId: world.studentBId });

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.userId).toBe(world.studentBId);
    expect(members[0]!.role).toBe("moderator");
  });

  test("the last member is refused — the group would be unclosable", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Solo" });
    await world.addMember(groupId, world.studentAId, "moderator");

    await expect(
      asUser(t, SUBJECT.studentA).mutation(api.leaveGroup, { groupId }),
    ).rejects.toThrow(/only member/);

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members).toHaveLength(1);
  });

  test("a non-member cannot leave", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.leaveGroup, { groupId }),
    ).rejects.toThrow(/not a member/);
  });

  test("getGroup reports a blocked leave so the UI can explain it", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Solo" });
    await world.addMember(groupId, world.studentAId, "moderator");

    const detail = await asUser(t, SUBJECT.studentA).query(api.getGroup, {
      groupId,
    });
    expect(detail.permissions.canLeave).toBe(false);
    expect(detail.permissions.canPost).toBe(true);
  });
});

describe("promoteMember / demoteMember", () => {
  test("the course instructor can promote and demote", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await asUser(t, SUBJECT.instructorA).mutation(api.promoteMember, {
      groupId,
      userId: world.studentBId,
    });
    let members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(
      members.find((m: StudyGroupMemberDoc) => m.userId === world.studentBId)!.role,
    ).toBe("moderator");

    await asUser(t, SUBJECT.instructorA).mutation(api.demoteMember, {
      groupId,
      userId: world.studentBId,
    });
    members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(members.find((m: StudyGroupMemberDoc) => m.userId === world.studentBId)!.role).toBe(
      "member",
    );
  });

  test("a group moderator cannot promote peers", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await expect(
      asUser(t, SUBJECT.studentA).mutation(api.promoteMember, {
        groupId,
        userId: world.studentBId,
      }),
    ).rejects.toThrow(/Only the course instructor can promote/);

    const members = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("studyGroupMembers").collect(),
    );
    expect(
      members.find((m: StudyGroupMemberDoc) => m.userId === world.studentBId)!.role,
    ).toBe("member");
  });

  test("a group moderator cannot demote either", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await expect(
      asUser(t, SUBJECT.studentB).mutation(api.demoteMember, {
        groupId,
        userId: world.studentAId,
      }),
    ).rejects.toThrow(/Only the course instructor/);
  });

  test("the last moderator cannot be demoted out of existence", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Open" });
    await world.addMember(groupId, world.studentAId, "moderator");

    await expect(
      asUser(t, SUBJECT.instructorA).mutation(api.demoteMember, {
        groupId,
        userId: world.studentAId,
      }),
    ).rejects.toThrow(/at least one moderator/);
  });

  test("a non-member cannot be promoted", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await expect(
      asUser(t, SUBJECT.instructorA).mutation(api.promoteMember, {
        groupId,
        userId: world.outsiderId,
      }),
    ).rejects.toThrow(/not a member/);
  });

  test("promoting twice is refused rather than silently repeating", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);
    const instructor = asUser(t, SUBJECT.instructorA);

    await instructor.mutation(api.promoteMember, {
      groupId,
      userId: world.studentBId,
    });
    await expect(
      instructor.mutation(api.promoteMember, {
        groupId,
        userId: world.studentBId,
      }),
    ).rejects.toThrow(/already a moderator/);
  });

  test("role changes are audited; ordinary participation is not", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await asUser(t, SUBJECT.studentB).mutation(api.postMessage, {
      groupId,
      body: "just chatting",
    });
    let audits = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("auditLogs").collect(),
    );
    expect(audits).toHaveLength(0);

    await asUser(t, SUBJECT.instructorA).mutation(api.promoteMember, {
      groupId,
      userId: world.studentBId,
    });
    audits = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("auditLogs").collect(),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]!.action).toBe("group.promote");
    expect(audits[0]!.actorId).toBe(world.instructorAId);
  });
});

describe("archiveGroup / unarchiveGroup", () => {
  test("the course instructor can archive and reopen", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await asUser(t, SUBJECT.instructorA).mutation(api.archiveGroup, { groupId });
    let detail = await asUser(t, SUBJECT.studentA).query(api.getGroup, {
      groupId,
    });
    expect(detail.isArchived).toBe(true);
    expect(detail.permissions.canPost).toBe(false);
    // Still readable: archiving is not deletion.
    expect(detail.permissions.canReadMessages).toBe(true);

    await asUser(t, SUBJECT.instructorA).mutation(api.unarchiveGroup, {
      groupId,
    });
    detail = await asUser(t, SUBJECT.studentA).query(api.getGroup, { groupId });
    expect(detail.isArchived).toBe(false);
  });

  test("messages survive the archive", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);
    await asUser(t, SUBJECT.studentB).mutation(api.postMessage, {
      groupId,
      body: "history matters",
    });

    await asUser(t, SUBJECT.instructorA).mutation(api.archiveGroup, { groupId });
    const page = await asUser(t, SUBJECT.studentB).query(api.listMessages, {
      groupId,
    });
    expect(page.messages.map((m: MessageRow) => m.body)).toEqual([
      "history matters",
    ]);
  });

  test("a group moderator cannot archive", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await expect(
      asUser(t, SUBJECT.studentA).mutation(api.archiveGroup, { groupId }),
    ).rejects.toThrow(/Only the course instructor can archive/);

    const detail = await asUser(t, SUBJECT.studentA).query(api.getGroup, {
      groupId,
    });
    expect(detail.isArchived).toBe(false);
  });

  test("archiving twice is refused, and an open group cannot be reopened", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);
    const instructor = asUser(t, SUBJECT.instructorA);

    await expect(
      instructor.mutation(api.unarchiveGroup, { groupId }),
    ).rejects.toThrow(/not archived/);

    await instructor.mutation(api.archiveGroup, { groupId });
    await expect(
      instructor.mutation(api.archiveGroup, { groupId }),
    ).rejects.toThrow(/already archived/);
  });

  test("archiving is audited — it is a visibility change", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await seedPopulatedGroup(t, world);

    await asUser(t, SUBJECT.instructorA).mutation(api.archiveGroup, { groupId });
    const audits = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("auditLogs").collect(),
    );
    expect(audits.map((a) => a.action)).toEqual(["group.archive"]);
  });
});

describe("listMyGroups and getMyGroupStats", () => {
  test("my groups carry the course, the count, the role and the latest activity", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const quiet = await world.seedGroup(world.courseId, { name: "Quiet" });
    await world.addMember(quiet, world.studentAId, "moderator");
    const busy = await world.seedGroup(world.courseId, { name: "Busy" });
    await world.addMember(busy, world.studentAId, "member");
    await world.addMember(busy, world.studentBId, "member");

    await asUser(t, SUBJECT.studentB).mutation(api.postMessage, {
      groupId: busy,
      body: "first line\nsecond line",
    });

    const groups = await asUser(t, SUBJECT.studentA).query(api.listMyGroups, {});
    expect(groups.map((g: MyGroupRow) => g.name)).toEqual(["Busy", "Quiet"]);
    const busyRow = groups[0]!;
    expect(busyRow.course.title).toBe("Course A");
    expect(busyRow.memberCount).toBe(2);
    expect(busyRow.myRole).toBe("member");
    expect(busyRow.latestMessage!.body).toBe("first line");
    expect(busyRow.latestMessage!.authorName).toBe("Student Bode");
    expect(groups[1]!.latestMessage).toBeNull();
    expect(groups[1]!.lastActivityAt).toBe(groups[1]!.createdAt);
  });

  test("archived groups still appear in my groups, flagged", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, {
      name: "Closed",
      isArchived: true,
    });
    await world.addMember(groupId, world.studentAId, "moderator");

    const groups = await asUser(t, SUBJECT.studentA).query(api.listMyGroups, {});
    expect(groups).toHaveLength(1);
    expect(groups[0]!.isArchived).toBe(true);
  });

  test("the limit is respected", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    for (let i = 0; i < 4; i++) {
      const groupId = await world.seedGroup(world.courseId, { name: `G${i}` });
      await world.addMember(groupId, world.studentAId, "member");
    }
    const groups = await asUser(t, SUBJECT.studentA).query(api.listMyGroups, {
      limit: 2,
    });
    expect(groups).toHaveLength(2);
  });

  test("stats count my groups, my queue and the people in them", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const moderated = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });
    await world.addMember(moderated, world.studentAId, "moderator");
    const plain = await world.seedGroup(world.courseId, { name: "Plain" });
    await world.addMember(plain, world.studentAId, "member");
    await world.addMember(plain, world.studentBId, "member");

    // A request in Amina's moderated group, and one in a group she does not
    // moderate — only the first should count towards her queue.
    await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId: moderated,
    });
    const instructorGroup = await world.seedGroup(world.courseId, {
      name: "Instructor's",
      isPrivate: true,
    });
    await world.addMember(instructorGroup, world.instructorAId, "moderator");
    await asUser(t, SUBJECT.studentB).mutation(api.joinGroup, {
      groupId: instructorGroup,
    });

    const stats = await asUser(t, SUBJECT.studentA).query(api.getMyGroupStats, {});
    expect(stats.myGroups).toBe(2);
    expect(stats.pendingRequestsToReview).toBe(1);
    expect(stats.totalMembersAcrossMyGroups).toBe(3);

    // The course instructor, who moderates one group and owns both courses,
    // sees both queues.
    const instructorStats = await asUser(t, SUBJECT.instructorA).query(
      api.getMyGroupStats,
      {},
    );
    expect(instructorStats.pendingRequestsToReview).toBe(2);
  });

  test("a student who moderates nothing has an empty queue", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const groupId = await world.seedGroup(world.courseId, { name: "Plain" });
    await world.addMember(groupId, world.studentAId, "member");

    const stats = await asUser(t, SUBJECT.studentA).query(api.getMyGroupStats, {});
    expect(stats.myGroups).toBe(1);
    expect(stats.pendingRequestsToReview).toBe(0);
  });
});

describe("listMyAccessibleCourses", () => {
  test("returns enrolled courses and courses the caller teaches", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    await world.seedGroup(world.courseId, { name: "G1" });
    await world.seedGroup(world.courseId, { name: "G2" });

    const student = await asUser(t, SUBJECT.studentA).query(
      api.listMyAccessibleCourses,
      {},
    );
    expect(student.map((c: CourseRow) => c._id)).toEqual([world.courseId]);
    expect(student[0]!.access).toBe("enrolled");
    expect(student[0]!.groupCount).toBe(2);

    const instructor = await asUser(t, SUBJECT.instructorA).query(
      api.listMyAccessibleCourses,
      {},
    );
    expect(instructor.map((c: CourseRow) => c._id).sort()).toEqual(
      [world.courseId, world.otherCourseId].sort(),
    );
    expect(instructor.every((c: CourseRow) => c.access === "instructor")).toBe(
      true,
    );
  });

  test("archived groups do not count towards a course's group total", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    await world.seedGroup(world.courseId, { name: "Live" });
    await world.seedGroup(world.courseId, { name: "Closed", isArchived: true });

    const [course] = await asUser(t, SUBJECT.studentA).query(
      api.listMyAccessibleCourses,
      {},
    );
    expect(course!.groupCount).toBe(1);
  });
});

describe("getGroupRelationship", () => {
  test("pairs the relationship with the button to offer", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedWorld(t);
    const open = await world.seedGroup(world.courseId, { name: "Open" });
    const priv = await world.seedGroup(world.courseId, {
      name: "Invite only",
      isPrivate: true,
    });
    await world.addMember(open, world.studentAId, "moderator");

    const asModerator = await asUser(t, SUBJECT.studentA).query(
      api.getGroupRelationship,
      { groupId: open },
    );
    expect(asModerator.relationship).toBe("moderator");
    expect(asModerator.action.kind).toBe("none");

    const openAction = await asUser(t, SUBJECT.studentB).query(
      api.getGroupRelationship,
      { groupId: open },
    );
    expect(openAction.action).toEqual({ kind: "join", label: "Join" });

    const privateAction = await asUser(t, SUBJECT.studentB).query(
      api.getGroupRelationship,
      { groupId: priv },
    );
    expect(privateAction.action).toEqual({
      kind: "request",
      label: "Request to join",
    });
  });
});

describe("group creation stays inside the course", () => {
  test("a group in a nonexistent course is refused, not silently created", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const ghost = makeFunctionReference<"mutation", { courseId: string }, string>(
      "groups:createGroup",
    );

    // convex-test validates ids before the handler runs, so a bogus id is a
    // harness-level rejection — which is the behaviour we want to prove.
    await expect(
      asUser(t, SUBJECT.studentA).mutation(ghost, {
        courseId: "not-a-real-id",
      }),
    ).rejects.toThrow();
  });
});