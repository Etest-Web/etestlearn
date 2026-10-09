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

/**
 * The instructor-application review queue, the notification it sends the
 * applicant, and the two pending counts the sidebar badges.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

const as = (t: TestConvex<typeof testSchema>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

async function seed(t: TestConvex<typeof testSchema>) {
  const now = Date.now();

  const admin = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  async function applicant(clerkId: string) {
    const userId = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@test.com`,
        name: `Applicant ${clerkId}`,
        role: "student",
        createdAt: now,
      }),
    );

    const applicationId = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("instructorApplications", {
        userId,
        fullName: `Applicant ${clerkId}`,
        email: `${clerkId}@test.com`,
        expertise: "Testing",
        bio: "A bio",
        motivation: "A motivation",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      }),
    );

    return { userId, applicationId };
  }

  return { admin, applicant, now };
}

describe("countPendingApplications", () => {
  test("counts only pending applications", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);

    const a = await applicant("clerk_p1");
    await applicant("clerk_p2");
    await applicant("clerk_p3");

    // Clear one out of the pending set.
    await t.run(async (ctx: TestCtx) =>
      ctx.db.patch(a.applicationId, { status: "approved", updatedAt: Date.now() }),
    );

    const count = await as(t, "clerk_admin").query(
      api.instructorApplications.countPendingApplications,
      {},
    );
    expect(count).toBe(2);
  });

  test("is zero with an empty queue, not undefined", async () => {
    const t = convexTest(testSchema, modules);
    await seed(t);

    // The sidebar renders "nothing to badge" for 0 and shows nothing for
    // `undefined`, so this has to be a real number.
    const count = await as(t, "clerk_admin").query(
      api.instructorApplications.countPendingApplications,
      {},
    );
    expect(count).toBe(0);
  });

  test("refuses a non-admin", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    // The caller has to actually exist, or this would fail closed on identity
    // rather than on role — which is a different assertion.
    await applicant("clerk_applicant");

    await expect(
      as(t, "clerk_applicant").query(
        api.instructorApplications.countPendingApplications,
        {},
      ),
    ).rejects.toThrow(/admin access required/i);
  });

  test("refuses a signed-out caller", async () => {
    const t = convexTest(testSchema, modules);
    await seed(t);

    await expect(
      t.query(api.instructorApplications.countPendingApplications, {}),
    ).rejects.toThrow(/Not authenticated/i);
  });
});

describe("reviewApplication notification", () => {
  test("approval notifies the applicant and links to the console", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "approved" },
    );

    const notifications = await as(t, "clerk_applicant").query(
      api.inbox.listNotifications,
      {},
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("instructor_application_reviewed");
    expect(notifications[0].title).toMatch(/approved/i);
    // The whole value of notifying on approval is that it takes you somewhere.
    expect(notifications[0].href).toBe("/dashboard/instructor");
  });

  test("rejection notifies too, and links back to the application form", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "rejected" },
    );

    const notifications = await as(t, "clerk_applicant").query(
      api.inbox.listNotifications,
      {},
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("instructor_application_reviewed");
    expect(notifications[0].title).toMatch(/not approved/i);
    expect(notifications[0].href).toBe("/become-instructor");
  });

  test("carries the admin's review note through to the applicant", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "approved", reviewNote: "Strong portfolio." },
    );

    const notifications = await as(t, "clerk_applicant").query(
      api.inbox.listNotifications,
      {},
    );
    // A bare "rejected" is a worse outcome than no notification at all — the
    // reason is the part the applicant cannot act on alone.
    expect(notifications[0].body).toBe("Strong portfolio.");
  });

  test("omits the body entirely when the admin left no note", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "approved" },
    );

    const notifications = await as(t, "clerk_applicant").query(
      api.inbox.listNotifications,
      {},
    );
    expect(notifications[0].body ?? "").toBe("");
  });

  test("attributes the notification to the reviewing admin", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "approved" },
    );

    const notifications = await as(t, "clerk_applicant").query(
      api.inbox.listNotifications,
      {},
    );
    // `listNotifications` returns a resolved `actor` profile rather than the raw
    // id, so assert on who the applicant will see named on the row.
    expect(notifications[0].actor?.name).toBe("Admin");
  });

  test("approval still promotes the user and still writes an audit row", async () => {
    // The notification is an addition, not a replacement: the promotion and the
    // audit trail must be unchanged by it.
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { userId, applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "approved" },
    );

    const user = await t.run(async (ctx: TestCtx) => ctx.db.get(userId));
    expect(user?.role).toBe("instructor");

    const logs = await as(t, "clerk_admin").query(api.auditLogs.listAuditLogs, {});
    const review = logs.find(
      (l: { action: string }) => l.action === "instructor_application.review",
    );
    expect(review).toBeDefined();
    expect((review as { details: { newRole: string } }).details.newRole).toBe(
      "instructor",
    );
  });

  test("does not notify the reviewing admin about their own action", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "approved" },
    );

    const adminNotifications = await as(t, "clerk_admin").query(
      api.inbox.listNotifications,
      {},
    );
    expect(adminNotifications).toHaveLength(0);
  });

  test("a second review is refused, so no duplicate notification", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await as(t, "clerk_admin").mutation(
      api.instructorApplications.reviewApplication,
      { applicationId, decision: "approved" },
    );

    await expect(
      as(t, "clerk_admin").mutation(api.instructorApplications.reviewApplication, {
        applicationId,
        decision: "rejected",
      }),
    ).rejects.toThrow(/already been reviewed/i);

    const notifications = await as(t, "clerk_applicant").query(
      api.inbox.listNotifications,
      {},
    );
    expect(notifications).toHaveLength(1);
  });

  test("a non-admin cannot review, and the applicant is not notified", async () => {
    const t = convexTest(testSchema, modules);
    const { applicant } = await seed(t);
    const { applicationId } = await applicant("clerk_applicant");

    await expect(
      as(t, "clerk_applicant").mutation(
        api.instructorApplications.reviewApplication,
        { applicationId, decision: "approved" },
      ),
    ).rejects.toThrow(/admin access required/i);

    const notifications = await as(t, "clerk_applicant").query(
      api.inbox.listNotifications,
      {},
    );
    expect(notifications).toHaveLength(0);
  });
});