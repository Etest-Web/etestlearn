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

async function seedUser(
  t: TestConvex<typeof testSchema>,
  overrides: Record<string, unknown> = {},
) {
  return t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      role: "student",
      createdAt: Date.now(),
      ...overrides,
    } as never),
  );
}

describe("tutorial.completeTour", () => {
  test("stamps the completion time on the first call", async () => {
    const t = convexTest(testSchema, modules);
    const userId = await seedUser(t);

    const result = await as(t, "clerk_student").mutation(
      api.tutorial.completeTour,
      {},
    );
    expect(result).toEqual({ completed: true, firstCompletion: true });

    const user = await t.run((ctx: TestCtx) => ctx.db.get(userId));
    expect(typeof user?.tourCompletedAt).toBe("number");
  });

  test("a second call keeps the original timestamp", async () => {
    const t = convexTest(testSchema, modules);
    // Seed with a completion already recorded, as a replay would find it.
    const stamp = 1_000;
    const userId = await seedUser(t, { tourCompletedAt: stamp });

    const result = await as(t, "clerk_student").mutation(
      api.tutorial.completeTour,
      {},
    );
    expect(result).toEqual({ completed: true, firstCompletion: false });

    // "Completed at" is when the user first got through it; a replay must not
    // move it.
    const user = await t.run((ctx: TestCtx) => ctx.db.get(userId));
    expect(user?.tourCompletedAt).toBe(stamp);
  });

  test("refuses an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    await seedUser(t);

    await expect(t.mutation(api.tutorial.completeTour, {})).rejects.toThrow();
  });

  test("a suspended account cannot write the flag", async () => {
    const t = convexTest(testSchema, modules);
    await seedUser(t, { suspendedAt: Date.now() });

    // `requireUser` treats suspension as unauthenticated, so the tour cannot be
    // used to write to a locked account.
    await expect(
      as(t, "clerk_student").mutation(api.tutorial.completeTour, {}),
    ).rejects.toThrow();
  });
});
