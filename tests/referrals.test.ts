import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "../convex/_generated/api";
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
type T = TestConvex<typeof testSchema>;

/**
 * Impersonates a Clerk identity.
 *
 * The email is part of the identity rather than a convenience: `createPendingPurchase`
 * refuses a buyer with no email address (Paystack needs one), so a bare
 * `withIdentity` would make every checkout test fail for an unrelated reason.
 */
const as = (t: T, subject: string, email = `${subject.replace("clerk_", "")}@test.com`) =>
  t.withIdentity({ subject, tokenIdentifier: subject, email });

const COURSE_PRICE = 500_000; // ₦5,000

/** An instructor, a student who refers, a second student, and a paid course. */
async function seedWorld(t: T) {
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

  const referrerId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_referrer",
      email: "referrer@test.com",
      name: "Rita Referrer",
      role: "student",
      referralCode: "REFER001",
      createdAt: now,
    }),
  );

  const inviteeId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_invitee",
      email: "invitee@test.com",
      name: "Ivan Invitee",
      role: "student",
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
      title: "Advanced Testing",
      slug: "advanced-testing",
      description: "A paid course.",
      instructorId,
      published: true,
      price: COURSE_PRICE,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    }),
  );

  return { instructorId, referrerId, inviteeId, adminId, courseId };
}

/** Settles a purchase by reference, as the Paystack webhook does. */
async function payPurchase(t: T, reference: string) {
  await t.mutation(internal.payments.markPurchasePaid, { reference });
}

/**
 * Starts a checkout as the seeded invitee.
 *
 * Always the same identity, so tests about a *specific* buyer can read clearly
 * instead of threading a user id through every call.
 */
async function purchaseAsInvitee(t: T, courseId: Id<"courses">, referralCode?: string) {
  return as(t, "clerk_invitee").mutation(api.payments.createPendingPurchase, {
    courseId,
    referralCode,
  });
}

/** Reads a purchase back by its Paystack reference. */
async function purchaseByRef(t: T, reference: string) {
  const row = await t.run(async (ctx: TestCtx) =>
    ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", reference))
      .unique(),
  );
  if (!row) throw new Error(`no purchase for reference ${reference}`);
  return row;
}

/** Inserts an extra published course owned by the seeded instructor. */
async function addCourse(t: T, slug: string) {
  const id = await t.run(async (ctx: TestCtx) => {
    const instructor = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_instructor"))
      .unique();
    return await ctx.db.insert("courses", {
      title: slug,
      slug,
      description: "A paid course.",
      instructorId: instructor!._id,
      published: true,
      price: COURSE_PRICE,
      currency: "NGN",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return id;
}

// ─── Share codes ─────────────────────────────────────────────────────────────

describe("referral codes", () => {
  test("a code is generated on demand and reused afterwards", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const first = await as(t, "clerk_referrer").mutation(api.referrals.ensureMyCode, {});
    expect(first.code).toHaveLength(8);
    expect(first.code).toMatch(/^[A-Z0-9]+$/);

    // Idempotent: the same account must not get a second code, or an old
    // share link would stop resolving the moment the page is reopened.
    const second = await as(t, "clerk_referrer").mutation(api.referrals.ensureMyCode, {});
    expect(second.code).toBe(first.code);
  });

  test("the alphabet omits characters people misread", async () => {
    const t = convexTest(testSchema, modules);
    const { inviteeId } = await seedWorld(t);

    // The seeded referrer already has a hand-written code containing 0 and 1, so
    // this asks an *account with no code* for one rather than reading back a
    // fixture that would trivially satisfy the assertion.
    const { code } = await as(t, "clerk_invitee").mutation(api.referrals.ensureMyCode, {});

    expect(await t.run(async (ctx: TestCtx) => ctx.db.get(inviteeId))).toMatchObject({
      referralCode: code,
    });
    // No 0/O, 1/I, or L — the substitutions that turn a shared code into support.
    expect(code).not.toMatch(/[O0IL1]/);
  });

  test("a suspended account is treated as signed out", async () => {
    const t = convexTest(testSchema, modules);
    const { referrerId } = await seedWorld(t);

    await t.run((ctx: TestCtx) =>
      ctx.db.patch(referrerId, { suspendedAt: Date.now() }),
    );

    await expect(
      as(t, "clerk_referrer").mutation(api.referrals.ensureMyCode, {}),
    ).rejects.toThrow();
  });
});

// ─── The referral discount ───────────────────────────────────────────────────

describe("referral discount", () => {
  test("applies the default discount to the first purchase", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");
    const purchase = await purchaseByRef(t, reference);

    // Defaults: 20% of ₦5,000, charged as ₦4,000.
    expect(purchase.listAmount).toBe(COURSE_PRICE);
    expect(purchase.discountAmount).toBe(100_000);
    expect(purchase.amount).toBe(400_000);
  });

  test("no code means no discount — the pre-referral behaviour", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId);
    const purchase = await purchaseByRef(t, reference);

    expect(purchase.amount).toBe(COURSE_PRICE);
    expect(purchase.discountAmount ?? 0).toBe(0);
  });

  test("an unknown code is ignored rather than failing checkout", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    // A stale link must not block a purchase — the buyer pays full price.
    const { reference } = await purchaseAsInvitee(t, courseId, "NOPE0000");
    const purchase = await purchaseByRef(t, reference);

    expect(purchase.amount).toBe(COURSE_PRICE);
  });

  test("self-referral earns no discount", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, inviteeId } = await seedWorld(t);

    // Give the invitee a code, then have them use it themselves.
    const { code } = await as(t, "clerk_invitee").mutation(api.referrals.ensureMyCode, {});
    const { reference } = await purchaseAsInvitee(t, courseId, code);
    const purchase = await purchaseByRef(t, reference);

    expect(purchase.amount).toBe(COURSE_PRICE);
    expect(purchase.discountAmount ?? 0).toBe(0);

    const referrals = await t.run((ctx: TestCtx) => ctx.db.query("referrals").collect());
    expect(referrals).toHaveLength(0);
    expect(referrals.filter((r) => r.referrerId === inviteeId)).toHaveLength(0);
  });

  test("a second code does not re-discount the same person", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    // Another account with its own code.
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId: "clerk_other",
        email: "other@test.com",
        name: "Otto Other",
        role: "student",
        referralCode: "OTHER001",
        createdAt: Date.now(),
      }),
    );

    // First purchase, referred by Rita, and settled.
    const first = await purchaseAsInvitee(t, courseId, "REFER001");
    await payPurchase(t, first.reference);

    // Second purchase, a different code, same buyer: still one referral.
    const secondCourseId = await addCourse(t, "second-course");
    const { reference } = await purchaseAsInvitee(t, secondCourseId, "OTHER001");
    const purchase = await purchaseByRef(t, reference);

    // Already referred *and* already bought once, so neither code grants
    // anything — the discount is one per person, for their first paid course.
    expect(purchase.amount).toBe(COURSE_PRICE);

    const referrals = await t.run((ctx: TestCtx) => ctx.db.query("referrals").collect());
    expect(referrals).toHaveLength(1);
    expect(referrals[0].code).toBe("REFER001");
  });

  // The bug this re-pricing exists to prevent: a buyer who abandoned checkout,
  // then arrived via a referral link, used to get the old undiscounted row back.
  test("a retried checkout picks up a discount the first attempt missed", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const first = await purchaseAsInvitee(t, courseId);
    const abandoned = await purchaseByRef(t, first.reference);
    expect(abandoned.amount).toBe(COURSE_PRICE);

    // Same buyer retries, this time with the code. Same reference, new price.
    const second = await purchaseAsInvitee(t, courseId, "REFER001");
    expect(second.reference).toBe(first.reference);

    const repriced = await purchaseByRef(t, second.reference);
    expect(repriced.amount).toBe(400_000);
    expect(repriced.discountAmount).toBe(100_000);

    // And still exactly one open checkout for this user+course.
    const pending = await t.run(async (ctx: TestCtx) =>
      ctx.db
        .query("purchases")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", abandoned.userId).eq("courseId", courseId),
        )
        .collect(),
    );
    expect(pending).toHaveLength(1);
  });
});

// ─── Settlement ──────────────────────────────────────────────────────────────

describe("settlement snapshot", () => {
  test("writes the split once, at settlement", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");
    await payPurchase(t, reference);

    const purchase = await purchaseByRef(t, reference);

    // The platform funds the discount: the instructor still earns 80% of the
    // list price, not of what the buyer was charged.
    expect(purchase.status).toBe("paid");
    expect(purchase.amount).toBe(400_000);
    expect(purchase.listAmount).toBe(500_000);
    expect(purchase.instructorShareKobo).toBe(400_000);
    expect(purchase.platformFeeKobo).toBe(100_000);

    // The invariant from lib/settlement.ts, asserted on a real row.
    expect(purchase.instructorShareKobo! + purchase.platformFeeKobo!).toBe(
      purchase.listAmount!,
    );
  });

  test("settlement is idempotent — the webhook and verify can both fire", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, referrerId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");

    await payPurchase(t, reference);
    await payPurchase(t, reference);
    await payPurchase(t, reference);

    // One enrollment, and exactly one grant — not three.
    const enrollments = await t.run((ctx: TestCtx) => ctx.db.query("enrollments").collect());
    expect(enrollments).toHaveLength(1);

    const grants = await t.run((ctx: TestCtx) => ctx.db.query("referralGrants").collect());
    expect(grants).toHaveLength(1);
    expect(grants[0].userId).toBe(referrerId);
  });
});

// ─── Referrer grants ─────────────────────────────────────────────────────────

describe("referrer grants", () => {
  test("a converted referral awards the referrer a grant", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, referrerId, inviteeId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");
    await payPurchase(t, reference);

    const grants = await t.run((ctx: TestCtx) => ctx.db.query("referralGrants").collect());
    expect(grants).toHaveLength(1);
    expect(grants[0].userId).toBe(referrerId);
    expect(grants[0].status).toBe("available");
    // Default: 40% of the ₦5,000 list price, capped at ₦2,000.
    expect(grants[0].originalKobo).toBe(200_000);
    expect(grants[0].remainingKobo).toBe(200_000);

    const referral = await t.run(async (ctx: TestCtx) => {
      const r = await ctx.db
        .query("referrals")
        .withIndex("by_referred_user", (q) => q.eq("referredUserId", inviteeId))
        .unique();
      return r!;
    });
    expect(referral.status).toBe("converted");
  });

  test("an unconverted referral awards nothing", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    // Created but never paid.
    await purchaseAsInvitee(t, courseId, "REFER001");

    const grants = await t.run((ctx: TestCtx) => ctx.db.query("referralGrants").collect());
    expect(grants).toHaveLength(0);

    const referrals = await t.run((ctx: TestCtx) => ctx.db.query("referrals").collect());
    expect(referrals[0].status).toBe("pending");
  });

  test("a grant discounts the referrer's next purchase and is then spent", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");
    await payPurchase(t, reference);

    // The referrer now buys a course of their own.
    const granted = await as(t, "clerk_referrer").mutation(
      api.payments.createPendingPurchase,
      { courseId },
    );
    const quote = await purchaseByRef(t, granted.reference);

    // The full ₦2,000 grant applies — more than a fresh referral would give.
    expect(quote.discountAmount).toBe(200_000);
    expect(quote.amount).toBe(300_000);
    expect(quote.grantId).toBeDefined();

    await payPurchase(t, granted.reference);

    const grants = await t.run((ctx: TestCtx) => ctx.db.query("referralGrants").collect());
    expect(grants[0].status).toBe("consumed");
    expect(grants[0].remainingKobo).toBe(0);
    expect(grants[0].consumedByPurchaseId).toBe(quote._id);

    const purchase = await t.run((ctx: TestCtx) => ctx.db.get(quote._id));
    expect(purchase!.grantAppliedKobo).toBe(200_000);

    // And the instructor is still paid on the full list price for that sale.
    expect(purchase!.instructorShareKobo).toBe(400_000);
  });

  test("a spent grant is not applied to a later purchase", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");
    await payPurchase(t, reference);

    const granted = await as(t, "clerk_referrer").mutation(
      api.payments.createPendingPurchase,
      { courseId },
    );
    await payPurchase(t, granted.reference);

    const thirdId = await addCourse(t, "third-course");

    const later = await as(t, "clerk_referrer").mutation(
      api.payments.createPendingPurchase,
      { courseId: thirdId },
    );
    const quote = await purchaseByRef(t, later.reference);

    expect(quote.amount).toBe(COURSE_PRICE);
    expect(quote.grantId).toBeUndefined();
  });

  // Non-stacking: a buyer who is both an invitee and holds a grant takes the
  // larger, never both.
  test("a grant and a referral discount do not stack", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    // Rita holds a ₦2,000 grant earned earlier, then arrives at checkout with
    // someone else's code. Both benefits apply to one purchase.
    await t.run(async (ctx: TestCtx) => {
      const rita = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_referrer"))
        .unique();
      const referralId = await ctx.db.insert("referrals", {
        referrerId: (await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", "clerk_instructor"))
          .unique())!._id,
        referredUserId: rita!._id,
        code: "REFER001",
        status: "converted",
        rewardKobo: 200_000,
        createdAt: Date.now(),
      });
      await ctx.db.insert("referralGrants", {
        userId: rita!._id,
        referralId,
        source: "referral",
        originalKobo: 200_000,
        remainingKobo: 200_000,
        status: "available",
        awardedAt: Date.now(),
      });
    });

    const { reference } = await as(t, "clerk_referrer").mutation(
      api.payments.createPendingPurchase,
      { courseId, referralCode: "REFER001" },
    );
    const quote = await purchaseByRef(t, reference);

    // Both benefits would be ₦100,000 (20%) and ₦200,000 (grant). The larger
    // wins: ₦200,000, not ₦300,000.
    expect(quote.discountAmount).toBe(200_000);
    expect(quote.amount).toBe(300_000);
  });
});

// ─── Programme switch and settings ───────────────────────────────────────────

describe("referral settings", () => {
  test("disabling the programme stops new discounts", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, adminId } = await seedWorld(t);

    await t.run(async (ctx: TestCtx) => {
      await ctx.db.insert("referralSettings", {
        enabled: false,
        inviteeDiscountBps: 2000,
        maxInviteeDiscountKobo: 500_000,
        referrerGrantBps: 4000,
        maxReferrerGrantKobo: 200_000,
        grantExpiryDays: 90,
        updatedAt: Date.now(),
        updatedBy: adminId,
      });
    });

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");

    const purchase = await purchaseByRef(t, reference);
    expect(purchase.amount).toBe(COURSE_PRICE);
  });

  test("an admin rate change is clamped and audited", async () => {
    const t = convexTest(testSchema, modules);
    const { adminId } = await seedWorld(t);

    const saved = await as(t, "clerk_admin").mutation(api.referrals.updateSettings, {
      enabled: true,
      inviteeDiscountBps: 999_999, // nonsense
      maxInviteeDiscountKobo: -1,
      referrerGrantBps: 50_000,
      maxReferrerGrantKobo: 10_000_000_000,
      grantExpiryDays: 999_999,
    });

    expect(saved.inviteeDiscountBps).toBe(10_000);
    expect(saved.maxInviteeDiscountKobo).toBe(0);
    expect(saved.referrerGrantBps).toBe(10_000);
    expect(saved.maxReferrerGrantKobo).toBe(100_000_000);
    expect(saved.grantExpiryDays).toBe(3650);

    const audits = await as(t, "clerk_admin").query(api.auditLogs.listAuditLogs, { limit: 10 });
    const entry = audits.find((a) => a.action === "referral.settings_update");
    expect(entry).toBeDefined();
  });

  test("a non-admin cannot read or change the settings", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    await expect(
      as(t, "clerk_referrer").query(api.referrals.getSettings, {}),
    ).rejects.toThrow();

    await expect(
      as(t, "clerk_referrer").mutation(api.referrals.updateSettings, {
        enabled: false,
        inviteeDiscountBps: 0,
        maxInviteeDiscountKobo: 0,
        referrerGrantBps: 0,
        maxReferrerGrantKobo: 0,
      }),
    ).rejects.toThrow();
  });
});

// ─── Learner summary ─────────────────────────────────────────────────────────

describe("referral summary", () => {
  test("reports the code, counts and available credit", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const before = await as(t, "clerk_referrer").query(
      api.referrals.getMyReferralSummary,
      {},
    );
    expect(before.code).toBe("REFER001");
    expect(before.invitedCount).toBe(0);
    expect(before.availableCreditKobo).toBe(0);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");
    await payPurchase(t, reference);

    const after = await as(t, "clerk_referrer").query(
      api.referrals.getMyReferralSummary,
      {},
    );
    expect(after.invitedCount).toBe(1);
    expect(after.convertedCount).toBe(1);
    expect(after.totalRewardKobo).toBe(200_000);
    expect(after.availableCreditKobo).toBe(200_000);
    expect(after.recent[0].inviteeName).toBe("Ivan Invitee");
    expect(after.recent[0].courseTitle).toBe("Advanced Testing");
  });

  test("a student's summary shows nobody else's referrals", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const summary = await as(t, "clerk_invitee").query(
      api.referrals.getMyReferralSummary,
      {},
    );

    // They referred nobody, and being referred does not make them a referrer.
    expect(summary.invitedCount).toBe(0);
    expect(summary.convertedCount).toBe(0);
  });
});

describe("programme stats", () => {
  test("conversion rate is null before anyone is invited, not zero", async () => {
    const t = convexTest(testSchema, modules);
    await seedWorld(t);

    const stats = await as(t, "clerk_admin").query(api.referrals.getProgramStats, {});
    expect(stats.invited).toBe(0);
    // "No invitations yet" and "a 0% rate" are different facts.
    expect(stats.conversionRate).toBeNull();
  });

  test("counts conversions and outstanding credit", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const { reference } = await purchaseAsInvitee(t, courseId, "REFER001");
    await payPurchase(t, reference);

    const stats = await as(t, "clerk_admin").query(api.referrals.getProgramStats, {});
    expect(stats.invited).toBe(1);
    expect(stats.converted).toBe(1);
    expect(stats.conversionRate).toBe(100);
    expect(stats.rewardIssuedKobo).toBe(200_000);
    expect(stats.outstandingCreditKobo).toBe(200_000);
  });
});