import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import type {
  GenericSchema,
  SchemaDefinition,
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
} from "convex/server";

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

const as = (t: TestConvex<typeof testSchema>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

type World = Awaited<ReturnType<typeof seedWorld>>;

/**
 * `published: true` on every seeded course — the scam this suite covers is
 * only reachable from a live listing.
 */
async function seedWorld(t: TestConvex<typeof testSchema>) {
  const now = Date.now();

  const adminId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  const instructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const otherInstructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_other_instructor",
      email: "other@test.com",
      name: "Other",
      role: "instructor",
      createdAt: now,
    }),
  );

  const studentId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      role: "student",
      createdAt: now,
    }),
  );

  const paidCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Sold Course",
      slug: "sold-course",
      description: "Already has a buyer",
      instructorId,
      published: true,
      price: 50000,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    }),
  );

  const unsoldPaidCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Unsold Paid Course",
      slug: "unsold-paid-course",
      description: "Nobody has bought it",
      instructorId,
      published: true,
      price: 50000,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    }),
  );

  const freeCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Free Course",
      slug: "free-course",
      description: "Costs nothing",
      instructorId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const otherCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Someone Else's Course",
      slug: "someone-elses-course",
      description: "Not yours",
      instructorId: otherInstructorId,
      published: true,
      price: 50000,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    }),
  );

  return {
    adminId,
    instructorId,
    otherInstructorId,
    studentId,
    paidCourseId,
    unsoldPaidCourseId,
    freeCourseId,
    otherCourseId,
  };
}

async function seedPurchase(
  t: TestConvex<typeof testSchema>,
  {
    userId,
    courseId,
    status = "paid",
  }: {
    userId: Id<"users">;
    courseId: Id<"courses">;
    status?: "pending" | "paid" | "failed";
  },
) {
  return await t.run((ctx: TestCtx) =>
    ctx.db.insert("purchases", {
      userId,
      courseId,
      paystackReference: `ref-${userId}-${status}-${Math.random()}`,
      amount: 50000,
      currency: "NGN",
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

const published = (t: TestConvex<typeof testSchema>, courseId: Id<"courses">) =>
  t.run(async (ctx: TestCtx) => {
    const course = await ctx.db.get(courseId);
    return course?.published;
  });

const requests = (t: TestConvex<typeof testSchema>) =>
  t.run((ctx: TestCtx) => ctx.db.query("courseUnpublishRequests").collect());

const auditRows = (t: TestConvex<typeof testSchema>) =>
  t.run((ctx: TestCtx) => ctx.db.query("auditLogs").collect());

describe("unpublishing a course learners already paid for", () => {
  test("the owning instructor is refused and the course stays live", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    await expect(
      as(t, "clerk_instructor").mutation(api.courses.unpublishCourse, {
        courseId: world.paidCourseId,
      }),
    ).rejects.toThrow(/already paid for this course/);

    // The whole point: the listing is still there and no request was conjured
    // up on the instructor's behalf.
    expect(await published(t, world.paidCourseId)).toBe(true);
    expect(await requests(t)).toHaveLength(0);
  });

  test("a pending checkout does not gate it — no money has changed hands", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, {
      userId: world.studentId,
      courseId: world.paidCourseId,
      status: "pending",
    });

    await as(t, "clerk_instructor").mutation(api.courses.unpublishCourse, {
      courseId: world.paidCourseId,
    });

    expect(await published(t, world.paidCourseId)).toBe(false);
  });

  test("updateCourse has no published argument, so metadata edits cannot unpublish", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    // The validator rejects the extra field rather than ignoring it, so there
    // is no way to sneak the flag through a partial edit.
    await expect(
      as(t, "clerk_instructor").mutation(api.courses.updateCourse, {
        courseId: world.paidCourseId,
        title: "Renamed",
        // @ts-expect-error — `published` was deliberately removed from the args
        published: false,
      }),
    ).rejects.toThrow();

    // A legitimate edit still works and still leaves it published.
    await as(t, "clerk_instructor").mutation(api.courses.updateCourse, {
      courseId: world.paidCourseId,
      title: "Renamed",
    });
    const course = await t.run((ctx: TestCtx) => ctx.db.get(world.paidCourseId));
    expect(course?.title).toBe("Renamed");
    expect(course?.published).toBe(true);
  });

  test("a free course and an unsold paid course are unpublishable directly", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    await instructor.mutation(api.courses.unpublishCourse, {
      courseId: world.freeCourseId,
    });
    await instructor.mutation(api.courses.unpublishCourse, {
      courseId: world.unsoldPaidCourseId,
    });

    expect(await published(t, world.freeCourseId)).toBe(false);
    expect(await published(t, world.unsoldPaidCourseId)).toBe(false);
    expect(await requests(t)).toHaveLength(0);
  });

  test("an admin may unpublish directly, and it is audited", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    await as(t, "clerk_admin").mutation(api.courses.unpublishCourse, {
      courseId: world.paidCourseId,
    });

    expect(await published(t, world.paidCourseId)).toBe(false);

    const rows = await auditRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("course.unpublish");
    expect(rows[0].actorId).toBe(world.adminId);
    expect(rows[0].targetId).toBe(world.paidCourseId);
    expect(JSON.parse(rows[0].details!)).toEqual({
      paidSales: 1,
      price: 50000,
      direct: true,
    });
  });

  test("unpublishing a free course is self-service and leaves no audit row", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);

    await as(t, "clerk_instructor").mutation(api.courses.unpublishCourse, {
      courseId: world.freeCourseId,
    });

    // Otherwise every draft toggle would bury the rows that matter.
    expect(await auditRows(t)).toHaveLength(0);
  });

  test("an instructor cannot unpublish or republish someone else's course", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    await expect(
      instructor.mutation(api.courses.unpublishCourse, {
        courseId: world.otherCourseId,
      }),
    ).rejects.toThrow(/Not authorized to unpublish/);

    await expect(
      instructor.mutation(api.courses.publishCourse, {
        courseId: world.otherCourseId,
      }),
    ).rejects.toThrow(/Not authorized to publish/);

    await expect(
      instructor.mutation(api.courses.requestUnpublish, {
        courseId: world.otherCourseId,
      }),
    ).rejects.toThrow(/Not authorized to request/);

    expect(await published(t, world.otherCourseId)).toBe(true);
  });

  test("students cannot publish, unpublish or request", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    const student = as(t, "clerk_student");

    await expect(
      student.mutation(api.courses.publishCourse, { courseId: world.paidCourseId }),
    ).rejects.toThrow(/Not authorized/);
    await expect(
      student.mutation(api.courses.unpublishCourse, { courseId: world.paidCourseId }),
    ).rejects.toThrow(/Not authorized/);
    await expect(
      student.mutation(api.courses.requestUnpublish, { courseId: world.paidCourseId }),
    ).rejects.toThrow(/Not authorized/);
    await expect(
      student.query(api.courses.getCoursePublishingState, {
        courseId: world.paidCourseId,
      }),
    ).rejects.toThrow(/Not authorized/);
  });
});

describe("the unpublish request workflow", () => {
  test("an approved request is what takes the course down", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });
    const instructor = as(t, "clerk_instructor");

    const requestId = await instructor.mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
      reason: "  Re-recording modules 3-5 with corrected audio.  ",
    });

    // Requesting is not unpublishing.
    expect(await published(t, world.paidCourseId)).toBe(true);

    await as(t, "clerk_admin").mutation(api.courses.reviewUnpublishRequest, {
      requestId,
      decision: "approved",
      reviewNote: "Confirmed with the instructor",
    });

    expect(await published(t, world.paidCourseId)).toBe(false);

    const [row] = await requests(t);
    expect(row.status).toBe("approved");
    // Trimmed, not stored with the stray whitespace the form sent.
    expect(row.reason).toBe("Re-recording modules 3-5 with corrected audio.");
    expect(row.reviewedBy).toBe(world.adminId);

    const logs = await auditRows(t);
    expect(logs.map((l) => l.action)).toEqual([
      "course_unpublish_request.review",
    ]);
    expect(JSON.parse(logs[0].details!)).toMatchObject({
      decision: "approved",
      courseId: world.paidCourseId,
      requestedBy: world.instructorId,
      paidSales: 1,
      courseTitle: "Sold Course",
      note: "Confirmed with the instructor",
    });
  });

  test("a rejected request leaves the course selling and no audit row is faked", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    const requestId = await as(t, "clerk_instructor").mutation(
      api.courses.requestUnpublish,
      { courseId: world.paidCourseId, reason: "Taking a break" },
    );

    await as(t, "clerk_admin").mutation(api.courses.reviewUnpublishRequest, {
      requestId,
      decision: "rejected",
      reviewNote: "Buyers would lose access to paid content",
    });

    expect(await published(t, world.paidCourseId)).toBe(true);
    const [row] = await requests(t);
    expect(row.status).toBe("rejected");
    // The rejection is on the record even though nothing about the course
    // changed — the instructor escalated rather than pulling it silently.
    expect((await auditRows(t)).map((l) => l.action)).toEqual([
      "course_unpublish_request.review",
    ]);
  });

  test("a request cannot be submitted twice, or reviewed twice", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });
    const instructor = as(t, "clerk_instructor");

    await instructor.mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
    });
    await expect(
      instructor.mutation(api.courses.requestUnpublish, {
        courseId: world.paidCourseId,
      }),
    ).rejects.toThrow(/already have a pending request/);

    const [pending] = await requests(t);
    await as(t, "clerk_admin").mutation(api.courses.reviewUnpublishRequest, {
      requestId: pending._id,
      decision: "rejected",
    });
    await expect(
      as(t, "clerk_admin").mutation(api.courses.reviewUnpublishRequest, {
        requestId: pending._id,
        decision: "approved",
      }),
    ).rejects.toThrow(/already been reviewed/);

    // Still only one row, and it is the one that was decided.
    expect(await requests(t)).toHaveLength(1);
  });

  test("only an admin may review a request", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    const requestId = await as(t, "clerk_instructor").mutation(
      api.courses.requestUnpublish,
      { courseId: world.paidCourseId },
    );

    await expect(
      as(t, "clerk_instructor").mutation(api.courses.reviewUnpublishRequest, {
        requestId,
        decision: "approved",
      }),
    ).rejects.toThrow(/admin access required/);

    await expect(
      as(t, "clerk_student").mutation(api.courses.reviewUnpublishRequest, {
        requestId,
        decision: "approved",
      }),
    ).rejects.toThrow(/admin access required/);

    await expect(
      t.mutation(api.courses.reviewUnpublishRequest, {
        requestId,
        decision: "approved",
      }),
    ).rejects.toThrow(/Not authenticated/);

    expect(await published(t, world.paidCourseId)).toBe(true);
  });

  test("an ungated course cannot be sent for review", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    await expect(
      instructor.mutation(api.courses.requestUnpublish, {
        courseId: world.freeCourseId,
      }),
    ).rejects.toThrow(/can unpublish it directly/);

    await expect(
      instructor.mutation(api.courses.requestUnpublish, {
        courseId: world.unsoldPaidCourseId,
      }),
    ).rejects.toThrow(/can unpublish it directly/);

    expect(await requests(t)).toHaveLength(0);
  });

  test("an unpublished course has nothing to request", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });
    await as(t, "clerk_admin").mutation(api.courses.unpublishCourse, {
      courseId: world.paidCourseId,
    });

    await expect(
      as(t, "clerk_instructor").mutation(api.courses.requestUnpublish, {
        courseId: world.paidCourseId,
      }),
    ).rejects.toThrow(/already unpublished/);
  });

  test("withdrawing a request closes it and frees the course to be requested again", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });
    const instructor = as(t, "clerk_instructor");

    await instructor.mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
    });
    await instructor.mutation(api.courses.withdrawUnpublishRequest, {
      courseId: world.paidCourseId,
    });

    const [withdrawn] = await requests(t);
    expect(withdrawn.status).toBe("rejected");
    expect(withdrawn.reviewNote).toMatch(/withdrawn/i);
    expect(await published(t, world.paidCourseId)).toBe(true);

    // And it can be asked again after the dust settles.
    await instructor.mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
    });
    expect(await requests(t)).toHaveLength(2);
  });

  test("withdrawing only works on your own course, and only while pending", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    await expect(
      as(t, "clerk_instructor").mutation(api.courses.withdrawUnpublishRequest, {
        courseId: world.paidCourseId,
      }),
    ).rejects.toThrow(/no pending request/);

    await expect(
      as(t, "clerk_instructor").mutation(api.courses.withdrawUnpublishRequest, {
        courseId: world.otherCourseId,
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  test("republishing resolves a request the admin bypassed instead of leaving it in the queue", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });
    const instructor = as(t, "clerk_instructor");

    await instructor.mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
      reason: "Wrong price shown on the listing",
    });

    // An admin answering a support ticket can pull the course without touching
    // the request — which is how a request ends up pending on a course that is
    // already off sale.
    await as(t, "clerk_admin").mutation(api.courses.unpublishCourse, {
      courseId: world.paidCourseId,
    });
    expect((await requests(t))[0].status).toBe("pending");

    // Republishing answers that request: there is nothing left for an admin to
    // decide, and leaving it queued would only produce a review of a decision
    // that has already been made.
    await instructor.mutation(api.courses.publishCourse, {
      courseId: world.paidCourseId,
    });

    expect(await published(t, world.paidCourseId)).toBe(true);
    const [row] = await requests(t);
    expect(row.status).toBe("rejected");
    expect(row.reviewNote).toMatch(/republished/i);
  });
});

describe("reads for the publishing UI", () => {
  test("the state query reports the policy and the live request", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });
    const instructor = as(t, "clerk_instructor");

    const before = await instructor.query(api.courses.getCoursePublishingState, {
      courseId: world.paidCourseId,
    });
    expect(before).toMatchObject({
      published: true,
      paidSales: 1,
      policy: "needs_approval",
      isAdmin: false,
      pendingRequest: null,
    });

    await instructor.mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
      reason: "Correcting an error",
    });

    const after = await instructor.query(api.courses.getCoursePublishingState, {
      courseId: world.paidCourseId,
    });
    expect(after.pendingRequest?.reason).toBe("Correcting an error");
    // Publishing is ungated, so the policy never changes with it.
    expect(after.policy).toBe("needs_approval");
  });

  test("free and unsold courses report policies that need no request", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    const instructor = as(t, "clerk_instructor");

    expect(
      await instructor.query(api.courses.getCoursePublishingState, {
        courseId: world.freeCourseId,
      }),
    ).toMatchObject({ policy: "free", paidSales: 0 });

    expect(
      await instructor.query(api.courses.getCoursePublishingState, {
        courseId: world.unsoldPaidCourseId,
      }),
    ).toMatchObject({ policy: "paid_unsold", paidSales: 0 });
  });

  test("the review queue is admin-only and joins the course, requester and sale count", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });
    await as(t, "clerk_instructor").mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
      reason: "Out of date",
    });

    await expect(
      t.query(api.courses.listUnpublishRequests, {}),
    ).rejects.toThrow(/Not authenticated/);
    await expect(
      as(t, "clerk_instructor").query(api.courses.listUnpublishRequests, {}),
    ).rejects.toThrow(/admin access required/);

    const rows = await as(t, "clerk_admin").query(api.courses.listUnpublishRequests, {
      status: "pending",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending",
      reason: "Out of date",
      paidSales: 1,
      course: {
        title: "Sold Course",
        slug: "sold-course",
        published: true,
        price: 50000,
      },
      requester: { name: "Instructor", email: "instructor@test.com" },
    });

    // Once reviewed it leaves the pending filter but not the audit record.
    await as(t, "clerk_admin").mutation(api.courses.reviewUnpublishRequest, {
      requestId: rows[0]._id,
      decision: "approved",
    });
    expect(
      await as(t, "clerk_admin").query(api.courses.listUnpublishRequests, {
        status: "pending",
      }),
    ).toHaveLength(0);
    expect(
      await as(t, "clerk_admin").query(api.courses.listUnpublishRequests, {
        status: "approved",
      }),
    ).toHaveLength(1);
  });
});

describe("buyers are not punished by any of this", () => {
  test("unpublishing keeps existing enrollments and access intact", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    // The webhook's fulfilment path.
    await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId: world.studentId,
        courseId: world.paidCourseId,
        progressPercent: 40,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await as(t, "clerk_admin").mutation(api.courses.unpublishCourse, {
      courseId: world.paidCourseId,
    });

    // Access is keyed on the enrollment, not on `published` — so a buyer keeps
    // the course they paid for even after the listing comes down.
    expect(
      await as(t, "clerk_student").query(api.payments.hasAccessToCourse, {
        courseId: world.paidCourseId,
      }),
    ).toBe(true);
    expect(
      await t.run(async (ctx: TestCtx) =>
        (await ctx.db.get(world.paidCourseId))?.published,
      ),
    ).toBe(false);
  });

  test("a newly sold course cannot be bought again once it is off sale", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await as(t, "clerk_admin").mutation(api.courses.unpublishCourse, {
      courseId: world.paidCourseId,
    });

    await expect(
      as(t, "clerk_student").mutation(api.payments.createPendingPurchase, {
        courseId: world.paidCourseId,
      }),
    ).rejects.toThrow(/Course not found/);
  });
});
describe("the unpublish queue badge", () => {
  // The sidebar renders this number on every admin page, so it has to be
  // cheap, admin-only, and honest about the difference between "nothing
  // pending" (0) and "not loaded yet" (undefined) — the first shows no badge,
  // the second shows the same thing, but only one of them is a real answer.

  const queueRequest = (
    t: TestConvex<typeof testSchema>,
    courseId: Id<"courses">,
    requestedBy: Id<"users">,
  ) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("courseUnpublishRequests", {
        courseId,
        requestedBy,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

  test("counts pending requests and ignores decided ones", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);

    await queueRequest(t, world.paidCourseId, world.instructorId);
    await queueRequest(t, world.paidCourseId, world.instructorId);

    const second = await queueRequest(t, world.paidCourseId, world.instructorId);
    await t.run(async (ctx: TestCtx) =>
      ctx.db.patch(second, { status: "rejected", updatedAt: Date.now() }),
    );

    const count = await as(t, "clerk_admin").query(
      api.courses.countPendingUnpublishRequests,
      {},
    );
    expect(count).toBe(2);
  });

  test("is 0, not undefined, on an empty queue", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const count = await as(t, "clerk_admin").query(
      api.courses.countPendingUnpublishRequests,
      {},
    );
    expect(count).toBe(0);
  });

  test("an approved request leaves the queue", async () => {
    const t = convexTest(testSchema, modules);
    const world: World = await seedWorld(t);
    await seedPurchase(t, { userId: world.studentId, courseId: world.paidCourseId });

    await as(t, "clerk_instructor").mutation(api.courses.requestUnpublish, {
      courseId: world.paidCourseId,
      reason: "Correcting an error",
    });

    const before = await as(t, "clerk_admin").query(
      api.courses.countPendingUnpublishRequests,
      {},
    );
    expect(before).toBe(1);

    const [request] = await requests(t);
    await as(t, "clerk_admin").mutation(api.courses.reviewUnpublishRequest, {
      requestId: request._id,
      decision: "approved",
    });

    const after = await as(t, "clerk_admin").query(
      api.courses.countPendingUnpublishRequests,
      {},
    );
    expect(after).toBe(0);
  });

  test("refuses a non-admin, so a student cannot poll the queue", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_student").query(api.courses.countPendingUnpublishRequests, {}),
    ).rejects.toThrow(/admin access required/i);

    await expect(
      as(t, "clerk_instructor").query(
        api.courses.countPendingUnpublishRequests,
        {},
      ),
    ).rejects.toThrow(/admin access required/i);
  });

  test("refuses a signed-out caller", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      t.query(api.courses.countPendingUnpublishRequests, {}),
    ).rejects.toThrow(/Not authenticated/i);
  });
});
