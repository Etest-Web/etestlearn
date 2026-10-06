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

async function seedUsers(t: any) {
  const now = Date.now();

  const userA = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_user_a",
      email: "usera@test.com",
      name: "User A",
      role: "student",
      createdAt: now,
    }),
  );

  const userB = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_user_b",
      email: "userb@test.com",
      name: "User B",
      role: "student",
      createdAt: now,
    }),
  );

  const instructor = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Instructor Dave",
      role: "instructor",
      createdAt: now,
    }),
  );

  const courseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Fullstack Mastery",
      slug: "fullstack-mastery",
      description: "Learn everything",
      instructorId: instructor,
      published: true,
      price: 0,
      createdAt: now,
      updatedAt: now,
    }),
  );

  const lessonId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId,
      title: "Lesson 1",
      contentType: "article",
      order: 1,
      createdAt: now,
    }),
  );

  return { userA, userB, instructor, courseId, lessonId };
}

describe("significant action notifications", () => {
  test("friend request and accept generate notifications", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, userB } = await seedUsers(t);

    // User A sends friend request to User B
    const friendshipId = await as(t, "clerk_user_a").mutation(
      api.friends.sendRequest,
      { userId: userB },
    );

    // User B receives friend_request notification
    const userBNotifications = await as(t, "clerk_user_b").query(
      api.inbox.listNotifications,
      {},
    );
    expect(userBNotifications).toHaveLength(1);
    expect(userBNotifications[0].type).toBe("friend_request");
    expect(userBNotifications[0].title).toContain("Friend request from User A");

    // User B accepts friend request
    await as(t, "clerk_user_b").mutation(api.friends.acceptRequest, {
      friendshipId,
    });

    // User A receives friend_accepted notification
    const userANotifications = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    expect(userANotifications).toHaveLength(1);
    expect(userANotifications[0].type).toBe("friend_accepted");
    expect(userANotifications[0].title).toContain("User B accepted your friend request");
  });

  test("course enrollment and purchase generate notifications", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, courseId, instructor } = await seedUsers(t);

    // User A enrolls in course
    await as(t, "clerk_user_a").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });

    // Learner receives course_purchased notification
    const learnerNotifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    expect(learnerNotifs.some((n) => n.type === "course_purchased")).toBe(true);

    // Instructor receives notification of new student
    const instructorNotifs = await as(t, "clerk_instructor").query(
      api.inbox.listNotifications,
      {},
    );
    expect(instructorNotifs.some((n) => n.type === "course_purchased")).toBe(true);
    expect(instructorNotifs[0].title).toContain("New student in Fullstack Mastery");
  });

  test("course completion generates notification", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, courseId, lessonId } = await seedUsers(t);

    // Enroll
    await as(t, "clerk_user_a").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });

    // Complete the only lesson (100% course completion)
    await as(t, "clerk_user_a").mutation(api.enrollments.completeLesson, {
      courseId,
      lessonId,
    });

    const notifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    expect(notifs.some((n) => n.type === "course_completed")).toBe(true);
  });

  test("inactivity reminder notification triggers for stale in-progress course", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, courseId, lessonId } = await seedUsers(t);

    // Add a second lesson so 1 completed = 50% progress
    await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId,
        title: "Lesson 2",
        contentType: "article",
        order: 2,
        createdAt: Date.now(),
      }),
    );

    // Enroll
    await as(t, "clerk_user_a").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });

    // Complete lesson 1
    await as(t, "clerk_user_a").mutation(api.enrollments.completeLesson, {
      courseId,
      lessonId,
    });

    // Backdate enrollment updatedAt by 10 days
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx: TestCtx) => {
      const enrollment = await ctx.db
        .query("enrollments")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", userA).eq("courseId", courseId),
        )
        .unique();
      if (enrollment) {
        await ctx.db.patch(enrollment._id, { updatedAt: tenDaysAgo });
      }
    });

    // Run inactivity check
    await as(t, "clerk_user_a").mutation(
      api.enrollments.checkInactivityReminders,
      {},
    );

    const notifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    const reminder = notifs.find((n) => n.type === "course_reminder");
    expect(reminder).toBeDefined();
    expect(reminder?.title).toContain("Continue learning: Fullstack Mastery");
  });

  test("direct message triggers direct_message notification", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, userB } = await seedUsers(t);

    const { threadId } = await as(t, "clerk_user_a").mutation(
      api.inbox.startThread,
      { recipientId: userB },
    );

    await as(t, "clerk_user_a").mutation(api.inbox.sendMessage, {
      threadId,
      body: "Hello friend!",
    });

    const notifs = await as(t, "clerk_user_b").query(
      api.inbox.listNotifications,
      {},
    );
    const dmNotif = notifs.find((n) => n.type === "direct_message");
    expect(dmNotif).toBeDefined();
    expect(dmNotif?.title).toContain("New message from User A");
  });

  test("quiz attempt triggers quiz_graded notification", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, courseId, lessonId } = await seedUsers(t);

    await as(t, "clerk_user_a").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });

    const quizId = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("quizzes", {
        lessonId,
        title: "Test Quiz",
        passingScore: 70,
        createdAt: Date.now(),
      }),
    );

    const questionId = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("quizQuestions", {
        quizId,
        prompt: "What is 2+2?",
        order: 1,
      }),
    );

    const optionId = await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("quizOptions", {
        questionId,
        text: "4",
        isCorrect: true,
      }),
    );

    await as(t, "clerk_user_a").mutation(api.quizzes.submitQuizAttempt, {
      lessonId,
      answers: [{ questionId, optionId }],
    });

    const notifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    const quizNotif = notifs.find((n) => n.type === "quiz_graded");
    expect(quizNotif).toBeDefined();
    expect(quizNotif?.title).toContain("Quiz passed: Test Quiz");
  });

  test("discussion reply triggers discussion_reply notification", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, userB, courseId } = await seedUsers(t);

    await as(t, "clerk_user_a").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });
    await as(t, "clerk_user_b").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });

    const threadId = await as(t, "clerk_user_a").mutation(
      api.discussions.createThread,
      {
        courseId,
        title: "Help with React?",
      },
    );

    await as(t, "clerk_user_b").mutation(api.discussions.postMessage, {
      threadId,
      body: "Sure, check hooks documentation!",
    });

    const notifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    const replyNotif = notifs.find((n) => n.type === "discussion_reply");
    expect(replyNotif).toBeDefined();
    expect(replyNotif?.title).toContain("New reply on: Help with React?");
  });

  test("assignment creation and grading trigger task notifications", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, courseId } = await seedUsers(t);

    await as(t, "clerk_user_a").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });

    // Instructor creates assignment
    const assignmentId = await as(t, "clerk_instructor").mutation(
      api.tasks.createAssignment,
      {
        courseId,
        title: "Build a Portfolio",
        instructions: "Create a GitHub pages site.",
        status: "open",
        maxPoints: 100,
      },
    );

    // Learner receives task_assigned
    const learnerNotifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    const taskNotif = learnerNotifs.find((n) => n.type === "task_assigned");
    expect(taskNotif).toBeDefined();
    expect(taskNotif?.title).toContain("New assignment: Build a Portfolio");

    // Student submits assignment
    const submissionId = await as(t, "clerk_user_a").mutation(
      api.tasks.submitAssignment,
      {
        assignmentId,
        content: "Here is my site url: https://example.com",
      },
    );

    // Instructor grades submission
    await as(t, "clerk_instructor").mutation(api.tasks.gradeSubmission, {
      submissionId,
      score: 95,
      feedback: "Great job!",
    });

    // Student receives task_graded
    const updatedLearnerNotifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    const gradedNotif = updatedLearnerNotifs.find((n) => n.type === "task_graded");
    expect(gradedNotif).toBeDefined();
    expect(gradedNotif?.title).toContain("Assignment graded: Build a Portfolio");
    expect(gradedNotif?.body).toContain("Score: 95/100");
  });

  test("study group request and approval trigger group_invite notifications", async () => {
    const t = convexTest(testSchema, modules);
    const { userA, userB, courseId } = await seedUsers(t);

    await as(t, "clerk_user_a").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });
    await as(t, "clerk_user_b").mutation(api.enrollments.enrollInCourse, {
      courseId,
    });

    // User A creates private study group
    const groupId = await as(t, "clerk_user_a").mutation(
      api.groups.createGroup,
      {
        courseId,
        name: "React Masters",
        description: "Study group for react",
        isPrivate: true,
      },
    );

    // User B requests to join
    const joinResult = await as(t, "clerk_user_b").mutation(
      api.groups.joinGroup,
      {
        groupId: groupId as any,
        message: "Can I join?",
      },
    );
    expect(joinResult.outcome).toBe("request_created");

    // Group creator (User A) receives join request notification
    const userANotifs = await as(t, "clerk_user_a").query(
      api.inbox.listNotifications,
      {},
    );
    const joinReqNotif = userANotifs.find((n) => n.type === "group_invite");
    expect(joinReqNotif).toBeDefined();
    expect(joinReqNotif?.title).toContain("Join request: React Masters");

    // User A approves join request
    if (joinResult.outcome === "request_created" && joinResult.requestId) {
      await as(t, "clerk_user_a").mutation(api.groups.reviewJoinRequest, {
        requestId: joinResult.requestId as any,
        decision: "approve",
      });

      // User B receives approval notification
      const userBNotifs = await as(t, "clerk_user_b").query(
        api.inbox.listNotifications,
        {},
      );
      const approvedNotif = userBNotifs.find((n) => n.type === "group_invite");
      expect(approvedNotif).toBeDefined();
      expect(approvedNotif?.title).toContain("Accepted into React Masters");
    }
  });
});
