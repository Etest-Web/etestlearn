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
  await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );
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

async function installTemplate(t: TestWorld, name: string) {
  return await as(t, "clerk_admin").mutation(api.certificateTemplates.saveTemplate, {
    name,
    pdfStorageId: await seedTemplateFile(t, name),
    pageWidth: 841.89,
    pageHeight: 595.28,
  });
}

const templateRows = (t: TestWorld) =>
  t.run((ctx: TestCtx) => ctx.db.query("certificateTemplates").collect());

describe("certificate template access control", () => {
  test("non-admins cannot read the template", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await installTemplate(t, "Brand");

    await expect(
      as(t, "clerk_instructor").query(api.certificateTemplates.getTemplate, {}),
    ).rejects.toThrow(/Not authorized/);
  });

  test("non-admins cannot save, reposition, or delete the template", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await installTemplate(t, "Brand");

    const instructor = as(t, "clerk_instructor");

    await expect(
      instructor.mutation(api.certificateTemplates.saveTemplate, {
        name: "Sneaky",
        pdfStorageId: await seedTemplateFile(t),
        pageWidth: 841.89,
        pageHeight: 595.28,
      }),
    ).rejects.toThrow(/Not authorized/);

    await expect(
      instructor.mutation(api.certificateTemplates.updateTemplateLayout, {
        layout: { recipient: { x: 0.5, y: 0.5 } },
      }),
    ).rejects.toThrow(/Not authorized/);

    await expect(
      instructor.mutation(api.certificateTemplates.deleteTemplate, {}),
    ).rejects.toThrow(/Not authorized/);
  });
});

describe("certificate template management", () => {
  test("an admin can install a template and read it back", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const id = await installTemplate(t, "Brand v1");

    const template = await as(t, "clerk_admin").query(
      api.certificateTemplates.getTemplate,
      {},
    );
    expect(template?._id).toBe(id);
    expect(template?.name).toBe("Brand v1");
    expect(template?.previewUrl).toBeTruthy();
  });

  test("getTemplate is null before anything is uploaded", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    expect(
      await as(t, "clerk_admin").query(api.certificateTemplates.getTemplate, {}),
    ).toBeNull();
  });

  test("uploading again replaces the design instead of adding a second one", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const firstFile = await seedTemplateFile(t, "first");
    await admin.mutation(api.certificateTemplates.saveTemplate, {
      name: "First",
      pdfStorageId: firstFile,
      pageWidth: 841.89,
      pageHeight: 595.28,
    });

    const secondFile = await seedTemplateFile(t, "second");
    const secondId = await admin.mutation(api.certificateTemplates.saveTemplate, {
      name: "Second",
      pdfStorageId: secondFile,
      pageWidth: 1000,
      pageHeight: 700,
    });

    const rows = await templateRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(secondId);
    expect(rows[0].name).toBe("Second");
    expect(rows[0].pageWidth).toBe(1000);
    expect(rows[0].active).toBe(true);

    // The superseded artwork would otherwise sit in storage forever.
    expect(await t.run((ctx: TestCtx) => ctx.db.system.get(firstFile))).toBeNull();
  });

  test("the template id is stable across replacements", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const first = await installTemplate(t, "First");
    const second = await admin.mutation(api.certificateTemplates.saveTemplate, {
      name: "Second",
      pdfStorageId: await seedTemplateFile(t, "second"),
      pageWidth: 841.89,
      pageHeight: 595.28,
    });

    // Certificates record the id at issuance; churning it would orphan them.
    expect(second).toBe(first);
  });

  test("removing the template leaves none, so plain artwork is used", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    await installTemplate(t, "Only");
    await admin.mutation(api.certificateTemplates.deleteTemplate, {});

    expect(await templateRows(t)).toHaveLength(0);
    expect(
      await admin.query(api.certificateTemplates.getTemplate, {}),
    ).toBeNull();
  });

  test("layout positions are validated", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const id = await installTemplate(t, "Layout");

    await expect(
      admin.mutation(api.certificateTemplates.updateTemplateLayout, {
        layout: { recipient: { x: 1.4, y: 0.5 } },
      }),
    ).rejects.toThrow(/between 0 and 1/);

    await admin.mutation(api.certificateTemplates.updateTemplateLayout, {
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

  test("saving positions with no template installed is refused", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_admin").mutation(
        api.certificateTemplates.updateTemplateLayout,
        { layout: { recipient: { x: 0.5, y: 0.4 } } },
      ),
    ).rejects.toThrow(/No certificate template/);
  });

  test("deleting a template removes it and its stored file", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const admin = as(t, "clerk_admin");

    const storageId = await seedTemplateFile(t, "doomed");
    const id = await admin.mutation(api.certificateTemplates.saveTemplate, {
      name: "Doomed",
      pdfStorageId: storageId,
      pageWidth: 841.89,
      pageHeight: 595.28,
    });

    await admin.mutation(api.certificateTemplates.deleteTemplate, {});

    expect(await t.run((ctx: TestCtx) => ctx.db.get(id))).toBeNull();
    expect(await t.run((ctx: TestCtx) => ctx.db.system.get(storageId))).toBeNull();
  });

  test("a nameless template is rejected", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_admin").mutation(api.certificateTemplates.saveTemplate, {
        name: "   ",
        pdfStorageId: await seedTemplateFile(t),
        pageWidth: 841.89,
        pageHeight: 595.28,
      }),
    ).rejects.toThrow(/name/i);
  });
});
