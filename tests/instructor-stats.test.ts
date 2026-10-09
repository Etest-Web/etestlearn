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

const DAY = 24 * 60 * 60 * 1000;

const as = (t: TestConvex<typeof testSchema>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

/**
 * Two instructors, so every "scoped to my own courses" claim below is tested
 * against data the caller must not see rather than against an empty table.
 */
async function seedWorld(t: TestConvex<typeof testSchema>) {
  const now = Date.now();

  const instructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_instructor",
      email: "instructor@test.com",
      name: "Ada Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const rivalId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_rival",
      email: "rival@test.com",
      name: "Rival Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );

  const studentId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_student",
      email: "student@test.com",
      name: "Sam Student",
      role: "student",
      createdAt: now,
    }),
  );

  const paidCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Sold Course",
      slug: "sold-course",
      description: "Has buyers",
      instructorId,
      published: true,
      price: 100_000, // ₦1,000
      currency: "NGN",
      createdAt: now - 90 * DAY,
      updatedAt: now,
    }),
  );

  const freeCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Draft Course",
      slug: "draft-course",
      description: "Not live",
      instructorId,
      published: false,
      createdAt: now - 5 * DAY,
      updatedAt: now,
    }),
  );

  const rivalCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Rival Course",
      slug: "rival-course",
      description: "Belongs to someone else",
      instructorId: rivalId,
      published: true,
      price: 500_000,
      currency: "NGN",
      createdAt: now - 90 * DAY,
      updatedAt: now,
    }),
  );

  // Two settled sales on the instructor's course; one refunded. Timestamps are
  // fixed calendar months rather than relative offsets, because the bucketing
  // assertions name them — and because the 30-day trend windows must be empty
  // for the "no baseline" case, which requires the sales to be genuinely old.
  await t.run(async (ctx: TestCtx) => {
    await ctx.db.insert("purchases", {
      userId: studentId,
      courseId: paidCourseId,
      paystackReference: "ref-1",
      amount: 100_000,
      currency: "NGN",
      status: "paid",
      paidAt: Date.UTC(2026, 0, 15),
      createdAt: Date.UTC(2026, 0, 15),
      updatedAt: Date.UTC(2026, 0, 15),
    });
    await ctx.db.insert("purchases", {
      userId: studentId,
      courseId: paidCourseId,
      paystackReference: "ref-2",
      amount: 100_000,
      currency: "NGN",
      status: "paid",
      paidAt: Date.UTC(2026, 1, 2),
      createdAt: Date.UTC(2026, 1, 2),
      updatedAt: Date.UTC(2026, 1, 2),
    });
    await ctx.db.insert("purchases", {
      userId: studentId,
      courseId: paidCourseId,
      paystackReference: "ref-3",
      amount: 50_000,
      currency: "NGN",
      status: "paid",
      paidAt: Date.UTC(2026, 1, 3),
      refundedAt: Date.UTC(2026, 1, 4),
      createdAt: Date.UTC(2026, 1, 3),
      updatedAt: Date.UTC(2026, 1, 4),
    });
    // A pending checkout is not money: it must never appear in any total.
    await ctx.db.insert("purchases", {
      userId: studentId,
      courseId: paidCourseId,
      paystackReference: "ref-pending",
      amount: 999_000,
      currency: "NGN",
      status: "pending",
      createdAt: Date.UTC(2026, 1, 5),
      updatedAt: Date.UTC(2026, 1, 5),
    });
    // The rival's big sale — must stay out of the instructor's numbers.
    await ctx.db.insert("purchases", {
      userId: studentId,
      courseId: rivalCourseId,
      paystackReference: "ref-rival",
      amount: 500_000,
      currency: "NGN",
      status: "paid",
      paidAt: Date.UTC(2026, 1, 6),
      createdAt: Date.UTC(2026, 1, 6),
      updatedAt: Date.UTC(2026, 1, 6),
    });
  });

  // Three lessons, one quiz on the second, and enrollments covering every
  // state the UI distinguishes: completed, in progress, untouched.
  const lessonIds = await t.run(async (ctx: TestCtx) => {
    const ids: Id<"lessons">[] = [];
    for (let i = 1; i <= 3; i += 1) {
      ids.push(
        await ctx.db.insert("lessons", {
          courseId: paidCourseId,
          title: `Lesson ${i}`,
          contentType: i === 2 ? "quiz" : "article",
          order: i,
          createdAt: now - 80 * DAY,
        }),
      );
    }
    return ids;
  });

  await t.run(async (ctx: TestCtx) => {
    await ctx.db.insert("quizzes", {
      lessonId: lessonIds[1],
      title: "Checkpoint",
      passingScore: 60,
      createdAt: now - 80 * DAY,
    });
  });

  await t.run(async (ctx: TestCtx) => {
    await ctx.db.insert("enrollments", {
      userId: studentId,
      courseId: paidCourseId,
      progressPercent: 100,
      completedLessonIds: lessonIds,
      createdAt: now - 60 * DAY,
      updatedAt: now - 2 * DAY,
    });
    // A second learner who stalled mid-course — the at-risk signal.
    const stalledId = await ctx.db.insert("users", {
      clerkId: "clerk_stalled",
      email: "stalled@test.com",
      name: "Stalled Learner",
      role: "student",
      createdAt: now - 40 * DAY,
    });
    await ctx.db.insert("enrollments", {
      userId: stalledId,
      courseId: paidCourseId,
      progressPercent: 33,
      completedLessonIds: [lessonIds[0]],
      createdAt: now - 40 * DAY,
      updatedAt: now - 30 * DAY,
    });
  });

  return {
    instructorId,
    rivalId,
    studentId,
    paidCourseId,
    freeCourseId,
    rivalCourseId,
    lessonIds,
  };
}

describe("instructor stats authorization", () => {
  test("students and signed-out callers are refused on every surface", async () => {
    const t = convexTest(testSchema, modules);
    const { paidCourseId } = await seedWorld(t);

    const queries = [
      api.instructorStats.getEarningsSummary,
      api.instructorStats.getInstructorPulse,
      api.instructorStats.listInstructorCoursePerformance,
      api.instructorStats.listInstructorAttentionItems,
      api.instructorStats.listInstructorActivity,
    ] as const;

    for (const q of queries) {
      await expect(as(t, "clerk_student").query(q, {})).rejects.toThrow(
        /Not authorized/,
      );
      await expect(t.query(q, {})).rejects.toThrow(/Not authenticated/);
    }

    // And the one function that takes an argument still refuses by role, not by
    // silently returning an empty page.
    expect(paidCourseId).toBeTruthy();
  });

  test("a suspended instructor reads as signed out", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId } = await seedWorld(t);
    await t.run((ctx: TestCtx) =>
      ctx.db.patch(instructorId, { suspendedAt: Date.now() }),
    );

    await expect(
      as(t, "clerk_instructor").query(api.instructorStats.getEarningsSummary, {}),
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe("instructor earnings summary", () => {
  test("counts only settled sales, excludes refunds, and never leaks a rival's revenue", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.getEarningsSummary,
      { months: 12 },
    );

    // ₦1,000 + ₦1,000 settled; the ₦500 refund and the pending ₦9,990 excluded;
    // the rival's ₦5,000 is a different instructor's money.
    expect(result.lifetime.grossKobo).toBe(200_000);
    expect(result.lifetime.refundedKobo).toBe(50_000);
    expect(result.lifetime.sales).toBe(2);
    expect(result.lifetime.refunds).toBe(1);
    expect(result.lifetime.netEarningsKobo).toBe(160_000);
    expect(result.lifetime.platformFeeKobo).toBe(40_000);
    expect(result.lifetime.averageOrderKobo).toBe(100_000);

    expect(result.byCourse.map((row) => row.title)).toEqual([
      "Sold Course",
      "Draft Course",
    ]);
    expect(result.recentSales).toHaveLength(3);
    expect(result.recentSales.every((sale) => sale.courseId !== undefined)).toBe(true);
  });

  test("buckets sales into the calendar month they settled in", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const now = Date.now();
    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.getEarningsSummary,
      { months: 12 },
    );

    expect(result.series).toHaveLength(12);
    // The series ends with the current month and works backwards from it.
    expect(result.series[11].key).toBe(
      `${new Date(now).getUTCFullYear()}-${String(new Date(now).getUTCMonth() + 1).padStart(2, "0")}`,
    );

    const january = result.series.find((p) => p.key === "2026-01");
    expect(january?.grossKobo).toBe(100_000);
    expect(january?.sales).toBe(1);
    expect(january?.refundedKobo).toBe(0);

    const february = result.series.find((p) => p.key === "2026-02");
    expect(february?.grossKobo).toBe(100_000);
    expect(february?.refundedKobo).toBe(50_000);
    expect(february?.sales).toBe(1);
    expect(february?.netEarningsKobo).toBe(80_000);

    // Months with no sales are zero points, not gaps — so the chart's bars line
    // up with the statement table's rows.
    expect(result.series.filter((p) => p.grossKobo === 0)).toHaveLength(10);
  });

  test("reports no trend rather than infinity when the baseline is zero", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.getEarningsSummary,
      { months: 6 },
    );

    // The seeded sales are in Jan/Feb 2026, so both trailing-30-day windows are
    // empty and the honest answer is "nothing to compare against".
    expect(result.last30.netEarningsKobo).toBe(0);
    expect(result.last30.sales).toBe(0);
    expect(result.trendPercent).toBeNull();
    expect(result.trendLabel).toBeNull();
  });

  test("reports growth when the trailing window beats its baseline", async () => {
    const t = convexTest(testSchema, modules);
    const { paidCourseId, studentId } = await seedWorld(t);
    const now = Date.now();

    // ₦100 five days ago (inside the last 30 days) and ₦50 fifty days ago
    // (inside the window before it): earnings double, so +100%.
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("purchases", {
        userId: studentId,
        courseId: paidCourseId,
        paystackReference: "recent",
        amount: 10_000,
        currency: "NGN",
        status: "paid",
        paidAt: now - 5 * DAY,
        createdAt: now - 5 * DAY,
        updatedAt: now - 5 * DAY,
      });
      await ctx.db.insert("purchases", {
        userId: studentId,
        courseId: paidCourseId,
        paystackReference: "prior",
        amount: 5_000,
        currency: "NGN",
        status: "paid",
        paidAt: now - 50 * DAY,
        createdAt: now - 50 * DAY,
        updatedAt: now - 50 * DAY,
      });
    });

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.getEarningsSummary,
      { months: 12 },
    );

    expect(result.last30.netEarningsKobo).toBe(8_000);
    expect(result.previous30.netEarningsKobo).toBe(4_000);
    expect(result.trendPercent).toBe(100);
    expect(result.trendLabel).toBe("up 100% on the previous period");
  });

  test("an instructor with no courses gets zeroes, not an error", async () => {
    const t = convexTest(testSchema, modules);
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_new",
        email: "new@test.com",
        name: "New Instructor",
        role: "instructor",
        createdAt: Date.now(),
      }),
    );

    const result = await as(t, "clerk_new").query(
      api.instructorStats.getEarningsSummary,
      { months: 6 },
    );

    expect(result.lifetime.grossKobo).toBe(0);
    expect(result.byCourse).toHaveLength(0);
    expect(result.recentSales).toHaveLength(0);
    expect(result.series.every((p) => p.grossKobo === 0)).toBe(true);
  });
});

describe("instructor pulse", () => {
  test("separates completed, in-progress and untouched learners", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.getInstructorPulse,
      {},
    );

    expect(result.courses).toBe(2);
    expect(result.publishedCourses).toBe(1);
    expect(result.draftCourses).toBe(1);
    expect(result.lessons).toBe(3);
    expect(result.quizCount).toBe(1);
    expect(freeCourseId).toBeTruthy();

    expect(result.learners.enrolled).toBe(2);
    expect(result.learners.completed).toBe(1);
    expect(result.learners.inProgress).toBe(1);
    expect(result.learners.completionRate).toBe(50);
    // The stalled learner is surfaced by name-less row with progress, not dropped.
    expect(result.atRiskCount).toBe(1);
    expect(result.atRisk[0].progressPercent).toBe(33);
    expect(result.atRisk[0].courseTitle).toBe("Sold Course");
  });

  test("counts a learner's quiz pass once, however many times they retried", async () => {
    const t = convexTest(testSchema, modules);
    const { lessonIds, studentId } = await seedWorld(t);

    const quizId = await t.run(async (ctx: TestCtx) => {
      const quiz = await ctx.db
        .query("quizzes")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lessonIds[1]))
        .unique();
      if (!quiz) throw new Error("quiz missing");
      return quiz._id;
    });

    await t.run(async (ctx: TestCtx) => {
      const second = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_stalled"))
        .unique();
      if (!second) throw new Error("learner missing");

      // One learner fails twice then passes; another passes first time. A
      // retry-heavy pass rate is still 100%, not 60%.
      for (const [attempt, score] of [
        [0, 1],
        [1, 1],
        [2, 5],
      ] as const) {
        await ctx.db.insert("quizAttempts", {
          userId: studentId,
          quizId,
          score,
          maxScore: 5,
          passed: score === 5,
          createdAt: Date.now() - attempt * 1000,
        });
      }
      await ctx.db.insert("quizAttempts", {
        userId: second._id,
        quizId,
        score: 5,
        maxScore: 5,
        passed: true,
        createdAt: Date.now() - 5000,
      });
    });

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.getInstructorPulse,
      {},
    );

    expect(result.quizPerformance.attemptedBy).toBe(2);
    expect(result.quizPerformance.passedBy).toBe(2);
    expect(result.quizPerformance.passRate).toBe(100);
  });
});

describe("course performance", () => {
  test("returns a row per owned course with scoped financials", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const rows = await as(t, "clerk_instructor").query(
      api.instructorStats.listInstructorCoursePerformance,
      {},
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.title)).toEqual([
      "Sold Course", // ₦160,000 earned — sorts above the course that earned nothing
      "Draft Course",
    ]);

    const sold = rows[0];
    expect(sold.enrollmentCount).toBe(2);
    expect(sold.completedCount).toBe(1);
    expect(sold.completionRate).toBe(50);
    expect(sold.averageProgress).toBe(67);
    expect(sold.lessons).toBe(3);
    expect(sold.sales).toBe(2);
    expect(sold.grossKobo).toBe(200_000);
    expect(sold.netEarningsKobo).toBe(160_000);
    expect(sold.refundedKobo).toBe(50_000);

    const draft = rows[1];
    expect(draft.published).toBe(false);
    expect(draft.netEarningsKobo).toBe(0);
    expect(draft.conversionRate).toBe(0);
  });

  test("never includes another instructor's course", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const rows = await as(t, "clerk_rival").query(
      api.instructorStats.listInstructorCoursePerformance,
      {},
    );

    expect(rows.map((row) => row.title)).toEqual(["Rival Course"]);
    expect(rows[0].grossKobo).toBe(500_000);
  });
});

describe("attention items", () => {
  test("flags the draft and stays silent about a healthy course", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.listInstructorAttentionItems,
      {},
    );

    const kinds = result.items.map((item) => item.kind);
    expect(kinds).toContain("draft");
    // The live course has lessons, so it is not flagged as empty.
    expect(kinds).not.toContain("empty");
    expect(result.counts.drafts).toBe(1);
    expect(result.counts.emptyCourses).toBe(0);
    expect(result.hasWork).toBe(true);

    const draftItem = result.items.find((item) => item.kind === "draft");
    expect(draftItem?.title).toContain("Draft Course");
  });

  test("flags a published course with no lessons — the failure revenue hides", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId } = await seedWorld(t);
    await t.run((ctx: TestCtx) =>
      ctx.db.patch(freeCourseId, { published: true }),
    );

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.listInstructorAttentionItems,
      {},
    );

    expect(result.counts.emptyCourses).toBe(1);
    expect(result.items[0].kind).toBe("empty");
  });

  test("counts a stalled learner once, not once per course", async () => {
    const t = convexTest(testSchema, modules);
    const { freeCourseId, lessonIds } = await seedWorld(t);

    // Enroll the same quiet learner in a second course.
    await t.run(async (ctx: TestCtx) => {
      const stalled = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_stalled"))
        .unique();
      if (!stalled) throw new Error("learner missing");
      await ctx.db.insert("lessons", {
        courseId: freeCourseId,
        title: "Draft Lesson",
        contentType: "article",
        order: 1,
        createdAt: Date.now(),
      });
      await ctx.db.insert("enrollments", {
        userId: stalled._id,
        courseId: freeCourseId,
        progressPercent: 50,
        completedLessonIds: [lessonIds[0]],
        createdAt: Date.now() - 40 * DAY,
        updatedAt: Date.now() - 30 * DAY,
      });
    });

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.listInstructorAttentionItems,
      {},
    );

    expect(result.counts.stalledLearners).toBe(1);
    expect(result.items.filter((item) => item.kind === "stalled")).toHaveLength(1);
  });

  test("reports an unpublish request as waiting rather than as work to do", async () => {
    const t = convexTest(testSchema, modules);
    const { instructorId, paidCourseId } = await seedWorld(t);

    await t.run((ctx: TestCtx) =>
      ctx.db.insert("courseUnpublishRequests", {
        courseId: paidCourseId,
        requestedBy: instructorId,
        reason: "Reworking the syllabus",
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.listInstructorAttentionItems,
      {},
    );

    expect(result.counts.pendingUnpublishRequests).toBe(1);
    const item = result.items.find((i) => i.kind === "unpublish");
    expect(item?.detail).toContain("Nothing is needed from you");
  });

  test("is empty — not an error — for an instructor with nothing to do", async () => {
    const t = convexTest(testSchema, modules);
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_clean",
        email: "clean@test.com",
        name: "Clean Instructor",
        role: "instructor",
        createdAt: Date.now(),
      });
      const courseId = await ctx.db.insert("courses", {
        title: "Healthy Course",
        slug: "healthy-course",
        description: "Published with content",
        instructorId: (
          await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_clean"))
            .unique()
        )!._id,
        published: true,
        createdAt: Date.now() - 30 * DAY,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("lessons", {
        courseId,
        title: "Only lesson",
        contentType: "article",
        order: 1,
        createdAt: Date.now(),
      });
    });

    const result = await as(t, "clerk_clean").query(
      api.instructorStats.listInstructorAttentionItems,
      {},
    );

    expect(result.items).toHaveLength(0);
    expect(result.hasWork).toBe(false);
  });
});

describe("activity feed", () => {
  test("merges sales, enrollments and completions newest first", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.listInstructorActivity,
      { limit: 10 },
    );

    expect(result.events.length).toBeGreaterThan(0);
    // Newest first, every timestamp.
    const times = result.events.map((event) => event.at);
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const kinds = new Set(result.events.map((event) => event.kind));
    expect(kinds.has("sale")).toBe(true);
    expect(kinds.has("enrollment")).toBe(true);
    expect(kinds.has("completion")).toBe(true);

    // Sale events carry the amount; the others do not invent one.
    for (const event of result.events) {
      expect(typeof event.amountKobo === "number").toBe(event.kind === "sale");
    }
  });

  test("respects the limit and only reports the caller's own courses", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const result = await as(t, "clerk_instructor").query(
      api.instructorStats.listInstructorActivity,
      { limit: 2 },
    );
    expect(result.events).toHaveLength(2);

    const rival = await as(t, "clerk_rival").query(
      api.instructorStats.listInstructorActivity,
      { limit: 50 },
    );
    expect(rival.events.every((event) => event.courseTitle === "Rival Course")).toBe(
      true,
    );
  });
});
