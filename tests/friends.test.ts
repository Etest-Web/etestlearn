import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";
import {
  acceptRequest,
  cancelRequest,
  declineRequest,
  getFriendsActivity,
  getPendingRequestCount,
  listFriends,
  listRequests,
  listSidebarFriends,
  removeFriend,
  searchUsers,
  sendRequest,
} from "../lib/friends-api";
import type {
  DiscoverUser,
  FriendSummary,
  FriendsActivityItem,
  RequestsBundle,
  SidebarFriend,
} from "../lib/friends-api";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Integration tests for the mutual-approval social graph.
 *
 * The privacy cases are the point of this suite, not an afterthought. A social
 * graph that leaks is worse than no social graph, so the tests that matter are
 * the negative ones: a non-friend's activity must be unreachable, a pending
 * request must grant nothing, and a decline must never have granted anything.
 *
 * Function handles come from `lib/friends-api` rather than `api.friends.*`
 * because `convex/_generated/api.d.ts` predates this module — the wire names are
 * identical, so these tests exercise the real functions.
 */

const modules = import.meta.glob("../convex/**/*.ts");

const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

/**
 * `t` is `any` here (the same looseness `tests/discussions.test.ts` uses) and so
 * is the return value: `convex-test`'s generic `TestConvex` cannot infer a
 * DataModel for a hand-built function reference, which would otherwise force
 * `any` annotations onto every callback in this file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asUser = (t: any, subject: string): any =>
  t.withIdentity({ subject, tokenIdentifier: subject });

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);
/** UTC noon of the day the suite is running on. */
function noonToday(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
}

interface Seeded {
  ada: Id<"users">;
  grace: Id<"users">;
  mallory: Id<"users">;
  eve: Id<"users">;
  frank: Id<"users">;
  courseId: Id<"courses">;
}

async function seedUser(
  t: any,
  clerkId: string,
  name: string,
  email: string,
  role: "student" | "instructor" | "admin" = "student",
): Promise<Id<"users">> {
  return t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId,
      name,
      email,
      role,
      createdAt: NOW,
    }),
  );
}

async function seedWorld(t: any): Promise<Seeded> {
  // `ada` is the caller in most tests. The rest exist to be a stranger, a
  // pending requester, a decliner, and a deleted account respectively.
  const ada = await seedUser(t, "clerk_ada", "Ada Lovelace", "ada@test.com");
  const grace = await seedUser(t, "clerk_grace", "Grace Hopper", "grace@test.com");
  const mallory = await seedUser(t, "clerk_mallory", "Mallory Emms", "mall@test.com");
  const eve = await seedUser(t, "clerk_eve", "Eve Polastri", "eve@test.com");
  const frank = await seedUser(t, "clerk_frank", "Frank Adams", "frank@test.com");

  const courseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Compilers 101",
      slug: "compilers-101",
      description: "A course",
      instructorId: grace,
      published: true,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );

  return { ada, grace, mallory, eve, frank, courseId };
}

/** Inserts a friendship row directly, bypassing the mutation guards. */
async function seedFriendship(
  t: any,
  row: {
    requesterId: Id<"users">;
    addresseeId: Id<"users">;
    status: "pending" | "accepted" | "declined";
    createdAt?: number;
    respondedAt?: number;
  },
): Promise<Id<"friendships">> {
  return t.run(
    async (ctx: TestCtx) =>
      ctx.db.insert("friendships", {
        requesterId: row.requesterId,
        addresseeId: row.addresseeId,
        status: row.status,
        createdAt: row.createdAt ?? NOW,
        respondedAt: row.respondedAt,
      }),
  );
}

/** Grants a friend some learning history: 3 certificates, mixed progress. */
async function seedActivity(
  t: any,
  userId: Id<"users">,
  courseId: Id<"courses">,
): Promise<void> {
  return t.run(async (ctx: TestCtx) => {
    await ctx.db.insert("certificates", {
      userId,
      courseId,
      issuedAt: NOW - 10 * DAY,
      serial: "GL-A",
    });
    await ctx.db.insert("certificates", {
      userId,
      courseId,
      issuedAt: NOW - 9 * DAY,
      serial: "GL-B",
      revokedAt: NOW - DAY,
    });
    await ctx.db.insert("certificates", {
      userId,
      courseId,
      issuedAt: NOW - 8 * DAY,
      serial: "GL-C",
    });
    await ctx.db.insert("enrollments", {
      userId,
      courseId,
      progressPercent: 0,
      createdAt: NOW - 20 * DAY,
      updatedAt: NOW - 20 * DAY,
    });
    await ctx.db.insert("enrollments", {
      userId,
      courseId,
      progressPercent: 55,
      createdAt: NOW - 19 * DAY,
      updatedAt: NOW - DAY,
    });
    await ctx.db.insert("enrollments", {
      userId,
      courseId,
      progressPercent: 100,
      createdAt: NOW - 30 * DAY,
      updatedAt: NOW - 18 * DAY,
    });
    // Anchored to UTC noon of the real current day, minus 1/2/3 days. That
    // makes the streak exactly 3 regardless of when the suite runs: today has no
    // activity, so the "today has not started yet" grace rule hands the walk to
    // yesterday and it continues unbroken. (Without the anchor the streak would
    // depend on the wall clock.)
    for (const offset of [1, 2, 3]) {
      await ctx.db.insert("learningActivities", {
        userId,
        type: "lesson_completed",
        courseId,
        createdAt: noonToday() - offset * DAY,
      });
    }
  });
}

/** Resolves a `users` row to its id, by Clerk subject. */
async function userId(t: any, clerkId: string): Promise<Id<"users">> {
  return t.run(async (ctx: TestCtx) => {
    const row = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    return row!._id;
  });
}

// ─── Typed query wrappers ─────────────────────────────────────────────────
// `asUser` is `any` (see above), which would make every `.map((x) => ...)`
// callback an implicit `any`. These wrappers restore the declared result types
// so the assertions below are typechecked against the real view models.

const qFriends = (t: any, subject: string): Promise<FriendSummary[]> =>
  asUser(t, subject).query(listFriends);
const qSidebar = (t: any, subject: string, limit?: number): Promise<SidebarFriend[]> =>
  asUser(t, subject).query(listSidebarFriends, limit === undefined ? {} : { limit });
const qRequests = (t: any, subject: string): Promise<RequestsBundle> =>
  asUser(t, subject).query(listRequests);
const qCount = (t: any, subject: string): Promise<number> =>
  asUser(t, subject).query(getPendingRequestCount);
const qFeed = (t: any, subject: string, limit?: number): Promise<FriendsActivityItem[]> =>
  asUser(t, subject).query(getFriendsActivity, limit === undefined ? {} : { limit });
const qDiscover = (
  t: any,
  subject: string,
  query: string,
  limit?: number,
): Promise<DiscoverUser[]> =>
  asUser(t, subject).query(searchUsers, limit === undefined ? { query } : { query, limit });

// ─── listFriends ──────────────────────────────────────────────────────────

describe("listFriends", () => {
  test("returns accepted friends from both directions, most recently befriended first", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory, courseId } = await seedWorld(t);

    // Ada asked Grace (outgoing) and Eve asked Ada (incoming).
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
      createdAt: NOW - 10 * DAY,
      respondedAt: NOW - 9 * DAY,
    });
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "accepted",
      createdAt: NOW - 2 * DAY,
      respondedAt: NOW - 1 * DAY,
    });
    await seedActivity(t, grace, courseId);
    await seedActivity(t, mallory, courseId);

    const friends = await qFriends(t, "clerk_ada");

    expect(friends.map((f) => f.name)).toEqual(["Mallory Emms", "Grace Hopper"]);
    // Mallory's friendship is the newest; Grace's row was inserted first. The
    // order must follow `since`, not insertion order.
    const [newest, older] = friends;
    expect(newest._id).toBe(mallory);
    expect(older._id).toBe(grace);
    // Denormalized: the client never has to join a user row.
    expect(newest.role).toBe("student");
    expect(newest.imageUrl).toBeNull();
    expect(newest.friendshipId).toBeTruthy();
    expect(newest.since).toBe(NOW - DAY);
    expect(older.since).toBe(NOW - 9 * DAY);
  });

  test("summarizes certificates, in-progress courses and streak", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, courseId } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
      respondedAt: NOW,
    });
    await seedActivity(t, grace, courseId);

    const [friend] = await qFriends(t, "clerk_ada");
    // Three certificates, one of them revoked.
    expect(friend.activity.certificatesEarned).toBe(2);
    // 0% and 100% enrollments are not "in progress".
    expect(friend.activity.coursesInProgress).toBe(1);
    expect(friend.activity.currentStreak).toBe(3);
    expect(friend.activity.lastActiveAt).not.toBeNull();
  });

  test("excludes pending and declined relationships", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "pending",
    });
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "declined",
      respondedAt: NOW,
    });

    expect(await qFriends(t, "clerk_ada")).toEqual([]);
  });

  test("never leaks another user's friend list", async () => {
    const t = convexTest(testSchema, modules);
    const { grace, mallory } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: mallory,
      status: "accepted",
    });

    // Mallory is friends with Grace. Ada sees nothing of it.
    expect(await qFriends(t, "clerk_ada")).toEqual([]);
    expect(
      (await qFriends(t, "clerk_mallory")).map((f) => f.name),
    ).toEqual(["Grace Hopper"]);
  });

  test("collapses duplicate rows for one person to the newest", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    // Unreachable through `sendRequest`, which refuses a duplicate in either
    // direction — this covers rows that predate that guard.
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
      respondedAt: NOW - 10 * DAY,
    });
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "accepted",
      respondedAt: NOW - DAY,
    });

    const friends = await qFriends(t, "clerk_ada");
    expect(friends).toHaveLength(1);
    expect(friends[0].since).toBe(NOW - DAY);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    await expect(t.query(listFriends)).rejects.toThrow(/Not authenticated/);
  });
});

// ─── listSidebarFriends ───────────────────────────────────────────────────

describe("listSidebarFriends", () => {
  test("caps the list and orders most recently befriended first", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory, eve, frank } = await seedWorld(t);

    const people = [
      { id: grace, since: NOW - 5 * DAY },
      { id: mallory, since: NOW - 1 * DAY },
      { id: eve, since: NOW - 3 * DAY },
      { id: frank, since: NOW - 4 * DAY },
    ];
    for (const p of people) {
      await seedFriendship(t, {
        requesterId: ada,
        addresseeId: p.id,
        status: "accepted",
        respondedAt: p.since,
      });
    }

    const capped = await qSidebar(t, "clerk_ada", 2);
    expect(capped.map((f) => f.name)).toEqual(["Mallory Emms", "Eve Polastri"]);
    // Only the four documented fields — no activity, no friendship row.
    expect(Object.keys(capped[0]).sort()).toEqual([
      "_id",
      "imageUrl",
      "name",
      "role",
    ]);

    const defaulted = await qSidebar(t, "clerk_ada");
    expect(defaulted).toHaveLength(4);
  });

  test("clamps a hostile limit instead of trusting it", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
    });

    // Over the ceiling: clamped, not honoured.
    expect(
      await qSidebar(t, "clerk_ada", 5000),
    ).toHaveLength(1);
    // Below the floor: clamped up to 1, not zero.
    expect(
      await qSidebar(t, "clerk_ada", 0),
    ).toHaveLength(1);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    await expect(t.query(listSidebarFriends, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── listRequests ─────────────────────────────────────────────────────────

describe("listRequests", () => {
  test("returns both directions, newest first in each", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "pending",
      createdAt: NOW - 5 * DAY,
    });
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
      createdAt: NOW - DAY,
    });
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "pending",
      createdAt: NOW - 3 * DAY,
    });

    const bundle = await qRequests(t, "clerk_ada");
    expect(bundle.incoming.map((r) => r.name)).toEqual([
      "Mallory Emms",
      "Grace Hopper",
    ]);
    expect(bundle.outgoing.map((r) => r.name)).toEqual(["Grace Hopper"]);
    expect(bundle.incoming[0].createdAt).toBe(NOW - DAY);
    expect(bundle.incoming[0].role).toBe("student");
    expect(bundle.incoming[0].imageUrl).toBeNull();
    // Either party can appear with two separate rows for the same person.
    expect(bundle.incoming[0].friendshipId).not.toBe(bundle.outgoing[0].friendshipId);
  });

  test("hides accepted and declined rows", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "accepted",
    });
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "declined",
    });

    const bundle = await qRequests(t, "clerk_ada");
    expect(bundle).toEqual({ incoming: [], outgoing: [] });
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    await expect(t.query(listRequests)).rejects.toThrow(/Not authenticated/);
  });
});

// ─── getPendingRequestCount ───────────────────────────────────────────────

describe("getPendingRequestCount", () => {
  test("counts incoming pending only, and ignores outgoing", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory, eve } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "pending",
    });
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });
    // Outgoing: mine to wait on, not something I am waiting for.
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: eve,
      status: "pending",
    });
    // Neither pending, and someone else's.
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: mallory,
      status: "accepted",
    });

    const count = await qCount(t, "clerk_ada");
    expect(count).toBe(2);
    // A number, not a list: the sidebar badge must never ship rows.
    expect(typeof count).toBe("number");
  });

  test("is zero with no requests", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    expect(await qCount(t, "clerk_ada")).toBe(0);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    await expect(t.query(getPendingRequestCount)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── Privacy: getFriendsActivity ──────────────────────────────────────────

describe("getFriendsActivity privacy", () => {
  test("only surfaces accepted friends' activity", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory, eve, courseId } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
    });
    await seedActivity(t, grace, courseId);
    // Mallory and Eve are strangers to Ada but both have juicy history.
    await seedActivity(t, mallory, courseId);
    await seedActivity(t, eve, courseId);

    const feed = await qFeed(t, "clerk_ada");
    expect(feed.length).toBeGreaterThan(0);
    const userIds = new Set(feed.map((item) => item.userId));
    expect([...userIds]).toEqual([grace]);
    expect(feed.map((item) => item.name)).toContain("Grace Hopper");
    expect(feed.every((item) => item.courseTitle === "Compilers 101")).toBe(true);
  });

  test("a non-friend's activity is unreachable", async () => {
    const t = convexTest(testSchema, modules);
    const { mallory, courseId } = await seedWorld(t);
    // Mallory studied; she and Ada have never spoken.
    await seedActivity(t, mallory, courseId);

    const feed = await qFeed(t, "clerk_ada");
    expect(feed).toEqual([]);
    // Nothing about her leaks through the row either.
    expect(JSON.stringify(feed)).not.toContain("Compilers 101");
    expect(JSON.stringify(feed)).not.toContain("Mallory");
  });

  test("a pending request grants no activity access", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory, courseId } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });
    await seedActivity(t, mallory, courseId);

    expect(await qFeed(t, "clerk_ada")).toEqual([]);
    // Nor is the requester let into Ada's own activity.
    expect(
      await qFeed(t, "clerk_mallory"),
    ).toEqual([]);
  });

  test("a declined request grants no activity access", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory, courseId } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "declined",
      respondedAt: NOW,
    });
    await seedActivity(t, mallory, courseId);

    expect(await qFeed(t, "clerk_ada")).toEqual([]);
    expect(
      await qFeed(t, "clerk_mallory"),
    ).toEqual([]);
  });

  test("activity appears only after the request is accepted", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory, courseId } = await seedWorld(t);
    await seedActivity(t, mallory, courseId);

    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });
    const adaView = asUser(t, "clerk_ada");
    const adaFeed = (): Promise<FriendsActivityItem[]> =>
      adaView.query(getFriendsActivity, {});
    expect(await adaFeed()).toEqual([]);

    await adaView.mutation(acceptRequest, { friendshipId });
    const feed = await adaFeed();
    expect(feed.length).toBeGreaterThan(0);
    expect(new Set(feed.map((i) => i.userId))).toEqual(new Set([mallory]));
  });

  test("removing a friendship revokes activity access again", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory, courseId } = await seedWorld(t);
    await seedActivity(t, mallory, courseId);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "accepted",
    });

    const adaView = asUser(t, "clerk_ada");
    const adaFeed = (): Promise<FriendsActivityItem[]> =>
      adaView.query(getFriendsActivity, {});
    expect(await adaFeed()).toHaveLength(3);

    await adaView.mutation(removeFriend, { friendshipId });
    expect(await adaFeed()).toEqual([]);
  });

  test("honours the limit and orders newest first", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory, courseId } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
    });
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: mallory,
      status: "accepted",
    });
    await seedActivity(t, grace, courseId);
    await seedActivity(t, mallory, courseId);

    const feed = await qFeed(t, "clerk_ada", 2);
    expect(feed).toHaveLength(2);
    const timestamps = feed.map((i) => i.at);
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    await expect(t.query(getFriendsActivity, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── searchUsers ──────────────────────────────────────────────────────────

describe("searchUsers", () => {
  test("finds people by name and email substring", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const byName = await qDiscover(t, "clerk_ada", "hopper");
    expect(byName.map((u) => u.name)).toEqual(["Grace Hopper"]);

    const byEmail = await qDiscover(t, "clerk_ada", "eve@");
    expect(byEmail.map((u) => u.name)).toEqual(["Eve Polastri"]);
    // Discover matches on email, so it is the one list that returns it.
    expect(byEmail[0].email).toBe("eve@test.com");
  });

  test("ranks an exact name match above prefix and substring matches", async () => {
    const t = convexTest(testSchema, modules);
    // The caller must NOT be one of the candidates — discover excludes self.
    await seedUser(t, "clerk_ada", "Zoe Caller", "zoe@test.com");
    await seedUser(t, "clerk_exact", "Ada", "exact@test.com");
    await seedUser(t, "clerk_prefix", "Ada Lovelace", "prefix@test.com");
    await seedUser(t, "clerk_substring", "Bertrand Ada", "sub@test.com");

    const results = await qDiscover(t, "clerk_ada", "ada");
    expect(results.map((u) => u.name)).toEqual([
      "Ada",
      "Ada Lovelace",
      "Bertrand Ada",
    ]);
  });

  test("excludes self and anyone with an existing relationship in any status", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory, eve, frank } = await seedWorld(t);

    // All five statuses covered, in both directions.
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "pending",
    });
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "accepted",
    });
    await seedFriendship(t, {
      requesterId: eve,
      addresseeId: ada,
      status: "declined",
    });
    await seedFriendship(t, {
      requesterId: frank,
      addresseeId: ada,
      status: "accepted",
    });

    // "e" matches Eve and Frank by name/email but both are already related.
    const results = await qDiscover(t, "clerk_ada", "e");
    const ids = results.map((u) => u._id);
    expect(ids).not.toContain(ada);
    expect(ids).not.toContain(grace);
    expect(ids).not.toContain(mallory);
    expect(ids).not.toContain(eve);
    expect(ids).not.toContain(frank);

    // A wider term still never returns Ada herself.
    const wide = await qDiscover(t, "clerk_ada", "a");
    expect(wide.map((u) => u._id)).not.toContain(ada);
  });

  test("short terms short-circuit before any read", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    expect(await qDiscover(t, "clerk_ada", "a")).toEqual(
      [],
    );
    expect(await qDiscover(t, "clerk_ada", "   ")).toEqual(
      [],
    );
  });

  test("respects the result limit", async () => {
    const t = convexTest(testSchema, modules);
    await seedUser(t, "clerk_ada", "Ada Lovelace", "ada@test.com");
    for (let i = 0; i < 5; i++) {
      await seedUser(t, `clerk_many_${i}`, `Many Match ${i}`, `m${i}@test.com`);
    }

    const results = await qDiscover(t, "clerk_ada", "many", 2);
    expect(results).toHaveLength(2);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    await expect(t.query(searchUsers, { query: "ada" })).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── sendRequest ──────────────────────────────────────────────────────────

describe("sendRequest", () => {
  test("creates a pending row", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);

    const friendshipId = await asUser(t, "clerk_ada").mutation(sendRequest, {
      userId: grace,
    });
    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(friendshipId));
    expect(row).toMatchObject({
      requesterId: ada,
      addresseeId: grace,
      status: "pending",
    });
  });

  test("refuses a self-request", async () => {
    const t = convexTest(testSchema, modules);
    const { ada } = await seedWorld(t);

    await expect(
      asUser(t, "clerk_ada").mutation(sendRequest, { userId: ada }),
    ).rejects.toThrow(/cannot send a friend request to yourself/);
  });

  test("refuses a request to an account that no longer exists", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const ghostId = await seedUser(
      t,
      "clerk_ghost",
      "Ghost",
      "ghost@test.com",
    );
    await t.run(async (ctx: TestCtx) => ctx.db.delete(ghostId));

    await expect(
      asUser(t, "clerk_ada").mutation(sendRequest, { userId: ghostId }),
    ).rejects.toThrow(/no longer has an account/);
  });

  test("refuses a duplicate in the same direction", async () => {
    const t = convexTest(testSchema, modules);
    const { grace } = await seedWorld(t);

    await asUser(t, "clerk_ada").mutation(sendRequest, { userId: grace });
    await expect(
      asUser(t, "clerk_ada").mutation(sendRequest, { userId: grace }),
    ).rejects.toThrow(/already sent Grace Hopper a friend request/);

    const rows = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("friendships").collect(),
    );
    expect(rows).toHaveLength(1);
  });

  test("refuses a duplicate in the reverse direction", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "pending",
    });

    await expect(
      asUser(t, "clerk_ada").mutation(sendRequest, { userId: grace }),
    ).rejects.toThrow(/Grace Hopper has already sent you a friend request/);
  });

  test("refuses when already friends", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
    });

    await expect(
      asUser(t, "clerk_ada").mutation(sendRequest, { userId: grace }),
    ).rejects.toThrow(/already friends/);
  });

  test("a declined request may be re-asked, and re-uses the same row", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    const first = await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "declined",
      createdAt: NOW - 5 * DAY,
      respondedAt: NOW - 4 * DAY,
    });

    const friendshipId = await asUser(t, "clerk_ada").mutation(sendRequest, {
      userId: grace,
    });
    // Re-opened, not duplicated: one row per directed pair.
    expect(friendshipId).toBe(first);
    const rows = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("friendships").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    // The stale decision timestamp is cleared so the UI shows the new attempt.
    expect(rows[0].respondedAt).toBeUndefined();

    const bundle = await qRequests(t, "clerk_ada");
    expect(bundle.outgoing).toHaveLength(1);
  });

  test("asking someone who declined you creates a new forward row", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    // They asked, Ada declined.
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "declined",
      respondedAt: NOW - DAY,
    });

    await asUser(t, "clerk_ada").mutation(sendRequest, { userId: grace });
    const bundle = await qRequests(t, "clerk_ada");
    expect(bundle.outgoing.map((r) => r.name)).toEqual(["Grace Hopper"]);
    expect(bundle.incoming).toEqual([]);
  });

  test("works across roles — instructors and admins participate too", async () => {
    const t = convexTest(testSchema, modules);
    await seedUser(t, "clerk_ada", "Ada Lovelace", "ada@test.com");
    await seedUser(t, "clerk_instructor", "Ivan Instructor", "ivan@test.com", "instructor");
    await seedUser(t, "clerk_admin", "Ada Admin", "admin@test.com", "admin");

    const instructorId = await userId(t, "clerk_instructor");
    await expect(
      asUser(t, "clerk_ada").mutation(sendRequest, { userId: instructorId }),
    ).resolves.toBeTruthy();
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    const { grace } = await seedWorld(t);
    await expect(t.mutation(sendRequest, { userId: grace })).rejects.toThrow(
      /Not authenticated/,
    );
  });

  test("rate limits after twenty requests an hour", async () => {
    const t = convexTest(testSchema, modules);
    await seedUser(t, "clerk_ada", "Ada Lovelace", "ada@test.com");
    const targets: Id<"users">[] = [];
    for (let i = 0; i < 21; i++) {
      targets.push(
        await seedUser(t, `clerk_target_${i}`, `Target ${i}`, `t${i}@test.com`),
      );
    }

    const caller = asUser(t, "clerk_ada");
    for (let i = 0; i < 20; i++) {
      await expect(
        caller.mutation(sendRequest, { userId: targets[i] }),
      ).resolves.toBeTruthy();
    }
    await expect(
      caller.mutation(sendRequest, { userId: targets[20] }),
    ).rejects.toThrow(/Too many requests/);

    // The refused attempt wrote nothing.
    const rows = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("friendships").collect(),
    );
    expect(rows).toHaveLength(20);
  });
});

// ─── acceptRequest / declineRequest ───────────────────────────────────────

describe("acceptRequest and declineRequest", () => {
  test("accept marks the friendship accepted with a timestamp", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });

    await asUser(t, "clerk_ada").mutation(acceptRequest, { friendshipId });
    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(friendshipId));
    expect(row?.status).toBe("accepted");
    expect(row?.respondedAt).toBeGreaterThan(0);
    expect(await qFriends(t, "clerk_ada")).toHaveLength(1);
    expect(await qRequests(t, "clerk_ada")).toEqual({
      incoming: [],
      outgoing: [],
    });
  });

  test("decline marks it declined and leaves no friendship", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });

    await asUser(t, "clerk_ada").mutation(declineRequest, { friendshipId });
    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(friendshipId));
    expect(row?.status).toBe("declined");
    expect(await qFriends(t, "clerk_ada")).toEqual([]);
  });

  test("a third party cannot accept or decline someone else's request", async () => {
    const t = convexTest(testSchema, modules);
    const { mallory, eve } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: eve,
      status: "pending",
    });

    // Ada is neither requester nor addressee.
    const caller = asUser(t, "clerk_ada");
    await expect(
      caller.mutation(acceptRequest, { friendshipId }),
    ).rejects.toThrow(/sent to someone else/);
    await expect(
      caller.mutation(declineRequest, { friendshipId }),
    ).rejects.toThrow(/sent to someone else/);

    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(friendshipId));
    expect(row?.status).toBe("pending");
  });

  test("the requester cannot accept their own outgoing request", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "pending",
    });

    await expect(
      asUser(t, "clerk_ada").mutation(acceptRequest, { friendshipId }),
    ).rejects.toThrow(/sent to someone else/);
    await expect(
      asUser(t, "clerk_ada").mutation(declineRequest, { friendshipId }),
    ).rejects.toThrow(/sent to someone else/);
  });

  test("a malformed self-row can never be accepted", async () => {
    const t = convexTest(testSchema, modules);
    const { ada } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: ada,
      addresseeId: ada,
      status: "pending",
    });

    await expect(
      asUser(t, "clerk_ada").mutation(acceptRequest, { friendshipId }),
    ).rejects.toThrow(/malformed/);
  });

  test("cannot answer a request twice", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });

    const caller = asUser(t, "clerk_ada");
    await caller.mutation(acceptRequest, { friendshipId });
    await expect(
      caller.mutation(acceptRequest, { friendshipId }),
    ).rejects.toThrow(/already been handled/);
    await expect(
      caller.mutation(declineRequest, { friendshipId }),
    ).rejects.toThrow(/already been handled/);
  });

  test("cannot answer a request that was never pending", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "declined",
      respondedAt: NOW,
    });

    await expect(
      asUser(t, "clerk_ada").mutation(acceptRequest, { friendshipId }),
    ).rejects.toThrow(/already been handled/);
  });

  test("refuses a friendship id that no longer exists", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });
    // Deleted underneath the client (the other party cancelled it).
    await t.run(async (ctx: TestCtx) => ctx.db.delete(friendshipId));

    await expect(
      asUser(t, "clerk_ada").mutation(acceptRequest, { friendshipId }),
    ).rejects.toThrow(/no longer exists/);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });

    await expect(t.mutation(acceptRequest, { friendshipId })).rejects.toThrow(
      /Not authenticated/,
    );
    await expect(t.mutation(declineRequest, { friendshipId })).rejects.toThrow(
      /Not authenticated/,
    );
  });

  test("rate limits a click-through of the accept button", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory, eve, frank } = await seedWorld(t);

    const incoming = [grace, mallory, eve, frank];
    const ids: Id<"friendships">[] = [];
    for (let i = 0; i < 31; i++) {
      ids.push(
        await seedFriendship(t, {
          requesterId: incoming[i % incoming.length],
          addresseeId: ada,
          status: "pending",
        }),
      );
    }

    const caller = asUser(t, "clerk_ada");
    for (let i = 0; i < 30; i++) {
      await expect(
        caller.mutation(acceptRequest, { friendshipId: ids[i] }),
      ).resolves.toBeTruthy();
    }
    await expect(
      caller.mutation(acceptRequest, { friendshipId: ids[30] }),
    ).rejects.toThrow(/Too many requests/);

    const accepted = await t.run(async (ctx: TestCtx) =>
      ctx.db
        .query("friendships")
        .withIndex("by_addressee_status", (q) =>
          q.eq("addresseeId", ada).eq("status", "accepted"),
        )
        .collect(),
    );
    expect(accepted).toHaveLength(30);
  });
});

// ─── cancelRequest ────────────────────────────────────────────────────────

describe("cancelRequest", () => {
  test("the requester can withdraw a pending request", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);
    const friendshipId = await asUser(t, "clerk_grace").mutation(sendRequest, {
      userId: await userId(t, "clerk_ada"),
    });

    await asUser(t, "clerk_grace").mutation(cancelRequest, { friendshipId });
    const rows = await t.run(async (ctx: TestCtx) =>
      ctx.db.query("friendships").collect(),
    );
    expect(rows).toEqual([]);
    expect(await qRequests(t, "clerk_grace")).toEqual({
      incoming: [],
      outgoing: [],
    });
  });

  test("the addressee cannot cancel it for me", async () => {
    const t = convexTest(testSchema, modules);
    const { ada } = await seedWorld(t);
    const friendshipId = await asUser(t, "clerk_grace").mutation(sendRequest, {
      userId: ada,
    });

    await expect(
      asUser(t, "clerk_ada").mutation(cancelRequest, { friendshipId }),
    ).rejects.toThrow(/only cancel a request you sent/);
  });

  test("cannot cancel a request that was already answered", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "accepted",
      respondedAt: NOW,
    });

    await expect(
      asUser(t, "clerk_mallory").mutation(cancelRequest, { friendshipId }),
    ).rejects.toThrow(/already been handled/);
  });

  test("cannot cancel an accepted friendship — that is removeFriend's job", async () => {
    const t = convexTest(testSchema, modules);
    const { mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: await userId(t, "clerk_ada"),
      status: "accepted",
    });

    await expect(
      asUser(t, "clerk_mallory").mutation(cancelRequest, { friendshipId }),
    ).rejects.toThrow(/already been handled/);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });

    await expect(t.mutation(cancelRequest, { friendshipId })).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

// ─── removeFriend ─────────────────────────────────────────────────────────

describe("removeFriend", () => {
  test("either party can end an accepted friendship", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);

    // The requester removes.
    const first = await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
    });
    await asUser(t, "clerk_ada").mutation(removeFriend, { friendshipId: first });
    expect(await t.run(async (ctx: TestCtx) => ctx.db.get(first))).toBeNull();

    // The addressee removes.
    const second = await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
    });
    await asUser(t, "clerk_grace").mutation(removeFriend, {
      friendshipId: second,
    });
    expect(await t.run(async (ctx: TestCtx) => ctx.db.get(second))).toBeNull();
  });

  test("a third party cannot remove someone else's friendship", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    // Grace and Ada are friends; Mallory (an unrelated third party) is not.
    const friendshipId = await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "accepted",
    });

    await expect(
      asUser(t, "clerk_mallory").mutation(removeFriend, { friendshipId }),
    ).rejects.toThrow(/not part of this friendship/);
    expect(await t.run(async (ctx: TestCtx) => ctx.db.get(friendshipId))).toBeTruthy();
  });

  test("refuses to touch a pending request", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "pending",
    });

    await expect(
      asUser(t, "clerk_ada").mutation(removeFriend, { friendshipId }),
    ).rejects.toThrow(/Only an accepted friendship/);
    expect(await t.run(async (ctx: TestCtx) => ctx.db.get(friendshipId))).toBeTruthy();
  });

  test("refuses to touch a declined request", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "declined",
      respondedAt: NOW,
    });

    await expect(
      asUser(t, "clerk_mallory").mutation(removeFriend, { friendshipId }),
    ).rejects.toThrow(/Only an accepted friendship/);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, mallory } = await seedWorld(t);
    const friendshipId = await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "accepted",
    });

    await expect(t.mutation(removeFriend, { friendshipId })).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

