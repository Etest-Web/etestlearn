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
    name: string,
    role: "student" | "instructor" | "admin",
  ) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@test.com`,
        name,
        role,
        createdAt: now,
      }),
    );

  const instructorId = await insertUser("clerk_ada", "Ada Instructor", "instructor");
  const strangerId = await insertUser("clerk_rex", "Rex Rival", "instructor");
  const adminId = await insertUser("clerk_admin", "Amina Admin", "admin");
  const studentId = await insertUser("clerk_student", "Lee Learner", "student");

  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Ada's course",
      slug: "adas-course",
      description: "Learn something",
      instructorId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const otherCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Rex's course",
      slug: "rexs-course",
      description: "Learn something else",
      instructorId: strangerId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return { instructorId, strangerId, adminId, studentId, courseId, otherCourseId };
}

const createAs = (
  t: T,
  subject: string,
  courseId: Id<"courses">,
  title = "A portfolio site",
  description = "A responsive one-pager you can send to anyone.",
) =>
  as(t, subject).mutation(api.courseProjects.createProject, {
    courseId,
    title,
    description,
  });

describe("courseProjects.createProject — who may write", () => {
  test("the course owner can add one", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const id = await createAs(t, "clerk_ada", w.courseId);
    const project = await t.run((ctx: TestCtx) => ctx.db.get(id));
    expect(project?.title).toBe("A portfolio site");
  });

  test("a stranger instructor cannot add one to someone else's course", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(createAs(t, "clerk_rex", w.courseId)).rejects.toThrow(
      /you do not manage this course/,
    );
  });

  test("a learner cannot add one", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(createAs(t, "clerk_student", w.courseId)).rejects.toThrow(
      /you do not manage this course/,
    );
  });

  test("an admin can — owner-or-admin, not a bare role check", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const id = await createAs(t, "clerk_admin", w.courseId);
    expect(await t.run((ctx: TestCtx) => ctx.db.get(id))).not.toBeNull();
  });

  test("a signed-out caller cannot write", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(
      t.mutation(api.courseProjects.createProject, {
        courseId: w.courseId,
        title: "x",
        description: "y",
      }),
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe("courseProjects.createProject — what a project may say", () => {
  test("title and description are both required", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(createAs(t, "clerk_ada", w.courseId, "   ", "A body")).rejects.toThrow(
      /Give the project a title/,
    );
    await expect(createAs(t, "clerk_ada", w.courseId, "A title", "   ")).rejects.toThrow(
      /Describe what the learner will have built/,
    );
  });

  test("an over-long title is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(
      createAs(t, "clerk_ada", w.courseId, "x".repeat(81), "A body"),
    ).rejects.toThrow(/Keep the title under 80 characters/);
  });

  test("fields are trimmed, and a blank image or outcome is stored as absent", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const id = await as(t, "clerk_ada").mutation(api.courseProjects.createProject, {
      courseId: w.courseId,
      title: "  A portfolio site  ",
      description: "  A responsive one-pager.  ",
      imageUrl: "   ",
      outcome: "  ",
    });

    const project = await t.run((ctx: TestCtx) => ctx.db.get(id));
    expect(project?.title).toBe("A portfolio site");
    expect(project?.description).toBe("A responsive one-pager.");
    expect(project?.imageUrl).toBeUndefined();
    expect(project?.outcome).toBeUndefined();
  });

  test("the tech stack is de-duplicated case-insensitively and capped", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const id = await as(t, "clerk_ada").mutation(api.courseProjects.createProject, {
      courseId: w.courseId,
      title: "A dashboard",
      description: "Charts and a table.",
      // React twice, plus a blank, plus more tags than the cap allows.
      techStack: ["React", "react", "  ", "Postgres", "Next.js", "Tailwind", "D3", "Zod", "tRPC", "Vitest", "Extra"],
    });

    const project = await t.run((ctx: TestCtx) => ctx.db.get(id));
    // Keeps the first spelling, drops the duplicate, stops at eight.
    expect(project?.techStack).toEqual([
      "React",
      "Postgres",
      "Next.js",
      "Tailwind",
      "D3",
      "Zod",
      "tRPC",
      "Vitest",
    ]);
  });

  test("a course cannot hold more than the cap", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    for (let i = 0; i < 24; i += 1) {
      await createAs(t, "clerk_ada", w.courseId, `Project ${i}`, "A body");
    }
    await expect(createAs(t, "clerk_ada", w.courseId, "One too many", "A body")).rejects.toThrow(
      /at most 24 projects/,
    );
  });
});

describe("courseProjects.listForCourse — the public read", () => {
  test("is readable signed out", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await createAs(t, "clerk_ada", w.courseId);

    const list = await t.query(api.courseProjects.listForCourse, { courseId: w.courseId });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("A portfolio site");
  });

  test("comes back in `order`, not creation order", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await createAs(t, "clerk_ada", w.courseId, "First");
    await createAs(t, "clerk_ada", w.courseId, "Second");
    await createAs(t, "clerk_ada", w.courseId, "Third");

    const ids = (
      await t.query(api.courseProjects.listForCourse, { courseId: w.courseId })
    ).map((p) => p._id);

    await as(t, "clerk_ada").mutation(api.courseProjects.reorderProjects, {
      courseId: w.courseId,
      projectIds: [ids[2], ids[0], ids[1]],
    });

    const reordered = await t.query(api.courseProjects.listForCourse, {
      courseId: w.courseId,
    });
    expect(reordered.map((p) => p.title)).toEqual(["Third", "First", "Second"]);
  });

  test("an empty showcase is an empty array, which is how the UI hides the section", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    expect(await t.query(api.courseProjects.listForCourse, { courseId: w.courseId })).toEqual([]);
  });

  test("reports an absent stack as an empty array so the card has one shape", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await createAs(t, "clerk_ada", w.courseId);

    const list = await t.query(api.courseProjects.listForCourse, { courseId: w.courseId });
    expect(list[0].techStack).toEqual([]);
    expect(list[0].imageUrl).toBeNull();
    expect(list[0].outcome).toBeNull();
  });
});

describe("courseProjects.updateProject", () => {
  test("edits in place and keeps the order", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const first = await createAs(t, "clerk_ada", w.courseId, "First");
    await createAs(t, "clerk_ada", w.courseId, "Second");

    await as(t, "clerk_ada").mutation(api.courseProjects.updateProject, {
      projectId: first,
      title: "Renamed",
      description: "A new description.",
      imageUrl: "https://example.com/a.png",
    });

    const project = await t.run((ctx: TestCtx) => ctx.db.get(first));
    expect(project?.title).toBe("Renamed");
    expect(project?.imageUrl).toBe("https://example.com/a.png");
    expect(project?.order).toBe(1);
  });

  test("a stranger instructor cannot edit", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const id = await createAs(t, "clerk_ada", w.courseId);

    await expect(
      as(t, "clerk_rex").mutation(api.courseProjects.updateProject, {
        projectId: id,
        title: "Hijacked",
        description: "Not mine.",
      }),
    ).rejects.toThrow(/you do not manage this course/);
  });

  test("a missing project is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const ghost = await t.run((ctx: TestCtx) =>
      ctx.db.insert("courseProjects", {
        courseId: w.courseId,
        title: "ghost",
        description: "gone",
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.run((ctx: TestCtx) => ctx.db.delete(ghost));

    await expect(
      as(t, "clerk_ada").mutation(api.courseProjects.updateProject, {
        projectId: ghost,
        title: "x",
        description: "y",
      }),
    ).rejects.toThrow(/Project not found/);
  });
});

describe("courseProjects.deleteProject", () => {
  test("the owner can remove one", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const id = await createAs(t, "clerk_ada", w.courseId);

    await as(t, "clerk_ada").mutation(api.courseProjects.deleteProject, { projectId: id });
    expect(await t.run((ctx: TestCtx) => ctx.db.get(id))).toBeNull();
  });

  test("a stranger instructor cannot remove one", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const id = await createAs(t, "clerk_ada", w.courseId);

    await expect(
      as(t, "clerk_rex").mutation(api.courseProjects.deleteProject, { projectId: id }),
    ).rejects.toThrow(/you do not manage this course/);
    expect(await t.run((ctx: TestCtx) => ctx.db.get(id))).not.toBeNull();
  });
});

describe("courseProjects.reorderProjects", () => {
  test("refuses to renumber another course's project", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const mine = await createAs(t, "clerk_ada", w.courseId, "Mine");
    // Rex creates the foreign row on his own course, so the refusal has to come
    // from the per-id course check — not from who happens to own the row.
    const foreign = await createAs(t, "clerk_rex", w.otherCourseId, "Foreign");

    await expect(
      as(t, "clerk_ada").mutation(api.courseProjects.reorderProjects, {
        courseId: w.courseId,
        projectIds: [mine, foreign],
      }),
    ).rejects.toThrow(/belongs to a different course/);
  });

  test("a stranger instructor cannot reorder at all", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const id = await createAs(t, "clerk_ada", w.courseId);

    await expect(
      as(t, "clerk_rex").mutation(api.courseProjects.reorderProjects, {
        courseId: w.courseId,
        projectIds: [id],
      }),
    ).rejects.toThrow(/you do not manage this course/);
  });

  test("a repeated id is de-duplicated rather than giving two rows one order", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const a = await createAs(t, "clerk_ada", w.courseId, "A");
    const b = await createAs(t, "clerk_ada", w.courseId, "B");

    await as(t, "clerk_ada").mutation(api.courseProjects.reorderProjects, {
      courseId: w.courseId,
      projectIds: [a, b, a],
    });

    const orders = (
      await t.query(api.courseProjects.listForCourse, { courseId: w.courseId })
    ).map((p) => p.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});