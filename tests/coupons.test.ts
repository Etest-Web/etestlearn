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

/** Two instructors, an admin, two buyers, and one paid course each instructor owns. */
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

  const otherInstructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_other",
      email: "other@test.com",
      name: "Obi Other",
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

  const buyerId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_buyer",
      email: "buyer@test.com",
      name: "Bea Buyer",
      role: "student",
      createdAt: now,
    }),
  );

  const secondBuyerId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_second",
      email: "second@test.com",
      name: "Sam Second",
      role: "student",
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

  const otherCourseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Another Course",
      slug: "another-course",
      description: "A second paid course.",
      instructorId: otherInstructorId,
      published: true,
      price: COURSE_PRICE,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    }),
  );

  return {
    instructorId,
    otherInstructorId,
    adminId,
    buyerId,
    secondBuyerId,
    courseId,
    otherCourseId,
  };
}

/** Creates a coupon as the course owner and returns its id. */
async function addCoupon(
  t: T,
  courseId: Id<"courses">,
  args: Partial<{
    code: string;
    kind: "percent" | "amount";
    percentOff: number;
    amountOffKobo: number;
    maxRedemptions: number;
    expiresAt: number;
  }> = {},
): Promise<Id<"coupons">> {
  return as(t, "clerk_instructor").mutation(api.coupons.create, {
    courseId,
    code: args.code ?? "SAVE20",
    kind: args.kind ?? "percent",
    percentOff: args.kind === "amount" ? undefined : (args.percentOff ?? 20),
    amountOffKobo: args.amountOffKobo,
    maxRedemptions: args.maxRedemptions,
    expiresAt: args.expiresAt,
  });
}

/** Reads a purchase back by its Paystack reference. */
async function purchaseByRef(t: T, reference: string) {
  const row = await t.run((ctx: TestCtx) =>
    ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", reference))
      .unique(),
  );
  if (!row) throw new Error(`no purchase for reference ${reference}`);
  return row;
}

/** Reads a coupon row directly, for assertions the public API does not expose. */
async function couponById(t: T, couponId: Id<"coupons">) {
  const row = await t.run((ctx: TestCtx) => ctx.db.get(couponId));
  if (!row) throw new Error(`no coupon ${couponId}`);
  return row;
}

/** Starts a checkout for a buyer, optionally with a coupon code. */
async function checkout(
  t: T,
  subject: string,
  courseId: Id<"courses">,
  couponCode?: string,
) {
  return as(t, subject).mutation(api.payments.createPendingPurchase, {
    courseId,
    couponCode,
  });
}

// ─── Authoring access ────────────────────────────────────────────────────────

describe("coupon authoring access", () => {
  test("the course owner can create a coupon and see it listed", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const couponId = await addCoupon(t, courseId, { code: "SAVE20", percentOff: 20 });

    const list = await as(t, "clerk_instructor").query(api.coupons.listForCourse, {
      courseId,
    });
    expect(list).toHaveLength(1);
    expect(list[0]._id).toBe(couponId);
    expect(list[0].code).toBe("SAVE20");
    expect(list[0].label).toBe("20% off");
    expect(list[0].state).toBe("active");
    expect(list[0].redemptionCount).toBe(0);
  });

  test("a code typed in lower case is normalized to upper case", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await addCoupon(t, courseId, { code: "launch-week" });

    const list = await as(t, "clerk_instructor").query(api.coupons.listForCourse, {
      courseId,
    });
    expect(list[0].code).toBe("LAUNCH-WEEK");
  });

  test("a code is generated when the author leaves it blank", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await as(t, "clerk_instructor").mutation(api.coupons.create, {
      courseId,
      kind: "percent",
      percentOff: 15,
    });

    const list = await as(t, "clerk_instructor").query(api.coupons.listForCourse, {
      courseId,
    });
    expect(list[0].code).toMatch(/^GLY-[BCDFGHJKLMNPQRSTVWXYZ23456789]{6}$/);
  });

  test("an instructor who does not own the course is refused everywhere", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const couponId = await addCoupon(t, courseId);

    await expect(
      as(t, "clerk_other").mutation(api.coupons.create, {
        courseId,
        kind: "percent",
        percentOff: 10,
      }),
    ).rejects.toThrow(/only the course owner/);

    await expect(
      as(t, "clerk_other").query(api.coupons.listForCourse, { courseId }),
    ).rejects.toThrow(/only the course owner/);

    await expect(
      as(t, "clerk_other").mutation(api.coupons.setActive, {
        couponId,
        active: false,
      }),
    ).rejects.toThrow(/only the course owner/);

    await expect(
      as(t, "clerk_other").mutation(api.coupons.remove, { couponId }),
    ).rejects.toThrow(/only the course owner/);
  });

  test("a learner cannot reach the authoring surface", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, buyerId } = await seedWorld(t);
    expect(buyerId).toBeTruthy();

    await expect(
      as(t, "clerk_buyer").query(api.coupons.listForCourse, { courseId }),
    ).rejects.toThrow(/only the course owner/);
  });

  test("signed-out callers are refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await expect(
      t.query(api.coupons.listForCourse, { courseId }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("an admin may manage any course's coupons", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, instructorId } = await seedWorld(t);

    const couponId = await as(t, "clerk_admin").mutation(api.coupons.create, {
      courseId,
      code: "ADMINCODE",
      kind: "amount",
      amountOffKobo: 50_000,
    });

    const list = await as(t, "clerk_admin").query(api.coupons.listForCourse, {
      courseId,
    });
    expect(list.some((row) => row._id === couponId)).toBe(true);

    // The stored owner is the course's instructor, not the admin who typed it,
    // so an admin-created code is still listed for the instructor afterwards.
    const row = await couponById(t, couponId);
    expect(row.instructorId).toBe(instructorId);
    const ownerList = await as(t, "clerk_instructor").query(api.coupons.listForCourse, {
      courseId,
    });
    expect(ownerList.map((c) => c._id)).toContain(couponId);
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe("coupon validation", () => {
  test("a duplicate code on the same course is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await addCoupon(t, courseId, { code: "SAVE20" });

    await expect(addCoupon(t, courseId, { code: "save20" })).rejects.toThrow(
      /already in use/,
    );
  });

  test("the same code may be used on a different course", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, otherCourseId } = await seedWorld(t);
    await addCoupon(t, courseId, { code: "SAVE20" });

    await as(t, "clerk_other").mutation(api.coupons.create, {
      courseId: otherCourseId,
      code: "SAVE20",
      kind: "percent",
      percentOff: 20,
    });

    const list = await as(t, "clerk_other").query(api.coupons.listForCourse, {
      courseId: otherCourseId,
    });
    expect(list[0].code).toBe("SAVE20");
  });

  test("a too-short code, a bad percentage and a past expiry are all refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    await expect(addCoupon(t, courseId, { code: "ABC" })).rejects.toThrow(
      /between 4 and 32/,
    );
    await expect(addCoupon(t, courseId, { percentOff: 0 })).rejects.toThrow(/1 to 100/);
    await expect(addCoupon(t, courseId, { percentOff: 150 })).rejects.toThrow(/1 to 100/);
    await expect(
      addCoupon(t, courseId, { expiresAt: Date.now() - 1000 }),
    ).rejects.toThrow(/must be in the future/);
  });

  test("the unused field of the other kind is not stored", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const couponId = await addCoupon(t, courseId, {
      kind: "amount",
      amountOffKobo: 50_000,
      percentOff: 99,
    });
    const row = await couponById(t, couponId);
    expect(row.amountOffKobo).toBe(50_000);
    expect(row.percentOff).toBeUndefined();
  });
});

// ─── Preview ─────────────────────────────────────────────────────────────────

describe("coupon preview", () => {
  test("a valid code reports what it would take off", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await addCoupon(t, courseId, { percentOff: 20 });

    const preview = await as(t, "clerk_buyer").query(api.coupons.preview, {
      courseId,
      code: "save20",
    });

    expect(preview.valid).toBe(true);
    expect(preview.discountKobo).toBe(100_000);
    expect(preview.message).toMatch(/20% off/);
  });

  test("a signed-out visitor can check a code", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await addCoupon(t, courseId, { code: "SAVE20" });

    const preview = await t.query(api.coupons.preview, { courseId, code: "SAVE20" });
    expect(preview.valid).toBe(true);
  });

  test("an unknown code and a code for another course both read as invalid", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, otherCourseId } = await seedWorld(t);
    await addCoupon(t, courseId, { code: "SAVE20" });

    const unknown = await as(t, "clerk_buyer").query(api.coupons.preview, {
      courseId,
      code: "NOPE1234",
    });
    expect(unknown.valid).toBe(false);
    expect(unknown.message).toMatch(/isn't valid/);

    const wrongCourse = await as(t, "clerk_buyer").query(api.coupons.preview, {
      courseId: otherCourseId,
      code: "SAVE20",
    });
    expect(wrongCourse.valid).toBe(false);
  });

  test("a paused code is refused without saying it was paused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const couponId = await addCoupon(t, courseId, { code: "SAVE20" });

    await as(t, "clerk_instructor").mutation(api.coupons.setActive, {
      couponId,
      active: false,
    });

    const preview = await as(t, "clerk_buyer").query(api.coupons.preview, {
      courseId,
      code: "SAVE20",
    });
    expect(preview.valid).toBe(false);
    expect(preview.message).toMatch(/no longer valid/);
  });

  test("a lapsed code is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, instructorId } = await seedWorld(t);

    // Inserted directly: `create` refuses to write an already-expired coupon,
    // and the point here is the read path for a code that has since lapsed.
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("coupons", {
        courseId,
        instructorId,
        code: "LAPSED",
        kind: "percent",
        percentOff: 20,
        active: true,
        redemptionCount: 0,
        expiresAt: Date.now() - 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const preview = await as(t, "clerk_buyer").query(api.coupons.preview, {
      courseId,
      code: "LAPSED",
    });
    expect(preview.valid).toBe(false);
    expect(preview.message).toMatch(/no longer valid/);
  });

  test("a code at its redemption cap is refused", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId, instructorId } = await seedWorld(t);

    await t.run((ctx: TestCtx) =>
      ctx.db.insert("coupons", {
        courseId,
        instructorId,
        code: "ONESLEFT",
        kind: "percent",
        percentOff: 20,
        active: true,
        redemptionCount: 1,
        maxRedemptions: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const preview = await as(t, "clerk_buyer").query(api.coupons.preview, {
      courseId,
      code: "ONESLEFT",
    });
    expect(preview.valid).toBe(false);
    expect(preview.message).toMatch(/fully redeemed/);
  });

  test("a course that is not for sale reports no discount", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await addCoupon(t, courseId, { code: "SAVE20" });

    await t.run((ctx: TestCtx) =>
      ctx.db.patch(courseId, { published: false }),
    );

    const preview = await as(t, "clerk_buyer").query(api.coupons.preview, {
      courseId,
      code: "SAVE20",
    });
    expect(preview.valid).toBe(false);
    expect(preview.message).toBe("");
  });
});

// ─── Deletion ────────────────────────────────────────────────────────────────

describe("removing a coupon", () => {
  test("an unused coupon can be deleted", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const couponId = await addCoupon(t, courseId);

    await as(t, "clerk_instructor").mutation(api.coupons.remove, { couponId });

    const row = await t.run((ctx: TestCtx) => ctx.db.get(couponId));
    expect(row).toBeNull();
  });

  test("a redeemed coupon is refused, because sales point at it", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const couponId = await addCoupon(t, courseId);

    const { reference } = await checkout(t, "clerk_buyer", courseId, "SAVE20");
    await t.mutation(internal.payments.markPurchasePaid, { reference });

    await expect(
      as(t, "clerk_instructor").mutation(api.coupons.remove, { couponId }),
    ).rejects.toThrow(/pause it instead/);

    // Pausing still works, which is the option the message points at.
    await as(t, "clerk_instructor").mutation(api.coupons.setActive, {
      couponId,
      active: false,
    });
    const row = await couponById(t, couponId);
    expect(row.active).toBe(false);
  });
});

// ─── Checkout ────────────────────────────────────────────────────────────────

describe("checkout with a coupon", () => {
  test("the charge is the discounted price and the coupon is recorded", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const couponId = await addCoupon(t, courseId, { code: "SAVE20", percentOff: 20 });

    const { reference } = await checkout(t, "clerk_buyer", courseId, "SAVE20");
    const purchase = await purchaseByRef(t, reference);

    expect(purchase.amount).toBe(400_000);
    expect(purchase.listAmount).toBe(COURSE_PRICE);
    expect(purchase.couponId).toBe(couponId);
    expect(purchase.couponCode).toBe("SAVE20");
    expect(purchase.couponDiscountKobo).toBe(100_000);
    // Nothing is redeemed until the sale settles.
    expect((await couponById(t, couponId)).redemptionCount).toBe(0);
  });

  test("settlement takes the coupon off the instructor's share, not the platform's", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await addCoupon(t, courseId, { code: "SAVE20", percentOff: 20 });

    const { reference } = await checkout(t, "clerk_buyer", courseId, "SAVE20");
    await t.mutation(internal.payments.markPurchasePaid, { reference });

    const purchase = await purchaseByRef(t, reference);
    // 80% of the 400,000 the coupon left standing — not 80% of the list price.
    expect(purchase.instructorShareKobo).toBe(320_000);
    expect(purchase.platformFeeKobo).toBe(80_000);
    expect(purchase.status).toBe("paid");
  });

  test("a 100%-off code pays the instructor nothing", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await addCoupon(t, courseId, { code: "FREE100", percentOff: 100 });

    const { reference } = await checkout(t, "clerk_buyer", courseId, "FREE100");
    await t.mutation(internal.payments.markPurchasePaid, { reference });

    const purchase = await purchaseByRef(t, reference);
    expect(purchase.amount).toBe(0);
    expect(purchase.instructorShareKobo).toBe(0);
    expect(purchase.platformFeeKobo).toBe(0);
  });

  test("settling twice redeems the coupon exactly once", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const couponId = await addCoupon(t, courseId, { code: "SAVE20" });

    const { reference } = await checkout(t, "clerk_buyer", courseId, "SAVE20");
    await t.mutation(internal.payments.markPurchasePaid, { reference });
    await t.mutation(internal.payments.markPurchasePaid, { reference });

    expect((await couponById(t, couponId)).redemptionCount).toBe(1);
  });

  test("an expired or unknown code is quietly ignored, and the full price is charged", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);

    const { reference } = await checkout(t, "clerk_buyer", courseId, "NOTACODE1");
    const purchase = await purchaseByRef(t, reference);

    expect(purchase.amount).toBe(COURSE_PRICE);
    expect(purchase.couponId).toBeUndefined();
    expect(purchase.couponDiscountKobo).toBe(0);
  });

  test("a code that reaches its cap stops applying to later buyers", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    const couponId = await addCoupon(t, courseId, {
      code: "ONLYONE",
      percentOff: 50,
      maxRedemptions: 1,
    });

    const first = await checkout(t, "clerk_buyer", courseId, "ONLYONE");
    expect((await purchaseByRef(t, first.reference)).amount).toBe(250_000);
    await t.mutation(internal.payments.markPurchasePaid, { reference: first.reference });

    const preview = await as(t, "clerk_second").query(api.coupons.preview, {
      courseId,
      code: "ONLYONE",
    });
    expect(preview.valid).toBe(false);
    expect(preview.message).toMatch(/fully redeemed/);

    // And the next buyer is charged in full, not given a discount the cap forbids.
    const second = await checkout(t, "clerk_second", courseId, "ONLYONE");
    const purchase = await purchaseByRef(t, second.reference);
    expect(purchase.amount).toBe(COURSE_PRICE);
    expect(purchase.couponId).toBeUndefined();
    expect((await couponById(t, couponId)).redemptionCount).toBe(1);
  });

  test("a fixed-amount coupon takes exactly that much off", async () => {
    const t = convexTest(testSchema, modules);
    const { courseId } = await seedWorld(t);
    await addCoupon(t, courseId, {
      code: "FIVEOFF",
      kind: "amount",
      amountOffKobo: 50_000,
    });

    const { reference } = await checkout(t, "clerk_buyer", courseId, "FIVEOFF");
    const purchase = await purchaseByRef(t, reference);
    expect(purchase.amount).toBe(450_000);
    expect(purchase.couponDiscountKobo).toBe(50_000);
  });
});
