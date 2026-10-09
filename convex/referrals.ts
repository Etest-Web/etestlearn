/**
 * Referral programme: share codes, first-purchase discounts, and referrer credits.
 *
 * The arithmetic lives in `lib/referrals.ts` (rules) and `lib/settlement.ts`
 * (the instructor split) so it can be unit-tested without a database. This
 * module owns only the state transitions and the authorization.
 *
 * ── The shape of the programme ──────────────────────────────────────────────
 *
 * A referrer has a permanent code. Someone who arrives with `?ref=CODE` and buys
 * a paid course gets a discount on that purchase; the referrer earns a grant
 * that discounts one future course. Grants are non-withdrawable by design —
 * see the comment on `referralGrants` in the schema.
 *
 * Two rules do most of the work:
 *
 *  - **One referral per person, ever.** `by_referred_user` makes the binding
 *    idempotent, so nobody can stack codes to farm discounts.
 *  - **The discount applies to the invitee's first purchase only.** It is
 *    granted at `createPendingPurchase` and frozen into the pending row, so it
 *    cannot be re-applied later by re-running checkout.
 *
 * Settings are an admin-editable singleton (`referralSettings`) so rates can be
 * tuned without a deploy; `enabled` is the kill switch.
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireUser } from "./helpers/auth";
import { logAudit } from "./helpers/audit";
import { createNotification } from "./helpers/notifications";
import { clampDiscount } from "../lib/settlement";
import {
  DEFAULT_MAX_DISCOUNT_KOBO,
  applyDiscount,
  chargedAmountFor,
  grantExpiry,
  inviteeDiscountKobo,
  referrerGrantKobo,
} from "../lib/referrals";

/** Code alphabet: no 0/O/1/I/L, which are the characters people misread aloud. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_ATTEMPTS = 12;

export interface ReferralSettings {
  enabled: boolean;
  inviteeDiscountBps: number;
  maxInviteeDiscountKobo: number;
  referrerGrantBps: number;
  maxReferrerGrantKobo: number;
  grantExpiryDays?: number;
}

/**
 * Used when `referralSettings` is empty, which is the state of every fresh
 * deployment until an admin saves the form once. Chosen to be modest: a
 * 20% invitee discount capped at ₦5,000, and a ₦2,000 referrer credit.
 */
export const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: true,
  inviteeDiscountBps: 2000,
  maxInviteeDiscountKobo: DEFAULT_MAX_DISCOUNT_KOBO,
  referrerGrantBps: 4000,
  maxReferrerGrantKobo: 200000,
  grantExpiryDays: 90,
};

/** Cap on settings inputs, so a bad admin value cannot exceed the code guards. */
const MAX_RATE_BPS = 10000;
const MAX_KOBO_CAP = 100_000_000; // ₦1,000,000
const MAX_EXPIRY_DAYS = 3650;

/**
 * Reads the settings row, or the defaults when none exists.
 *
 * A collect() rather than `.first()` on a single-row table: the schema allows
 * more than one row, and taking the newest means a stray duplicate can never
 * shadow the row an admin just edited.
 */
async function loadSettings(ctx: { db: any }): Promise<ReferralSettings> {
  const rows = await ctx.db
    .query("referralSettings")
    .withIndex("by_updatedAt")
    .collect();

  if (rows.length === 0) return DEFAULT_SETTINGS;

  const newest = rows.sort(
    (a: Doc<"referralSettings">, b: Doc<"referralSettings">) => b.updatedAt - a.updatedAt,
  )[0];
  return {
    enabled: newest.enabled,
    inviteeDiscountBps: newest.inviteeDiscountBps,
    maxInviteeDiscountKobo: newest.maxInviteeDiscountKobo,
    referrerGrantBps: newest.referrerGrantBps,
    maxReferrerGrantKobo: newest.maxReferrerGrantKobo,
    grantExpiryDays: newest.grantExpiryDays,
  };
}

// ─── Share codes ─────────────────────────────────────────────────────────────

/** Random code from the unambiguous alphabet. Uses crypto, not Math.random. */
function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/** True for a string shaped like a code, before it is looked up. */
function normalizeCode(raw: string | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return /^[A-Z0-9]+$/.test(code) ? code : null;
}

/**
 * Returns the caller's share code, generating one on first call.
 *
 * A mutation rather than a query because generation is a write. Idempotent and
 * safe to call on every render of the referral page: the overwhelmingly common
 * path is a read of the already-stored code.
 *
 * Generated here rather than in the Clerk webhook so that new and pre-existing
 * accounts share one code path and no backfill migration is needed.
 */
export const ensureMyCode = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.referralCode) return { code: user.referralCode };

    // Retry on the vanishingly unlikely collision rather than failing the user.
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = generateCode();
      const clash = await ctx.db
        .query("users")
        .withIndex("by_referral_code", (q) => q.eq("referralCode", code))
        .unique();
      if (clash) continue;

      await ctx.db.patch(user._id, { referralCode: code });
      return { code };
    }

    throw new Error(
      "Could not allocate a referral code — please try again in a moment",
    );
  },
});

/** The referrer a code belongs to, or null. Shared by checkout and by preview. */
export const getReferrerByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const referrer = await ctx.db
      .query("users")
      .withIndex("by_referral_code", (q) => q.eq("referralCode", args.code))
      .unique();
    if (!referrer || referrer.suspendedAt !== undefined) return null;
    return { _id: referrer._id, name: referrer.name ?? null };
  },
});

// ─── Grants ──────────────────────────────────────────────────────────────────

/**
 * The caller's oldest available, unexpired grant.
 *
 * Oldest-first by `awardedAt` so a grant close to expiry is spent before one
 * with more life left in it. Returns null when the caller has nothing, which is
 * the common case and must not be an error.
 */
export const getMyAvailableGrant = internalQuery({
  args: { userId: v.id("users"), now: v.number() },
  handler: async (ctx, args) => {
    const grants = await ctx.db
      .query("referralGrants")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "available"),
      )
      .collect();

    const usable = grants
      .filter((g) => g.remainingKobo > 0)
      .filter((g) => g.expiresAt === undefined || g.expiresAt > args.now)
      .sort((a, b) => a.awardedAt - b.awardedAt);

    const grant = usable[0];
    if (!grant) return null;
    return { _id: grant._id, remainingKobo: grant.remainingKobo, expiresAt: grant.expiresAt ?? null };
  },
});

/**
 * Consumes a grant against a purchase.
 *
 * Re-reads the grant inside the mutation rather than trusting the id and amount
 * carried on the purchase row. Convex serializes mutations, so this read-then-
 * write is atomic: two checkouts racing for the same grant cannot both spend it,
 * because the second sees the first's patch.
 *
 * Marks the grant `consumed` rather than decrementing `remainingKobo`, so the
 * row always shows what it was worth and what it was spent on. A partial spend
 * would leave an ambiguous balance, which is the thing this design avoids.
 */
async function consumeGrant(
  ctx: { db: any },
  args: { grantId: Id<"referralGrants">; purchaseId: Id<"purchases">; now: number },
): Promise<number> {
  const grant = await ctx.db.get(args.grantId);
  if (!grant || grant.status !== "available") return 0;
  if (grant.remainingKobo <= 0) return 0;
  if (grant.expiresAt !== undefined && grant.expiresAt <= args.now) return 0;

  await ctx.db.patch(grant._id, {
    status: "consumed",
    remainingKobo: 0,
    consumedByPurchaseId: args.purchaseId,
    consumedAt: args.now,
  });

  return grant.remainingKobo;
}

// ─── Referral binding ────────────────────────────────────────────────────────

/**
 * Binds the caller to a referrer, if they are not already bound.
 *
 * Called from `createPendingPurchase`. Three refusals, in order of cost:
 *
 *  - **Self-referral.** A code belongs to exactly one account, so this can only
 *    happen if someone pastes their own link. Refused rather than silently
 *    ignored, because a self-referral that "worked" would be a bug the user
 *    believes is a feature.
 *  - **Already referred.** `by_referred_user` makes this a single range read.
 *    Returns the existing row so re-running checkout is a no-op rather than an
 *    error — the pending-reuse path calls this on every retry.
 *  - **A referrer who cannot be resolved** (unknown code, suspended account, or
 *    the programme switched off) is not an error either: the buyer simply pays
 *    full price. Failing the checkout over a stale link would be worse.
 *
 * Returns null when no referral applies, which the caller reads as "no discount".
 */
export const bindReferral = internalMutation({
  args: { referredUserId: v.id("users"), code: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    if (!code) return null;

    const settings = await loadSettings(ctx);
    if (!settings.enabled) return null;

    const referrer = await ctx.db
      .query("users")
      .withIndex("by_referral_code", (q) => q.eq("referralCode", code))
      .unique();
    if (!referrer || referrer.suspendedAt !== undefined) return null;

    // Self-referral: the code is this account's own.
    if (referrer._id === args.referredUserId) return null;

    // Already referred — idempotent, so a retried checkout does not error.
    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user", (q) => q.eq("referredUserId", args.referredUserId))
      .unique();
    if (existing) return existing;

    return await ctx.db.insert("referrals", {
      referrerId: referrer._id,
      referredUserId: args.referredUserId,
      code,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * The discount a buyer would receive on `courseId` right now.
 *
 * A read-only preview so the course page can show the reduced price before
 * checkout. It never writes and never binds — binding happens at
 * `createPendingPurchase`, where the decision is recorded on the purchase row.
 *
 * The caller must pass the caller's own referral code if they have one; this
 * function deliberately takes the referrer's id as an argument rather than
 * looking it up from a URL param, because the code has to be resolved to an
 * account before it can be trusted.
 */
export const previewDiscount = query({
  args: { courseId: v.id("courses"), referralCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const course = await ctx.db.get(args.courseId);
    if (!course || !course.published) return null;

    const settings = await loadSettings(ctx);
    const listAmount = course.price ?? 0;
    if (!settings.enabled || listAmount <= 0) {
      return { listAmount, discountAmount: 0, chargedAmount: listAmount, fromReferral: false };
    }

    // Resolve the referral this buyer is entitled to, if any.
    let inviteeDiscount = 0;
    const code = normalizeCode(args.referralCode);
    if (code) {
      const existing = await ctx.db
        .query("referrals")
        .withIndex("by_referred_user", (q) => q.eq("referredUserId", user._id))
        .unique();
      // A bound referral keeps its discount on later previews even after the
      // code has left the URL, which is what "sticky" means here.
      if (existing) {
        // First *paid* purchase only — same rule `createPendingPurchase` applies,
        // so the preview cannot advertise a discount checkout would refuse.
        // The pending row for this course is not `paid`, so it does not count.
        const alreadyPaid = await ctx.db
          .query("purchases")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .filter((q) => q.eq(q.field("status"), "paid"))
          .first();

        if (!alreadyPaid) {
          inviteeDiscount = inviteeDiscountKobo({
            listAmount,
            discountBps: settings.inviteeDiscountBps,
            maxDiscountKobo: settings.maxInviteeDiscountKobo,
          });
        }
      }
    }

    const grant = await ctx.db
      .query("referralGrants")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "available"),
      )
      .collect();

    const now = Date.now();
    const usable = grant
      .filter((g) => g.remainingKobo > 0)
      .filter((g) => g.expiresAt === undefined || g.expiresAt > now)
      .sort((a, b) => a.awardedAt - b.awardedAt);

    const applied = applyDiscount({
      listAmount,
      inviteeDiscountKobo: inviteeDiscount,
      grantKobo: usable[0]?.remainingKobo ?? 0,
    });

    return {
      listAmount,
      discountAmount: applied.discountAmount,
      chargedAmount: chargedAmountFor(listAmount, applied.discountAmount),
      fromReferral: applied.fromReferral,
    };
  },
});

// ─── Learner-facing reads ────────────────────────────────────────────────────

/**
 * Everything the referral page renders: the caller's code, share link, counts,
 * available credit, and recent conversions.
 *
 * One query rather than four so the page renders in a single subscription. The
 * conversion list is capped because it is a "recent activity" feed, not a
 * statement — a full history belongs in a paginated view.
 */
export const getMyReferralSummary = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 10)));

    const [referrals, grants] = await Promise.all([
      ctx.db
        .query("referrals")
        .withIndex("by_referrer", (q) => q.eq("referrerId", user._id))
        .collect(),
      ctx.db
        .query("referralGrants")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const availableGrants = grants.filter(
      (g) =>
        g.status === "available" &&
        g.remainingKobo > 0 &&
        (g.expiresAt === undefined || g.expiresAt > now),
    );

    const converted = referrals.filter((r) => r.status === "converted");

    // Resolve the invitee names and course titles for the feed. Capped and
    // index-backed, so this is a bounded read rather than a scan of users.
    const recent = await Promise.all(
      referrals
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(async (r) => {
          const invitee = await ctx.db.get(r.referredUserId);
          // A purchase points at a course rather than snapshotting its title,
          // so this is two point reads rather than one.
          const purchase = r.convertedPurchaseId
            ? await ctx.db.get(r.convertedPurchaseId)
            : null;
          const course = purchase ? await ctx.db.get(purchase.courseId) : null;
          return {
            _id: r._id,
            status: r.status,
            inviteeName: invitee?.name?.trim() || null,
            createdAt: r.createdAt,
            convertedAt: r.convertedAt ?? null,
            rewardKobo: r.rewardKobo ?? 0,
            courseTitle: course?.title ?? null,
          };
        }),
    );

    return {
      code: user.referralCode ?? null,
      invitedCount: referrals.length,
      convertedCount: converted.length,
      // Earned across every grant, spent or not — the marketing number.
      totalRewardKobo: grants.reduce((sum, g) => sum + g.originalKobo, 0),
      // Spendable right now.
      availableCreditKobo: availableGrants.reduce((sum, g) => sum + g.remainingKobo, 0),
      activeGrantCount: availableGrants.length,
      grants: availableGrants
        .sort((a, b) => a.awardedAt - b.awardedAt)
        .map((g) => ({ _id: g._id, remainingKobo: g.remainingKobo, expiresAt: g.expiresAt ?? null })),
      recent,
    };
  },
});

// ─── Admin settings ──────────────────────────────────────────────────────────

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return loadSettings(ctx);
  },
});

/**
 * Saves the referral programme settings.
 *
 * Audited because it moves real money: the discount is funded by the platform
 * and the grant rate is a liability. `details` records the before/after so a
 * rate change can be traced after the fact.
 *
 * Values are clamped rather than rejected. An admin typing 150% should get a
 * bounded rate and a working form, not a stack trace — and `lib/referrals.ts`
 * enforces its own ceiling independently, so this is defence in depth.
 */
export const updateSettings = mutation({
  args: {
    enabled: v.boolean(),
    inviteeDiscountBps: v.number(),
    maxInviteeDiscountKobo: v.number(),
    referrerGrantBps: v.number(),
    maxReferrerGrantKobo: v.number(),
    grantExpiryDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const clampRate = (n: number) => Math.max(0, Math.min(MAX_RATE_BPS, Math.floor(n)));
    const clampKobo = (n: number) => Math.max(0, Math.min(MAX_KOBO_CAP, Math.floor(n)));
    const expiry =
      args.grantExpiryDays === undefined
        ? undefined
        : Math.max(0, Math.min(MAX_EXPIRY_DAYS, Math.floor(args.grantExpiryDays)));

    const next: ReferralSettings = {
      enabled: args.enabled,
      inviteeDiscountBps: clampRate(args.inviteeDiscountBps),
      maxInviteeDiscountKobo: clampKobo(args.maxInviteeDiscountKobo),
      referrerGrantBps: clampRate(args.referrerGrantBps),
      maxReferrerGrantKobo: clampKobo(args.maxReferrerGrantKobo),
      grantExpiryDays: expiry,
    };

    const previous = await loadSettings(ctx);

    const now = Date.now();
    const rows = await ctx.db
      .query("referralSettings")
      .withIndex("by_updatedAt")
      .collect();
    const newest = rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (newest) {
      await ctx.db.patch(newest._id, { ...next, updatedAt: now, updatedBy: admin._id });
    } else {
      await ctx.db.insert("referralSettings", { ...next, updatedAt: now, updatedBy: admin._id });
    }

    await logAudit(ctx, {
      actorId: admin._id,
      action: "referral.settings_update",
      targetType: "referral_settings",
      details: {
        enabled: next.enabled,
        inviteeDiscountBps: next.inviteeDiscountBps,
        maxInviteeDiscountKobo: next.maxInviteeDiscountKobo,
        referrerGrantBps: next.referrerGrantBps,
        maxReferrerGrantKobo: next.maxReferrerGrantKobo,
        grantExpiryDays: next.grantExpiryDays ?? 0,
        previousEnabled: previous.enabled,
        previousInviteeDiscountBps: previous.inviteeDiscountBps,
      },
    });

    return next;
  },
});

/**
 * Programme-wide referral stats for the admin console.
 *
 * A collect() over `referrals` rather than per-referrer index reads: this is an
 * aggregate over the whole programme, which no index can answer in one range.
 * Bounded by the table being referral-sized (one row per person, ever) rather
 * than purchase-sized.
 */
export const getProgramStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const referrals = await ctx.db.query("referrals").collect();
    const grants = await ctx.db.query("referralGrants").collect();
    const now = Date.now();

    const converted = referrals.filter((r) => r.status === "converted");
    const available = grants.filter(
      (g) => g.status === "available" && g.remainingKobo > 0,
    );

    return {
      invited: referrals.length,
      converted: converted.length,
      // null rather than 0 when nobody has been invited — "no conversion rate
      // yet" and "a 0% rate" are different facts and the UI must be able to say so.
      conversionRate:
        referrals.length === 0
          ? null
          : Math.round((converted.length / referrals.length) * 100),
      rewardIssuedKobo: converted.reduce((sum, r) => sum + (r.rewardKobo ?? 0), 0),
      outstandingCreditKobo: available.reduce((sum, g) => sum + g.remainingKobo, 0),
      expiringSoonKobo: available
        .filter((g) => g.expiresAt !== undefined && g.expiresAt <= now + 30 * 24 * 60 * 60 * 1000)
        .reduce((sum, g) => sum + g.remainingKobo, 0),
      settings: await loadSettings(ctx),
    };
  },
});

// ─── Internal: conversion + grant award ──────────────────────────────────────

/**
 * Converts a referral and awards the referrer a grant.
 *
 * Called from `internal.payments.markPurchasePaid` once the purchase is known
 * paid. Idempotent in two independent ways, because both the webhook and the
 * localhost verify fallback can fire:
 *
 *  - `markPurchasePaid` returns early on an already-paid purchase, so this
 *    normally runs once.
 *  - Even if it did run twice, converting an already-converted referral is a
 *    no-op rather than a second grant.
 *
 * No-ops on every edge case rather than throwing: a referral reward is a
 * courtesy, and failing the settlement because a grant could not be written
 * would cost a student their course. The notification is best-effort too.
 */
export const convertReferral = internalMutation({
  args: { referralId: v.id("referrals"), purchaseId: v.id("purchases"), listAmount: v.number() },
  handler: async (ctx, args) => {
    const referral = await ctx.db.get(args.referralId);
    if (!referral || referral.status === "converted") return null;

    const settings = await loadSettings(ctx);
    const rewardKobo = referrerGrantKobo({
      listAmount: args.listAmount,
      grantBps: settings.referrerGrantBps,
      maxGrantKobo: settings.maxReferrerGrantKobo,
    });

    const now = Date.now();
    await ctx.db.patch(referral._id, {
      status: "converted",
      rewardKobo,
      convertedPurchaseId: args.purchaseId,
      convertedAt: now,
    });

    if (rewardKobo <= 0) return null;

    const grantId = await ctx.db.insert("referralGrants", {
      userId: referral.referrerId,
      referralId: referral._id,
      source: "referral",
      originalKobo: rewardKobo,
      remainingKobo: rewardKobo,
      status: "available",
      awardedAt: now,
      expiresAt: grantExpiry(now, settings.grantExpiryDays),
    });

    const invitee = await ctx.db.get(referral.referredUserId);
    const purchase = await ctx.db.get(args.purchaseId);
    const course = purchase ? await ctx.db.get(purchase.courseId) : null;
    const courseTitle = course?.title ?? "a course";
    const inviteeName = invitee?.name?.trim() || "Someone";

    await createNotification(ctx, {
      userId: referral.referrerId,
      type: "referral_converted",
      title: `${inviteeName} just enrolled`,
      body: `Their purchase of ${courseTitle} counts as a referral. You have earned credit toward your next course.`,
      href: "/dashboard/referrals",
      actorId: referral.referredUserId,
    });

    await createNotification(ctx, {
      userId: referral.referrerId,
      type: "referral_reward",
      title: "Referral credit added",
      body: "Your credit is applied automatically to your next paid course.",
      href: "/dashboard/referrals",
      actorId: referral.referredUserId,
    });

    return { grantId, rewardKobo };
  },
});

/**
 * Grants a referral discount on a pending purchase, returning what was applied.
 *
 * Kept separate from `bindReferral` so the binding (a one-time identity fact)
 * and the pricing (which depends on settings that can change) are not decided in
 * the same breath.
 */
export const computeInviteeDiscount = internalQuery({
  args: { referredUserId: v.id("users"), listAmount: v.number() },
  handler: async (ctx, args) => {
    const settings = await loadSettings(ctx);
    if (!settings.enabled) return 0;

    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_referred_user", (q) => q.eq("referredUserId", args.referredUserId))
      .unique();
    if (!referral) return 0;

    // First *paid* purchase only.
    //
    // The binding alone is not enough to enforce "one discount per person": a
    // referred buyer could otherwise open a second checkout on another course
    // and be discounted again, indefinitely, off the same single referral. The
    // `by_user` range read finds their first settled purchase — the pending row
    // for the course being priced now is not `paid`, so it does not count,
    // which is what lets an abandoned checkout be retried without consuming the
    // discount.
    const alreadyPaid = await ctx.db
      .query("purchases")
      .withIndex("by_user", (q) => q.eq("userId", args.referredUserId))
      .filter((q) => q.eq(q.field("status"), "paid"))
      .first();
    if (alreadyPaid) return 0;

    return inviteeDiscountKobo({
      listAmount: args.listAmount,
      discountBps: settings.inviteeDiscountBps,
      maxDiscountKobo: settings.maxInviteeDiscountKobo,
    });
  },
});

export { consumeGrant, loadSettings, normalizeCode };

/** Re-exported for tests. */
export const __testing = { generateCode, consumeGrant, clampDiscount };