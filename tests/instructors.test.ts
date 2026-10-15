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

/**
 * The instructor on the profile carries every field a real user row can hold,
 * including the ones that must never reach the page. That is deliberate: the
 * test that matters here is not "does it return a name", it is "does anything
 * from `email` through `bankAccountEncrypted` leak into a public payload", and
 * that question can only be asked of a row that actually has them.
 */
async function seedWorld(t: TestConvex<typeof testSchema>) {
  const now = Date.now();

  const instructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "ada@instructor.test",
      phone: "+2348099999999",
      birthday: 631152000000,
      name: "Ada Teacher",
      imageUrl: "https://images.test/ada.png",
      bio: "Teaches distributed systems to people who deploy them.",
      location: "Lagos, Nigeria",
      website: "ada.example.com",
      pronouns: "she/her",
      role: "instructor",
      createdAt: now - 100_000,
    }),
  );

  const studentId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@learner.test",
      name: "Sam Learner",
      bio: "A learner who filled in a bio of their own.",
      location: "Abuja",
      website: "sam.example.com",
      role: "student",
      createdAt: now,
    }),
  );

  const adminId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@glypha.test",
      name: "Grace Admin",
      role: "admin",
      createdAt: now,
    }),
  );

  const suspendedId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_suspended",
      email: "suspended@instructor.test",
      name: "Suspended Instructor",
      role: "instructor",
      suspendedAt: now,
      createdAt: now,
    }),
  );

  const course = (
    slug: string,
    owner: typeof instructorId,
    extra: { published?: boolean; featured?: boolean; createdAt?: number } = {},
  ) =>
    t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: slug,
        slug,
        description: `${slug} description`,
        instructorId: owner,
        published: extra.published ?? true,
        price: 250_000,
        currency: "NGN",
        createdAt: extra.createdAt ?? now,
        updatedAt: extra.createdAt ?? now,
        ...(extra.featured === undefined ? {} : { featured: extra.featured }),
      }),
    );

  const newestCourseId = await course("newest-course", instructorId, { createdAt: now });
  const flagshipCourseId = await course("flagship-course", instructorId, {
    featured: true,
    createdAt: now - 50_000,
  });
  const draftCourseId = await course("draft-course", instructorId, { published: false });
  const studentCourseId = await course("student-course", studentId);
  const otherCourseId = await course("other-course", suspendedId);

  return {
    instructorId,
    studentId,
    adminId,
    suspendedId,
    newestCourseId,
    flagshipCourseId,
    draftCourseId,
    studentCourseId,
    otherCourseId,
  };
}

type World = Awaited<ReturnType<typeof seedWorld>>;

const profileOf = (t: TestConvex<typeof testSchema>, instructorId: World["instructorId"]) =>
  t.query(api.instructors.getPublicProfile, { instructorId });

describe("instructors.getPublicProfile", () => {
  test("a signed-out visitor sees the profile and its published courses", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, newestCourseId, flagshipCourseId } = await seedWorld(t);

    const profile = await profileOf(t, instructorId);

    expect(profile).not.toBeNull();
    expect(profile!.instructor).toEqual({
      _id: instructorId,
      name: "Ada Teacher",
      imageUrl: "https://images.test/ada.png",
      bio: "Teaches distributed systems to people who deploy them.",
      location: "Lagos, Nigeria",
      website: "ada.example.com",
      pronouns: "she/her",
      joinedAt: expect.any(Number),
    });
    // Featured leads, then newest — the same ordering `/courses` uses.
    expect(profile!.courses.map((c) => c._id)).toEqual([flagshipCourseId, newestCourseId]);
    expect(profile!.courseCount).toBe(2);
  });

  test("the payload contains none of the fields a profile page has no business printing", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId } = await seedWorld(t);

    const profile = await profileOf(t, instructorId);
    const serialized = JSON.stringify(profile);

    // Named individually rather than trusted to a type, because the failure this
    // guards against is a future edit spreading the whole user document.
    expect(Object.keys(profile!.instructor).sort()).toEqual([
      "_id",
      "bio",
      "imageUrl",
      "joinedAt",
      "location",
      "name",
      "pronouns",
      "website",
    ]);
    expect(serialized).not.toContain("ada@instructor.test");
    expect(serialized).not.toContain("+2348099999999");
    expect(serialized).not.toContain("clerk_instructor");
    expect(serialized).not.toContain("631152000000");
  });

  test("a draft course is not on the profile", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, draftCourseId } = await seedWorld(t);

    const profile = await profileOf(t, instructorId);

    expect(profile!.courses.map((c) => c._id)).not.toContain(draftCourseId);
  });

  test("another instructor's course is not on the profile", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, studentCourseId, otherCourseId } = await seedWorld(t);

    const profile = await profileOf(t, instructorId);
    const listed = profile!.courses.map((c) => c._id);

    expect(listed).not.toContain(studentCourseId);
    expect(listed).not.toContain(otherCourseId);
  });

  test("a learner has no public profile, bio and all", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    // The learner row above has a bio, a location and a website. They are theirs,
    // and `/instructors/<a learner id>` must not become a way to read them.
    expect(await profileOf(t, studentId)).toBeNull();
  });

  test("an admin has a public profile too", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId } = await seedWorld(t);

    const profile = await profileOf(t, adminId);

    expect(profile!.instructor.name).toBe("Grace Admin");
    expect(profile!.courses).toEqual([]);
  });

  test("a suspended instructor has no public profile", async () => {
    const t = convexTest(testSchema, modules);
    const { suspendedId, otherCourseId } = await seedWorld(t);

    // Suspension must not leave a live page behind: the course is published and
    // owned by this instructor, and still neither the profile nor the course
    // list is served.
    expect(otherCourseId).toBeTruthy();
    expect(await profileOf(t, suspendedId)).toBeNull();
  });

  test("an id that no longer resolves is null, not an error", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId } = await seedWorld(t);

    await t.run((ctx: TestCtx) => ctx.db.delete("users", instructorId));

    expect(await profileOf(t, instructorId)).toBeNull();
  });

  test("the answer does not depend on who asks", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId } = await seedWorld(t);

    const signedOut = await profileOf(t, instructorId);
    const asStudent = await as(t, "clerk_student").query(api.instructors.getPublicProfile, {
      instructorId,
    });
    const asStranger = await as(t, "clerk_nobody").query(api.instructors.getPublicProfile, {
      instructorId,
    });

    expect(asStudent).toEqual(signedOut);
    expect(asStranger).toEqual(signedOut);
  });
});

describe("instructors.getInstructorCard", () => {
  test("returns the public subset for an instructor", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId } = await seedWorld(t);

    const card = await t.query(api.instructors.getInstructorCard, { instructorId });

    expect(card).toEqual({
      _id: instructorId,
      name: "Ada Teacher",
      imageUrl: "https://images.test/ada.png",
      bio: "Teaches distributed systems to people who deploy them.",
      location: "Lagos, Nigeria",
      website: "ada.example.com",
      pronouns: "she/her",
      joinedAt: expect.any(Number),
    });
    expect(JSON.stringify(card)).not.toContain("ada@instructor.test");
  });

  test("is null for a learner", async () => {
    const t = convexTest(testSchema, modules);
    const { studentId } = await seedWorld(t);

    expect(await t.query(api.instructors.getInstructorCard, { instructorId: studentId })).toBeNull();
  });

  test("is null for a suspended instructor", async () => {
    const t = convexTest(testSchema, modules);
    const { suspendedId } = await seedWorld(t);

    expect(await t.query(api.instructors.getInstructorCard, { instructorId: suspendedId })).toBeNull();
  });

  test("is null for an id that no longer resolves", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId } = await seedWorld(t);

    await t.run((ctx: TestCtx) => ctx.db.delete("users", instructorId));

    expect(await t.query(api.instructors.getInstructorCard, { instructorId })).toBeNull();
  });
});
