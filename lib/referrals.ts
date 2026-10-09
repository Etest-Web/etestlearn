/**
 * Referral reward arithmetic.
 *
 * Pure rules for what a referral is worth, shared by the Convex mutations that
 * grant and consume rewards and by the unit tests that pin them. Same shape as
 * `lib/settlement.ts` and `lib/publishing.ts`: one rule, one place, no
 * re-derivation in the query layer or the browser.
 *
 * ── What a referral pays ───────────────────────────────────────────────────
 *
 * The **invitee** gets a discount off their first paid course. The **referrer**
 * gets a grant — a fixed credit that discounts *their* next paid course.
 *
 * A grant is deliberately not a wallet. It is a row in `referralGrants` with an
 * explicit `remainingKobo`, consumed by a specific purchase, and it can never be
 * withdrawn, transferred, or cashed out. That is the whole reason it is
 * modelled this way:
 *
 *  - **A balance must always equal the sum of its entries.** Every refund,
 *    adjustment and failed payout is an opportunity for those two numbers to
 *    drift apart, and when they do there is no principled way to decide which
 *    is right. Immutable grants make the total a sum of rows, so drift is not
 *    representable.
 *  - **Non-withdrawable credit caps the value of fraud.** Self-referral is
 *    trivially detectable, but the two-account case is not. With a grant, the
 *    worst outcome is one extra discount capped at `maxReferrerGrantKobo`. With
 *    a cash-equivalent balance, the same trick is worth whatever the ceiling is
 *    and it is withdrawable.
 *
 * ── Discounts do not stack ─────────────────────────────────────────────────
 *
 * A buyer who is both an invitee and holds a grant gets whichever benefit is
 * larger, not both. Stacking would let one person discount every purchase
 * indefinitely and would need a cap-of-the-caps to stay bounded. Taking the
 * maximum is the simpler rule to explain in the marketing copy, and it bounds
 * platform cost without a second layer of arithmetic.
 *
 * All amounts are integer kobo and all rates are integer basis points.
 */

import { BPS_PER_WHOLE, clampDiscount } from "./settlement";

/**
 * Upper bound on any single discount, as a share of the list price, and an
 * absolute kobo ceiling. The percentage guard exists so a generous absolute cap
 * cannot zero out an expensive course; the absolute guard exists so a cheap one
 * cannot be discounted to nothing.
 *
 * Both are *defaults*. An admin row can override them (see
 * `convex/referrals.ts`), but these are the floor the code enforces regardless —
 * a misconfigured settings row can relax them, not bypass them.
 */
export const MAX_DISCOUNT_BPS = 5000; // never more than half off
export const DEFAULT_MAX_DISCOUNT_KOBO = 500000; // ₦5,000

/** A purchaser's standing benefits, as read at checkout time. */
export interface DiscountInputs {
  /** Kobo the course costs before any discount. */
  listAmount: number;
  /** Discount the invitee's referral earns, already computed or 0. */
  inviteeDiscountKobo: number;
  /** `remainingKobo` of the purchaser's oldest available grant, or 0. */
  grantKobo: number;
}

export interface AppliedDiscount {
  /** Total discount, never more than the list price. */
  discountAmount: number;
  /** Whether the invitee's referral supplied the discount. */
  fromReferral: boolean;
  /** Whether an existing grant supplied the discount. */
  fromGrant: boolean;
}

/**
 * Kobo the buyer pays after `discountAmount`.
 *
 * Clamps before subtracting rather than clamping the result, so a discount
 * larger than the price yields 0 rather than a negative charge — a value that
 * would be rejected by Paystack rather than honoured.
 */
export function chargedAmountFor(
  listAmount: number,
  discountAmount: number,
): number {
  const list = Number.isFinite(listAmount) && listAmount > 0 ? Math.floor(listAmount) : 0;
  return list - clampDiscount(list, discountAmount);
}

/**
 * A percentage discount on a list price, capped in both directions.
 *
 * Rounded to the nearest kobo — half a kobo is below the smallest amount that
 * can exist, so rounding down would systematically shave a fraction off every
 * discount for no reason, and rounding to nearest is what "20% off" means to a
 * buyer at the till.
 */
export function percentageOf(listAmount: number, bps: number): number {
  if (!Number.isFinite(listAmount) || listAmount <= 0) return 0;
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  return Math.round((listAmount * bps) / BPS_PER_WHOLE);
}

/**
 * The invitee's discount for a first purchase made with a referral code.
 *
 * `min(percentage of list, absolute cap, MAX_DISCOUNT_BPS share, list price)`.
 * The referral is what the platform spends to acquire a paying customer, so this
 * is a cost the platform carries — which is why settlement pays the instructor
 * on the pre-discount price.
 */
export function inviteeDiscountKobo(args: {
  listAmount: number;
  discountBps: number;
  maxDiscountKobo: number;
}): number {
  const byRate = percentageOf(args.listAmount, args.discountBps);
  const byCeiling = Math.max(0, Math.floor(args.maxDiscountKobo));

  return clampDiscount(
    args.listAmount,
    Math.min(byRate, byCeiling, percentageOf(args.listAmount, MAX_DISCOUNT_BPS)),
  );
}

/**
 * The referrer's grant, awarded when their referral converts.
 *
 * Valued off the **list** price rather than the discounted charge, so a course
 * that was nearly free still produces a meaningful reward and the referrer is
 * not incentivised to steer people toward the cheapest course on the platform.
 */
export function referrerGrantKobo(args: {
  listAmount: number;
  grantBps: number;
  maxGrantKobo: number;
}): number {
  const byRate = percentageOf(args.listAmount, args.grantBps);
  const byCeiling = Math.max(0, Math.floor(args.maxGrantKobo));

  return Math.max(0, Math.min(byRate, byCeiling));
}

/**
 * Picks the single discount a buyer receives.
 *
 * Ties go to the referral, so the marketing promise ("your friend gets 20% off")
 * is the one that holds when the two would otherwise be equal. Exposed as a
 * separate function because the checkout page needs to *show* which benefit
 * applied before the buyer commits to paying.
 */
export function applyDiscount(inputs: DiscountInputs): AppliedDiscount {
  const invitee = Math.max(0, Math.floor(inputs.inviteeDiscountKobo));
  const grant = Math.max(0, Math.floor(inputs.grantKobo));

  const discountAmount = clampDiscount(
    inputs.listAmount,
    Math.max(invitee, grant),
  );

  return {
    discountAmount,
    fromReferral: discountAmount > 0 && invitee >= grant,
    fromGrant: discountAmount > 0 && grant > invitee,
  };
}

/**
 * Expiry timestamp for a grant, or `undefined` when grants do not expire.
 *
 * A grant with no expiry is a permanent liability, so an admin who leaves
 * `grantExpiryDays` unset is treated as "90 days" rather than "forever" —
 * a deliberate default in the direction of not owing money indefinitely.
 */
export const DEFAULT_GRANT_EXPIRY_DAYS = 90;

export function grantExpiry(
  awardedAt: number,
  expiryDays: number | undefined,
): number | undefined {
  const days = expiryDays ?? DEFAULT_GRANT_EXPIRY_DAYS;
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return awardedAt + Math.floor(days) * 24 * 60 * 60 * 1000;
}