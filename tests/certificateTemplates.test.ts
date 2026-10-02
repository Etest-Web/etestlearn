import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestCtx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
type TestWorld = TestConvex<typeof testSchema>;

const as = (t: TestWorld, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

async function seedWorld(t: TestWorld) {
  const now = Date.now();

  await t.run((ctx: TestCtx) =>
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
  return { instructorId };
}

/**
 * A stored template file. Storage ids come from a real upload, so seed one via
 * `ctx.storage.store` rather than fabricating an id.
 */
async function seedTemplateFile(t: TestWorld, name = "artwork") {
  return await t.run(async (ctx) =>
    ctx.storage.store(
      new Blob([`%PDF-1.7 ${name}`], { type: "application/pdf" }),
    ),
  );
}

describe("certificate template access control", () => {
  test("non-admins cannot list templates", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_instructor").query(api.certificateTemplates.listTemplates, {}),
    ).rejects.toThrow(/Not authorized/);
  });

  test("non-admins cannot create, activate, or delete templates", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");
    const instructor = as(t, "clerk_instructor");

    const existing = await admin.mutation(
      api.certificateTemplates.createTemplate,
      {
        name: "Existing",
        pdfStorageId: await seedTemplateFile(t),
        pageWidth: 841.89,
        pageHeight: 595.28,
      },
    );

    await expect(
      instructor.mutation(api.certificateTemplates.createTemplate, {
        name: "Sneaky",
        pdfStorageId: await seedTemplateFile(t),
        pageWidth: 841.89,
        pageHeight: 595.28,
      }),
    ).rejects.toThrow(/Not authorized/);

    await expect(
      instructor.mutation(api.certificateTemplates.activateTemplate, {
        templateId: existing,
      }),
    ).rejects.toThrow(/Not authorized/);

    await expect(
      instructor.mutation(api.certificateTemplates.updateTemplateLayout, {
        templateId: existing,
        layout: { recipient: { x: 0.5, y: 0.5 } },
      }),
    ).rejects.toThrow(/Not authorized/);

    await expect(
      instructor.mutation(api.certificateTemplates.deleteTemplate, {
        templateId: existing,
      }),
    ).rejects.toThrow(/Not authorized/);
  });
});

describe("certificate template management", () => {
  test("admins can upload and activate a template", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const storageId = await seedTemplateFile(t);

    const id = await as(t, "clerk_admin").mutation(
      api.certificateTemplates.createTemplate,
      {
        name: "Brand v1",
        pdfStorageId: storageId,
        pageWidth: 841.89,
        pageHeight: 595.28,
        activate: true,
      },
    );

    const list = await as(t, "clerk_admin").query(
      api.certificateTemplates.listTemplates,
      {},
    );
    expect(list).toHaveLength(1);
    expect(list[0].active).toBe(true);
    expect(list[0].name).toBe("Brand v1");
    expect(list[0]._id).toBe(id);
  });

  test("only one template is active at a time", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const first = await admin.mutation(api.certificateTemplates.createTemplate, {
      name: "First",
      pdfStorageId: await seedTemplateFile(t, "a"),
      pageWidth: 841.89,
      pageHeight: 595.28,
      activate: true,
    });

    const second = await admin.mutation(api.certificateTemplates.createTemplate, {
      name: "Second",
      pdfStorageId: await seedTemplateFile(t, "b"),
      pageWidth: 841.89,
      pageHeight: 595.28,
      activate: true,
    });

    const list = await admin.query(api.certificateTemplates.listTemplates, {});
    const active = list.filter((tpl) => tpl.active);
    expect(active).toHaveLength(1);
    expect(active[0]._id).toBe(second);
    expect(list.find((tpl) => tpl._id === first)?.active).toBe(false);
  });

  test("deactivating leaves no active template, so plain artwork is used", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const id = await admin.mutation(api.certificateTemplates.createTemplate, {
      name: "Only",
      pdfStorageId: await seedTemplateFile(t),
      pageWidth: 841.89,
      pageHeight: 595.28,
      activate: true,
    });

    await admin.mutation(api.certificateTemplates.deactivateTemplate, {
      templateId: id,
    });

    const active = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("certificateTemplates")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect(),
    );
    expect(active).toHaveLength(0);
  });

  test("layout positions are validated", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const id = await admin.mutation(api.certificateTemplates.createTemplate, {
      name: "Layout",
      pdfStorageId: await seedTemplateFile(t),
      pageWidth: 841.89,
      pageHeight: 595.28,
    });

    await expect(
      admin.mutation(api.certificateTemplates.updateTemplateLayout, {
        templateId: id,
        layout: { recipient: { x: 1.4, y: 0.5 } },
      }),
    ).rejects.toThrow(/between 0 and 1/);

    await admin.mutation(api.certificateTemplates.updateTemplateLayout, {
      templateId: id,
      layout: {
        recipient: { x: 0.5, y: 0.4, size: 28 },
        // A field the template already prints can be kept off entirely.
        heading: null,
      },
    });

    const stored = await t.run((ctx: TestCtx) => ctx.db.get(id));
    expect(stored?.layout?.recipient).toEqual({ x: 0.5, y: 0.4, size: 28 });
    expect(stored?.layout?.heading).toBeNull();
  });

  test("deleting a template removes it and its stored file", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const storageId = await seedTemplateFile(t, "doomed");
    const id = await admin.mutation(api.certificateTemplates.createTemplate, {
      name: "Doomed",
      pdfStorageId: storageId,
      pageWidth: 841.89,
      pageHeight: 595.28,
    });

    await admin.mutation(api.certificateTemplates.deleteTemplate, {
      templateId: id,
    });

    expect(await t.run((ctx: TestCtx) => ctx.db.get(id))).toBeNull();
    expect(await t.run((ctx: TestCtx) => ctx.db.system.get(storageId))).toBeNull();
  });

  test("a nameless template is rejected", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_admin").mutation(api.certificateTemplates.createTemplate, {
        name: "   ",
        pdfStorageId: await seedTemplateFile(t),
        pageWidth: 841.89,
        pageHeight: 595.28,
      }),
    ).rejects.toThrow(/name/i);
  });
});