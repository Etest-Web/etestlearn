import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { internal } from "../convex/_generated/api";

/**
 * The delivery pipeline's two load-bearing guarantees:
 *
 * 1. A send happens at most once per `dedupeKey`, however many times the
 *    action is retried or scheduled twice. Convex retries failed actions, so
 *    without the ledger a flaky provider becomes a duplicate email.
 * 2. The drip never sends when its condition is not met, and records the skip
 *    rather than leaving the key reusable.
 *
 * The actual send is mocked. These tests are about the decision and the
 * ledger, not about Resend.
 */

const modules = import.meta.glob("../convex/**/*.ts");

const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({
  sendMail,
  isMailConfigured: () => true,
  siteUrl: () => "https://glypha.com.ng",
  escapeHtml: (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));

const t = convexTest(
  schema as unknown as SchemaDefinition<GenericSchema, boolean>,
  modules,
);

const DAY = 86_400_000;

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue(undefined);
});

async function seedCourse() {
  return t.run(async (ctx) => {
    const instructorId = await ctx.db.insert("users", {
      clerkId: `clerk_instr_${Math.random().toString(36).slice(2)}`,
      name: "Chidi Eze",
      role: "instructor",
      createdAt: Date.now(),
    });
    return ctx.db.insert("courses", {
      title: "Data structures and algorithms",
      slug: "data-structures",
      description: "A course.",
      instructorId,
      published: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedLessons(courseId: Id<"courses">, count: number) {
  return t.run(async (ctx) => {
    const ids: Id<"lessons">[] = [];
    for (let i = 0; i < count; i += 1) {
      ids.push(
        await ctx.db.insert("lessons", {
          courseId,
          title: `Lesson ${i + 1}`,
          contentType: "article",
          order: i,
          durationMinutes: 10,
          createdAt: Date.now(),
        }),
      );
    }
    return ids;
  });
}

/** A user with a real email and no preference overrides. */
async function seedUser(overrides: Record<string, unknown> = {}) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      clerkId: `clerk_${Math.random().toString(36).slice(2)}`,
      email: "ada@example.com",
      name: "Ada Obi",
      role: "student",
      createdAt: Date.now(),
      ...overrides,
    }),
  );
}

describe("the send ledger", () => {
  it("claims a fresh key exactly once", async () => {
    const userId = await seedUser();

    const first = await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "welcome:abc",
      templateId: "welcome",
      group: "account",
      category: "transactional",
      recipient: "ada@example.com",
      userId,
    });
    const second = await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "welcome:abc",
      templateId: "welcome",
      group: "account",
      category: "transactional",
      recipient: "ada@example.com",
      userId,
    });

    expect(first).toEqual({ claimed: true });
    expect(second.claimed).toBe(false);
  });

  it("refuses a second claim once the send succeeded", async () => {
    await seedUser();
    await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "receipt:1",
      templateId: "paymentReceipt",
      group: "billing",
      category: "transactional",
      recipient: "ada@example.com",
    });
    await t.mutation(internal.emailDeliveries.complete, {
      dedupeKey: "receipt:1",
      outcome: "sent",
    });

    const again = await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "receipt:1",
      templateId: "paymentReceipt",
      group: "billing",
      category: "transactional",
      recipient: "ada@example.com",
    });

    expect(again.claimed).toBe(false);
  });

  it("lets a failed send be retried, since a lost receipt costs real money", async () => {
    await seedUser();
    await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "receipt:2",
      templateId: "paymentReceipt",
      group: "billing",
      category: "transactional",
      recipient: "ada@example.com",
    });
    await t.mutation(internal.emailDeliveries.complete, {
      dedupeKey: "receipt:2",
      outcome: "failed",
      error: "provider 500",
    });

    const retry = await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "receipt:2",
      templateId: "paymentReceipt",
      group: "billing",
      category: "transactional",
      recipient: "ada@example.com",
    });

    expect(retry).toEqual({ claimed: true });
  });

  it("treats a skip as a decision, so the key is not reusable", async () => {
    await seedUser();
    await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "drip:1",
      templateId: "courseStalled",
      group: "courses",
      category: "nudge",
      recipient: "ada@example.com",
    });
    await t.mutation(internal.emailDeliveries.complete, {
      dedupeKey: "drip:1",
      outcome: "skipped",
      reason: "learner finished the course",
    });

    const later = await t.mutation(internal.emailDeliveries.claim, {
      dedupeKey: "drip:1",
      templateId: "courseStalled",
      group: "courses",
      category: "nudge",
      recipient: "ada@example.com",
    });

    expect(later.claimed).toBe(false);
  });

  it("refuses a concurrent claim while the first is still in flight", async () => {
    await seedUser();
    const args = {
      dedupeKey: "in-flight",
      templateId: "welcome" as const,
      group: "account",
      category: "transactional" as const,
      recipient: "ada@example.com",
    };

    const a = await t.mutation(internal.emailDeliveries.claim, args);
    const b = await t.mutation(internal.emailDeliveries.claim, args);

    expect(a.claimed).toBe(true);
    expect(b.claimed).toBe(false);
  });
});

describe("drip scheduling", () => {
  it("queues the whole cadence once per enrollment", async () => {
    const userId = await seedUser();
    const courseId = await seedCourse();
    await seedLessons(courseId, 8);

    const enrollmentId = await t.run(async (ctx) =>
      ctx.db.insert("enrollments", {
        userId,
        courseId,
        progressPercent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const scheduled = await t.mutation(internal.emailCampaignsData.scheduleDrip, {
      enrollmentId,
    });
    const again = await t.mutation(internal.emailCampaignsData.scheduleDrip, {
      enrollmentId,
    });

    expect(scheduled).toBe(4);
    // The guard is what stops a retried enrolling mutation from doubling the
    // cadence, so a second call must queue nothing.
    expect(again).toBe(0);
  });

  it("records a skip when a drip step's condition is not met", async () => {
    const userId = await seedUser();
    const courseId = await seedCourse();
    await seedLessons(courseId, 6);

    // Finished the course, so the "you have not started" step cannot apply.
    // Seeded outside the transaction below: nesting a `t.run` inside another
// `t.run` deadlocks the test backend, so the lesson ids come in as an argument.
const lessonIds = await seedLessons(courseId, 6);

    const enrollmentId = await t.run(async (ctx) => {
      return ctx.db.insert("enrollments", {
        userId,
        courseId,
        progressPercent: 100,
        completedLessonIds: lessonIds,
        createdAt: Date.now() - 3 * DAY,
        updatedAt: Date.now() - 3 * DAY,
      });
    });

    await t.action(internal.emailCampaigns.runDripStep, {
      enrollmentId,
      stepId: "courseNotStarted",
    });

    const row = await t.query(internal.emailDeliveries.getByDedupeKey, {
      dedupeKey: `courseNotStarted:${enrollmentId}:courseNotStarted`,
    });

    expect(sendMail).not.toHaveBeenCalled();
    expect(row?.status).toBe("skipped");
  });

  it("sends the not-started nudge to a learner who never opened the course", async () => {
    const userId = await seedUser();
    const courseId = await seedCourse();
    await seedLessons(courseId, 5);

    const enrollmentId = await t.run(async (ctx) =>
      ctx.db.insert("enrollments", {
        userId,
        courseId,
        progressPercent: 0,
        createdAt: Date.now() - 3 * DAY,
        updatedAt: Date.now() - 3 * DAY,
      }),
    );

    await t.action(internal.emailCampaigns.runDripStep, {
      enrollmentId,
      stepId: "courseNotStarted",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].group).toBe("courses");
    const row = await t.query(internal.emailDeliveries.getByDedupeKey, {
      dedupeKey: `courseNotStarted:${enrollmentId}:courseNotStarted`,
    });
    expect(row?.status).toBe("sent");
  });

  it("holds a nudge back from a learner who opted out of marketing", async () => {
    const userId = await seedUser({
      preferences: { marketingEmails: false },
    });
    const courseId = await seedCourse();
    await seedLessons(courseId, 5);

    const enrollmentId = await t.run(async (ctx) =>
      ctx.db.insert("enrollments", {
        userId,
        courseId,
        progressPercent: 0,
        createdAt: Date.now() - 3 * DAY,
        updatedAt: Date.now() - 3 * DAY,
      }),
    );

    await t.action(internal.emailCampaigns.runDripStep, {
      enrollmentId,
      stepId: "courseNotStarted",
    });

    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("transactional mail ignores the marketing preference", () => {
  it("still sends a receipt to somebody who opted out", async () => {
    const userId = await seedUser({
      preferences: { marketingEmails: false },
    });
    const courseId = await seedCourse();
    await seedLessons(courseId, 4);

    const { purchaseId } = await t.run(async (ctx) => ({
      purchaseId: await ctx.db.insert("purchases", {
        userId,
        courseId,
        paystackReference: "PSK-TEST-1",
        amount: 150_000,
        currency: "NGN",
        status: "paid",
        paidAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    }));

    await t.action(internal.emailCampaigns.sendPaymentReceipt, {
      purchaseId,
      userId,
      email: "ada@example.com",
      name: "Ada Obi",
      courseTitle: "Data structures and algorithms",
      courseSlug: "data-structures",
      amountFormatted: "₦1,500",
      reference: "PSK-TEST-1",
      paidAt: Date.now(),
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].group).toBe("billing");
  });
});

describe("marketing preference", () => {
  it("defaults to allowed when the user has no preference set", async () => {
    const userId = await seedUser();
    const allowed = await t.query(internal.emailCampaignsData.allowsMarketing, { userId });
    expect(allowed).toBe(true);
  });

  it("honours an explicit opt-out", async () => {
    const userId = await seedUser({
      preferences: { marketingEmails: false },
    });
    const allowed = await t.query(internal.emailCampaignsData.allowsMarketing, { userId });
    expect(allowed).toBe(false);
  });

  it("refuses a suspended account regardless of preference", async () => {
    const userId = await seedUser({ suspendedAt: Date.now() });
    const allowed = await t.query(internal.emailCampaignsData.allowsMarketing, { userId });
    expect(allowed).toBe(false);
  });
});

describe("the drip ledger", () => {
  it("sends the welcome email once, not once per webhook redelivery", async () => {
    const userId = await seedUser();

    await t.action(internal.emailCampaigns.sendWelcome, {
      userId,
      name: "Ada Obi",
      email: "ada@example.com",
    });
    await t.action(internal.emailCampaigns.sendWelcome, {
      userId,
      name: "Ada Obi",
      email: "ada@example.com",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].group).toBe("account");
  });

  it("skips a learner with no email address rather than sending to nothing", async () => {
    const userId = await seedUser({ email: undefined });

    await t.action(internal.emailCampaigns.sendWelcome, { userId, name: "Ada" });

    expect(sendMail).not.toHaveBeenCalled();
  });

  it("refuses a malformed address before spending a provider round trip", async () => {
    const userId = await seedUser({ email: "not-an-address" });

    await t.action(internal.emailCampaigns.sendWelcome, {
      userId,
      name: "Ada",
      email: "not-an-address",
    });

    expect(sendMail).not.toHaveBeenCalled();
  });
});