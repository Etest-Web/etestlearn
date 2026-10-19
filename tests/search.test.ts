import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";
import { searchApi } from "../lib/search-api";
import { friendsApi } from "../lib/friends-api";
import type { SearchResults } from "../lib/search";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Integration tests for the platform search.
 *
 * The point of this suite is that one query answers for **three kinds of
 * thing** — a course, an instructor, a person — and that the boundaries
 * between them hold:
 *
 *  · a learner is not an instructor, even though both are rows in `users`,
 *  · you are not a result for "who else is learning here?",
 *  · a suspended account is not in any directory,
 *  · a draft course is not in the results, and
 *  · the address of a learner is only ever shown when the address is what
 *    was searched for.
 *
 * Function handles come from `lib/search-api` rather than `api.search.*`
 * because `convex/_generated/api.d.ts` predates this module — the wire names
 * are identical, so these tests exercise the real functions.
 */

const modules = import.meta.glob("../convex/**/*.ts");

const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestCtx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
type TestWorld = TestConvex<typeof testSchema>;

const as = (t: TestWorld, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

const NOW = Date.UTC(2026, 2, 15, 12, 0, 0);

type Role = "student" | "instructor" | "admin";

async function seedUser(
  t: TestWorld,
  clerkId: string,
  name: string,
  email: string,
  role: Role = "student",
  extra: Record<string, unknown> = {},
): Promise<Id<"users">> {
  return t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId,
      name,
      email,
      role,
      createdAt: NOW,
      ...extra,
    }),
  );
}

async function seedCourse(
  t: TestWorld,
  args: {
    title: string;
    slug: string;
    instructorId: Id<"users">;
    description?: string;
    category?: string;
    published?: boolean;
  },
): Promise<Id<"courses">> {
  const description = args.description ?? "A course about testing";
  const category = args.category ?? "Engineering";
  return t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: args.title,
      slug: args.slug,
      description,
      instructorId: args.instructorId,
      category,
      published: args.published ?? true,
      // The search index reads this denormalised field, exactly as
      // `courses.createCourse` writes it.
      searchText: [args.title, description, category].join(" "),
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

/** The world every test in this file searches. */
async function seedWorld(t: TestWorld) {
  // The caller. A student, so the "people" section has somebody to exclude.
  const ada = await seedUser(t, "clerk_ada", "Ada Lovelace", "ada@test.com");
  // Another student — the expected "people" hit.
  const grace = await seedUser(t, "clerk_grace", "Grace Hopper", "grace@test.com");
  // A third student, so a search for a shared term has more than one answer.
  const mallory = await seedUser(t, "clerk_mallory", "Mallory Emms", "mall@test.com");
  // A student with no name on the profile, findable only by address.
  const nameless = await seedUser(t, "clerk_nameless", "", "nameless@test.com");
  // A teacher, whose profile is public. The bio mentions compilers, so a
  // *subject* search finds them as well as a name search.
  const teacher = await seedUser(t, "clerk_teacher", "Turing Ada", "teacher@test.com", "instructor", {
    bio: "Teaches compilers, machine learning and the theory of computation.",
    location: "Lagos, Nigeria",
    instructorRatingSum: 19,
    instructorRatingCount: 4,
  });
  // A second teacher, so the instructor section can be ranked.
  const otherTeacher = await seedUser(
    t,
    "clerk_other_teacher",
    "Alan Kay",
    "alan@test.com",
    "instructor",
  );
  // A suspended teacher: signed out everywhere else, so nowhere here.
  const suspended = await seedUser(
    t,
    "clerk_suspended",
    "Suspended Sam",
    "sam@test.com",
    "instructor",
    { suspendedAt: NOW },
  );

  const courseId = await seedCourse(t, {
    title: "Compilers 101",
    slug: "compilers-101",
    instructorId: teacher,
    description: "Build a compiler from scratch.",
    category: "Engineering",
  });
  const draftId = await seedCourse(t, {
    title: "Compilers Advanced",
    slug: "compilers-advanced",
    instructorId: teacher,
    description: "A draft that is not published.",
    published: false,
  });

  return {
    ada,
    grace,
    mallory,
    nameless,
    teacher,
    otherTeacher,
    suspended,
    courseId,
    draftId,
  };
}

/** Runs the search as a signed-in user. */
const q = (t: TestWorld, subject: string, query: string): Promise<SearchResults> =>
  as(t, subject).query(searchApi.search, { query });

// ─── The three kinds of result ────────────────────────────────────────────

describe("search", () => {
  test("answers for courses, instructors and people in one query", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "compilers");

    // The course matched on its title.
    expect(results.courses.map((c) => c.title)).toEqual(["Compilers 101"]);
    // The teacher matched on their bio — a subject search finds a teacher.
    expect(results.instructors.map((i) => i.name)).toEqual(["Turing Ada"]);
    // And nobody matched on "compilers" among the learners, who have no bio.
    expect(results.people).toEqual([]);
  });

  test("finds a person by name", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "grace");

    expect(results.people.map((p) => p.name)).toEqual(["Grace Hopper"]);
    expect(results.people[0].role).toBe("student");
  });

  test("finds an instructor by name", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "turing");

    expect(results.instructors.map((i) => i.name)).toEqual(["Turing Ada"]);
    // The same person is not also listed among "people": a teacher is
    // searchable as a teacher, once.
    expect(results.people).toEqual([]);
  });

  test("finds an instructor by a word in their bio", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "machine learning");

    expect(results.instructors.map((i) => i.name)).toEqual(["Turing Ada"]);
  });

  test("carries the instructor's rating so a card needs no extra read", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "turing");

    expect(results.instructors[0].ratingSum).toBe(19);
    expect(results.instructors[0].ratingCount).toBe(4);
  });

  test("carries no private fields on an instructor", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "turing");
    const instructor = results.instructors[0] as unknown as Record<
      string,
      unknown
    >;

    // The `users` row also holds an address, a phone number and the encrypted
    // bank account. None of them may travel to a search result.
    expect(instructor.email).toBeUndefined();
    expect(instructor.phone).toBeUndefined();
    expect(instructor.bankAccountEncrypted).toBeUndefined();
  });
});

// ─── Boundaries ───────────────────────────────────────────────────────────

describe("search boundaries", () => {
  test("never lists the caller among the people", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "ada");

    // Ada matches on her own name — and Ada is not a result for herself.
    expect(results.people.map((p) => p.name)).not.toContain("Ada Lovelace");
    // The teacher, whose surname is Ada, still is.
    expect(results.instructors.map((i) => i.name)).toEqual(["Turing Ada"]);
  });

  test("never lists a suspended account", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "suspended");

    expect(results.instructors).toEqual([]);
  });

  test("never lists an unpublished course", async () => {
    const t = convexTest(testSchema, modules);
    const { draftId } = await seedWorld(t);

    const results = await q(t, "clerk_ada", "compilers advanced");

    expect(results.courses.map((c) => c._id)).not.toContain(draftId);
  });

  test("returns nothing for a term that is too short to be useful", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "a");

    expect(results.courses).toEqual([]);
    expect(results.instructors).toEqual([]);
    expect(results.people).toEqual([]);
  });

  test("returns nothing for an empty term", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "   ");

    expect(results.courses).toEqual([]);
    expect(results.instructors).toEqual([]);
    expect(results.people).toEqual([]);
  });

  test("requires a session", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(t.query(searchApi.search, { query: "ada" })).rejects.toThrow(
      "Not authenticated",
    );
  });

  test("cuts an absurdly long term instead of matching against all of it", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    // A megabyte of text is matched against every account on the platform, so
    // the term is capped. The cap is a truncation, so a long phrase still
    // matches on its opening words.
    const results = await q(t, "clerk_ada", `${"grace".repeat(20_000)}`);
    expect(results.people.map((p) => p.name)).toEqual([]);
    expect(results.instructors).toEqual([]);
  });
});

// ─── One directory ────────────────────────────────────────────────────────

describe("the two people searches", () => {
  test("agree on who exists — the same name finds the same people either way", async () => {
    // The search page and the friends Discover tab are two doors onto one
    // directory. If they scanned different windows, the same name would return
    // different people depending on which box you typed it in.
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const viaSearch = await q(t, "clerk_ada", "hopper");
    const viaDiscover = await as(t, "clerk_ada").query(friendsApi.searchUsers, {
      query: "hopper",
    });

    expect(viaSearch.people.map((p) => p.name)).toEqual(["Grace Hopper"]);
    expect(viaDiscover.map((u) => u.name)).toEqual(["Grace Hopper"]);
  });

  test("discover offers teachers too, because it is asking a wider question", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    // The search page lists a teacher under "Instructors" and a learner under
    // "People". Discover is one flat list of everybody you might befriend.
    const viaSearch = await q(t, "clerk_ada", "turing");
    expect(viaSearch.instructors.map((i) => i.name)).toEqual(["Turing Ada"]);
    expect(viaSearch.people).toEqual([]);

    const viaDiscover = await as(t, "clerk_ada").query(friendsApi.searchUsers, {
      query: "turing",
    });
    expect(viaDiscover.map((u) => u.name)).toEqual(["Turing Ada"]);
  });
});

// ─── Privacy ──────────────────────────────────────────────────────────────

describe("search privacy", () => {
  test("shows a learner's address only when the address is what matched", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    // Matched by name — the address is not part of the answer.
    const byName = await q(t, "clerk_ada", "grace");
    expect(byName.people[0].email).toBeNull();

    // Matched by address — now it is the thing that was searched for, and
    // showing it is the only way to find somebody with no name on their
    // profile.
    const byEmail = await q(t, "clerk_ada", "nameless@test.com");
    expect(byEmail.people.map((p) => p.email)).toEqual(["nameless@test.com"]);
  });

  test("finds a learner who has no name on their profile, by address", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "nameless@test.com");

    expect(results.people).toHaveLength(1);
    // `displayName` falls back to the address, so the row is not blank.
    expect(results.people[0].name).toBe("nameless@test.com");
  });
});

// ─── Relationships ────────────────────────────────────────────────────────

describe("search relationships", () => {
  async function seedFriendship(
    t: TestWorld,
    row: {
      requesterId: Id<"users">;
      addresseeId: Id<"users">;
      status: "pending" | "accepted" | "declined";
    },
  ): Promise<void> {
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("friendships", {
        requesterId: row.requesterId,
        addresseeId: row.addresseeId,
        status: row.status,
        createdAt: NOW,
      });
    });
  }

  test("reports no relationship for a stranger", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "grace");
    expect(results.people[0].relationship).toEqual({ kind: "none" });
  });

  test("reports a request the caller sent as outgoing", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "pending",
    });

    const results = await q(t, "clerk_ada", "grace");
    expect(results.people[0].relationship).toMatchObject({
      kind: "pending",
      direction: "outgoing",
    });
  });

  test("reports a request the caller received as incoming", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "pending",
    });

    const results = await q(t, "clerk_ada", "grace");
    expect(results.people[0].relationship).toMatchObject({
      kind: "pending",
      direction: "incoming",
    });
  });

  test("reports an accepted friendship", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace } = await seedWorld(t);
    await seedFriendship(t, {
      requesterId: grace,
      addresseeId: ada,
      status: "accepted",
    });

    const results = await q(t, "clerk_ada", "grace");
    expect(results.people[0].relationship).toMatchObject({ kind: "accepted" });
  });

  test("keeps the direction of a decline, because it decides what may be done", async () => {
    const t = convexTest(testSchema, modules);
    const { ada, grace, mallory } = await seedWorld(t);

    // The caller asked and they declined: re-askable, so "outgoing".
    await seedFriendship(t, {
      requesterId: ada,
      addresseeId: grace,
      status: "declined",
    });
    // They asked and the caller declined: not re-offered, so "incoming".
    await seedFriendship(t, {
      requesterId: mallory,
      addresseeId: ada,
      status: "declined",
    });

    const graceResult = await q(t, "clerk_ada", "grace");
    expect(graceResult.people[0].relationship).toMatchObject({
      kind: "declined",
      direction: "outgoing",
    });

    const malloryResult = await q(t, "clerk_ada", "mallory");
    expect(malloryResult.people[0].relationship).toMatchObject({
      kind: "declined",
      direction: "incoming",
    });
  });

  test("reports no relationship at all for a stranger", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const results = await q(t, "clerk_ada", "mallory");
    expect(results.people[0].relationship).toEqual({ kind: "none" });
  });
});
