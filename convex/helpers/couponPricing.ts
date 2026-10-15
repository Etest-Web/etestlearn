/**
 * Looking a coupon up and pricing it, shared by the coupon module and checkout.
 *
 * Lives in `helpers/` because two callers need the same answer to the same
 * question — `coupons.preview` (does this code work for this buyer?) and
 * `payments.createPendingPurchase` (what does this sale actually cost?) — and a
 * second copy of the lookup is exactly how a preview and a charge drift apart.
 * Same reasoning as `helpers/completion.ts` and `helpers/certificateTemplate.ts`.
 *
 * The rules themselves are in `lib/coupons.ts`; this file only does the I/O.
 */

import { couponDiscountKobo, couponLabel, couponState, normalizeCouponCode } from "../../lib/coupons";
import type { CouponKind, CouponState } from "../../lib/coupons";
import type { Id } from "../_generated/dataModel";
import type { ReadCtx } from "./auth";

/** A coupon, resolved against a specific course and price. */
export interface ResolvedCoupon {
  couponId: Id<"coupons">;
  code: string;
  kind: CouponKind;
  state: CouponState;
  /** Kobo this coupon takes off the price it was resolved against. */
  discountKobo: number;
  /** e.g. `20% off`, for the checkout summary. */
  label: string;
}

export type CouponLookup =
  | { found: false }
  | { found: true; coupon: ResolvedCoupon };

/**
 * Resolves a typed code against one course.
 *
 * Scoped to the course on purpose: a code belongs to the listing it discounts,
 * so a valid code for another course reads as `found: false` rather than
 * revealing that it exists elsewhere. A malformed or empty code is also
 * `found: false` — the caller treats every miss the same way.
 */
export async function resolveCoupon(
  ctx: ReadCtx,
  args: {
    courseId: Id<"courses">;
    code: string;
    listAmount: number;
    now: number;
  },
): Promise<CouponLookup> {
  const code = normalizeCouponCode(args.code);
  if (!code) return { found: false };

  const coupon = await ctx.db
    .query("coupons")
    .withIndex("by_course_code", (q) =>
      q.eq("courseId", args.courseId).eq("code", code),
    )
    .unique();
  if (!coupon) return { found: false };

  const terms = {
    active: coupon.active,
    kind: coupon.kind,
    percentOff: coupon.percentOff,
    amountOffKobo: coupon.amountOffKobo,
    maxRedemptions: coupon.maxRedemptions,
    expiresAt: coupon.expiresAt,
  };

  return {
    found: true,
    coupon: {
      couponId: coupon._id,
      code: coupon.code,
      kind: coupon.kind,
      state: couponState(terms, coupon.redemptionCount, args.now),
      discountKobo: couponDiscountKobo(terms, args.listAmount),
      label: couponLabel(terms),
    },
  };
}
