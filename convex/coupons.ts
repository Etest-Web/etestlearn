import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  canManageCourse,
  requireUser,
  type AnyCtx,
} from "./helpers/auth";
import type { Id } from "./_generated/dataModel";
import { resolveCoupon } from "./helpers/couponPricing";
import {
  couponDraftError,
  couponLabel,
  couponRejectionMessage,
  couponState,
  normalizeCouponCode,
  type CouponRules,
} from "../lib/coupons";

/**
 * Instructor-authored discount codes for a course.
 *
 * Every mutation here is scoped through `canManageCourse`, so a coupon belongs
 * to the course owner (or an admin acting on their behalf) and never to whoever
 * happens to know a coupon id. Reading is different: `preview` is deliberately
 * open, because a signed-out visitor on a public course page has to be able to
 * check a code before signing in to buy. See `lib/coupons.ts` for the rules and
 * `helpers/couponPricing.ts` for the lookup checkout reuses.
 */

/** Read bound for one course's coupons. A listing with more than this is a mistake. */
const MAX_COUPONS = 200;

/**
 * A random code, when the author leaves the field blank.
 *
 * The alphabet omits vowels and easily-confused characters, so a generated code
 * cannot spell something unfortunate and cannot be misread off a screenshot.
 */
function generateCouponCode(): string {
  const alphabet = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `GLY-${suffix}`;
}

/** The stored shape, narrowed to what the pure rules read. */
function rulesOf(coupon: {
  active: boolean;
  kind: "percent" | "amount";
  percentOff?: number;
  amountOffKobo?: number;
  maxRedemptions?: number;
  expiresAt?: number;
}): CouponRules {
  return {
    active: coupon.active,
    kind: coupon.kind,
    percentOff: coupon.percentOff,
    amountOffKobo: coupon.amountOffKobo,
    maxRedemptions: coupon.maxRedemptions,
    expiresAt: coupon.expiresAt,
  };
}

/**
 * Asserts the caller owns the course. Ownership is checked against the course,
 * not the coupon's `instructorId` field: if a course is handed to another
 * instructor, the coupons go with it, which is what "the course's coupons"
 * should mean.
 */
async function requireCourseManager(ctx: AnyCtx, courseId: Id<"courses">) {
  const user = await requireUser(ctx);
  const course = await ctx.db.get(courseId);
  if (!course) throw new Error("Course not found");
  if (!(await canManageCourse(ctx, user, course))) {
    throw new Error(
      "Not authorized — only the course owner or an admin can manage its coupons",
    );
  }
  return { user, course };
}

/** Same check, reached through a coupon id rather than a course id. */
async function requireCouponManager(ctx: AnyCtx, couponId: Id<"coupons">) {
  const coupon = await ctx.db.get(couponId);
  if (!coupon) throw new Error("Coupon not found");
  const { user, course } = await requireCourseManager(ctx, coupon.courseId);
  return { user, course, coupon };
}

/** The course's coupons, newest first, each with its lifecycle state resolved. */
export const listForCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    await requireCourseManager(ctx, args.courseId);

    const coupons = await ctx.db
      .query("coupons")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .order("desc")
      .take(MAX_COUPONS);

    const now = Date.now();
    return coupons.map((coupon) => {
      const rules = rulesOf(coupon);
      return {
        _id: coupon._id,
        code: coupon.code,
        kind: coupon.kind,
        percentOff: coupon.percentOff,
        amountOffKobo: coupon.amountOffKobo,
        maxRedemptions: coupon.maxRedemptions,
        expiresAt: coupon.expiresAt,
        active: coupon.active,
        redemptionCount: coupon.redemptionCount,
        label: couponLabel(rules),
        state: couponState(rules, coupon.redemptionCount, now),
        createdAt: coupon.createdAt,
      };
    });
  },
});

/** Creates a code for a course. `code` is generated when left blank. */
export const create = mutation({
  args: {
    courseId: v.id("courses"),
    code: v.optional(v.string()),
    kind: v.union(v.literal("percent"), v.literal("amount")),
    percentOff: v.optional(v.number()),
    amountOffKobo: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, course } = await requireCourseManager(ctx, args.courseId);

    // Instructors are limited to a maximum of 30% off (percent or fixed amount).
    // Admins may create larger discounts.
    if (user.role === "instructor") {
      if (args.kind === "percent") {
        if (
          typeof args.percentOff !== "number" ||
          !Number.isFinite(args.percentOff) ||
          args.percentOff > 30
        ) {
          throw new Error("Instructors may only create coupons for up to 30% off.");
        }
      } else if (args.kind === "amount" && course.price && course.price > 0) {
        const maxAmountOff = Math.floor(course.price * 0.3);
        if (
          typeof args.amountOffKobo !== "number" ||
          !Number.isFinite(args.amountOffKobo) ||
          args.amountOffKobo > maxAmountOff
        ) {
          throw new Error("Instructors may only create coupons for up to 30% off the course price.");
        }
      }
    }

    const code = normalizeCouponCode(args.code ?? generateCouponCode());
    const now = Date.now();

    const error = couponDraftError(
      {
        code,
        kind: args.kind,
        percentOff: args.percentOff,
        amountOffKobo: args.amountOffKobo,
        maxRedemptions: args.maxRedemptions,
        expiresAt: args.expiresAt,
      },
      now,
    );
    if (error) throw new Error(error);

    const existing = await ctx.db
      .query("coupons")
      .withIndex("by_course_code", (q) =>
        q.eq("courseId", args.courseId).eq("code", code),
      )
      .unique();
    if (existing) {
      throw new Error(`The code ${code} is already in use for this course.`);
    }

    return await ctx.db.insert("coupons", {
      courseId: args.courseId,
      instructorId: course.instructorId,
      code,
      kind: args.kind,
      // Only the field that matches the kind is stored, so a "percent" coupon
      // can never be misread as also carrying a fixed amount.
      percentOff: args.kind === "percent" ? args.percentOff : undefined,
      amountOffKobo: args.kind === "amount" ? args.amountOffKobo : undefined,
      maxRedemptions: args.maxRedemptions,
      expiresAt: args.expiresAt,
      active: true,
      redemptionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Pauses or resumes a code. Pausing is the way to retire a used coupon. */
export const setActive = mutation({
  args: { couponId: v.id("coupons"), active: v.boolean() },
  handler: async (ctx, args) => {
    const { coupon } = await requireCouponManager(ctx, args.couponId);
    await ctx.db.patch(coupon._id, {
      active: args.active,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Deletes a coupon that has never been used.
 *
 * A redeemed coupon is refused rather than deleted: paid purchases reference it,
 * and removing the row would leave those sales pointing at nothing — the
 * redemption history and the "was this a discount sale?" answer both vanish.
 * Pausing is the reversible option and the UI offers it directly.
 */
export const remove = mutation({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, args) => {
    const { coupon } = await requireCouponManager(ctx, args.couponId);
    if (coupon.redemptionCount > 0) {
      throw new Error(
        "This code has already been redeemed — pause it instead of deleting it.",
      );
    }
    await ctx.db.delete(coupon._id);
  },
});

/**
 * Checks a code against a course and returns what it would take off.
 *
 * Public on purpose: the buyer may not be signed in yet when they type the code,
 * and the answer contains nothing but a price. It is a *preview* — the charge is
 * priced again inside `createPendingPurchase`, so a coupon paused or exhausted
 * between this call and checkout is caught there.
 */
export const preview = query({
  args: { courseId: v.id("courses"), code: v.string() },
  handler: async (ctx, args) => {
    const empty = { valid: false, discountKobo: 0, label: "", message: "" };
    if (!normalizeCouponCode(args.code)) return empty;

    const course = await ctx.db.get(args.courseId);
    if (!course || !course.published || !course.price || course.price <= 0) {
      return empty;
    }

    const lookup = await resolveCoupon(ctx, {
      courseId: args.courseId,
      code: args.code,
      listAmount: course.price,
      now: Date.now(),
    });

    if (!lookup.found) {
      return {
        valid: false,
        discountKobo: 0,
        label: "",
        message: "That code isn't valid for this course.",
      };
    }

    if (lookup.coupon.state !== "active") {
      return {
        valid: false,
        discountKobo: 0,
        label: "",
        message: couponRejectionMessage(lookup.coupon.state),
      };
    }

    return {
      valid: true,
      discountKobo: lookup.coupon.discountKobo,
      label: lookup.coupon.label,
      message: `${lookup.coupon.label} with ${lookup.coupon.code}`,
    };
  },
});
