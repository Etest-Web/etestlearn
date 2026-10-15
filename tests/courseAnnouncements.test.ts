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

const as = (t: TestConvex<typeof testSchema>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

async function seedWorld(t: any) {
  const now = Date.now();

  const adminId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  const instructorId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Ada Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const otherInstructorId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_other_instructor",
      email: "other@test.com",
      name: "Other Instructor",
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

  const strangerId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_stranger",
      email: "stranger@test.com",
      name: "Stranger",
      role: "student",
      createdAt: now,
    }),
  );

  const courseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Intro to Testing",
      slug: "intro-to-testing",
      description: "A course",
      instructorId,
      published: true,
      searchText: "Intro to Testing A course",
      createdAt: now,
      updatedAt: now,
    }),
  );

  // The enrolled learner — the only non-staff caller with read access.
  await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("enrollments", {
      userId: studentId,
      courseId,
      progressPercent: 0,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return {
    adminId,
    instructorId,
    otherInstructorId,
    studentId,
    strangerId,
    courseId,
  };
}

/** An announcement already in the database, for the read-path tests. */
async function seedAnnouncement(
  t: any,
  courseId: any,
  authorId: any,
  overrides: Partial<{ title: string; body: string; published: boolean }> = {},
): Promise<Id<"courseAnnouncements">> {
  const now = Date.now();
  return await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courseAnnouncements", {
      courseId,
      authorId,
      title: overrides.title ?? "Schedule change",
      body: overrides.body ?? "Live session moved to Thursday.",
      published: overrides.published ?? false,
      publishedAt: overrides.published ? now : undefined,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

describe("course announcements — authoring access", () => {
  test("the course owner can create a draft", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseId } = await seedWorld(t);

    const id = await as(t, "clerk_instructor").mutation(
      api.courseAnnouncements.create,
      { courseId, title: "  Week 1 recap  ", body: "  Watch the recording.  " },
    );

    const rows = await as(t, "clerk_instructor").query(
      api.courseAnnouncements.listForAuthor,
      { courseId },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(id);
    // Trimmed on the way in, and a draft by default.
    expect(rows[0].title).toBe("Week 1 recap");
    expect(rows[0].body).toBe("Watch the recording.");
    expect(rows[0].published).toBe(false);
    expect(rows[0].authorId).toBe(instructorId);
  });

  test("an instructor who does not own the course is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await expect(
      as(t, "clerk_other_instructor").mutation(api.courseAnnouncements.create, {
        courseId,
        title: "Hijack",
        body: "Not mine to post",
      }),
    ).rejects.toThrow(/only the course owner/);

    await expect(
      as(t, "clerk_other_instructor").query(
        api.courseAnnouncements.listForAuthor,
        { courseId },
      ),
    ).rejects.toThrow(/only the course owner/);
  });

  test("a learner cannot author or read the draft console", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await expect(
      as(t, "clerk_student").mutation(api.courseAnnouncements.create, {
        courseId,
        title: "Nope",
        body: "Nope",
      }),
    ).rejects.toThrow(/only the course owner/);

    await expect(
      as(t, "clerk_student").query(api.courseAnnouncements.listForAuthor, {
        courseId,
      }),
    ).rejects.toThrow(/only the course owner/);
  });

  test("signed-out callers are refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await expect(
      t.mutation(api.courseAnnouncements.create, {
        courseId,
        title: "Hello",
        body: "Hello",
      }),
    ).rejects.toThrow(/Not authenticated/);

    await expect(
      t.query(api.courseAnnouncements.listForCourse, { courseId }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("an admin may manage any course's announcements", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await as(t, "clerk_admin").mutation(api.courseAnnouncements.create, {
      courseId,
      title: "Platform note",
      body: "Posted by support.",
      publish: true,
    });

    const rows = await as(t, "clerk_admin").query(
      api.courseAnnouncements.listForAuthor,
      { courseId },
    );
    expect(rows.some((row) => row.title === "Platform note")).toBe(true);
  });

  test("text limits are enforced on create", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await expect(
      as(t, "clerk_instructor").mutation(api.courseAnnouncements.create, {
        courseId,
        title: "",
        body: "Body",
      }),
    ).rejects.toThrow(/Title is required/);

    await expect(
      as(t, "clerk_instructor").mutation(api.courseAnnouncements.create, {
        courseId,
        title: "t".repeat(121),
        body: "Body",
      }),
    ).rejects.toThrow(/at most 120 characters/);

    await expect(
      as(t, "clerk_instructor").mutation(api.courseAnnouncements.create, {
        courseId,
        title: "Hi",
        body: "b".repeat(2001),
      }),
    ).rejects.toThrow(/at most 2000 characters/);
  });
});

describe("course announcements — learner read path", () => {
  test("an enrolled learner sees published notices only", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseId } = await seedWorld(t);

    await seedAnnouncement(t, courseId, instructorId, {
      title: "Live",
      published: true,
    });
    await seedAnnouncement(t, courseId, instructorId, {
      title: "Draft",
      published: false,
    });

    const rows = await as(t, "clerk_student").query(
      api.courseAnnouncements.listForCourse,
      { courseId },
    );
    expect(rows.map((row) => row.title)).toEqual(["Live"]);
    expect(rows[0].authorName).toBe("Ada Instructor");
  });

  test("a non-enrolled learner is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await expect(
      as(t, "clerk_stranger").query(api.courseAnnouncements.listForCourse, {
        courseId,
      }),
    ).rejects.toThrow(/must be enrolled/);
  });

  test("the course owner may read the learner view of their own course", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseId } = await seedWorld(t);

    await seedAnnouncement(t, courseId, instructorId, {
      title: "Live",
      published: true,
    });

    const rows = await as(t, "clerk_instructor").query(
      api.courseAnnouncements.listForCourse,
      { courseId },
    );
    expect(rows).toHaveLength(1);
  });
});

describe("course announcements — lifecycle", () => {
  test("publish then unpublish clears publishedAt without deleting the text", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseId } = await seedWorld(t);
    const id = await seedAnnouncement(t, courseId, instructorId);

    await as(t, "clerk_instructor").mutation(
      api.courseAnnouncements.setPublished,
      { announcementId: id, published: true },
    );

    let row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row?.published).toBe(true);
    expect(row?.publishedAt).toBeTypeOf("number");

    await as(t, "clerk_instructor").mutation(
      api.courseAnnouncements.setPublished,
      { announcementId: id, published: false },
    );

    row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row?.published).toBe(false);
    expect(row?.publishedAt).toBeUndefined();
    expect(row?.title).toBe("Schedule change");
  });

  test("update re-validates and requires ownership", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseId } = await seedWorld(t);
    const id = await seedAnnouncement(t, courseId, instructorId);

    await expect(
      as(t, "clerk_other_instructor").mutation(api.courseAnnouncements.update, {
        announcementId: id,
        title: "Changed",
        body: "Changed",
      }),
    ).rejects.toThrow(/only the course owner/);

    await as(t, "clerk_instructor").mutation(api.courseAnnouncements.update, {
      announcementId: id,
      title: "  Updated title  ",
      body: "  Updated body  ",
    });

    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row?.title).toBe("Updated title");
    expect(row?.body).toBe("Updated body");

    await expect(
      as(t, "clerk_instructor").mutation(api.courseAnnouncements.update, {
        announcementId: id,
        title: "",
        body: "Body",
      }),
    ).rejects.toThrow(/Title is required/);
  });

  test("remove deletes the row and is ownership-checked", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, courseId } = await seedWorld(t);
    const id = await seedAnnouncement(t, courseId, instructorId);

    await expect(
      as(t, "clerk_other_instructor").mutation(api.courseAnnouncements.remove, {
        announcementId: id,
      }),
    ).rejects.toThrow(/only the course owner/);

    await as(t, "clerk_instructor").mutation(api.courseAnnouncements.remove, {
      announcementId: id,
    });

    const row = await t.run(async (ctx: TestCtx) => ctx.db.get(id));
    expect(row).toBeNull();
  });
});

describe("platform announcements — audience targeting", () => {
  test("each role sees the newest active notice addressed to it", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    // Student notice is newer, but it must not surface for staff.
    await as(t, "clerk_admin").mutation(api.announcements.create, {
      title: "For instructors",
      body: "Payouts now settle on Fridays.",
      activate: true,
      audience: "instructors",
    });
    await as(t, "clerk_admin").mutation(api.announcements.create, {
      title: "For learners",
      body: "New course catalogue is live.",
      activate: true,
      audience: "students",
    });

    const instructorView = await as(t, "clerk_instructor").query(
      api.announcements.getActiveAnnouncement,
      {},
    );
    expect(instructorView?.title).toBe("For instructors");

    const learnerView = await as(t, "clerk_student").query(
      api.announcements.getActiveAnnouncement,
      {},
    );
    expect(learnerView?.title).toBe("For learners");
  });

  test("an everyone notice reaches every role", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await as(t, "clerk_admin").mutation(api.announcements.create, {
      title: "Everyone",
      body: "Maintenance on Sunday.",
      activate: true,
    });

    for (const subject of [
      "clerk_student",
      "clerk_instructor",
      "clerk_admin",
    ]) {
      const view = await as(t, subject).query(
        api.announcements.getActiveAnnouncement,
        {},
      );
      expect(view?.title).toBe("Everyone");
      expect(view?.audience).toBe("everyone");
    }
  });

  test("an inactive notice is never returned, whatever its audience", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await as(t, "clerk_admin").mutation(api.announcements.create, {
      title: "Not live",
      body: "Should not appear.",
      activate: false,
      audience: "everyone",
    });

    const view = await as(t, "clerk_student").query(
      api.announcements.getActiveAnnouncement,
      {},
    );
    expect(view).toBeNull();
  });

  test("a legacy row without an audience is visible to everyone", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId } = await seedWorld(t);

    // Simulates a row written before the `audience` column existed.
    await t.run(async (ctx: TestCtx) =>
      ctx.db.insert("announcements", {
        title: "Legacy",
        body: "Written before audiences existed.",
        active: true,
        createdBy: adminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const learnerView = await as(t, "clerk_student").query(
      api.announcements.getActiveAnnouncement,
      {},
    );
    expect(learnerView?.title).toBe("Legacy");
    expect(learnerView?.audience).toBe("everyone");
  });

  test("setAudience is admin-only and retargets an existing notice", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const id = await as(t, "clerk_admin").mutation(api.announcements.create, {
      title: "Starts broad",
      body: "Body",
      activate: true,
      audience: "everyone",
    });

    await expect(
      as(t, "clerk_instructor").mutation(api.announcements.setAudience, {
        announcementId: id,
        audience: "instructors",
      }),
    ).rejects.toThrow(/admin access required/);

    await as(t, "clerk_admin").mutation(api.announcements.setAudience, {
      announcementId: id,
      audience: "instructors",
    });

    // Now the learner no longer sees it and the instructor does.
    const learnerView = await as(t, "clerk_student").query(
      api.announcements.getActiveAnnouncement,
      {},
    );
    expect(learnerView).toBeNull();

    const instructorView = await as(t, "clerk_instructor").query(
      api.announcements.getActiveAnnouncement,
      {},
    );
    expect(instructorView?.title).toBe("Starts broad");
  });

  test("listAll is still admin-only", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_instructor").query(api.announcements.listAll, {}),
    ).rejects.toThrow(/admin access required/);
  });
});
