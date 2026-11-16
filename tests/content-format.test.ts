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

async function seedCourse(t: TestConvex<typeof testSchema>) {
  const now = Date.now();
  const instructorId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instr",
      email: "instr@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );
  const courseId = await t.run(async (ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Article Course",
      slug: `article-course-${now}`,
      description: "A course about articles",
      instructorId,
      published: true,
      searchText: "Article Course A course about articles",
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { instructorId, courseId };
}

async function lessonByTitle(
  t: TestConvex<typeof testSchema>,
  courseId: Id<"courses">,
  title: string,
) {
  const course = await as(t, "clerk_instr").query(api.courses.getCourseById, {
    courseId,
  });
  return course?.lessons.find((l) => l.title === title);
}

describe("article contentFormat", () => {
  test("createLesson stores an explicit html format", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedCourse(t);

    await as(t, "clerk_instr").mutation(api.courses.createLesson, {
      courseId,
      title: "Html Lesson",
      contentType: "article",
      order: 1,
      contentFormat: "html",
    });

    const lesson = await lessonByTitle(t, courseId, "Html Lesson");
    expect(lesson?.contentFormat).toBe("html");
  });

  test("createLesson without a format leaves contentFormat unset (renders as markdown)", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedCourse(t);

    await as(t, "clerk_instr").mutation(api.courses.createLesson, {
      courseId,
      title: "Plain Lesson",
      contentType: "article",
      order: 1,
    });

    const lesson = await lessonByTitle(t, courseId, "Plain Lesson");
    expect(lesson?.contentFormat).toBeUndefined();
  });

  test("updateLesson round-trips markdown -> html with content intact", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedCourse(t);

    const lessonId = await as(t, "clerk_instr").mutation(api.courses.createLesson, {
      courseId,
      title: "Round Trip",
      contentType: "article",
      order: 1,
    });

    await as(t, "clerk_instr").mutation(api.courses.updateLesson, {
      lessonId,
      content: "<p>Hello</p>",
      contentFormat: "html",
    });

    const lesson = await lessonByTitle(t, courseId, "Round Trip");
    expect(lesson?.content).toBe("<p>Hello</p>");
    expect(lesson?.contentFormat).toBe("html");
  });

  test("bulkCreateLessons stores the format per lesson", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedCourse(t);

    await as(t, "clerk_instr").mutation(api.courses.bulkCreateLessons, {
      courseId,
      lessons: [
        {
          title: "Md Lesson",
          contentType: "article",
          order: 0,
          content: "# hi",
          contentFormat: "markdown",
        },
        {
          title: "Html Lesson",
          contentType: "article",
          order: 1,
          content: "<p>hi</p>",
          contentFormat: "html",
        },
      ],
    });

    const md = await lessonByTitle(t, courseId, "Md Lesson");
    const html = await lessonByTitle(t, courseId, "Html Lesson");
    expect(md?.contentFormat).toBe("markdown");
    expect(html?.contentFormat).toBe("html");
  });
});
