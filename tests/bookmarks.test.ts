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
type T = TestConvex<typeof testSchema>;

const as = (t: T, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject, email: `${subject}@test.com` });

async function seedWorld(t: T) {
  const now = Date.now();

  const insertUser = (
    clerkId: string,
    name: string | undefined,
    role: "student" | "instructor" | "admin",
  ) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@test.com`,
        ...(name === undefined ? {} : { name }),
        role,
        createdAt: now,
      }),
    );

  const instructorId = await insertUser("clerk_ada", "Ada Instructor", "instructor");
  const studentId = await insertUser("clerk_student", "Lee Learner", "student");
  const otherId = await insertUser("clerk_other", "Other Learner", "student");

  const insertCourse = (slug: string, owner: Id<"users">, published = true) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: slug,
        slug,
        description: `${slug} description`,
        instructorId: owner,
        published,
        createdAt: now,
        updatedAt: now,
      }),
    );

  const publishedCourseId = await insertCourse("published", instructorId);
  const otherCourseId = await insertCourse("other", instructorId);
  const draftCourseId = await insertCourse("draft", instructorId, false);

  return { instructorId, studentId, otherId, publishedCourseId, otherCourseId, draftCourseId };
}

const toggle = (t: T, subject: string, courseId: Id<"courses">) =>
  as(t, subject).mutation(api.bookmarks.toggleBookmark, { courseId });

const rows = (t: T) => t.run((ctx: TestCtx) => ctx.db.query("bookmarks").collect());

describe("bookmarks.toggleBookmark", () => {
  test("saves a course and reports the new state", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const result = await toggle(t, "clerk_student", w.publishedCourseId);
    expect(result).toEqual({ bookmarked: true });
    expect(await rows(t)).toHaveLength(1);
  });

  test("toggling twice leaves no duplicate row — the pair is looked up first", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    expect(await toggle(t, "clerk_student", w.publishedCourseId)).toEqual({
      bookmarked: true,
    });
    expect(await toggle(t, "clerk_student", w.publishedCourseId)).toEqual({
      bookmarked: false,
    });

    expect(await rows(t)).toHaveLength(0);
  });

  test("a signed-out caller cannot bookmark anything", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(
      t.mutation(api.bookmarks.toggleBookmark, { courseId: w.publishedCourseId }),
    ).rejects.toThrow(/Not authenticated/);
    expect(await rows(t)).toHaveLength(0);
  });

  test("an unpublished course is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(toggle(t, "clerk_student", w.draftCourseId)).rejects.toThrow(
      /not available to save/,
    );
    expect(await rows(t)).toHaveLength(0);
  });

  test("your own course is refused — the console is the place for that", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(toggle(t, "clerk_ada", w.publishedCourseId)).rejects.toThrow(
      /You teach this course/,
    );
    expect(await rows(t)).toHaveLength(0);
  });

  test("a missing course is refused rather than saving a dangling row", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const ghostId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: "ghost",
        slug: "ghost",
        description: "gone",
        instructorId: w.instructorId,
        published: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.run((ctx: TestCtx) => ctx.db.delete(ghostId));

    await expect(toggle(t, "clerk_student", ghostId)).rejects.toThrow(/Course not found/);
  });

  test("one learner saving a course does not touch another's", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await toggle(t, "clerk_student", w.publishedCourseId);
    expect(await as(t, "clerk_other").query(api.bookmarks.isBookmarked, {
      courseId: w.publishedCourseId,
    })).toBe(false);
  });
});

describe("bookmarks.isBookmarked", () => {
  test("tracks the toggle", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    expect(
      await as(t, "clerk_student").query(api.bookmarks.isBookmarked, {
        courseId: w.publishedCourseId,
      }),
    ).toBe(false);

    await toggle(t, "clerk_student", w.publishedCourseId);

    expect(
      await as(t, "clerk_student").query(api.bookmarks.isBookmarked, {
        courseId: w.publishedCourseId,
      }),
    ).toBe(true);
  });

  test("is false signed out rather than throwing — a heart has to render", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    expect(
      await t.query(api.bookmarks.isBookmarked, { courseId: w.publishedCourseId }),
    ).toBe(false);
  });
});

describe("bookmarks.listBookmarkedCourseIds", () => {
  test("is an empty list signed out, so a catalog page can render signed out", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    expect(await t.query(api.bookmarks.listBookmarkedCourseIds, {})).toEqual([]);
  });

  test("returns only the caller's own ids", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await toggle(t, "clerk_student", w.publishedCourseId);
    await toggle(t, "clerk_student", w.otherCourseId);
    await toggle(t, "clerk_other", w.otherCourseId);

    const mine = await as(t, "clerk_student").query(api.bookmarks.listBookmarkedCourseIds, {});
    expect([...mine].sort()).toEqual([w.otherCourseId, w.publishedCourseId].sort());
  });
});

describe("bookmarks.listMyBookmarks", () => {
  test("hydrates enough of the course to render a card", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await toggle(t, "clerk_student", w.publishedCourseId);

    const list = await as(t, "clerk_student").query(api.bookmarks.listMyBookmarks, {});
    expect(list).toHaveLength(1);
    expect(list[0].course?.slug).toBe("published");
    expect(list[0].course?.instructorName).toBe("Ada Instructor");
  });

  test("carries no user id — the projection is what keeps it private", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await toggle(t, "clerk_student", w.publishedCourseId);

    const list = await as(t, "clerk_student").query(api.bookmarks.listMyBookmarks, {});
    expect(list[0]).not.toHaveProperty("userId");
    expect(list[0].course).not.toHaveProperty("instructorId");
  });

  test("is an empty list signed out, not an error", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    expect(await t.query(api.bookmarks.listMyBookmarks, {})).toEqual([]);
  });
});