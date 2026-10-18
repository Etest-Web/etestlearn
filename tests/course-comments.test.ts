import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { MAX_COMMENT_DEPTH } from "../lib/class-discussion";
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

const insertUser = (t: T, clerkId: string, name: string | undefined, role: "student" | "instructor" | "admin") =>
  t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId,
      email: `${clerkId}@test.com`,
      ...(name === undefined ? {} : { name }),
      role,
      createdAt: Date.now(),
    }),
  );

const insertCourse = (t: T, slug: string, instructorId: Id<"users">) =>
  t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: slug,
      slug,
      description: `${slug} description`,
      instructorId,
      published: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

/**
 * Enroll with an explicit set of completed lessons.
 *
 * Lesson completions are written directly rather than through
 * `enrollments.completeLesson` because several of these learners must end up in
 * states the real mutation would not produce — one who watched everything and
 * passed nothing, one who passed both quizzes but skipped a lesson. Those *are*
 * the states the gate has to tell apart, so they have to be constructible.
 */
const enroll = (
  t: T,
  userId: Id<"users">,
  courseId: Id<"courses">,
  completedLessonIds: Id<"lessons">[],
) =>
  t.run((ctx: TestCtx) =>
    ctx.db.insert("enrollments", {
      userId,
      courseId,
      progressPercent: completedLessonIds.length > 0 ? 100 : 0,
      completedLessonIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

const pass = (t: T, userId: Id<"users">, quizId: Id<"quizzes">) =>
  t.run((ctx: TestCtx) =>
    ctx.db.insert("quizAttempts", {
      userId,
      quizId,
      score: 100,
      maxScore: 100,
      passed: true,
      createdAt: Date.now(),
    }),
  );

/**
 * One instructor, a course of two lessons each carrying a quiz, and learners whose
 * completion state differs in exactly one way each.
 *
 * The quizzes are the point: the gate is certificate-grade, so "watched every
 * lesson" and "passed every quiz" are separate axes and both halves of the
 * `lessonsOnly` / `quizOnly` pair matter.
 */
async function seedWorld(t: T) {
  const instructorId = await insertUser(t, "clerk_ada", "Ada Instructor", "instructor");
  const rivalId = await insertUser(t, "clerk_rex", "Rex Rival", "instructor");
  const adminId = await insertUser(t, "clerk_admin", "Amina Admin", "admin");

  // Finished everything.
  const finisherId = await insertUser(t, "clerk_done", "Dana Done", "student");
  // Watched every lesson, passed no quiz.
  const lessonsOnlyId = await insertUser(t, "clerk_half", "Hal Halfway", "student");
  // Passed both quizzes, skipped the second lesson.
  const quizOnlyId = await insertUser(t, "clerk_quiz", "Quinn Quiz", "student");
  // Finished *Rex's* course in full — enrolled elsewhere, so not eligible here.
  const strangerId = await insertUser(t, "clerk_stranger", "Noa Stranger", "student");

  const courseId = await insertCourse(t, "course-a", instructorId);
  const rivalCourseId = await insertCourse(t, "rival-course", rivalId);

  const lessonIds: Id<"lessons">[] = [];
  const quizIds: Id<"quizzes">[] = [];
  for (let i = 1; i <= 2; i += 1) {
    const lessonId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId,
        title: `Lesson ${i}`,
        contentType: "video",
        order: i,
        createdAt: Date.now(),
      }),
    );
    lessonIds.push(lessonId);
    quizIds.push(
      await t.run((ctx: TestCtx) =>
        ctx.db.insert("quizzes", {
          lessonId,
          title: `Quiz ${i}`,
          passingScore: 50,
          createdAt: Date.now(),
        }),
      ),
    );
  }

  // Fully complete.
  await enroll(t, finisherId, courseId, lessonIds);
  for (const quizId of quizIds) await pass(t, finisherId, quizId);

  // All lessons, no quizzes.
  await enroll(t, lessonsOnlyId, courseId, lessonIds);

  // All quizzes, first lesson only.
  await enroll(t, quizOnlyId, courseId, [lessonIds[0]]);
  for (const quizId of quizIds) await pass(t, quizOnlyId, quizId);

  // Fully complete — but on a different course.
  await enroll(t, strangerId, rivalCourseId, []);
  await pass(t, strangerId, quizIds[0]);

  return {
    instructorId,
    rivalId,
    adminId,
    finisherId,
    lessonsOnlyId,
    quizOnlyId,
    strangerId,
    courseId,
    lessonIds,
    quizIds,
  };
}

const post = (t: T, subject: string, courseId: Id<"courses">, body: string) =>
  as(t, subject).mutation(api.courseComments.postComment, { courseId, body });

const reply = (t: T, subject: string, parentId: Id<"courseComments">, body: string) =>
  as(t, subject).mutation(api.courseComments.replyToComment, { parentId, body });

describe("courseComments.postComment — the completion gate", () => {
  test("a learner who finished every lesson and passed every quiz may post", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const result = await post(t, "clerk_done", w.courseId, "The final project was hard but good.");
    expect(result.created).toBe(true);
  });

  test("watching every lesson is NOT enough — an unpassed quiz blocks the post", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    // lessonsOnly completed all lessons and passed nothing. A lessons-only gate
    // would wave this through; the certificate-grade gate does not, and that
    // difference is the whole reason this test exists.
    await expect(post(t, "clerk_half", w.courseId, "I watched all of it.")).rejects.toThrow(
      /Finish every lesson and pass the quizzes/,
    );
  });

  test("passing every quiz but skipping a lesson is also not enough", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(post(t, "clerk_quiz", w.courseId, "I passed everything.")).rejects.toThrow(
      /Finish every lesson and pass the quizzes/,
    );
  });

  test("finishing a DIFFERENT course does not qualify", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(post(t, "clerk_stranger", w.courseId, "I did it!")).rejects.toThrow(
      /Only people who took this course/,
    );
  });

  test("the instructor cannot post a review of their own class, but is pointed at replying", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    // Give the instructor a genuine full completion, so the refusal can only come
    // from the role check and not from the completion gate.
    await enroll(t, w.instructorId, w.courseId, w.lessonIds);
    for (const quizId of w.quizIds) await pass(t, w.instructorId, quizId);

    await expect(post(t, "clerk_ada", w.courseId, "Great class!")).rejects.toThrow(
      /you can reply, but not post a review/,
    );
  });

  test("a signed-out caller cannot post", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(
      t.mutation(api.courseComments.postComment, { courseId: w.courseId, body: "hi" }),
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe("courseComments.postComment — one post per learner", () => {
  test("a second post returns the first rather than creating a duplicate", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const first = await post(t, "clerk_done", w.courseId, "First thoughts.");
    const second = await post(t, "clerk_done", w.courseId, "Changed my mind.");

    expect(second.created).toBe(false);
    expect(second.commentId).toBe(first.commentId);

    const rows = await t.run((ctx: TestCtx) => ctx.db.query("courseComments").collect());
    expect(rows).toHaveLength(1);
    // The first text stands — a second attempt is a UI bug, not a retraction.
    expect(rows[0].body).toBe("First thoughts.");
  });

  test("a blank body is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(post(t, "clerk_done", w.courseId, "   ")).rejects.toThrow(
      /Write something before posting/,
    );
  });

  test("a body over the cap is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(post(t, "clerk_done", w.courseId, "x".repeat(4001))).rejects.toThrow(
      /Keep your post under 4000 characters/,
    );
  });
});

describe("courseComments.replyToComment — threading", () => {
  test("the instructor may reply even though they may not post", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "How did the final project go?");

    expect(await reply(t, "clerk_ada", commentId, "Glad it challenged you.")).toBeTruthy();
  });

  test("replying is NOT gated on having taken or finished this course", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Thoughts.");

    // The stranger completed a different course entirely and can still answer,
    // which is the point: a thread only the finished may enter is a testimonial
    // wall, and the people replying to a teacher's answer are often still
    // working through the course.
    expect(await reply(t, "clerk_stranger", commentId, "This helped me too.")).toBeTruthy();
  });

  test("threads nest to the cap and no further", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Root post.");

    let current = commentId;
    for (let depth = 1; depth <= MAX_COMMENT_DEPTH; depth += 1) {
      current = await reply(t, "clerk_ada", current, `Depth ${depth}`);
    }

    expect((await t.run((ctx: TestCtx) => ctx.db.get(current)))?.depth).toBe(MAX_COMMENT_DEPTH);
    await expect(reply(t, "clerk_ada", current, "Too deep")).rejects.toThrow(/as deep as it goes/);
  });

  test("a reply records its parent's depth plus one", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Root.");
    const first = await reply(t, "clerk_ada", commentId, "First reply.");
    const second = await reply(t, "clerk_done", first, "Second reply.");

    const row = await t.run((ctx: TestCtx) => ctx.db.get(second));
    expect(row?.depth).toBe(2);
    expect(row?.parentId).toBe(first);
  });

  test("a missing parent is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const ghost = await t.run((ctx: TestCtx) =>
      ctx.db.insert("courseComments", {
        courseId: w.courseId,
        userId: w.finisherId,
        depth: 0,
        body: "gone",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run((ctx: TestCtx) => ctx.db.delete(ghost));

    await expect(reply(t, "clerk_ada", ghost, "hi")).rejects.toThrow(/Comment not found/);
  });

  test("a blank reply is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Root.");

    await expect(reply(t, "clerk_ada", commentId, "   ")).rejects.toThrow(/Write something/);
  });
});

describe("courseComments.listForCourse — the public read", () => {
  test("is readable signed out", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await post(t, "clerk_done", w.courseId, "A public retrospective.");

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].body).toBe("A public retrospective.");
  });

  test("carries no author id — the author is a name and a face", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await post(t, "clerk_done", w.courseId, "Hello.");

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(Object.keys(data.posts[0])).not.toContain("userId");
    expect(data.posts[0].authorName).toBe("Dana Done");
  });

  test("an author with no name is 'A learner', never their email", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const namelessId = await insertUser(t, "clerk_nameless", undefined, "student");
    await enroll(t, namelessId, w.courseId, w.lessonIds);
    for (const quizId of w.quizIds) await pass(t, namelessId, quizId);

    await post(t, "clerk_nameless", w.courseId, "No name here.");

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(data.posts[0].authorName).toBe("A learner");
    expect(JSON.stringify(data)).not.toContain("@test.com");
  });

  test("flags the instructor's replies so the UI can badge them", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Question.");
    await reply(t, "clerk_ada", commentId, "An answer.");

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(data.posts[0].isInstructor).toBe(false);
    expect(data.posts[0].replies[0].isInstructor).toBe(true);
  });

  test("nests replies into a tree", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Root.");
    const first = await reply(t, "clerk_ada", commentId, "Reply 1.");
    await reply(t, "clerk_done", first, "Reply 2.");

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].replies).toHaveLength(1);
    expect(data.posts[0].replies[0].replies[0].body).toBe("Reply 2.");
    expect(data.posts[0].replies[0].replies[0].depth).toBe(2);
  });

  test("an empty discussion is an empty list, which is how the UI hides it", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(data.posts).toEqual([]);
    expect(data.totalTopLevel).toBe(0);
    expect(data.truncated).toBe(false);
  });

  test("a top-level post is not counted twice when it has replies", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Root.");
    await reply(t, "clerk_ada", commentId, "One.");
    await reply(t, "clerk_ada", commentId, "Two.");

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(data.totalTopLevel).toBe(1);
    expect(data.posts[0].replies).toHaveLength(2);
  });
});

describe("courseComments.deleteComment — soft removal", () => {
  test("the author can remove their own post, and the replies survive it", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Regrettable.");
    await reply(t, "clerk_ada", commentId, "A reply that must survive.");

    expect(
      await as(t, "clerk_done").mutation(api.courseComments.deleteComment, { commentId }),
    ).toBe(true);

    // The row is still there — that is the whole point. A hard delete would
    // orphan the reply and leave a hole in the middle of the conversation.
    expect(await t.run((ctx: TestCtx) => ctx.db.get(commentId))).not.toBeNull();

    const data = await t.query(api.courseComments.listForCourse, { courseId: w.courseId });
    expect(data.posts).toHaveLength(1);
    expect(data.posts[0].deleted).toBe(true);
    expect(data.posts[0].body).toBeNull();
    expect(data.posts[0].replies[0].body).toBe("A reply that must survive.");
  });

  test("the course instructor can remove a post", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Unkind.");

    expect(
      await as(t, "clerk_ada").mutation(api.courseComments.deleteComment, { commentId }),
    ).toBe(true);
  });

  test("an admin can remove a post", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Unkind.");

    expect(
      await as(t, "clerk_admin").mutation(api.courseComments.deleteComment, { commentId }),
    ).toBe(true);
  });

  test("another learner cannot remove a post", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Mine.");

    await expect(
      as(t, "clerk_stranger").mutation(api.courseComments.deleteComment, { commentId }),
    ).rejects.toThrow(/Not authorized/);
  });

  test("removing twice is a false, not an error", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Once.");

    await as(t, "clerk_done").mutation(api.courseComments.deleteComment, { commentId });
    expect(
      await as(t, "clerk_done").mutation(api.courseComments.deleteComment, { commentId }),
    ).toBe(false);
  });
});

describe("courseComments.listForManagedCourse — the instructor's own read", () => {
  test("carries the author id, because this one exists to act on posts", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    await post(t, "clerk_done", w.courseId, "Something to moderate.");

    const rows = await as(t, "clerk_ada").query(api.courseComments.listForManagedCourse, {
      courseId: w.courseId,
    });
    expect(rows[0].userId).toBe(w.finisherId);
  });

  test("a stranger instructor is refused", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    await expect(
      as(t, "clerk_rex").query(api.courseComments.listForManagedCourse, {
        courseId: w.courseId,
      }),
    ).rejects.toThrow(/do not manage this course/);
  });
});

describe("courseComments.getViewerState", () => {
  test("agrees with the write on every eligibility verdict", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const finisher = await as(t, "clerk_done").query(api.courseComments.getViewerState, {
      courseId: w.courseId,
    });
    expect(finisher?.canPost).toBe(true);
    expect(finisher?.reason).toBeNull();

    const half = await as(t, "clerk_half").query(api.courseComments.getViewerState, {
      courseId: w.courseId,
    });
    expect(half?.canPost).toBe(false);
    expect(half?.reason).toMatch(/Finish every lesson and pass the quizzes/);
  });

  test("the instructor is told they cannot post but can reply", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const state = await as(t, "clerk_ada").query(api.courseComments.getViewerState, {
      courseId: w.courseId,
    });
    expect(state?.canPost).toBe(false);
    expect(state?.canReply).toBe(true);
    expect(state?.reason).toMatch(/you can reply/);
  });

  test("is a sign-in prompt signed out", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);

    const state = await t.query(api.courseComments.getViewerState, { courseId: w.courseId });
    expect(state?.signedIn).toBe(false);
    expect(state?.canPost).toBe(false);
    expect(state?.reason).toMatch(/Sign in/);
  });

  test("hands back the caller's own post, so the UI offers remove instead of write", async () => {
    const t = convexTest(testSchema, modules);
    const w = await seedWorld(t);
    const { commentId } = await post(t, "clerk_done", w.courseId, "Mine.");

    const state = await as(t, "clerk_done").query(api.courseComments.getViewerState, {
      courseId: w.courseId,
    });
    expect(state?.myPostId).toBe(commentId);
    expect(state?.canPost).toBe(false);
  });
});