import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
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

async function seedInstructor(t: ReturnType<typeof convexTest>, now: number) {
  await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_sanitize_instructor",
      email: "sanitize@test.com",
      name: "Sanitize Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );
  return t.withIdentity({
    subject: "clerk_sanitize_instructor",
    tokenIdentifier: "clerk_sanitize_instructor",
  });
}

describe("course input sanitization", () => {
  test("createCourse rejects a whitespace-only title", async () => {
    const t = convexTest(testSchema, modules);
    const asInstructor = await seedInstructor(t, Date.now());
    await expect(
      asInstructor.mutation(api.courses.createCourse, {
        title: "   ",
        slug: "whitespace-title",
        description: "Something useful",
      }),
    ).rejects.toThrow(/title/i);
  });

  test("createCourse strips control characters from stored text", async () => {
    const t = convexTest(testSchema, modules);
    const now = Date.now();
    const asInstructor = await seedInstructor(t, now);
    const courseId = await asInstructor.mutation(api.courses.createCourse, {
      title: "Filmmaking\u0007 101\n",
      slug: "control-chars",
      description: "Direct\u0000 your first film",
    });
    const course = await t.run((ctx: TestCtx) => ctx.db.get(courseId));
    expect(course?.title).toBe("Filmmaking 101");
    expect(course?.description).toBe("Direct your first film");
  });

  test("createCourse rejects non-http URLs for thumbnail and trailer", async () => {
    const t = convexTest(testSchema, modules);
    const asInstructor = await seedInstructor(t, Date.now());
    await expect(
      asInstructor.mutation(api.courses.createCourse, {
        title: "Bad URL course",
        slug: "bad-url",
        description: "Contains a dangerous URL",
        previewVideoUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow(/url/i);
    await expect(
      asInstructor.mutation(api.courses.createCourse, {
        title: "Bad thumb course",
        slug: "bad-thumb",
        description: "Contains a dangerous thumbnail",
        thumbnailUrl: "data:text/html;base64,PHNjcmlwdD4=",
      }),
    ).rejects.toThrow(/url/i);
  });

  test("updateCourse clears the trailer when given an empty string", async () => {
    const t = convexTest(testSchema, modules);
    const now = Date.now();
    const asInstructor = await seedInstructor(t, now);
    const courseId = await asInstructor.mutation(api.courses.createCourse, {
      title: "Trailer course",
      slug: "trailer-clear",
      description: "Trailer can be removed again",
      previewVideoUrl: "https://cdn.example.com/trailer.mp4",
    });
    let course = await t.run((ctx: TestCtx) => ctx.db.get(courseId));
    expect(course?.previewVideoUrl).toBe("https://cdn.example.com/trailer.mp4");

    await asInstructor.mutation(api.courses.updateCourse, {
      courseId,
      previewVideoUrl: "",
    });
    course = await t.run((ctx: TestCtx) => ctx.db.get(courseId));
    expect(course?.previewVideoUrl).toBeUndefined();
  });
});
