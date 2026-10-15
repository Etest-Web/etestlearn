/**
 * Coupon rules.
 *
 * Pure arithmetic and validation for instructor-authored discount codes, shared
 * by the Convex module that stores them, the checkout that prices a sale, and
 * the unit tests that pin them. Same shape as `lib/settlement.ts`,
 * `lib/referrals.ts` and `lib/publishing.ts`: one rule, one place, and no
 * re-derivation in the query layer or the browser.
 *
 * ── Who pays for a coupon ───────────────────────────────────────────────────
 *
 * A coupon is funded by the **instructor**, not the platform. A referral
 * discount is a customer-acquisition cost the platform chose to pay, so
 * `lib/settlement.ts` pays the instructor their full share of the list price
 * and lets the platform absorb it. A coupon is the opposite: the instructor is
 * choosing to sell their own course for less.
 *
 * That distinction is load-bearing, not cosmetic. If the platform absorbed
 * coupon discounts, an instructor could mint a 100%-off code, buy their own
 * course, and be paid 80% of the list price for a sale that charged nothing —
 * a money pump with no real student on the other end. Because the coupon comes
 * off the instructor's basis instead, such a "sale" pays them nothing.
 *
 * ── Why there is no balance here ────────────────────────────────────────────
 *
 * A coupon is a price rule, never a wallet. The only state it carries is whether
 * it is paused, when it lapses, and how many times it has been used. Usage is
 * recorded as a paid purchase carrying the coupon id, so a refund cannot leave a
 * counter disagreeing with the rows that justify it.
 */

import { formatNaira } from "./instructor-earnings";

export type CouponKind = "percent" | "amount";

/** A code must be long enough to not be guessing-fodder. */
export const COUPON_CODE_MIN_LENGTH = 4;
export const COUPON_CODE_MAX_LENGTH = 32;

/**
 * Uppercase alphanumerics and hyphens. Deliberately no spaces or underscores:
 * a code is typed off a social post or a screenshot, and every character that
 * cannot survive being read aloud is a support ticket.
 */
export const COUPON_CODE_PATTERN = /^[A-Z0-9-]+$/;

/** Ceiling on a redemption cap, to catch a fat-fingered extra zero. */
export const MAX_COUPON_REDEMPTIONS = 100_000;

/** ₦5,000,000 — a fixed coupon larger than this is a data-entry mistake. */
export const MAX_COUPON_AMOUNT_KOBO = 500_000_000;

/** A coupon's lifecycle state, as read by a buyer or shown to its author. */
export type CouponState = "active" | "inactive" | "expired" | "exhausted";

/**
 * The subset of a stored coupon the rules need. Kept structural so the pure
 * module never imports a Convex doc.
 */
export interface CouponRules {
  active: boolean;
  kind: CouponKind;
  percentOff?: number;
  amountOffKobo?: number;
  maxRedemptions?: number;
  expiresAt?: number;
}

/** The editable fields of a coupon, before validation. */
export interface CouponDraft {
  code: string;
  kind: CouponKind;
  percentOff?: number;
  amountOffKobo?: number;
  maxRedemptions?: number;
  expiresAt?: number;
}

/**
 * Canonical form of a code: trimmed, upper-cased, internal whitespace removed.
 *
 * Normalizing rather than rejecting means `ad\u200bMIN` pasted out of a chat app
 * still matches the code the instructor typed. Case and stray spaces are not
 * secrets; the caller validates the result with {@link couponCodeError}.
 */
export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** Validation error for a normalized code, or `null` when it is acceptable. */
export function couponCodeError(code: string): string | null {
  if (code.length < COUPON_CODE_MIN_LENGTH || code.length > COUPON_CODE_MAX_LENGTH) {
    return `A code must be between ${COUPON_CODE_MIN_LENGTH} and ${COUPON_CODE_MAX_LENGTH} characters.`;
  }
  if (!COUPON_CODE_PATTERN.test(code)) {
    return "A code may only contain letters, numbers and hyphens.";
  }
  return null;
}

/**
 * Validation error for a whole draft, or `null` when it is acceptable.
 *
 * One entry point so the admin form, the mutation and the tests agree on every
 * message. `now` is passed rather than read so the check is deterministic under
 * test.
 */
export function couponDraftError(draft: CouponDraft, now: number): string | null {
  const codeError = couponCodeError(draft.code);
  if (codeError) return codeError;

  if (draft.kind === "percent") {
    const percent = draft.percentOff;
    if (!Number.isInteger(percent) || percent === undefined || percent < 1 || percent > 100) {
      return "A percentage coupon must be a whole number from 1 to 100.";
    }
  } else {
    const amount = draft.amountOffKobo;
    if (!Number.isInteger(amount) || amount === undefined || amount <= 0) {
      return "A fixed coupon must be a positive whole number of kobo.";
    }
    if (amount > MAX_COUPON_AMOUNT_KOBO) {
      return `A fixed coupon may not exceed ${formatNaira(MAX_COUPON_AMOUNT_KOBO)}.`;
    }
  }

  if (draft.maxRedemptions !== undefined) {
    const cap = draft.maxRedemptions;
    if (!Number.isInteger(cap) || cap < 1) {
      return "A redemption limit must be a positive whole number.";
    }
    if (cap > MAX_COUPON_REDEMPTIONS) {
      return `A redemption limit may not exceed ${MAX_COUPON_REDEMPTIONS.toLocaleString("en-NG")}.`;
    }
  }

  if (draft.expiresAt !== undefined) {
    if (!Number.isFinite(draft.expiresAt)) {
      return "The expiry date is not a valid time.";
    }
    if (draft.expiresAt <= now) {
      return "The expiry date must be in the future.";
    }
  }

  return null;
}

/**
 * Kobo a coupon takes off a list price, never more than the price itself.
 *
 * Percentages round to the nearest kobo. Rounding down would shave a fraction
 * off every "20% off" for no reason; the clamp is what stops a coupon from
 * producing a negative charge, exactly as `clampDiscount` does for referrals.
 */
export function couponDiscountKobo(terms: CouponRules, listAmount: number): number {
  const list =
    Number.isFinite(listAmount) && listAmount > 0 ? Math.floor(listAmount) : 0;
  if (list === 0) return 0;

  if (terms.kind === "percent") {
    const percent = terms.percentOff;
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent <= 0) {
      return 0;
    }
    const raw = Math.round((list * Math.min(percent, 100)) / 100);
    return Math.min(raw, list);
  }

  const amount = terms.amountOffKobo;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.min(Math.floor(amount), list);
}

/**
 * Where a coupon sits in its lifecycle.
 *
 * Ordered so the most specific refusal wins: a paused code reads as `inactive`
 * even if it has also lapsed, because that is the state its author last chose.
 * `redemptionCount` is passed in rather than derived so this stays pure.
 */
export function couponState(
  coupon: CouponRules,
  redemptionCount: number,
  now: number,
): CouponState {
  if (!coupon.active) return "inactive";
  if (coupon.expiresAt !== undefined && coupon.expiresAt <= now) return "expired";
  if (
    coupon.maxRedemptions !== undefined &&
    redemptionCount >= coupon.maxRedemptions
  ) {
    return "exhausted";
  }
  return "active";
}

/** True when a buyer may redeem the coupon right now. */
export function couponIsRedeemable(
  coupon: CouponRules,
  redemptionCount: number,
  now: number,
): boolean {
  return couponState(coupon, redemptionCount, now) === "active";
}

/** Human phrase for the discount, e.g. `20% off` or `₦500 off`. */
export function couponLabel(terms: CouponRules): string {
  if (terms.kind === "percent") {
    return `${terms.percentOff ?? 0}% off`;
  }
  return `${formatNaira(terms.amountOffKobo ?? 0)} off`;
}

/** Short label for a lifecycle state, for a badge or a refusal message. */
export function couponStateLabel(state: CouponState): string {
  switch (state) {
    case "active":
      return "Active";
    case "inactive":
      return "Paused";
    case "expired":
      return "Expired";
    case "exhausted":
      return "Fully redeemed";
  }
}

/**
 * What to tell a buyer whose code was refused.
 *
 * `inactive` and `expired` deliberately read the same to a stranger: whether an
 * instructor paused a code or it simply lapsed is not the buyer's business, and
 * spelling it out would let anyone probe a course for codes that once existed.
 */
export function couponRejectionMessage(state: CouponState): string {
  switch (state) {
    case "expired":
    case "inactive":
      return "That code is no longer valid.";
    case "exhausted":
      return "That code has been fully redeemed.";
    case "active":
      return "";
  }
}
