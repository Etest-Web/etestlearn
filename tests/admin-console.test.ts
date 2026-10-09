import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../convex/_generated/api";
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

async function seedWorld(t: any) {
  const now = Date.now();

  const adminId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  const instructorId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const studentId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      role: "student",
      createdAt: now,
    }),
  );

  const courseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Draft Course",
      slug: "draft-course",
      description: "Not live yet",
      instructorId,
      published: false,
      searchText: "Draft Course Not live yet",
      createdAt: now,
      updatedAt: now,
    }),
  );

  return { adminId, instructorId, studentId, courseId };
}

describe("admin console security", () => {
  test("non-admins are refused on every admin surface", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, studentId } = await seedWorld(t);

    await expect(
      as(t, "clerk_student").query(api.admin.getPlatformOverview, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.admin.getEngagementStats, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.admin.exportPurchases, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.admin.exportUsers, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.admin.exportEnrollments, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").mutation(api.admin.suspendUser, {
        userId: studentId,
      }),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").mutation(api.admin.bulkSetRoles, {
        assignments: [],
      }),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.courses.adminListCourses, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").mutation(api.courses.setFeatured, {
        courseId,
        featured: true,
      }),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.courses.listPublishReviewRequests, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.discussions.adminListThreads, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.payments.adminListPurchases, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").query(api.announcements.listAll, {}),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").mutation(api.announcements.create, {
        title: "Hi",
        body: "Body",
      }),
    ).rejects.toThrow(/admin access required/);
    await expect(
      as(t, "clerk_student").mutation(api.categories.create, { name: "X" }),
    ).rejects.toThrow(/admin access required/);

    // Instructors are staff but not admins either.
    await expect(
      as(t, "clerk_instructor").query(api.admin.getPlatformOverview, {}),
    ).rejects.toThrow(/admin access required/);
  });

  test("suspension reads as signed out across the shared helpers", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId, studentId, courseId } = await seedWorld(t);

    await as(t, "clerk_admin").mutation(api.admin.suspendUser, {
      userId: studentId,
      reason: "spam",
    });

    // Enrolled student can no longer act: getCurrentUser is the choke point.
    const studentUser = await as(t, "clerk_student").query(api.users.getCurrentUser, {});
    expect(studentUser).toBeNull();

    // And a suspended admin loses the console too. Self-suspension is blocked,
    // so this uses a second admin to suspend the first.
    const secondAdmin = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_admin2",
        email: "admin2@test.com",
        name: "Admin Two",
        role: "admin",
        createdAt: Date.now(),
      }),
    );
    await as(t, "clerk_admin2").mutation(api.admin.suspendUser, {
      userId: adminId,
    });
    await expect(
      as(t, "clerk_admin").query(api.admin.getPlatformOverview, {}),
    ).rejects.toThrow();

    // Reinstate and everything returns.
    await as(t, "clerk_admin2").mutation(api.admin.unsuspendUser, {
      userId: studentId,
    });
    const restored = await as(t, "clerk_student").query(
      api.users.getCurrentUser,
      {},
    );
    expect(restored?._id).toBeTypeOf("string");

    // Admin cannot suspend themselves.
    await expect(
      as(t, "clerk_admin2").mutation(api.admin.suspendUser, {
        userId: secondAdmin,
      }),
    ).rejects.toThrow(/own account/);

    void courseId;
  });

  test("suspension and role changes are audited", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    await as(t, "clerk_admin").mutation(api.admin.suspendUser, {
      userId: studentId,
    });

    const logs = await as(t, "clerk_admin").query(api.auditLogs.listAuditLogs, {
      action: "user.suspend",
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("user.suspend");
  });

  test("bulk role change skips the self-demote row and audits the rest", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId, studentId } = await seedWorld(t);

    const result = await as(t, "clerk_admin").mutation(api.admin.bulkSetRoles, {
      assignments: [
        { userId: studentId, role: "instructor" },
        { userId: adminId, role: "student" }, // self-demote: skipped, not fatal
      ],
    });
    expect(result.changed).toBe(1);

    const role = await t.run(
      async (ctx: TestCtx) => (await ctx.db.get(studentId) as unknown as { role: string }).role,
    );
    expect(role).toBe("instructor");

    const logs = await as(t, "clerk_admin").query(api.auditLogs.listAuditLogs, {
      action: "user.set_role",
    });
    expect(logs).toHaveLength(1);
    expect((logs[0].details as { bulk?: boolean }).bulk).toBe(true);
  });

  test("publish review queue: approve publishes, reject leaves draft", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    // Only the course's instructor (or admin) may request review.
    const requestId = await as(t, "clerk_instructor").mutation(
      api.courses.requestPublishReview,
      { courseId, note: "First course, please check" },
    );

    // Duplicate pending request is refused.
    await expect(
      as(t, "clerk_instructor").mutation(api.courses.requestPublishReview, {
        courseId,
      }),
    ).rejects.toThrow(/already pending/);

    const queue = await as(t, "clerk_admin").query(
      api.courses.listPublishReviewRequests,
      {},
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].courseTitle).toBe("Draft Course");

    // Rejection leaves the course unpublished and records the note.
    await as(t, "clerk_admin").mutation(api.courses.reviewPublishRequest, {
      requestId,
      decision: "rejected",
      reviewNote: "Add more lessons",
    });
    let course = await t.run(
      async (ctx: TestCtx) =>
        (await ctx.db.get(courseId)) as unknown as { published: boolean } | null,
    );
    expect(course!.published).toBe(false);

    // A second request can now be approved, which publishes.
    const secondId = await as(t, "clerk_instructor").mutation(
      api.courses.requestPublishReview,
      { courseId },
    );
    await as(t, "clerk_admin").mutation(api.courses.reviewPublishRequest, {
      requestId: secondId,
      decision: "approved",
    });
    course = await t.run(
      async (ctx: TestCtx) =>
        (await ctx.db.get(courseId)) as unknown as { published: boolean } | null,
    );
    expect(course!.published).toBe(true);
  });

  test("featured courses sort first in the public catalog", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const now = Date.now();
    const plainId = await t.run(async (ctx: TestCtx) => {
      const anyUser = await ctx.db.query("users").first();
      return ctx.db.insert("courses", {
        title: "Plain Course",
        slug: "plain-course",
        description: "Ordinary",
        instructorId: anyUser!._id,
        published: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(plainId, { featured: true });
    });

    const listed = await as(t, "clerk_admin").query(
      api.courses.listPublishedCourses,
      {},
    ) as unknown as Array<{ _id: string; featured?: boolean }>;
    expect(listed[0]._id).toBe(plainId);
    expect(listed[0].featured).toBe(true);
  });

  test("discussion moderation: lock refuses posts, delete removes thread and messages", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, courseId } = await seedWorld(t);

    // The student must be enrolled to post.
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("enrollments", {
        userId: studentId,
        courseId,
        progressPercent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const threadId = await as(t, "clerk_student").mutation(
      api.discussions.createThread,
      { courseId, title: "Spam thread" },
    );
    const messageId = await as(t, "clerk_student").mutation(
      api.discussions.postMessage,
      { threadId, body: "Buy my course!!!" },
    );

    await as(t, "clerk_admin").mutation(api.discussions.adminSetThreadLocked, {
      threadId,
      locked: true,
    });
    await expect(
      as(t, "clerk_student").mutation(api.discussions.postMessage, {
        threadId,
        body: "still going",
      }),
    ).rejects.toThrow(/locked/);

    await as(t, "clerk_admin").mutation(api.discussions.adminDeleteThread, {
      threadId,
    });
    const remaining = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("discussionMessages").collect(),
    );
    expect(remaining.map((m: { _id: string }) => m._id)).not.toContain(messageId);
    void messageId;
  });

  test("refund annotation only applies to paid purchases", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, courseId } = await seedWorld(t);

    const purchaseId = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("purchases", {
        userId: studentId,
        courseId,
        paystackReference: "test-ref-1",
        amount: 50000,
        currency: "NGN",
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      as(t, "clerk_admin").mutation(api.payments.markRefunded, { purchaseId }),
    ).rejects.toThrow(/Only paid purchases/);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(purchaseId, { status: "paid", paidAt: Date.now() });
    });

    await as(t, "clerk_admin").mutation(api.payments.markRefunded, {
      purchaseId,
      reason: "chargeback",
    });
    const purchase = (await t.run(async (ctx: TestCtx) =>
      ctx.db.get(purchaseId),
    )) as unknown as { refundedAt?: number; refundReason?: string };
    expect(purchase.refundedAt).toBeTypeOf("number");
    expect(purchase.refundReason).toBe("chargeback");

    // Idempotence: a second refund attempt is refused.
    await expect(
      as(t, "clerk_admin").mutation(api.payments.markRefunded, { purchaseId }),
    ).rejects.toThrow(/already marked refunded/);
  });

  test("categories refuse deletion while published courses use the name", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(courseId, { published: true, category: "Design" });
    });

    const categoryId = await as(t, "clerk_admin").mutation(
      api.categories.create,
      { name: "Design" },
    );

    await expect(
      as(t, "clerk_admin").mutation(api.categories.remove, { categoryId }),
    ).rejects.toThrow(/still used/);

    // Duplicates are refused.
    await expect(
      as(t, "clerk_admin").mutation(api.categories.create, { name: "Design" }),
    ).rejects.toThrow(/already exists/);
  });
});
