import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
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

describe("course preview & video assets", () => {
  test("lesson 1 video asset is available for free preview without enrollment", async () => {
    const t = convexTest(testSchema, modules);
    const now = Date.now();

    const instructorId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_instructor",
        email: "instructor@test.com",
        name: "Instructor",
        role: "instructor",
        createdAt: now,
      }),
    );

    const courseId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: "Test Course",
        slug: "test-course",
        description: "Test description",
        instructorId,
        published: true,
        price: 500000,
        currency: "NGN",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const lesson1Id = await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId,
        title: "Lesson 1: Intro",
        contentType: "video",
        order: 1,
        createdAt: now,
      }),
    );

    const lesson2Id = await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId,
        title: "Lesson 2: Advanced",
        contentType: "video",
        order: 2,
        createdAt: now,
      }),
    );

    const asset1Id = await t.run((ctx: TestCtx) =>
      ctx.db.insert("videoAssets", {
        lessonId: lesson1Id,
        status: "ready",
        sourceFileUrl: "https://example.com/source.mp4",
        sourceFileKey: "source-key-1",
        variants: [
          {
            label: "720p",
            height: 720,
            bitrate: 2000000,
            bandwidth: 2200000,
          },
        ],
        durationSeconds: 120,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const asset2Id = await t.run((ctx: TestCtx) =>
      ctx.db.insert("videoAssets", {
        lessonId: lesson2Id,
        status: "ready",
        sourceFileUrl: "https://example.com/source2.mp4",
        sourceFileKey: "source-key-2",
        variants: [],
        durationSeconds: 300,
        createdAt: now,
        updatedAt: now,
      }),
    );

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(lesson1Id, { videoAssetId: asset1Id });
      await ctx.db.patch(lesson2Id, { videoAssetId: asset2Id });
    });

    // Anonymous query: Lesson 1 should be accessible as preview
    const status1 = await t.query(api.videoAssets.getAssetStatus, { lessonId: lesson1Id });
    expect(status1).not.toBeNull();
    expect(status1?.role).toBe("preview");
    expect(status1?.asset._id).toBe(asset1Id);

    // Anonymous query: Lesson 2 should be blocked (null)
    const status2 = await t.query(api.videoAssets.getAssetStatus, { lessonId: lesson2Id });
    expect(status2).toBeNull();

    // Internal playback access: Lesson 1 allows anonymous access
    const canPlay1 = await t.query(internal.videoAssets.checkPlaybackAccess, {
      assetId: asset1Id,
      userId: "anonymous",
    });
    expect(canPlay1).toBe(true);

    // Internal playback access: Lesson 2 denies anonymous access
    const canPlay2 = await t.query(internal.videoAssets.checkPlaybackAccess, {
      assetId: asset2Id,
      userId: "anonymous",
    });
    expect(canPlay2).toBe(false);
  });

  test("getCourseBySlug returns skills tags and lessons list", async () => {
    const t = convexTest(testSchema, modules);
    const now = Date.now();

    const instructorId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_instructor_2",
        email: "instructor2@test.com",
        name: "Instructor 2",
        role: "instructor",
        createdAt: now,
      }),
    );

    const skillId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("skills", {
        name: "Video Editing",
        slug: "video-editing",
        sortOrder: 1,
        createdAt: now,
      }),
    );

    await t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: "Masterclass",
        slug: "masterclass",
        description: "Learn editing",
        instructorId,
        published: true,
        skillIds: [skillId],
        createdAt: now,
        updatedAt: now,
      }),
    );

    const result = await t.query(api.courses.getCourseBySlug, { slug: "masterclass" });
    expect(result).not.toBeNull();
    expect(result?.course.title).toBe("Masterclass");
    expect(result?.skills).toHaveLength(1);
    expect(result?.skills[0].name).toBe("Video Editing");
  });
});
