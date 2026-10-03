import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

/**
 * Guards for the durable rate limits on discussion writes.
 *
 * Two independent limits exist per post, and both are covered here because a
 * regression in one is invisible to the other:
 *   · per-thread cooldown (10s, read back from the thread's own messages)
 *   · per-user global bucket (10/min, `rateLimits` table)
 *
 * The cooldown is per thread, so exhausting the global bucket requires one
 * post per thread — the threads are seeded directly to keep the test focused
 * on the limiter rather than on `createThread`'s own (separate) budget.
 */

const modules = import.meta.glob("../convex/**/*.ts");

const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

async function seedWorld(t: any) {
  const now = Date.now();

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

  // A second student who never enrolls, to prove access gating is independent
  // of rate limiting.
  const outsiderId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_outsider",
      email: "outsider@test.com",
      name: "Outsider",
      role: "student",
      createdAt: now,
    }),
  );

  const courseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Course With Discussions",
      slug: "course-with-discussions",
      description: "Has a discussion board",
      instructorId,
      published: true,
      searchText: "Course With Discussions Has a discussion board",
      createdAt: now,
      updatedAt: now,
    }),
  );

  await t.run(async (ctx: TestCtx) => {
    const student = (
      await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_student"))
        .unique()
    )!;
    await ctx.db.insert("enrollments", {
      userId: student._id,
      courseId,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  return { instructorId, studentId, outsiderId, courseId };
}

async function seedThread(t: any, courseId: any, createdBy: any, title = "Seeded") {
  return t.run(
    async (ctx: TestCtx) =>
      ctx.db.insert("discussionThreads", {
        courseId,
        title,
        createdBy,
        createdAt: Date.now(),
      }),
  );
}

const asUser = (t: any, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

describe("discussion access gating", () => {
  test("a user who is not enrolled cannot post", async () => {
    const t = convexTest(testSchema, modules);
    const { outsiderId, courseId } = await seedWorld(t);
    const threadId = await seedThread(t, courseId, outsiderId);

    await expect(
      asUser(t, "clerk_outsider").mutation(api.discussions.postMessage, {
        threadId,
        body: "let me in",
      }),
    ).rejects.toThrow(/must be enrolled/);
  });

  test("the course instructor can post without enrolling", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseId } = await seedWorld(t);
    const threadId = await seedThread(t, courseId, instructorId);

    await expect(
      asUser(t, "clerk_instructor").mutation(api.discussions.postMessage, {
        threadId,
        body: "Welcome!",
      }),
    ).resolves.toBeTruthy();
  });
});

describe("discussion rate limits", () => {
  test("postMessage allows ten posts a minute across threads, then refuses", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, courseId } = await seedWorld(t);

    // One thread per post: the 10s per-thread cooldown would otherwise block
    // the second post before the global bucket is ever consulted.
    const threadIds = [];
    for (let i = 0; i < 11; i++) {
      threadIds.push(await seedThread(t, courseId, studentId, `Thread ${i}`));
    }

    const student = asUser(t, "clerk_student");
    for (let i = 0; i < 10; i++) {
      await expect(
        student.mutation(api.discussions.postMessage, {
          threadId: threadIds[i],
          body: `post ${i}`,
        }),
      ).resolves.toBeTruthy();
    }

    await expect(
      student.mutation(api.discussions.postMessage, {
        threadId: threadIds[10],
        body: "one too many",
      }),
    ).rejects.toThrow(/Too many requests/);

    // Exactly ten messages landed — the refused attempt wrote nothing.
    const stored = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("discussionMessages").collect(),
    );
    expect(stored).toHaveLength(10);
  });

  test("the global bucket is per user, so another student is unaffected", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    // Enroll a second student and give both their own threads.
    const second = await t.run(async (ctx: TestCtx) => {
      const student = (
        await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_student"))
          .unique()
      )!;
      const other = (
        await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_outsider"))
          .unique()
      )!;
      await ctx.db.insert("enrollments", {
        userId: other._id,
        courseId,
        progressPercent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { first: student._id, second: other._id };
    });

    const firstThreads = [];
    for (let i = 0; i < 10; i++) {
      firstThreads.push(await seedThread(t, courseId, second.first, `A ${i}`));
    }
    const secondThread = await seedThread(t, courseId, second.second, "B 0");

    const first = asUser(t, "clerk_student");
    for (let i = 0; i < 10; i++) {
      await first.mutation(api.discussions.postMessage, {
        threadId: firstThreads[i],
        body: `post ${i}`,
      });
    }

    // First user's bucket is spent; the second user still has theirs.
    await expect(
      first.mutation(api.discussions.postMessage, {
        threadId: secondThread,
        body: "not mine anyway",
      }),
    ).rejects.toThrow(/Too many requests/);

    await expect(
      asUser(t, "clerk_outsider").mutation(api.discussions.postMessage, {
        threadId: secondThread,
        body: "still allowed",
      }),
    ).resolves.toBeTruthy();
  });

  test("createThread allows five threads an hour, then refuses", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const student = asUser(t, "clerk_student");
    for (let i = 0; i < 5; i++) {
      await expect(
        student.mutation(api.discussions.createThread, {
          courseId,
          title: `Thread ${i}`,
        }),
      ).resolves.toBeTruthy();
    }

    await expect(
      student.mutation(api.discussions.createThread, {
        courseId,
        title: "Thread 6",
      }),
    ).rejects.toThrow(/Too many requests/);

    const stored = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("discussionThreads").collect(),
    );
    expect(stored).toHaveLength(5);
  });

  test("the per-thread cooldown still applies within one thread", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, courseId } = await seedWorld(t);
    const threadId = await seedThread(t, courseId, studentId);

    const student = asUser(t, "clerk_student");
    await student.mutation(api.discussions.postMessage, {
      threadId,
      body: "first",
    });

    // Second post to the SAME thread trips the 10s cooldown, not the global
    // bucket — the two limits must not be confused for one another.
    await expect(
      student.mutation(api.discussions.postMessage, {
        threadId,
        body: "immediately after",
      }),
    ).rejects.toThrow(/posting too quickly/);
  });
});
