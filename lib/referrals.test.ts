import { describe, expect, it } from "vitest";

import {
  DEFAULT_GRANT_EXPIRY_DAYS,
  MAX_DISCOUNT_BPS,
  applyDiscount,
  chargedAmountFor,
  grantExpiry,
  inviteeDiscountKobo,
  percentageOf,
  referrerGrantKobo,
} from "./referrals";

describe("percentageOf", () => {
  it("computes a basis-point share, rounded to the nearest kobo", () => {
    expect(percentageOf(500000, 2000)).toBe(100000); // 20% of ₦5,000
    expect(percentageOf(999, 5000)).toBe(500); // 50% of 999, rounded
    expect(percentageOf(1001, 5000)).toBe(501);
  });

  it("returns zero rather than NaN for unusable inputs", () => {
    expect(percentageOf(0, 2000)).toBe(0);
    expect(percentageOf(1000, 0)).toBe(0);
    expect(percentageOf(-1000, 2000)).toBe(0);
    expect(percentageOf(1000, -2000)).toBe(0);
    expect(percentageOf(NaN, 2000)).toBe(0);
  });
});

describe("inviteeDiscountKobo", () => {
  it("applies the percentage rate", () => {
    expect(
      inviteeDiscountKobo({
        listAmount: 500000,
        discountBps: 2000,
        maxDiscountKobo: 500000,
      }),
    ).toBe(100000);
  });

  it("honours the absolute cap on an expensive course", () => {
    expect(
      inviteeDiscountKobo({
        listAmount: 5000000, // ₦50,000
        discountBps: 2000, // 20% would be ₦10,000
        maxDiscountKobo: 500000, // capped at ₦5,000
      }),
    ).toBe(500000);
  });

  // The percentage guard is the one that matters: a generous admin ceiling
  // must not be able to zero out an expensive course.
  it("never exceeds MAX_DISCOUNT_BPS even when the ceiling is generous", () => {
    const discount = inviteeDiscountKobo({
      listAmount: 1000000, // ₦10,000
      discountBps: 9000, // an admin who set 90%
      maxDiscountKobo: 9000000, // and an absurd ceiling
    });

    expect(discount).toBe(percentageOf(1000000, MAX_DISCOUNT_BPS));
    expect(discount).toBe(500000);
  });

  it("never discounts a cheap course to nothing via the rate", () => {
    // 50% of ₦100 is ₦50 — the buyer still pays something.
    expect(
      inviteeDiscountKobo({
        listAmount: 10000,
        discountBps: 2000,
        maxDiscountKobo: 500000,
      }),
    ).toBe(2000);
  });

  it("clamps to the list price when the cap exceeds it", () => {
    expect(
      inviteeDiscountKobo({
        listAmount: 5000,
        discountBps: 2000,
        maxDiscountKobo: 500000,
      }),
    ).toBe(1000);
  });

  it("is zero when the list price is zero", () => {
    expect(
      inviteeDiscountKobo({ listAmount: 0, discountBps: 2000, maxDiscountKobo: 500000 }),
    ).toBe(0);
  });
});

describe("referrerGrantKobo", () => {
  // Valued off the list price, so a heavily discounted course still produces a
  // reward — otherwise the referrer would be steered to cheap courses.
  it("values the grant off the list price, not the discounted charge", () => {
    const grant = referrerGrantKobo({
      listAmount: 500000,
      grantBps: 1000,
      maxGrantKobo: 500000,
    });

    expect(grant).toBe(50000);
  });

  it("honours its own ceiling, independent of the invitee discount cap", () => {
    expect(
      referrerGrantKobo({
        listAmount: 5000000,
        grantBps: 1000,
        maxGrantKobo: 100000,
      }),
    ).toBe(100000);
  });

  it("rejects a negative ceiling rather than paying out", () => {
    expect(
      referrerGrantKobo({ listAmount: 500000, grantBps: 1000, maxGrantKobo: -1 }),
    ).toBe(0);
  });
});

describe("applyDiscount", () => {
  it("uses the referral when there is no grant", () => {
    const result = applyDiscount({
      listAmount: 500000,
      inviteeDiscountKobo: 100000,
      grantKobo: 0,
    });

    expect(result.discountAmount).toBe(100000);
    expect(result.fromReferral).toBe(true);
    expect(result.fromGrant).toBe(false);
  });

  it("uses the grant when there is no referral", () => {
    const result = applyDiscount({
      listAmount: 500000,
      inviteeDiscountKobo: 0,
      grantKobo: 50000,
    });

    expect(result.discountAmount).toBe(50000);
    expect(result.fromGrant).toBe(true);
    expect(result.fromReferral).toBe(false);
  });

  // The rule that keeps platform cost bounded: one discount per purchase, not
  // two compounding.
  it("never stacks the referral and the grant", () => {
    const result = applyDiscount({
      listAmount: 500000,
      inviteeDiscountKobo: 100000,
      grantKobo: 50000,
    });

    expect(result.discountAmount).toBe(100000);
    expect(result.fromReferral).toBe(true);
    expect(result.fromGrant).toBe(false);
  });

  it("takes the larger when the grant beats the referral", () => {
    const result = applyDiscount({
      listAmount: 500000,
      inviteeDiscountKobo: 20000,
      grantKobo: 80000,
    });

    expect(result.discountAmount).toBe(80000);
    expect(result.fromGrant).toBe(true);
  });

  it("prefers the referral on a tie, so the advertised promise holds", () => {
    const result = applyDiscount({
      listAmount: 500000,
      inviteeDiscountKobo: 50000,
      grantKobo: 50000,
    });

    expect(result.discountAmount).toBe(50000);
    expect(result.fromReferral).toBe(true);
    expect(result.fromGrant).toBe(false);
  });

  it("clamps to the list price when either benefit exceeds it", () => {
    const result = applyDiscount({
      listAmount: 10000,
      inviteeDiscountKobo: 999999,
      grantKobo: 0,
    });

    expect(result.discountAmount).toBe(10000);
  });

  it("applies nothing when there is no benefit", () => {
    const result = applyDiscount({
      listAmount: 500000,
      inviteeDiscountKobo: 0,
      grantKobo: 0,
    });

    expect(result.discountAmount).toBe(0);
    expect(result.fromReferral).toBe(false);
    expect(result.fromGrant).toBe(false);
  });
});

describe("chargedAmountFor", () => {
  it("subtracts the discount from the list price", () => {
    expect(chargedAmountFor(500000, 100000)).toBe(400000);
  });

  it("never goes negative", () => {
    expect(chargedAmountFor(500000, 900000)).toBe(0);
  });
});

describe("grantExpiry", () => {
  it("uses the configured window", () => {
    const awarded = 1_700_000_000_000;
    expect(grantExpiry(awarded, 30)).toBe(awarded + 30 * 24 * 60 * 60 * 1000);
  });

  // An unset expiry is a permanent liability, so it defaults to a bounded one.
  it("defaults to a bounded window rather than never expiring", () => {
    const awarded = 1_700_000_000_000;
    expect(grantExpiry(awarded, undefined)).toBe(
      awarded + DEFAULT_GRANT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(DEFAULT_GRANT_EXPIRY_DAYS).toBeGreaterThan(0);
  });

  it("treats a non-positive window as no expiry", () => {
    expect(grantExpiry(1_700_000_000_000, 0)).toBeUndefined();
    expect(grantExpiry(1_700_000_000_000, -5)).toBeUndefined();
  });
});