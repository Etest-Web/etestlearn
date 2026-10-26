import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { logAudit } from "./helpers/audit";
import { requireAdmin } from "./helpers/auth";
import { createNotification } from "./helpers/notifications";
import { consumeGrant } from "./referrals";
import { settleSale } from "../lib/settlement";
import { applyDiscount, chargedAmountFor } from "../lib/referrals";
import { formatNaira } from "../lib/instructor-earnings";
import { resolveCoupon, type ResolvedCoupon } from "./helpers/couponPricing";

/**
 * References to `internal.referrals.*`, built by hand.
 *
 * Codegen has not been re-run since the referrals module was added (it needs
 * deployment credentials this checkout does not have), so `internal.referrals`
 * is absent from `_generated/api.d.ts`. `npx convex dev` makes these resolve to
 * `internal.referrals.*` again, at which point this block can be deleted along
 * with the `import { internal }` it replaces. Same workaround as
 * `lib/durable-rate-limit.ts`.
 */
const bindReferralRef = makeFunctionReference<"mutation">(
  "referrals:bindReferral",
);
const computeInviteeDiscountRef = makeFunctionReference<"query">(
  "referrals:computeInviteeDiscount",
);
const getMyAvailableGrantRef = makeFunctionReference<"query">(
  "referrals:getMyAvailableGrant",
);
const convertReferralRef = makeFunctionReference<"mutation">(
  "referrals:convertReferral",
);

// The receipt and the drip queue, named rather than imported. Same reasoning as
// the referral block: `internal` from `_generated/api` does not list these
// modules, and calling them by name is what makes the code compile before
// codegen has caught up. `npx convex dev` leaves these working unchanged.
const sendPaymentReceiptRef = makeFunctionReference<"action">(
  "emailCampaigns:sendPaymentReceipt",
);
const scheduleDripRef = makeFunctionReference<"mutation">(
  "emailCampaignsData:scheduleDrip",
);

// ─── Step 1: create a pending purchase record and return its reference ────
/**
 * Creates (or re-prices) the pending purchase for a course and returns the
 * reference Paystack will use.
 *
 * `referralCode` is optional and defaults to absent: an un-referred buyer must
 * get exactly the behaviour they got before this argument existed. It is
 * re-validated server-side here — the code in the URL is never trusted, only
 * used to look up an account (see `internal.referrals.bindReferral`).
 *
 * `couponCode` is likewise optional and likewise re-validated here. The price a
 * coupon produces is derived from the stored coupon, never from anything the
 * client sends besides the code itself, and it is snapshotted onto the purchase
 * so the amount charged cannot move after the buyer agrees to it. See
 * `lib/coupons.ts` for why a coupon comes off the instructor's side of the
 * split rather than the platform's.
 *
 * ── Why a pending row is re-priced rather than reused unchanged ──────────────
 *
 * The original code returned an existing pending purchase untouched, so a
 * buyer who abandoned checkout, then arrived via a referral link and retried,
 * silently got the undiscounted price back. The referral would appear to work
 * on the page and do nothing at checkout — the kind of bug that is reported as
 * "the promo code doesn't work" and is genuinely hard to diagnose. So the row
 * is re-priced on every attempt, which makes the retry idempotent *with respect
 * to current settings* rather than with respect to the first attempt.
 *
 * The one case this cannot undo: a buyer who already has a Paystack authorization
 * URL from before their grant existed may complete that URL and be charged the
 * old amount. `verifyAndCompletePurchase` accepts an overpayment, so they are
 * enrolled either way; the difference is reconciled by an admin refund rather
 * than silently.
 */
export const createPendingPurchase = mutation({
  args: {
    courseId: v.id("courses"),
    referralCode: v.optional(v.string()),
    couponCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User record not found");

    const course = await ctx.db.get(args.courseId);
    if (!course || !course.published) throw new Error("Course not found");
    if (!course.price || course.price <= 0) {
      throw new Error("This course is free — enroll directly instead");
    }
    if (!identity.email) throw new Error("Your account has no email address");

    // Already enrolled? Nothing to buy.
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();
    if (enrollment) throw new Error("You are already enrolled in this course");

    // ── Price the sale ───────────────────────────────────────────────────────
    // `listAmount` is the course price at this moment and is the basis for the
    // instructor's share; `amount` is what the buyer is charged. They differ
    // only when a referral discount or grant applies.
    const listAmount = course.price;
    const now = Date.now();

    // Bind first, then price: binding is the one-time identity fact (this
    // person is referred by that account), and the discount below is a
    // consequence of it.
    await ctx.runMutation(bindReferralRef, {
      referredUserId: user._id,
      code: args.referralCode,
    });

    // ── The instructor's coupon, if the buyer typed one ──────────────────────
    // Resolved before the referral discount, so the platform's discount applies
    // to the price the coupon left standing and the instructor-funded coupon
    // comes off *their* side of the split (see `lib/settlement.ts`).
    //
    // A code that does not resolve, or has lapsed since the page was opened, is
    // not an error: the buyer is charged the undiscounted price, exactly as
    // before coupons existed. Failing the whole checkout over a stale code would
    // be worse than dropping it, and the amount is shown again on Paystack.
    let coupon: ResolvedCoupon | null = null;
    if (args.couponCode) {
      const lookup = await resolveCoupon(ctx, {
        courseId: args.courseId,
        code: args.couponCode,
        listAmount,
        now,
      });
      if (lookup.found && lookup.coupon.state === "active") {
        coupon = lookup.coupon;
      }
    }

    const couponDiscountKobo = coupon?.discountKobo ?? 0;
    const baseAfterCoupon = chargedAmountFor(listAmount, couponDiscountKobo);

    const inviteeDiscount = await ctx.runQuery(computeInviteeDiscountRef, {
      referredUserId: user._id,
      listAmount: baseAfterCoupon,
    });

    // Oldest-first grant, so an expiring credit is spent before a fresh one.
    const grant = await ctx.runQuery(getMyAvailableGrantRef, {
      userId: user._id,
      now,
    });

    const applied = applyDiscount({
      listAmount: baseAfterCoupon,
      inviteeDiscountKobo: inviteeDiscount,
      grantKobo: grant?.remainingKobo ?? 0,
    });
    const chargedAmount = chargedAmountFor(baseAfterCoupon, applied.discountAmount);

    const reference = `etest-${now}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    // Reuse the pending row when there is one, so there is still exactly one
    // open checkout per user+course — but re-price it, because settings and
    // grants can have changed since it was created.
    const existingPending = await ctx.db
      .query("purchases")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (existingPending) {
      const unchanged =
        existingPending.amount === chargedAmount &&
        (existingPending.listAmount ?? existingPending.amount) === listAmount &&
        (existingPending.couponId ?? undefined) === (coupon?.couponId ?? undefined);

      if (unchanged) {
        return { reference: existingPending.paystackReference };
      }

      await ctx.db.patch(existingPending._id, {
        amount: chargedAmount,
        listAmount,
        discountAmount: applied.discountAmount,
        couponId: coupon?.couponId ?? undefined,
        couponCode: coupon?.code ?? undefined,
        couponDiscountKobo,
        // The grant id is re-resolved here rather than trusted from a previous
        // attempt; `grantId` is cleared when no grant applied so a spent grant
        // can never be double-consumed at settlement.
        grantId: applied.fromGrant ? (grant?._id ?? undefined) : undefined,
        grantAppliedKobo: applied.fromGrant ? (grant?.remainingKobo ?? 0) : undefined,
        updatedAt: now,
      });
      return { reference: existingPending.paystackReference };
    }

    await ctx.db.insert("purchases", {
      userId: user._id,
      courseId: args.courseId,
      paystackReference: reference,
      // Always the amount sent to Paystack — `verifyAndCompletePurchase` and
      // `initializeCheckout` both read this, and neither re-derives it.
      amount: chargedAmount,
      listAmount,
      discountAmount: applied.discountAmount,
      couponId: coupon?.couponId ?? undefined,
      couponCode: coupon?.code ?? undefined,
      couponDiscountKobo,
      grantId: applied.fromGrant ? (grant?._id ?? undefined) : undefined,
      grantAppliedKobo: applied.fromGrant ? (grant?.remainingKobo ?? 0) : undefined,
      currency: course.currency ?? "NGN",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return { reference };
  },
});

// ─── Client-facing read: does the current user have access? ───────────────

export const hasAccessToCourse = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return false;

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    return !!enrollment;
  },
});

// ─── Internal helpers (used by paystack.ts actions and the webhook) ───────

/**
 * Prefix for an amount/currency disagreement between Paystack's charge and the
 * checkout intent (M-2).
 *
 * It is a prefix rather than a dedicated error type because the webhook needs
 * to tell "this payload is not the charge we asked for" apart from "the
 * database is broken" — the first is a permanent condition and gets a 200 so
 * Paystack stops retrying, the second deserves a 5xx so it is retried and
 * seen. Matching on a documented prefix keeps that distinction without
 * threading a custom error class through the action boundary.
 */
export const PAYMENT_MISMATCH = "PAYMENT_MISMATCH:";

/**
 * Record exactly what we asked Paystack to charge for this reference.
 *
 * Called by the checkout action straight after `transaction/initialize`
 * succeeds, so verification has a server-side figure to check the eventual
 * charge against (M-2). It must be written *before* the buyer can pay — the
 * window between initialize and webhook is the whole lifetime of the intent.
 *
 * The fields are optional on the row rather than required, because every
 * purchase written before this existed has none; readers fall back to
 * `amount`/`currency`, which is what those rows were initialized with.
 */
export const recordCheckoutIntent = internalMutation({
  args: {
    reference: v.string(),
    checkoutAmount: v.number(),
    checkoutCurrency: v.string(),
  },
  handler: async (ctx, args) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .unique();
    if (!purchase) return;
    // Never rewrite an intent — a second initialize for the same reference
    // must not move the goalposts on a charge already in flight.
    if (purchase.checkoutAmount !== undefined) return;

    await ctx.db.patch(purchase._id, {
      checkoutAmount: args.checkoutAmount,
      checkoutCurrency: args.checkoutCurrency,
    });
  },
});

export const getPurchaseByRef = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .unique();
    if (!purchase) return null;
    const user = await ctx.db.get(purchase.userId);
    return {
      ...purchase,
      clerkId: user?.clerkId ?? "",
      email: user?.email ?? "",
    };
  },
});

/**
 * Settles a purchase: records the money split, grants enrolment, converts any
 * referral, and consumes any grant.
 *
 * Idempotent — the webhook and the localhost verify fallback can both fire, and
 * the early return on an already-paid row is what makes that safe.
 *
 * ── The settlement snapshot ────────────────────────────────────────────────
 *
 * The instructor/platform split is computed **here**, once, and written to the
 * purchase row. It used to be recomputed on every dashboard read from a
 * constant, which meant changing the rate retroactively rewrote what instructors
 * had already been shown. See `lib/settlement.ts` for the arithmetic and the
 * invariant (`share + fee === listAmount`).
 *
 * `listAmount` falls back to `amount` for rows created before the snapshot
 * existed; for those the two are equal, since the referral discount did not yet
 * exist.
 *
 * ── What the charge is checked against (M-2) ───────────────────────────────
 *
 * Callers may relay Paystack's own figures for the charge (`amount`,
 * `currency` — the webhook does, the redirect fallback does). When they are
 * present they are compared against the checkout intent: what *we* asked
 * Paystack to charge, which is `checkoutAmount`/`checkoutCurrency` when the
 * buyer picked another currency and `amount`/`currency` otherwise. A charge
 * that does not match is refused rather than settled — the course must not be
 * granted for money we did not ask for.
 *
 * The signature check on the webhook already proves the payload came from
 * Paystack; this is the check that proves it is the *right* payload for this
 * purchase, and it is what catches a reference/amount mix-up rather than a
 * forgery.
 */
export const markPurchasePaid = internalMutation({
  args: {
    reference: v.string(),
    /** Paystack's charged amount in the charge's own currency (kobo/cop). */
    amount: v.optional(v.number()),
    /** Paystack's charged currency, e.g. "NGN". */
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .unique();
    if (!purchase) throw new Error("Purchase not found");

    // Idempotent — webhook + verify may both fire.
    if (purchase.status === "paid") return;

    const expectedAmount = purchase.checkoutAmount ?? purchase.amount;
    const expectedCurrency = purchase.checkoutCurrency ?? purchase.currency;
    if (args.amount !== undefined && Math.round(args.amount) !== Math.round(expectedAmount)) {
      throw new Error(
        `${PAYMENT_MISMATCH} amount ${args.amount} ≠ expected ${expectedAmount} (${expectedCurrency})`,
      );
    }
    if (args.currency !== undefined && args.currency !== expectedCurrency) {
      throw new Error(
        `${PAYMENT_MISMATCH} currency ${args.currency} ≠ expected ${expectedCurrency}`,
      );
    }

    const now = Date.now();

    // Consume the grant BEFORE patching the purchase, so the purchase row's
    // `grantAppliedKobo` records what was actually spent rather than what was
    // quoted at checkout. `consumeGrant` re-reads the grant, so a concurrent
    // checkout cannot have already spent it.
    let grantApplied = 0;
    if (purchase.grantId) {
      grantApplied = await consumeGrant(ctx, {
        grantId: purchase.grantId,
        purchaseId: purchase._id,
        now,
      });
    }

    const listAmount = purchase.listAmount ?? purchase.amount;
    const settlement = settleSale({
      listAmount,
      // The discount was decided at checkout. Re-deriving it here would let a
      // settings change between "add to cart" and "paid" alter what the buyer
      // agreed to, and the two would no longer reconcile.
      discountAmount: purchase.discountAmount ?? 0,
      // The instructor-funded coupon, decided at checkout for the same reason.
      couponDiscountKobo: purchase.couponDiscountKobo ?? 0,
    });

    await ctx.db.patch(purchase._id, {
      status: "paid",
      paidAt: now,
      updatedAt: now,
      listAmount,
      discountAmount: purchase.discountAmount ?? 0,
      couponDiscountKobo: purchase.couponDiscountKobo ?? 0,
      instructorShareKobo: settlement.instructorShareKobo,
      platformFeeKobo: settlement.platformFeeKobo,
      grantAppliedKobo: grantApplied,
    });

    // Redeem the coupon. This sits below the `status === "paid"` early return, so
    // it runs exactly once per sale however many times the webhook and the
    // verify page fire. The coupon row can never be missing: `coupons.remove`
    // refuses to delete a code with redemptions, and Convex serializes mutations.
    if (purchase.couponId) {
      const coupon = await ctx.db.get(purchase.couponId);
      if (coupon) {
        await ctx.db.patch(coupon._id, {
          redemptionCount: coupon.redemptionCount + 1,
          updatedAt: now,
        });
      }
    }

    // Fulfilment: create the enrollment.
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", purchase.userId).eq("courseId", purchase.courseId),
      )
      .unique();

    let newEnrollmentId: import("./_generated/dataModel").Id<"enrollments"> | undefined;

    if (!existing) {
      newEnrollmentId = await ctx.db.insert("enrollments", {
        userId: purchase.userId,
        courseId: purchase.courseId,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    const course = await ctx.db.get(purchase.courseId);
    const buyer = await ctx.db.get(purchase.userId);

    // Receipt. Scheduled, not sent inline, because this mutation settles a real
    // payment and must not be at the mercy of a mail provider. Keyed on the
    // purchase id, so a webhook replay cannot bill the reader twice.
    if (buyer?.email && course) {
      await ctx.scheduler.runAfter(
        0,
        sendPaymentReceiptRef,
        {
          purchaseId: purchase._id,
          userId: purchase.userId,
          email: buyer.email,
          ...(buyer.name ? { name: buyer.name } : {}),
          courseTitle: course.title,
          courseSlug: course.slug,
          amountFormatted: formatNaira(purchase.amount),
          reference: purchase.paystackReference,
          paidAt: now,
          method: "Card",
        },
      );
    }

    // A purchase creates the enrollment, so the enrollment drip and
    // confirmation are queued here too. Re-running this mutation returns early
    // on `status === "paid"`, so neither can fire twice.
    if (newEnrollmentId) {
      await ctx.runMutation(scheduleDripRef, {
        enrollmentId: newEnrollmentId,
      });
    }

    if (course) {
      await createNotification(ctx, {
        userId: purchase.userId,
        type: "course_purchased",
        title: `Course purchased: ${course.title}`,
        body: "You're enrolled and ready to begin learning.",
        href: `/courses/${course.slug}`,
      });

      if (course.instructorId && course.instructorId !== purchase.userId) {
        await createNotification(ctx, {
          userId: course.instructorId,
          type: "course_purchased",
          title: `New student in ${course.title}`,
          body: `${buyer?.name?.trim() || "A learner"} just enrolled in your course.`,
          href: "/dashboard/instructor/courses",
          actorId: purchase.userId,
        });
      }
    }

    // ── Referral conversion ──────────────────────────────────────────────────
    // After fulfilment, so a referral is only ever recorded against a purchase
    // the buyer actually got. `convertReferral` no-ops on every edge case and is
    // idempotent, so a failure here can never cost the buyer their course.
    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user", (q) => q.eq("referredUserId", purchase.userId))
      .unique();

    if (referral) {
      await ctx.runMutation(convertReferralRef, {
        referralId: referral._id,
        purchaseId: purchase._id,
        listAmount,
      });
    }
  },
});

// ─── Admin console: payments view + refund annotation ──────────────────────

/** Recent purchases with buyer and course context, for the payments console. */
export const adminListPurchases = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("paid"), v.literal("failed")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 100)));

    // `by_course_status` leads with courseId, so a status-only filter cannot
    // use it; the table is small and admin-only, so a bounded newest-first
    // scan is the honest read here.
    const all = await ctx.db.query("purchases").collect();
    const filtered = all
      .filter((p) => (args.status ? p.status === args.status : true))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return await Promise.all(
      filtered.map(async (purchase) => {
        const [buyer, course] = await Promise.all([
          ctx.db.get(purchase.userId),
          ctx.db.get(purchase.courseId),
        ]);
        return {
          _id: purchase._id,
          reference: purchase.paystackReference,
          buyerName: buyer?.name ?? buyer?.email ?? null,
          buyerEmail: buyer?.email ?? null,
          courseTitle: course?.title ?? null,
          amount: purchase.amount / 100, // kobo → naira
          currency: purchase.currency,
          status: purchase.status,
          refundedAt: purchase.refundedAt ?? null,
          refundReason: purchase.refundReason ?? null,
          createdAt: purchase.createdAt,
          paidAt: purchase.paidAt ?? null,
        };
      }),
    );
  },
});

/**
 * Records a refund against a purchase. Deliberately annotation-only: the
 * money movement itself happens in the Paystack dashboard (calling their API
 * here would need an action + secret handling and a partial-refund policy
 * this console does not need yet), and access is NOT revoked automatically —
 * unwinding someone's enrollment after a refund is a separate, deliberate
 * decision so a mistaken annotation never silently deletes course access.
 * Audited like every other money-adjacent admin action.
 */
export const markRefunded = mutation({
  args: {
    purchaseId: v.id("purchases"),
    reason: v.optional(v.string()),
    clearRefund: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase) throw new Error("Purchase not found");

    if (args.clearRefund) {
      await ctx.db.patch(purchase._id, {
        refundedAt: undefined,
        refundReason: undefined,
        updatedAt: Date.now(),
      });
      await logAudit(ctx, {
        actorId: admin._id,
        action: "purchase.refund_cleared",
        targetType: "purchase",
        targetId: purchase._id,
        details: { reference: purchase.paystackReference },
      });
      return;
    }

    if (purchase.status !== "paid") {
      throw new Error("Only paid purchases can be marked refunded");
    }
    if (purchase.refundedAt !== undefined) {
      throw new Error("This purchase is already marked refunded");
    }

    await ctx.db.patch(purchase._id, {
      refundedAt: Date.now(),
      refundReason: args.reason?.trim() || undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      actorId: admin._id,
      action: "purchase.refund",
      targetType: "purchase",
      targetId: purchase._id,
      details: {
        reference: purchase.paystackReference,
        amount: purchase.amount / 100,
        reason: args.reason ?? null,
      },
    });
  },
});
