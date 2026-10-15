import { describe, expect, it } from "vitest";

import {
  MAX_COUPON_REDEMPTIONS,
  couponCodeError,
  couponDiscountKobo,
  couponDraftError,
  couponIsRedeemable,
  couponLabel,
  couponRejectionMessage,
  couponState,
  couponStateLabel,
  normalizeCouponCode,
} from "./coupons";

const NOW = 1_700_000_000_000;

describe("normalizeCouponCode", () => {
  it("trims, upper-cases and drops internal whitespace", () => {
    expect(normalizeCouponCode("  save20  ")).toBe("SAVE20");
    expect(normalizeCouponCode("save 20")).toBe("SAVE20");
    expect(normalizeCouponCode("Launch-Week")).toBe("LAUNCH-WEEK");
  });
});

describe("couponCodeError", () => {
  it("accepts letters, digits and hyphens within the length bounds", () => {
    expect(couponCodeError("SAVE20")).toBeNull();
    expect(couponCodeError("A-B-C-1")).toBeNull();
    expect(couponCodeError("A".repeat(32))).toBeNull();
  });

  it("rejects codes that are too short or too long", () => {
    expect(couponCodeError("ABC")).toMatch(/between 4 and 32/);
    expect(couponCodeError("A".repeat(33))).toMatch(/between 4 and 32/);
  });

  it("rejects characters that do not survive being read aloud", () => {
    expect(couponCodeError("SAVE_20")).toMatch(/letters, numbers and hyphens/);
    expect(couponCodeError("SAVE 20")).toMatch(/letters, numbers and hyphens/);
  });
});

describe("couponDraftError", () => {
  it("accepts a well-formed percentage coupon", () => {
    expect(
      couponDraftError({ code: "SAVE20", kind: "percent", percentOff: 20 }, NOW),
    ).toBeNull();
  });

  it("accepts a well-formed fixed coupon", () => {
    expect(
      couponDraftError(
        { code: "FIVEHUNDRED", kind: "amount", amountOffKobo: 50_000 },
        NOW,
      ),
    ).toBeNull();
  });

  it("bounds a percentage to 1–100 and requires a whole number", () => {
    expect(
      couponDraftError({ code: "SAVE", kind: "percent", percentOff: 0 }, NOW),
    ).toMatch(/1 to 100/);
    expect(
      couponDraftError({ code: "SAVE", kind: "percent", percentOff: 101 }, NOW),
    ).toMatch(/1 to 100/);
    expect(
      couponDraftError({ code: "SAVE", kind: "percent", percentOff: 12.5 }, NOW),
    ).toMatch(/1 to 100/);
    expect(
      couponDraftError({ code: "SAVE", kind: "percent" }, NOW),
    ).toMatch(/1 to 100/);
  });

  it("requires a positive whole kobo amount for a fixed coupon", () => {
    expect(
      couponDraftError({ code: "SAVE", kind: "amount", amountOffKobo: 0 }, NOW),
    ).toMatch(/positive whole number/);
    expect(
      couponDraftError({ code: "SAVE", kind: "amount", amountOffKobo: -100 }, NOW),
    ).toMatch(/positive whole number/);
    expect(
      couponDraftError(
        { code: "SAVE", kind: "amount", amountOffKobo: 1_000_000_000 },
        NOW,
      ),
    ).toMatch(/may not exceed/);
  });

  it("bounds the redemption cap", () => {
    expect(
      couponDraftError(
        { code: "SAVE20", kind: "percent", percentOff: 20, maxRedemptions: 0 },
        NOW,
      ),
    ).toMatch(/positive whole number/);
    expect(
      couponDraftError(
        {
          code: "SAVE20",
          kind: "percent",
          percentOff: 20,
          maxRedemptions: MAX_COUPON_REDEMPTIONS + 1,
        },
        NOW,
      ),
    ).toMatch(/may not exceed/);
  });

  it("refuses an expiry that has already passed", () => {
    expect(
      couponDraftError(
        { code: "SAVE20", kind: "percent", percentOff: 20, expiresAt: NOW - 1 },
        NOW,
      ),
    ).toMatch(/must be in the future/);
    expect(
      couponDraftError(
        { code: "SAVE20", kind: "percent", percentOff: 20, expiresAt: NOW + 1 },
        NOW,
      ),
    ).toBeNull();
  });

  it("reports a bad code before anything else", () => {
    expect(
      couponDraftError({ code: "X", kind: "percent", percentOff: 500 }, NOW),
    ).toMatch(/between 4 and 32/);
  });
});

describe("couponDiscountKobo", () => {
  it("takes a percentage off a price", () => {
    expect(couponDiscountKobo({ active: true, kind: "percent", percentOff: 20 }, 500_000)).toBe(
      100_000,
    );
  });

  it("rounds to the nearest kobo", () => {
    // 33% of 999 is 329.67.
    expect(couponDiscountKobo({ active: true, kind: "percent", percentOff: 33 }, 999)).toBe(330);
  });

  it("takes a fixed amount off", () => {
    expect(
      couponDiscountKobo({ active: true, kind: "amount", amountOffKobo: 50_000 }, 500_000),
    ).toBe(50_000);
  });

  it("never exceeds the price, so a charge can never go negative", () => {
    expect(couponDiscountKobo({ active: true, kind: "percent", percentOff: 100 }, 500_000)).toBe(
      500_000,
    );
    expect(
      couponDiscountKobo({ active: true, kind: "amount", amountOffKobo: 900_000 }, 500_000),
    ).toBe(500_000);
  });

  it("treats a missing or nonsensical term as no discount", () => {
    expect(couponDiscountKobo({ active: true, kind: "percent" }, 500_000)).toBe(0);
    expect(couponDiscountKobo({ active: true, kind: "amount" }, 500_000)).toBe(0);
    expect(couponDiscountKobo({ active: true, kind: "amount", amountOffKobo: -5 }, 500_000)).toBe(0);
    expect(couponDiscountKobo({ active: true, kind: "percent", percentOff: NaN }, 500_000)).toBe(0);
  });

  it("returns nothing for a free course or a non-finite price", () => {
    expect(couponDiscountKobo({ active: true, kind: "percent", percentOff: 20 }, 0)).toBe(0);
    expect(couponDiscountKobo({ active: true, kind: "percent", percentOff: 20 }, NaN)).toBe(0);
  });
});

describe("couponState", () => {
  const base = { active: true, kind: "percent" as const, percentOff: 20 };

  it("is active when nothing rules it out", () => {
    expect(couponState(base, 0, NOW)).toBe("active");
  });

  it("lets a manual pause win over a lapse", () => {
    expect(couponState({ ...base, active: false, expiresAt: NOW - 1 }, 0, NOW)).toBe("inactive");
  });

  it("reads an expiry at or before now as expired", () => {
    expect(couponState({ ...base, expiresAt: NOW }, 0, NOW)).toBe("expired");
    expect(couponState({ ...base, expiresAt: NOW - 1 }, 0, NOW)).toBe("expired");
    expect(couponState({ ...base, expiresAt: NOW + 1 }, 0, NOW)).toBe("active");
  });

  it("reads a fully redeemed cap as exhausted", () => {
    expect(couponState({ ...base, maxRedemptions: 5 }, 4, NOW)).toBe("active");
    expect(couponState({ ...base, maxRedemptions: 5 }, 5, NOW)).toBe("exhausted");
    expect(couponState({ ...base, maxRedemptions: 5 }, 6, NOW)).toBe("exhausted");
  });

  it("is redeemable only when active", () => {
    expect(couponIsRedeemable(base, 0, NOW)).toBe(true);
    expect(couponIsRedeemable({ ...base, maxRedemptions: 1 }, 1, NOW)).toBe(false);
  });
});

describe("labels and refusals", () => {
  it("describes the discount", () => {
    expect(couponLabel({ active: true, kind: "percent", percentOff: 20 })).toBe("20% off");
    expect(couponLabel({ active: true, kind: "amount", amountOffKobo: 50_000 })).toBe("₦500 off");
  });

  it("names each state", () => {
    expect(couponStateLabel("active")).toBe("Active");
    expect(couponStateLabel("inactive")).toBe("Paused");
    expect(couponStateLabel("expired")).toBe("Expired");
    expect(couponStateLabel("exhausted")).toBe("Fully redeemed");
  });

  it("does not tell a stranger whether a code was paused or lapsed", () => {
    expect(couponRejectionMessage("inactive")).toBe(couponRejectionMessage("expired"));
    expect(couponRejectionMessage("exhausted")).toMatch(/fully redeemed/i);
    expect(couponRejectionMessage("active")).toBe("");
  });
});
