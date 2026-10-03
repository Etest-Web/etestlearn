import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

// Load every Convex module (function definitions) for the in-memory backend.
const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestCtx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
type TestWorld = TestConvex<typeof testSchema>;

/** Shape returned by `listAuditLogs`, asserted against in the reader tests. */
type AuditRowResult = {
  _id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: unknown;
  createdAt: number;
  actor: { name: string | null; email: string | null } | null;
};

/**
 * `convex/_generated/api.d.ts` is only refreshed by `npx convex dev`, so it
 * does not list the new `auditLogs` module yet — same situation (and same
 * workaround) as `lib/durable-rate-limit.ts`. The wire name matches the one
 * codegen will emit.
 */
const listAuditLogs = makeFunctionReference<
  "query",
  { action?: string; limit?: number },
  AuditRowResult[]
>("auditLogs:listAuditLogs");

const as = (t: TestWorld, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

async function seedWorld(t: TestWorld) {
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
  const studentId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      role: "student",
      createdAt: now,
    }),
  );

  return { adminId, instructorId, studentId };
}

async function seedApplication(t: TestWorld, userId: Id<"users">) {
  const now = Date.now();
  return await t.run((ctx: TestCtx) =>
    ctx.db.insert("instructorApplications", {
      userId,
      fullName: "Applicant",
      email: "applicant@test.com",
      expertise: "Testing",
      bio: "A bio",
      motivation: "To teach",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function seedTemplateFile(t: TestWorld) {
  return await t.run((ctx) =>
    ctx.storage.store(new Blob(["%PDF-1.7 audit"], { type: "application/pdf" })),
  );
}

const auditRows = (t: TestWorld) =>
  t.run((ctx: TestCtx) => ctx.db.query("auditLogs").collect());

describe("privileged actions write audit rows", () => {
  test("setUserRole records the old and new role", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId, studentId } = await seedWorld(t);

    await as(t, "clerk_admin").mutation(api.users.setUserRole, {
      userId: studentId,
      role: "instructor",
    });

    const rows = await auditRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("user.set_role");
    expect(rows[0].actorId).toBe(adminId);
    expect(rows[0].targetType).toBe("user");
    expect(rows[0].targetId).toBe(studentId);
    expect(JSON.parse(rows[0].details!)).toEqual({
      oldRole: "student",
      newRole: "instructor",
    });
  });

  test("setUserRole rejects a missing user instead of silently patching nothing", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    // A real id whose row is gone — db.patch on it would be a no-op.
    const ghostId = await t.run(async (ctx: TestCtx) => {
      const id = await ctx.db.insert("users", {
        clerkId: "clerk_ghost",
        role: "student",
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      as(t, "clerk_admin").mutation(api.users.setUserRole, {
        userId: ghostId,
        role: "admin",
      }),
    ).rejects.toThrow(/User not found/);

    // A failed role change must not leave a row claiming otherwise.
    expect(await auditRows(t)).toHaveLength(0);
  });

  test("reviewApplication records the decision, promotion and old/new role", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId, studentId } = await seedWorld(t);
    const applicationId = await seedApplication(t, studentId);

    await as(t, "clerk_admin").mutation(api.instructorApplications.reviewApplication, {
      applicationId,
      decision: "approved",
    });

    const rows = await auditRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("instructor_application.review");
    expect(rows[0].actorId).toBe(adminId);
    expect(rows[0].targetType).toBe("instructorApplication");
    expect(rows[0].targetId).toBe(applicationId);
    expect(JSON.parse(rows[0].details!)).toEqual({
      decision: "approved",
      promotedUserId: studentId,
      oldRole: "student",
      newRole: "instructor",
    });

    const applicant = await t.run((ctx: TestCtx) => ctx.db.get(studentId));
    expect(applicant?.role).toBe("instructor");
  });

  test("a rejection logs the review note without a promotion", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);
    const applicationId = await seedApplication(t, studentId);

    await as(t, "clerk_admin").mutation(api.instructorApplications.reviewApplication, {
      applicationId,
      decision: "rejected",
      reviewNote: "Not enough portfolio",
    });

    const rows = await auditRows(t);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].details!)).toEqual({
      decision: "rejected",
      note: "Not enough portfolio",
    });

    const applicant = await t.run((ctx: TestCtx) => ctx.db.get(studentId));
    expect(applicant?.role).toBe("student");
  });

  test("the template lifecycle writes one row per operation", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId } = await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const templateId = await admin.mutation(api.certificateTemplates.createTemplate, {
      name: "Audit v1",
      pdfStorageId: await seedTemplateFile(t),
      pageWidth: 841.89,
      pageHeight: 595.28,
      activate: true,
    });
    await admin.mutation(api.certificateTemplates.updateTemplateLayout, {
      templateId,
      layout: { recipient: { x: 0.5, y: 0.4 } },
    });
    await admin.mutation(api.certificateTemplates.deactivateTemplate, {
      templateId,
    });
    await admin.mutation(api.certificateTemplates.activateTemplate, {
      templateId,
    });
    await admin.mutation(api.certificateTemplates.deleteTemplate, {
      templateId,
    });

    const rows = await auditRows(t);
    expect(rows.map((row) => row.action)).toEqual([
      "certificate_template.create",
      "certificate_template.layout_update",
      "certificate_template.deactivate",
      "certificate_template.activate",
      "certificate_template.delete",
    ]);
    expect(rows.every((row) => row.actorId === adminId)).toBe(true);
    expect(rows.every((row) => row.targetId === templateId)).toBe(true);

    // The template row is gone, so its name survives only in the log.
    const deleteDetails = JSON.parse(rows[rows.length - 1].details!);
    expect(deleteDetails.name).toBe("Audit v1");
  });
});

describe("listAuditLogs", () => {
  test("rejects unauthenticated callers and non-admins", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(t.query(listAuditLogs, {})).rejects.toThrow(/Not authenticated/);
    await expect(as(t, "clerk_instructor").query(listAuditLogs, {})).rejects.toThrow(
      /Not authorized/,
    );
    await expect(as(t, "clerk_student").query(listAuditLogs, {})).rejects.toThrow(
      /Not authorized/,
    );
  });

  test("returns rows newest-first with parsed details and joined actor", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, instructorId } = await seedWorld(t);
    const admin = as(t, "clerk_admin");

    await admin.mutation(api.users.setUserRole, {
      userId: studentId,
      role: "instructor",
    });
    await admin.mutation(api.users.setUserRole, {
      userId: instructorId,
      role: "admin",
    });

    const rows = await admin.query(listAuditLogs, {});
    expect(rows).toHaveLength(2);
    // Newest first: the second call heads the feed.
    expect(rows[0].targetId).toBe(instructorId);
    expect(rows[1].targetId).toBe(studentId);
    expect(rows[0].createdAt).toBeGreaterThanOrEqual(rows[1].createdAt);
    expect(rows[0].details).toEqual({ oldRole: "instructor", newRole: "admin" });
    expect(rows[0].actor).toEqual({ name: "Admin", email: "admin@test.com" });
  });

  test("filters by action name", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);
    const admin = as(t, "clerk_admin");

    await admin.mutation(api.users.setUserRole, {
      userId: studentId,
      role: "instructor",
    });
    await admin.mutation(api.certificateTemplates.createTemplate, {
      name: "Filtered",
      pdfStorageId: await seedTemplateFile(t),
      pageWidth: 841.89,
      pageHeight: 595.28,
    });

    const rows = await admin.query(listAuditLogs, { action: "user.set_role" });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("user.set_role");
    expect(rows[0].actor).toEqual({ name: "Admin", email: "admin@test.com" });

    expect(await admin.query(listAuditLogs, { action: "no.such.action" })).toEqual([]);
  });

  test("caps the page size at 200 and defaults to 50", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId } = await seedWorld(t);

    // Enough seeded rows to exceed both the default and the cap.
    await t.run(async (ctx: TestCtx) => {
      for (let i = 0; i < 250; i++) {
        await ctx.db.insert("auditLogs", {
          actorId: adminId,
          action: `seed.${i}`,
          createdAt: Date.now() + i,
        });
      }
    });

    const admin = as(t, "clerk_admin");

    const defaulted = await admin.query(listAuditLogs, {});
    expect(defaulted).toHaveLength(50);

    const capped = await admin.query(listAuditLogs, { limit: 100_000 });
    expect(capped).toHaveLength(200);

    const bounded = await admin.query(listAuditLogs, { limit: 3 });
    expect(bounded).toHaveLength(3);
  });
});
