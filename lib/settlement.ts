/**
 * Settlement arithmetic for a single paid course sale.
 *
 * Why this file exists: `purchases.amount` records what Paystack *charged*, but
 * until now nothing recorded how that amount was *divided*. The 80/20 split was
 * recomputed at read time by `lib/instructor-earnings.ts`, which has three
 * consequences that only bite once money is actually owed to somebody:
 *
 *  1. **Historical figures were mutable.** Changing `INSTRUCTOR_REVENUE_SHARE`
 *     silently rewrote what every instructor had already been shown, including
 *     numbers they had screenshotted. Nothing stored the decision.
 *  2. **Rounding was per-window, not per-sale.** `platformFeeKobo` rounded once
 *     over whatever total the dashboard happened to be looking at, so "June
 *     earnings" and "July earnings" each paid their own rounding and neither
 *     matched the sum of the underlying sales.
 *  3. **There was nowhere to put a discount.** A referral discount reduces what
 *     is charged, which changes the fee, and with a read-time split the
 *     instructor's share would move after the sale was already reported.
 *
 * The fix is to decide once, at the moment money moves, and write it down. This
 * module is that decision, as a pure function, so the Convex mutation that
 * settles a sale and the tests that pin the behaviour read the same numbers.
 * Same shape as `lib/certificates.ts` and `lib/publishing.ts`: one rule, one
 * place, no re-derivation in the browser or the query.
 *
 * ── The one invariant ───────────────────────────────────────────────────────
 *
 *     instructorShareKobo + platformFeeKobo === listAmount
 *
 * Always. The discount is funded by the platform, which is what makes this hold:
 * the instructor is paid on the pre-discount list price, and the platform's
 * share absorbs the discount plus its own cut. That is a deliberate commercial
 * decision, not an accounting accident — a referral discount is an acquisition
 * cost paid by the platform, not a price cut negotiated with the instructor.
 *
 * All money is integer **kobo** (1 naira = 100 kobo) and all rates are integer
 * **basis points** (10000 bps = 100%). Floating point naira is never
 * introduced: `0.8 * 500000` is not reliably `400000`.
 */

/**
 * Fraction of a sale's list price the instructor earns, in basis points.
 *
 * Stated here rather than per-call site so the split can never be applied at two
 * different rates on two different screens. This replaces the float
 * `INSTRUCTOR_REVENUE_SHARE = 0.8` that used to live in
 * `lib/instructor-earnings.ts`.
 */
export const INSTRUCTOR_SHARE_BPS = 8000;

/** What the platform keeps. Derived, never typed in twice. */
export const PLATFORM_SHARE_BPS = 10000 - INSTRUCTOR_SHARE_BPS;

/** Basis points in 100%, for converting admin-facing percentages to storage. */
export const BPS_PER_WHOLE = 10000;

/** The inputs to settling one sale. */
export interface SettleSaleInput {
  /** Kobo the course costs before any discount. */
  listAmount: number;
  /**
   * Kobo taken off by a **platform-funded** discount (a referral benefit).
   * Clamped so a misconfigured cap can never produce a negative charge. The
   * platform absorbs this: the instructor is still paid their share of the
   * price before it was applied.
   */
  discountAmount: number;
  /**
   * Kobo taken off by an **instructor-funded** coupon code.
   *
   * Unlike `discountAmount` this comes off the instructor's side: it reduces
   * the basis the share is computed from, because the instructor chose to sell
   * their own course for less. Without that, an instructor could mint a 100%-off
   * code, buy their own course for nothing, and still be paid 80% of the list
   * price. Optional, defaulting to `0`, so a sale with no coupon settles exactly
   * as it did before coupons existed.
   */
  couponDiscountKobo?: number;
  /** Instructor share in basis points. Defaults to {@link INSTRUCTOR_SHARE_BPS}. */
  revenueShareBps?: number;
}

export interface SaleSettlement {
  /** Kobo actually charged to the buyer — what was sent to Paystack. */
  chargedAmount: number;
  /**
   * Kobo earned by the instructor, computed from `listAmount - couponDiscountKobo`.
   * A referral discount does not reduce it; a coupon does.
   */
  instructorShareKobo: number;
  /** Kobo retained by the platform: its own cut plus any absorbed discount. */
  platformFeeKobo: number;
  /** Kobo the instructor's coupon took off the list price. */
  couponDiscountKobo: number;
}

function positiveInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Clamps a discount to something that cannot make a sale free-and-negative.
 *
 * A discount of exactly `listAmount` is legitimate — it makes a course free —
 * which is why this clamps rather than rejecting. Anything beyond that is a
 * configuration error, and silently charging a negative amount into Paystack
 * would be worse than ignoring the excess.
 */
export function clampDiscount(listAmount: number, discountAmount: number): number {
  const list = positiveInt(listAmount);
  const discount = positiveInt(discountAmount);
  return Math.min(discount, list);
}

/**
 * Splits one settled sale between the instructor and the platform.
 *
 * Rounds **once per component**, from the pre-discount list price. Rounding the
 * two halves independently would let them sum to `listAmount ± 1` kobo on
 * values that don't divide evenly, and "the parts do not add to the whole" is
 * precisely the class of bug a ledger exists to prevent.
 *
 * `chargedAmount` is `listAmount - couponDiscountKobo - discountAmount` and is
 * derived here rather than trusted from the caller, so a purchase row can never
 * claim a charge that disagrees with the prices it recorded.
 *
 * The two discounts are funded differently, which is the whole reason they are
 * separate inputs. The coupon comes off *before* the split (the instructor pays
 * for their own discount); the referral discount comes off *after* (the platform
 * pays for its own). With no coupon the arithmetic is identical to what it was
 * before coupons existed — see `lib/coupons.ts` for why the split cannot be the
 * other way round.
 */
export function settleSale(input: SettleSaleInput): SaleSettlement {
  const listAmount = positiveInt(input.listAmount);

  // The instructor's own discount shrinks the pie before it is divided.
  const couponDiscountKobo = clampDiscount(listAmount, input.couponDiscountKobo ?? 0);
  const basisAmount = listAmount - couponDiscountKobo;

  // The platform's discount then comes off what remains, so the two can never
  // combine into a negative charge.
  const discountAmount = clampDiscount(basisAmount, input.discountAmount);

  const shareBps = Math.min(
    BPS_PER_WHOLE,
    Math.max(0, Math.floor(input.revenueShareBps ?? INSTRUCTOR_SHARE_BPS)),
  );

  const instructorShareKobo = Math.round((basisAmount * shareBps) / BPS_PER_WHOLE);
  const platformFeeKobo = Math.max(0, basisAmount - instructorShareKobo);

  return {
    chargedAmount: basisAmount - discountAmount,
    instructorShareKobo,
    platformFeeKobo,
    couponDiscountKobo,
  };
}

/**
 * The read-time split for a purchase settled **before** the snapshot existed.
 *
 * Rows written by the old `createPendingPurchase` carry no
 * `instructorShareKobo`. They still have to render a number, so the split is
 * recomputed from the same rate — which means legacy rows stay subject to the
 * retroactive-repricing bug until they are re-settled, whereas settled rows are
 * frozen. That is a known, bounded limitation: we cannot know what an
 * instructor was shown at the time, so we cannot reproduce it faithfully, and a
 * migration would have to invent the same number anyway.
 *
 * New sales must use {@link settleSale} and store the result, never this.
 */
export function legacyShareKobo(
  amountKobo: number,
  revenueShareBps: number = INSTRUCTOR_SHARE_BPS,
): number {
  return settleSale({ listAmount: amountKobo, discountAmount: 0, revenueShareBps })
    .instructorShareKobo;
}