import { describe, expect, it } from "vitest";

import {
  BPS_PER_WHOLE,
  INSTRUCTOR_SHARE_BPS,
  PLATFORM_SHARE_BPS,
  clampDiscount,
  legacyShareKobo,
  settleSale,
} from "./settlement";

describe("settleSale", () => {
  it("splits a sale at the configured rate", () => {
    const result = settleSale({ listAmount: 500000, discountAmount: 0 });

    expect(result.chargedAmount).toBe(500000);
    expect(result.instructorShareKobo).toBe(400000);
    expect(result.platformFeeKobo).toBe(100000);
  });

  // The invariant that justifies the whole module. If this ever fails, an
  // instructor's earnings and the platform's revenue no longer reconcile.
  it("keeps the two halves summing to the list price for awkward amounts", () => {
    const amounts = [1, 3, 7, 999, 1001, 33333, 500000, 123457];

    for (const listAmount of amounts) {
      const { instructorShareKobo, platformFeeKobo } = settleSale({
        listAmount,
        discountAmount: 0,
      });
      expect(instructorShareKobo + platformFeeKobo).toBe(listAmount);
    }
  });

  it("holds the invariant when a discount is applied", () => {
    const result = settleSale({ listAmount: 500000, discountAmount: 100000 });

    // The platform absorbs the discount AND still pays the instructor their
    // full 80% of the pre-discount price.
    expect(result.chargedAmount).toBe(400000);
    expect(result.instructorShareKobo).toBe(400000);
    expect(result.platformFeeKobo).toBe(100000);
  });

  it("never pays the instructor more than the list price", () => {
    const result = settleSale({ listAmount: 100, discountAmount: 100 });

    expect(result.chargedAmount).toBe(0);
    expect(result.instructorShareKobo).toBe(80);
    expect(result.platformFeeKobo).toBe(20);
  });

  it("treats a free course as a zero settlement", () => {
    const result = settleSale({ listAmount: 0, discountAmount: 0 });

    expect(result.chargedAmount).toBe(0);
    expect(result.instructorShareKobo).toBe(0);
    expect(result.platformFeeKobo).toBe(0);
  });

  it("clamps a discount that exceeds the list price", () => {
    // A misconfigured cap must never produce a negative charge — that value
    // would be sent to Paystack.
    const result = settleSale({ listAmount: 500000, discountAmount: 900000 });

    expect(result.chargedAmount).toBe(0);
    expect(result.instructorShareKobo).toBe(400000);
  });

  it("rounds once per component, so the parts still reconcile", () => {
    // 999 kobo at 80% is 799.2. Rounding each half independently would give
    // 799 + 200 = 999 here but 999 + 200 = 1199 on some other value; deriving
    // the second half from the first keeps the sum exact.
    const result = settleSale({ listAmount: 999, discountAmount: 0 });

    expect(result.instructorShareKobo).toBe(799);
    expect(result.platformFeeKobo).toBe(200);
  });

  it("rejects rates outside 0–10000 by clamping rather than overflowing", () => {
    const tooHigh = settleSale({ listAmount: 1000, discountAmount: 0, revenueShareBps: 20000 });
    expect(tooHigh.instructorShareKobo).toBe(1000);
    expect(tooHigh.platformFeeKobo).toBe(0);

    const negative = settleSale({ listAmount: 1000, discountAmount: 0, revenueShareBps: -500 });
    expect(negative.instructorShareKobo).toBe(0);
    expect(negative.platformFeeKobo).toBe(1000);
  });

  it("uses basis points so the rate is exact", () => {
    // A 9.25% instructor share of 1000 kobo is exactly 93 kobo. A float rate
    // would not land on that cleanly at every amount, which is why rates are
    // integer basis points rather than the 0.8 this replaced.
    const result = settleSale({
      listAmount: 1000,
      discountAmount: 0,
      revenueShareBps: 925,
    });

    expect(result.instructorShareKobo).toBe(93);
    expect(result.platformFeeKobo).toBe(907);
  });

  it("ignores non-finite and negative inputs instead of producing NaN", () => {
    expect(settleSale({ listAmount: NaN, discountAmount: 0 }).chargedAmount).toBe(0);
    expect(settleSale({ listAmount: Infinity, discountAmount: 0 }).instructorShareKobo).toBe(0);
    expect(settleSale({ listAmount: -500, discountAmount: 0 }).chargedAmount).toBe(0);
    expect(settleSale({ listAmount: 1000, discountAmount: NaN }).chargedAmount).toBe(1000);
    expect(settleSale({ listAmount: 1000, discountAmount: -50 }).chargedAmount).toBe(1000);
  });
});

describe("settleSale with an instructor coupon", () => {
  it("takes the coupon off the instructor's basis, not the platform's", () => {
    const result = settleSale({
      listAmount: 500000,
      discountAmount: 0,
      couponDiscountKobo: 100000,
    });

    // 80% of the 400,000 the coupon left standing, not 80% of the list price.
    expect(result.chargedAmount).toBe(400000);
    expect(result.instructorShareKobo).toBe(320000);
    expect(result.platformFeeKobo).toBe(80000);
    expect(result.couponDiscountKobo).toBe(100000);
  });

  it("pays nothing for a self-purchase with a 100%-off code", () => {
    // The money pump this models: an instructor mints a 100%-off code, "buys"
    // their own course, and would otherwise be paid 80% of the list price for a
    // sale that charged nothing. Nothing is charged, so nothing is owed.
    const result = settleSale({
      listAmount: 500000,
      discountAmount: 0,
      couponDiscountKobo: 500000,
    });

    expect(result.chargedAmount).toBe(0);
    expect(result.instructorShareKobo).toBe(0);
    expect(result.platformFeeKobo).toBe(0);
  });

  it("keeps the halves summing to the coupon-adjusted price", () => {
    for (const listAmount of [1, 3, 999, 1001, 33333, 500000, 123457]) {
      const couponDiscountKobo = Math.min(listAmount, Math.floor(listAmount / 3));
      const { instructorShareKobo, platformFeeKobo } = settleSale({
        listAmount,
        discountAmount: 0,
        couponDiscountKobo,
      });
      expect(instructorShareKobo + platformFeeKobo).toBe(listAmount - couponDiscountKobo);
    }
  });

  it("applies a platform discount to what the coupon left standing", () => {
    const result = settleSale({
      listAmount: 500000,
      discountAmount: 100000,
      couponDiscountKobo: 100000,
    });

    // 500,000 − 100,000 coupon = 400,000 basis; − 100,000 referral = 300,000.
    expect(result.chargedAmount).toBe(300000);
    expect(result.instructorShareKobo).toBe(320000);
    expect(result.platformFeeKobo).toBe(80000);
  });

  it("clamps a coupon larger than the price", () => {
    const result = settleSale({
      listAmount: 500000,
      discountAmount: 0,
      couponDiscountKobo: 900000,
    });

    expect(result.chargedAmount).toBe(0);
    expect(result.instructorShareKobo).toBe(0);
    expect(result.couponDiscountKobo).toBe(500000);
  });

  it("treats a negative or non-finite coupon as no coupon", () => {
    expect(
      settleSale({ listAmount: 1000, discountAmount: 0, couponDiscountKobo: -50 }).chargedAmount,
    ).toBe(1000);
    expect(
      settleSale({ listAmount: 1000, discountAmount: 0, couponDiscountKobo: NaN }).chargedAmount,
    ).toBe(1000);
  });

  it("is identical to the pre-coupon result when no coupon applies", () => {
    const withoutCoupon = settleSale({ listAmount: 500000, discountAmount: 100000 });
    const withZero = settleSale({
      listAmount: 500000,
      discountAmount: 100000,
      couponDiscountKobo: 0,
    });

    expect(withZero).toEqual({ ...withoutCoupon, couponDiscountKobo: 0 });
  });
});

describe("clampDiscount", () => {
  it("allows a discount that exactly zeroes the sale", () => {
    expect(clampDiscount(1000, 1000)).toBe(1000);
  });

  it("caps at the list price", () => {
    expect(clampDiscount(1000, 5000)).toBe(1000);
  });

  it("drops a negative discount", () => {
    expect(clampDiscount(1000, -250)).toBe(0);
  });
});

describe("constants", () => {
  it("keeps the two shares complementary", () => {
    expect(INSTRUCTOR_SHARE_BPS + PLATFORM_SHARE_BPS).toBe(BPS_PER_WHOLE);
    expect(INSTRUCTOR_SHARE_BPS).toBe(8000);
  });
});

describe("legacyShareKobo", () => {
  // Pre-snapshot rows have no stored share, so the query layer falls back to
  // this. It must agree exactly with settleSale, otherwise a sale's figure
  // would depend on which code path rendered it.
  it("agrees with settleSale on the same inputs", () => {
    expect(legacyShareKobo(500000)).toBe(settleSale({ listAmount: 500000, discountAmount: 0 }).instructorShareKobo);
    expect(legacyShareKobo(999)).toBe(settleSale({ listAmount: 999, discountAmount: 0 }).instructorShareKobo);
  });

  it("treats the stored amount as the list price for undiscounted legacy rows", () => {
    // Legacy rows never had a discount, so charged === list and the fallback
    // reproduces the old figure exactly.
    expect(legacyShareKobo(400000)).toBe(320000);
  });
});