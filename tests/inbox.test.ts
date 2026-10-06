import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

/**
 * Integration tests for `convex/inbox.ts` — direct messages, the notification
 * feed and the discussion-activity feed.
 *
 * `convex/_generated/api.d.ts` is only refreshed by `npx convex dev`, so it does
 * not list the new `inbox` module yet. Same situation, and same workaround, as
 * `tests/audit.test.ts` and `lib/durable-rate-limit.ts`: the wire names below
 * match the ones codegen will emit, so this file needs no edits once it runs.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestCtx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
type TestWorld = TestConvex<typeof testSchema>;

const as = (t: TestWorld, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

// ─── Typed references ───────────────────────────────────────────────────────

type PersonSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  role: "student" | "instructor" | "admin";
};

type ThreadSummary = PersonSummary & {
  threadId: string;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  lastMessageId: string | null;
  lastMessageIsMine: boolean | null;
  unreadCount: number;
  unreadCapped: boolean;
};

type MessageView = {
  id: string;
  senderId: string;
  senderName: string;
  senderImageUrl: string | null;
  senderRole: "student" | "instructor" | "admin";
  body: string;
  createdAt: number;
  isMine: boolean;
};

type MessagePage = {
  messages: MessageView[];
  hasMore: boolean;
  nextBefore: number | null;
};

type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: number;
  isRead: boolean;
  actor: PersonSummary | null;
};

type DiscussionActivityView = {
  threadId: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  title: string;
  createdByMe: boolean;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  lastMessageAuthorName: string | null;
};

type PersonOption = PersonSummary & { existingThreadId: string | null };

const listThreads = makeFunctionReference<
  "query",
  { limit?: number },
  ThreadSummary[]
>("inbox:listThreads");

const getMessages = makeFunctionReference<
  "query",
  { threadId: string; limit?: number; before?: number },
  MessagePage
>("inbox:getMessages");

const listNotifications = makeFunctionReference<
  "query",
  { limit?: number; unreadOnly?: boolean },
  NotificationView[]
>("inbox:listNotifications");

const getUnreadCounts = makeFunctionReference<
  "query",
  Record<string, never>,
  { messages: number; notifications: number }
>("inbox:getUnreadCounts");

const listDiscussionActivity = makeFunctionReference<
  "query",
  { limit?: number },
  DiscussionActivityView[]
>("inbox:listDiscussionActivity");

const searchPeople = makeFunctionReference<
  "query",
  { query: string; limit?: number },
  PersonOption[]
>("inbox:searchPeople");

const startThread = makeFunctionReference<
  "mutation",
  { recipientId: string },
  { threadId: string; created: boolean }
>("inbox:startThread");

const sendMessage = makeFunctionReference<
  "mutation",
  { threadId: string; body: string },
  { messageId: string; sentAt: number }
>("inbox:sendMessage");

const markThreadRead = makeFunctionReference<
  "mutation",
  { threadId: string },
  { threadId: string; lastReadAt: number }
>("inbox:markThreadRead");

const markAllRead = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { threadsMarked: number }
>("inbox:markAllRead");

const markNotificationRead = makeFunctionReference<
  "mutation",
  { notificationId: string },
  { notificationId: string }
>("inbox:markNotificationRead");

const markAllNotificationsRead = makeFunctionReference<
  "mutation",
  Record<string, never>,
  { updated: number }
>("inbox:markAllNotificationsRead");

/**
 * `internalMutation` is normally unreachable from a client, but the harness runs
 * internal handlers directly — which is exactly what this needs to prove: that
 * the validation inside it holds.
 */
const internalNotification = makeFunctionReference<
  "mutation",
  {
    userId: string;
    type: string;
    title: string;
    body?: string;
    href?: string;
    actorId?: string;
  },
  string
>("inbox:internalNotification");

// ─── Fixtures ───────────────────────────────────────────────────────────────

type World = {
  studentId: Id<"users">;
  otherId: Id<"users">;
  outsiderId: Id<"users">;
  instructorId: Id<"users">;
  adminId: Id<"users">;
  courseId: Id<"courses">;
};

/**
 * Four accounts so cross-user isolation is exercised properly: two in a
 * conversation, one who is in neither (the "outsider"), plus an instructor and
 * an admin for the course-access branches.
 */
async function seedWorld(t: TestWorld): Promise<World> {
  const now = Date.now();

  const studentId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Student",
      imageUrl: "https://cdn.test/student.png",
      role: "student",
      createdAt: now,
    }),
  );

  const otherId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_other",
      email: "other@test.com",
      name: "Other Learner",
      role: "student",
      createdAt: now,
    }),
  );

  const outsiderId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_outsider",
      email: "outsider@test.com",
      name: "Outsider",
      role: "student",
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

  const adminId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Discussion Course",
      slug: "discussion-course",
      description: "Has a board",
      instructorId,
      published: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return { studentId, otherId, outsiderId, instructorId, adminId, courseId };
}

/** Mirrors `pairOrder` in convex/inbox.ts: `dmThreads` stores the pair sorted. */
function orderedPair(
  a: Id<"users">,
  b: Id<"users">,
): [Id<"users">, Id<"users">] {
  return a < b ? [a, b] : [b, a];
}

/** Seeds a DM thread directly, bypassing `startThread`'s own rate limit. */
async function seedThread(
  t: TestWorld,
  a: Id<"users">,
  b: Id<"users">,
  at?: number,
): Promise<Id<"dmThreads">> {
  const [userA, userB] = orderedPair(a, b);
  return await t.run((ctx: TestCtx) =>
    ctx.db.insert("dmThreads", {
      userA,
      userB,
      lastMessageAt: at,
      lastMessagePreview: at ? "seeded" : undefined,
      createdAt: at ?? Date.now(),
    }),
  );
}

async function seedMessage(
  t: TestWorld,
  threadId: Id<"dmThreads">,
  senderId: Id<"users">,
  body: string,
  at: number,
): Promise<Id<"dmMessages">> {
  return await t.run((ctx: TestCtx) =>
    ctx.db.insert("dmMessages", { threadId, senderId, body, createdAt: at }),
  );
}

async function seedNotification(
  t: TestWorld,
  userId: Id<"users">,
  overrides: Partial<{
    type: string;
    title: string;
    body: string;
    href: string;
    actorId: Id<"users">;
    readAt: number;
    createdAt: number;
  }> = {},
): Promise<Id<"notifications">> {
  return await t.run((ctx: TestCtx) =>
    ctx.db.insert("notifications", {
      userId,
      type: (overrides.type ?? "course_completed") as "course_completed",
      title: overrides.title ?? "Course complete",
      body: overrides.body,
      href: overrides.href,
      actorId: overrides.actorId,
      readAt: overrides.readAt,
      createdAt: overrides.createdAt ?? Date.now(),
    }),
  );
}

const dmThreads = (t: TestWorld) =>
  t.run((ctx: TestCtx) => ctx.db.query("dmThreads").collect());
const dmMessages = (t: TestWorld) =>
  t.run((ctx: TestCtx) => ctx.db.query("dmMessages").collect());
const readMarkers = (t: TestWorld) =>
  t.run((ctx: TestCtx) => ctx.db.query("dmReadMarkers").collect());

// ─── startThread ────────────────────────────────────────────────────────────

describe("startThread", () => {
  test("creates a thread with the pair stored in sorted order", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);

    const result = await as(t, "clerk_student").mutation(startThread, {
      recipientId: otherId,
    });

    expect(result.created).toBe(true);
    const rows = await dmThreads(t);
    expect(rows).toHaveLength(1);
    const [low, high] = orderedPair(studentId, otherId);
    expect(rows[0].userA).toBe(low);
    expect(rows[0].userB).toBe(high);
    // Nothing sent yet, so there is no preview to keep in sync.
    expect(rows[0].lastMessageAt).toBeUndefined();
  });

  test("is idempotent — a second call returns the same thread, not a new one", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);

    const first = await as(t, "clerk_student").mutation(startThread, {
      recipientId: otherId,
    });
    const second = await as(t, "clerk_student").mutation(startThread, {
      recipientId: otherId,
    });

    expect(second.threadId).toBe(first.threadId);
    expect(second.created).toBe(false);
    expect(await dmThreads(t)).toHaveLength(1);

    // The other side opening "their" copy must land on the same thread too,
    // which is what stops a duplicated conversation from appearing in the UI.
    const fromTheOtherSide = await as(t, "clerk_other").mutation(startThread, {
      recipientId: studentId,
    });
    expect(fromTheOtherSide.threadId).toBe(first.threadId);
    expect(await dmThreads(t)).toHaveLength(1);
  });

  test("refuses a conversation with yourself", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    await expect(
      as(t, "clerk_student").mutation(startThread, { recipientId: studentId }),
    ).rejects.toThrow(/cannot start a conversation with yourself/);
    expect(await dmThreads(t)).toHaveLength(0);
  });

  test("refuses a recipient that does not exist", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    // A real id whose row was removed, as a deleted Clerk account leaves behind.
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
      as(t, "clerk_student").mutation(startThread, { recipientId: ghostId }),
    ).rejects.toThrow(/no longer on this platform/);
    expect(await dmThreads(t)).toHaveLength(0);
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    const { otherId } = await seedWorld(t);

    await expect(t.mutation(startThread, { recipientId: otherId })).rejects.toThrow(
      /Not authenticated/,
    );
  });

  test("caps new conversations at twenty an hour", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    // Twenty further recipients, so the limit is the limiter and not the
    // directory size.
    const recipientIds = await t.run(async (ctx: TestCtx) => {
      const ids: Id<"users">[] = [];
      for (let i = 0; i < 21; i += 1) {
        ids.push(
          await ctx.db.insert("users", {
            clerkId: `clerk_target_${i}`,
            name: `Target ${i}`,
            role: "student",
            createdAt: Date.now(),
          }),
        );
      }
      return ids;
    });

    const student = as(t, "clerk_student");
    for (let i = 0; i < 20; i += 1) {
      await expect(
        student.mutation(startThread, { recipientId: recipientIds[i] }),
      ).resolves.toBeTruthy();
    }

    await expect(
      student.mutation(startThread, { recipientId: recipientIds[20] }),
    ).rejects.toThrow(/Too many requests/);

    // Exactly twenty threads — the refused attempt wrote nothing.
    expect(await dmThreads(t)).toHaveLength(20);
  });
});

// ─── sendMessage ────────────────────────────────────────────────────────────

describe("sendMessage", () => {
  test("stores the message, updates the thread preview and advances the sender's marker", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    const sent = await as(t, "clerk_student").mutation(sendMessage, {
      threadId,
      body: "  hello there  ",
    });

    // Trimmed on the way in.
    const stored = await dmMessages(t);
    expect(stored).toHaveLength(1);
    expect(stored[0].body).toBe("hello there");
    expect(stored[0]._id).toBe(sent.messageId);

    // The list view reads the preview off the thread, not off the newest body.
    const [thread] = await dmThreads(t);
    expect(thread.lastMessageAt).toBe(sent.sentAt);
    expect(thread.lastMessagePreview).toBe("hello there");

    // The sender has implicitly read what they just wrote, so it cannot be
    // unread for them.
    const markers = await readMarkers(t);
    expect(markers).toHaveLength(1);
    expect(markers[0].userId).toBe(studentId);
    expect(markers[0].lastReadAt).toBe(sent.sentAt);
  });

  test("counts as unread for the recipient only", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    await as(t, "clerk_student").mutation(sendMessage, {
      threadId,
      body: "ping",
    });

    expect(
      await as(t, "clerk_student").query(getUnreadCounts, {}),
    ).toEqual({ messages: 0, notifications: 0 });
    expect(
      await as(t, "clerk_other").query(getUnreadCounts, {}),
    ).toEqual({ messages: 1, notifications: 1 });
  });

  test("rejects an empty or whitespace-only body", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    for (const body of ["", "   ", "\n\t "]) {
      await expect(
        as(t, "clerk_student").mutation(sendMessage, { threadId, body }),
      ).rejects.toThrow(/cannot be empty/);
    }
    expect(await dmMessages(t)).toHaveLength(0);
  });

  test("rejects a body over the length cap", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    await expect(
      as(t, "clerk_student").mutation(sendMessage, {
        threadId,
        body: "x".repeat(2001),
      }),
    ).rejects.toThrow(/too long/i);
    expect(await dmMessages(t)).toHaveLength(0);

    // The boundary itself is allowed.
    await expect(
      as(t, "clerk_student").mutation(sendMessage, {
        threadId,
        body: "y".repeat(2000),
      }),
    ).resolves.toBeTruthy();
  });

  test("a non-participant cannot post into someone else's conversation", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId, outsiderId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    await expect(
      as(t, "clerk_outsider").mutation(sendMessage, {
        threadId,
        body: "let me in",
      }),
    ).rejects.toThrow(/not a participant/);

    expect(await dmMessages(t)).toHaveLength(0);
    // And nothing leaked through the thread row either.
    expect((await dmThreads(t))[0].lastMessageAt).toBeUndefined();
    expect(outsiderId).not.toBe(threadId);
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    await expect(
      t.mutation(sendMessage, { threadId, body: "hi" }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("the per-thread cooldown blocks an immediate second message", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);
    const student = as(t, "clerk_student");

    await student.mutation(sendMessage, { threadId, body: "first" });
    await expect(
      student.mutation(sendMessage, { threadId, body: "second" }),
    ).rejects.toThrow(/sending messages too quickly/);

    // The other participant is unaffected: the cooldown is per sender, not per
    // thread, so a reply from them is not blocked by mine.
    await expect(
      as(t, "clerk_other").mutation(sendMessage, {
        threadId,
        body: "reply",
      }),
    ).resolves.toBeTruthy();

    expect(await dmMessages(t)).toHaveLength(2);
  });

  test("caps a user at twenty messages a minute across all their threads", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);

    // One thread per send: the 2s per-thread cooldown would otherwise block the
    // second send before the global bucket is ever consulted. Seeding the
    // threads directly keeps `startThread`'s separate budget out of it.
    const threadIds: Id<"dmThreads">[] = [];
    for (let i = 0; i < 21; i += 1) {
      threadIds.push(await seedThread(t, studentId, otherId));
    }

    const student = as(t, "clerk_student");
    for (let i = 0; i < 20; i += 1) {
      await expect(
        student.mutation(sendMessage, {
          threadId: threadIds[i],
          body: `post ${i}`,
        }),
      ).resolves.toBeTruthy();
    }

    await expect(
      student.mutation(sendMessage, {
        threadId: threadIds[20],
        body: "one too many",
      }),
    ).rejects.toThrow(/Too many requests/);

    // Exactly twenty messages landed — the refused attempt wrote nothing.
    expect(await dmMessages(t)).toHaveLength(20);

    // Keyed by user: a blocked caller must not be able to starve anyone else.
    await expect(
      as(t, "clerk_outsider").mutation(sendMessage, {
        threadId: threadIds[20],
        body: "not my thread",
      }),
    ).rejects.toThrow(/not a participant/);
  });
});

// ─── getMessages ────────────────────────────────────────────────────────────

describe("getMessages", () => {
  test("returns the page oldest-first with resolved senders and isMine", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    await seedMessage(t, threadId, otherId, "hi there", 1_000);
    await seedMessage(t, threadId, studentId, "hello back", 2_000);
    await seedMessage(t, threadId, otherId, "how are you", 3_000);

    const page = await as(t, "clerk_student").query(getMessages, { threadId });

    expect(page.hasMore).toBe(false);
    expect(page.nextBefore).toBeNull();
    // Reading order, not index order.
    expect(page.messages.map((message) => message.body)).toEqual([
      "hi there",
      "hello back",
      "how are you",
    ]);
    expect(page.messages.map((message) => message.isMine)).toEqual([
      false,
      true,
      false,
    ]);
    // Profiles are joined server-side, so the client renders without a lookup.
    expect(page.messages[0].senderName).toBe("Other Learner");
    expect(page.messages[0].senderRole).toBe("student");
    expect(page.messages[1].senderName).toBe("Student");
    expect(page.messages[1].senderImageUrl).toBe("https://cdn.test/student.png");
  });

  test("a non-participant cannot read the messages — the core isolation test", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);
    await seedMessage(t, threadId, otherId, "a private note", 1_000);

    // Authenticated, but not one of the two participants.
    await expect(
      as(t, "clerk_outsider").query(getMessages, { threadId }),
    ).rejects.toThrow(/not a participant/);

    // An instructor and an admin are participants in the product sense, but
    // they are not in *this* thread — role must not unlock somebody's DMs.
    await expect(
      as(t, "clerk_instructor").query(getMessages, { threadId }),
    ).rejects.toThrow(/not a participant/);
    await expect(
      as(t, "clerk_admin").query(getMessages, { threadId }),
    ).rejects.toThrow(/not a participant/);
  });

  test("rejects unauthenticated callers and unknown threads", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    await expect(t.query(getMessages, { threadId })).rejects.toThrow(
      /Not authenticated/,
    );

    const ghostId = await t.run(async (ctx: TestCtx) => {
      const id = await ctx.db.insert("dmThreads", {
        userA: studentId,
        userB: otherId,
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      as(t, "clerk_student").query(getMessages, { threadId: ghostId }),
    ).rejects.toThrow(/Conversation not found/);
  });

  test("paginates backwards through a long thread", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    for (let i = 0; i < 10; i += 1) {
      await seedMessage(t, threadId, otherId, `message ${i}`, 1_000 + i * 10);
    }

    const first = await as(t, "clerk_student").query(getMessages, {
      threadId,
      limit: 4,
    });
    // Bounded: four requested, five read, four returned.
    expect(first.messages).toHaveLength(4);
    expect(first.messages.map((message) => message.body)).toEqual([
      "message 6",
      "message 7",
      "message 8",
      "message 9",
    ]);
    expect(first.hasMore).toBe(true);
    // The cursor is the *oldest* row returned, so `before` walks strictly back.
    expect(first.nextBefore).toBe(1_060);

    const second = await as(t, "clerk_student").query(getMessages, {
      threadId,
      limit: 4,
      before: first.nextBefore!,
    });
    expect(second.messages.map((message) => message.body)).toEqual([
      "message 2",
      "message 3",
      "message 4",
      "message 5",
    ]);
    expect(second.hasMore).toBe(true);
    expect(second.nextBefore).toBe(1_020);

    const third = await as(t, "clerk_student").query(getMessages, {
      threadId,
      limit: 10,
      before: second.nextBefore!,
    });
    expect(third.messages.map((message) => message.body)).toEqual([
      "message 0",
      "message 1",
    ]);
    expect(third.hasMore).toBe(false);
    expect(third.nextBefore).toBeNull();
  });

  test("an absurd limit is clamped rather than honoured", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId);

    for (let i = 0; i < 120; i += 1) {
      await seedMessage(t, threadId, otherId, `m${i}`, 1_000 + i);
    }

    const page = await as(t, "clerk_student").query(getMessages, {
      threadId,
      limit: 1_000_000,
    });
    // MESSAGE_PAGE_CAP is 100, so the page cannot become a table dump.
    expect(page.messages).toHaveLength(100);
    expect(page.hasMore).toBe(true);
  });
});

// ─── listThreads ────────────────────────────────────────────────────────────

describe("listThreads", () => {
  test("resolves the other participant, newest activity first, with unread counts", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId, instructorId, outsiderId } = await seedWorld(t);

    const quiet = await seedThread(t, studentId, otherId);
    const busy = await seedThread(t, studentId, instructorId);

    await seedMessage(t, busy, instructorId, "how is the course going", 2_000);
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(busy, {
        lastMessageAt: 2_000,
        lastMessagePreview: "how is the course going",
      });
      await ctx.db.patch(quiet, {
        lastMessageAt: 1_000,
        lastMessagePreview: "earlier",
      });
    });
    await seedMessage(t, quiet, otherId, "first", 1_000);
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(quiet, { lastMessageAt: 1_000 });
    });

    const rows = await as(t, "clerk_student").query(listThreads, {});

    expect(rows.map((row) => row.threadId)).toEqual([busy, quiet]);
    expect(rows[0].name).toBe("Instructor");
    expect(rows[0].role).toBe("instructor");
    expect(rows[0].imageUrl).toBeNull();
    expect(rows[0].lastMessagePreview).toBe("how is the course going");
    expect(rows[0].lastMessageIsMine).toBe(false);
    expect(rows[0].unreadCount).toBe(1);
    expect(rows[0].unreadCapped).toBe(false);

    // The other side of the conversation is what the row describes — never the
    // caller's own profile.
    expect(rows[1].name).toBe("Other Learner");
    expect(rows[1].id).toBe(otherId);
    expect(rows[0].id).toBe(instructorId);

    // A conversation with the outsider does not exist, so the outsider sees none.
    expect(outsiderId).not.toBe(rows[0].id);
    expect(
      await as(t, "clerk_outsider").query(listThreads, {}),
    ).toEqual([]);
  });

  test("an empty inbox is an empty array, not an error", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    expect(await as(t, "clerk_student").query(listThreads, {})).toEqual([]);
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await expect(t.query(listThreads, {})).rejects.toThrow(/Not authenticated/);
  });

  test("honours the limit and caps it", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);

    for (let i = 0; i < 8; i += 1) {
      await seedThread(t, studentId, otherId);
    }

    expect(
      await as(t, "clerk_student").query(listThreads, { limit: 3 }),
    ).toHaveLength(3);
    expect(
      await as(t, "clerk_student").query(listThreads, { limit: 1_000_000 }),
    ).toHaveLength(8);
  });
});

// ─── Read markers ───────────────────────────────────────────────────────────

describe("markThreadRead", () => {
  test("clears the unread count and the badge", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId, 5_000);
    await seedMessage(t, threadId, otherId, "unread", 5_000);

    expect(
      await as(t, "clerk_student").query(getUnreadCounts, {}),
    ).toEqual({ messages: 1, notifications: 0 });

    await as(t, "clerk_student").mutation(markThreadRead, { threadId });

    expect(
      await as(t, "clerk_student").query(getUnreadCounts, {}),
    ).toEqual({ messages: 0, notifications: 0 });
    const rows = await as(t, "clerk_student").query(listThreads, {});
    expect(rows[0].unreadCount).toBe(0);
  });

  test("is a high-water mark, so a marker ahead of the clock is not rewound", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId, 5_000);
    await seedMessage(t, threadId, otherId, "one", 5_000);

    // A marker further ahead than `Date.now()` — what a clock-skewed device or a
    // replayed old cursor looks like. Rewinding it would resurrect the message.
    const ahead = Date.now() + 60_000;
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("dmReadMarkers", {
        userId: studentId,
        threadId,
        lastReadAt: ahead,
      });
    });

    await as(t, "clerk_student").mutation(markThreadRead, { threadId });

    const markers = await readMarkers(t);
    expect(markers).toHaveLength(1);
    expect(markers[0].lastReadAt).toBe(ahead);
  });

  test("a non-participant cannot mark somebody else's thread read", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId, 5_000);

    await expect(
      as(t, "clerk_outsider").mutation(markThreadRead, { threadId }),
    ).rejects.toThrow(/not a participant/);
    // No marker row was written for the outsider on the victim's thread.
    expect(await readMarkers(t)).toHaveLength(0);
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId, 5_000);

    await expect(t.mutation(markThreadRead, { threadId })).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("markAllRead", () => {
  test("marks every conversation with activity and skips the empty ones", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId, instructorId } = await seedWorld(t);

    const quiet = await seedThread(t, studentId, otherId);
    const busy = await seedThread(t, studentId, instructorId);
    await seedMessage(t, busy, instructorId, "hello", 2_000);
    await t.run((ctx: TestCtx) =>
      ctx.db.patch(busy, { lastMessageAt: 2_000, lastMessagePreview: "hello" }),
    );

    const result = await as(t, "clerk_student").mutation(markAllRead, {});
    // The empty thread has nothing to have read.
    expect(result.threadsMarked).toBe(1);

    const markers = await readMarkers(t);
    expect(markers.map((marker) => marker.threadId)).toEqual([busy]);
    expect(markers.map((marker) => marker.threadId)).not.toContain(quiet);
    expect(
      await as(t, "clerk_student").query(getUnreadCounts, {}),
    ).toEqual({ messages: 0, notifications: 0 });
  });

  test("leaves other people's conversations alone", async () => {
    const t = convexTest(testSchema, modules);
    const { otherId, instructorId } = await seedWorld(t);

    const victimThread = await seedThread(t, otherId, instructorId, 5_000);
    await seedMessage(t, victimThread, instructorId, "private", 5_000);

    await as(t, "clerk_outsider").mutation(markAllRead, {});

    expect(await readMarkers(t)).toHaveLength(0);
    expect(
      await as(t, "clerk_other").query(getUnreadCounts, {}),
    ).toEqual({ messages: 1, notifications: 0 });
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await expect(t.mutation(markAllRead, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── Notifications ──────────────────────────────────────────────────────────

describe("listNotifications", () => {
  test("returns the feed newest-first with the actor joined and read state", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, instructorId } = await seedWorld(t);

    await seedNotification(t, studentId, {
      title: "Older",
      createdAt: 1_000,
      actorId: instructorId,
    });
    const unreadId = await seedNotification(t, studentId, {
      type: "quiz_graded",
      title: "Newer",
      body: "You scored 90%",
      href: "/dashboard/courses",
      createdAt: 2_000,
      actorId: instructorId,
    });

    const rows = await as(t, "clerk_student").query(listNotifications, {});

    expect(rows.map((row) => row.title)).toEqual(["Newer", "Older"]);
    expect(rows[0].id).toBe(unreadId);
    expect(rows[0].type).toBe("quiz_graded");
    expect(rows[0].body).toBe("You scored 90%");
    expect(rows[0].href).toBe("/dashboard/courses");
    expect(rows[0].isRead).toBe(false);
    expect(rows[0].actor?.name).toBe("Instructor");
    expect(rows[1].isRead).toBe(false);
  });

  test("only ever returns the caller's own rows", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);

    await seedNotification(t, studentId, { title: "Mine" });
    await seedNotification(t, otherId, { title: "Theirs" });

    const rows = await as(t, "clerk_student").query(listNotifications, {});
    expect(rows.map((row) => row.title)).toEqual(["Mine"]);
    expect(
      await as(t, "clerk_other").query(listNotifications, {}),
    ).toHaveLength(1);
  });

  test("unreadOnly reads the unread window through its own index", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    await seedNotification(t, studentId, {
      title: "Unread",
      createdAt: 1_000,
    });
    await seedNotification(t, studentId, {
      title: "Already read",
      readAt: 1_500,
      createdAt: 2_000,
    });

    const unread = await as(t, "clerk_student").query(listNotifications, {
      unreadOnly: true,
    });
    expect(unread.map((row) => row.title)).toEqual(["Unread"]);
    expect(unread[0].isRead).toBe(false);
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await expect(t.query(listNotifications, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });

  test("caps the page at two hundred rows", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      for (let i = 0; i < 220; i += 1) {
        await ctx.db.insert("notifications", {
          userId: studentId,
          type: "course_completed",
          title: `n${i}`,
          createdAt: Date.now() + i,
        });
      }
    });

    expect(
      await as(t, "clerk_student").query(listNotifications, {
        limit: 100_000,
      }),
    ).toHaveLength(200);
  });
});

describe("getUnreadCounts", () => {
  test("returns both badge numbers in one call", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);

    const threadId = await seedThread(t, studentId, otherId, 5_000);
    await seedMessage(t, threadId, otherId, "one", 5_000);
    await seedMessage(t, threadId, otherId, "two", 6_000);
    await seedNotification(t, studentId);
    await seedNotification(t, studentId, { readAt: 5_000 });

    expect(
      await as(t, "clerk_student").query(getUnreadCounts, {}),
    ).toEqual({ messages: 2, notifications: 1 });
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await expect(t.query(getUnreadCounts, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("markNotificationRead", () => {
  test("marks one row and leaves the others alone", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    const first = await seedNotification(t, studentId, { title: "First" });
    await seedNotification(t, studentId, { title: "Second" });

    await as(t, "clerk_student").mutation(markNotificationRead, {
      notificationId: first,
    });

    const rows = await as(t, "clerk_student").query(listNotifications, {});
    expect(rows.filter((row) => row.isRead).map((row) => row.title)).toEqual([
      "First",
    ]);
  });

  test("another account's notification cannot be marked read", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    const theirs = await seedNotification(t, studentId, { title: "Theirs" });

    await expect(
      as(t, "clerk_outsider").mutation(markNotificationRead, {
        notificationId: theirs,
      }),
    ).rejects.toThrow(/Not authorized/);

    // The row is untouched — a rejected attempt must not half-apply.
    const stored = await t.run((ctx: TestCtx) => ctx.db.get(theirs));
    expect(stored?.readAt).toBeUndefined();
  });

  test("rejects unauthenticated callers and unknown ids", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);
    const id = await seedNotification(t, studentId);

    await expect(
      t.mutation(markNotificationRead, { notificationId: id }),
    ).rejects.toThrow(/Not authenticated/);

    const ghostId = await t.run(async (ctx: TestCtx) => {
      const ghost = await ctx.db.insert("notifications", {
        userId: studentId,
        type: "friend_request",
        title: "Ghost",
        createdAt: Date.now(),
      });
      await ctx.db.delete(ghost);
      return ghost;
    });
    await expect(
      as(t, "clerk_student").mutation(markNotificationRead, {
        notificationId: ghostId,
      }),
    ).rejects.toThrow(/Notification not found/);
  });
});

describe("markAllNotificationsRead", () => {
  test("clears every unread row and no read ones", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);

    await seedNotification(t, studentId, { title: "A" });
    await seedNotification(t, studentId, { title: "B" });
    await seedNotification(t, studentId, {
      title: "C",
      readAt: 1_000,
      createdAt: 3_000,
    });
    await seedNotification(t, otherId, { title: "Not mine" });

    const result = await as(t, "clerk_student").mutation(
      markAllNotificationsRead,
      {},
    );
    expect(result.updated).toBe(2);

    expect(
      await as(t, "clerk_student").query(getUnreadCounts, {}),
    ).toEqual({ messages: 0, notifications: 0 });
    // The other account's unread row is untouched.
    expect(
      await as(t, "clerk_other").query(getUnreadCounts, {}),
    ).toEqual({ messages: 0, notifications: 1 });
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await expect(t.mutation(markAllNotificationsRead, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── internalNotification ───────────────────────────────────────────────────

describe("internalNotification", () => {
  test("writes a row the recipient can read back", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, instructorId } = await seedWorld(t);

    await t.mutation(internalNotification, {
      userId: studentId,
      type: "certificate_earned",
      title: "  Your certificate is ready  ",
      body: "Introduction to Glypha",
      href: "/dashboard/certificates",
      actorId: instructorId,
    });

    const rows = await as(t, "clerk_student").query(listNotifications, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("certificate_earned");
    // Trimmed on write, like every other user-facing string in this module.
    expect(rows[0].title).toBe("Your certificate is ready");
    expect(rows[0].actor?.id).toBe(instructorId);
  });

  test("refuses an unknown recipient, a blank title and an off-site href", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    const ghostId = await t.run(async (ctx: TestCtx) => {
      const ghost = await ctx.db.insert("users", {
        clerkId: "clerk_ghost",
        role: "student",
        createdAt: Date.now(),
      });
      await ctx.db.delete(ghost);
      return ghost;
    });

    await expect(
      t.mutation(internalNotification, {
        userId: ghostId,
        type: "friend_request",
        title: "Ghost",
      }),
    ).rejects.toThrow(/recipient not found/);

    await expect(
      t.mutation(internalNotification, {
        userId: studentId,
        type: "friend_request",
        title: "   ",
      }),
    ).rejects.toThrow(/title cannot be empty/);

    // `href` becomes a link the reader clicks, so it must not be able to leave
    // the origin — "//evil.example" and "/\evil.example" both start with "/".
    for (const href of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      await expect(
        t.mutation(internalNotification, {
          userId: studentId,
          type: "group_invite",
          title: "Off-site",
          href,
        }),
      ).rejects.toThrow(/in-app path/);
    }

    expect(await as(t, "clerk_student").query(listNotifications, {})).toEqual([]);
  });

  test("rejects a type outside the closed union", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    await expect(
      t.mutation(internalNotification, {
        userId: studentId,
        type: "not_a_real_event",
        title: "Nope",
      }),
    ).rejects.toThrow();
  });
});

// ─── listDiscussionActivity ─────────────────────────────────────────────────

describe("listDiscussionActivity", () => {
  async function seedCourseWorld(t: TestWorld) {
    const world = await seedWorld(t);
    const { studentId, courseId } = world;

    const enrolled = await t.run((ctx: TestCtx) =>
      ctx.db.insert("enrollments", {
        userId: studentId,
        courseId,
        progressPercent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const ownThread = await t.run((ctx: TestCtx) =>
      ctx.db.insert("discussionThreads", {
        courseId,
        title: "Question I asked",
        createdBy: studentId,
        createdAt: 1_000,
      }),
    );

    const someoneElsesThread = await t.run((ctx: TestCtx) =>
      ctx.db.insert("discussionThreads", {
        courseId,
        title: "Thread I replied in",
        createdBy: world.instructorId,
        createdAt: 2_000,
      }),
    );

    // Nobody in the thread, so it must not surface.
    const untouched = await t.run((ctx: TestCtx) =>
      ctx.db.insert("discussionThreads", {
        courseId,
        title: "Thread I never joined",
        createdBy: world.instructorId,
        createdAt: 3_000,
      }),
    );

    await t.run((ctx: TestCtx) => {
      return ctx.db.insert("discussionMessages", {
        threadId: someoneElsesThread,
        userId: studentId,
        body: "Here is what I think about this",
        createdAt: 4_000,
      });
    });

    return { ...world, enrolled, ownThread, someoneElsesThread, untouched };
  }

  test("returns threads the caller created or replied in, newest first", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedCourseWorld(t);

    const rows = await as(t, "clerk_student").query(listDiscussionActivity, {});

    expect(rows.map((row) => row.threadId)).toEqual([
      world.someoneElsesThread,
      world.ownThread,
    ]);
    expect(rows[0].title).toBe("Thread I replied in");
    expect(rows[0].createdByMe).toBe(false);
    expect(rows[0].lastMessagePreview).toBe("Here is what I think about this");
    expect(rows[0].lastMessageAuthorName).toBe("Student");
    expect(rows[0].lastMessageAt).toBe(4_000);
    expect(rows[0].courseSlug).toBe("discussion-course");
    expect(rows[0].courseTitle).toBe("Discussion Course");
    // The link the UI follows to the existing discussions page.
    expect(`/dashboard/courses/${rows[0].courseSlug}/discussions`).toContain(
      "discussion-course",
    );

    // A thread with no reply of mine is not activity.
    expect(rows.map((row) => row.threadId)).not.toContain(world.untouched);
    expect(rows[1].createdByMe).toBe(true);
    expect(rows[1].lastMessageAt).toBeNull();
  });

  test("gates on course access: unenrolled learners see nothing from that course", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedCourseWorld(t);

    // The outsider replied in the thread, so they are a participant — but they
    // are not enrolled, which is the admission `discussions.ts:verifyAccess`
    // enforces, so the feed must withhold it.
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("discussionMessages", {
        threadId: world.someoneElsesThread,
        userId: world.outsiderId,
        body: "let me in",
        createdAt: 5_000,
      }),
    );

    expect(
      await as(t, "clerk_outsider").query(listDiscussionActivity, {}),
    ).toEqual([]);

    // The course's own instructor is admitted without enrolling.
    expect(
      await as(t, "clerk_instructor").query(listDiscussionActivity, {}),
    ).not.toHaveLength(0);

    // And an admin is admitted everywhere: give the admin a reply in the same
    // thread and it surfaces without any enrollment of its own.
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("discussionMessages", {
        threadId: world.someoneElsesThread,
        userId: world.adminId,
        body: "admin weighing in",
        createdAt: 6_000,
      }),
    );
    const adminRows = await as(t, "clerk_admin").query(
      listDiscussionActivity,
      {},
    );
    expect(adminRows.map((row) => row.threadId)).toEqual([
      world.someoneElsesThread,
    ]);
  });

  test("an enrollment that is later removed withdraws the activity", async () => {
    const t = convexTest(testSchema, modules);
    const world = await seedCourseWorld(t);

    expect(
      await as(t, "clerk_student").query(listDiscussionActivity, {}),
    ).toHaveLength(2);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.delete(world.enrolled);
    });

    expect(
      await as(t, "clerk_student").query(listDiscussionActivity, {}),
    ).toEqual([]);
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await expect(t.query(listDiscussionActivity, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── searchPeople ───────────────────────────────────────────────────────────

describe("searchPeople", () => {
  test("matches by name, excludes the caller, and reports an existing thread", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId, otherId } = await seedWorld(t);
    const threadId = await seedThread(t, studentId, otherId, 5_000);

    const rows = await as(t, "clerk_student").query(searchPeople, {
      query: "other",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(otherId);
    expect(rows[0].existingThreadId).toBe(threadId);

    // Searching for yourself offers nothing to talk to.
    expect(
      await as(t, "clerk_student").query(searchPeople, { query: "Student" }),
    ).toEqual([]);
  });

  test("needs at least two characters and honours the limit", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const student = as(t, "clerk_student");

    expect(await student.query(searchPeople, { query: "a" })).toEqual([]);
    expect(await student.query(searchPeople, { query: "  " })).toEqual([]);

    // "er" appears in Other Learner and Outsider (Instructor ends "or", and
    // Student is the caller) — two matches before the limit trims it.
    const unlimited = await student.query(searchPeople, { query: "er" });
    expect(unlimited.length).toBe(2);
    expect(
      await student.query(searchPeople, { query: "er", limit: 1 }),
    ).toHaveLength(1);
  });

  test("matches on name only, so it cannot be used to probe registered emails", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const student = as(t, "clerk_student");

    // Every seeded account has an @test.com address, so a match here would make
    // this an account-enumeration oracle.
    expect(
      await student.query(searchPeople, { query: "test.com" }),
    ).toEqual([]);

    // And the response shape carries no email at all.
    const rows = await student.query(searchPeople, { query: "er" });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "existingThreadId",
        "id",
        "imageUrl",
        "name",
        "role",
      ]);
    }
  });

  test("rejects unauthenticated callers", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    await expect(t.query(searchPeople, { query: "other" })).rejects.toThrow(
      /Not authenticated/,
    );
  });
});
