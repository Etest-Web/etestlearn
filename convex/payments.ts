import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { logAudit } from "./helpers/audit";
import { createNotification } from "./helpers/notifications";
import { consumeGrant } from "./referrals";
import { settleSale } from "../lib/settlement";
import { applyDiscount, chargedAmountFor } from "../lib/referrals";

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
  args: { courseId: v.id("courses"), referralCode: v.optional(v.string()) },
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

    // Bind first, then price: binding is the one-time identity fact (this
    // person is referred by that account), and the discount below is a
    // consequence of it.
    await ctx.runMutation(bindReferralRef, {
      referredUserId: user._id,
      code: args.referralCode,
    });

    const inviteeDiscount = await ctx.runQuery(computeInviteeDiscountRef, {
      referredUserId: user._id,
      listAmount,
    });

    // Oldest-first grant, so an expiring credit is spent before a fresh one.
    const grant = await ctx.runQuery(getMyAvailableGrantRef, {
      userId: user._id,
      now: Date.now(),
    });

    const applied = applyDiscount({
      listAmount,
      inviteeDiscountKobo: inviteeDiscount,
      grantKobo: grant?.remainingKobo ?? 0,
    });
    const chargedAmount = chargedAmountFor(listAmount, applied.discountAmount);

    const now = Date.now();
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
        (existingPending.listAmount ?? existingPending.amount) === listAmount;

      if (unchanged) {
        return { reference: existingPending.paystackReference };
      }

      await ctx.db.patch(existingPending._id, {
        amount: chargedAmount,
        listAmount,
        discountAmount: applied.discountAmount,
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
 */
export const markPurchasePaid = internalMutation({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .unique();
    if (!purchase) throw new Error("Purchase not found");

    // Idempotent — webhook + verify may both fire.
    if (purchase.status === "paid") return;

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
    });

    await ctx.db.patch(purchase._id, {
      status: "paid",
      paidAt: now,
      updatedAt: now,
      listAmount,
      discountAmount: purchase.discountAmount ?? 0,
      instructorShareKobo: settlement.instructorShareKobo,
      platformFeeKobo: settlement.platformFeeKobo,
      grantAppliedKobo: grantApplied,
    });

    // Fulfilment: create the enrollment.
    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", purchase.userId).eq("courseId", purchase.courseId),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("enrollments", {
        userId: purchase.userId,
        courseId: purchase.courseId,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    const course = await ctx.db.get(purchase.courseId);
    const buyer = await ctx.db.get(purchase.userId);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const admin = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!admin || admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const admin = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!admin || admin.role !== "admin") {
      throw new Error("Not authorized — admin access required");
    }

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
