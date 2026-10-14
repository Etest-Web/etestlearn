import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./helpers/auth";
import { logAudit } from "./helpers/audit";
import { requireRateLimit } from "./helpers/rateLimit";
import { createNotification } from "./helpers/notifications";
import {
  decryptAccountNumber,
  encryptAccountNumber,
  maskAccountNumber,
} from "./helpers/encryption";
import { supportEmail } from "../lib/support";

/**
 * Instructor payout bank details.
 *
 * Verification runs against Paystack's account-resolution endpoint, which
 * lives in `bankVerification.ts` ("use node" — the default runtime has no
 * `fetch` for outbound calls). That action resolves the account name and then
 * hands the result to `persistVerifiedAccount` here, so the database write,
 * the audit row and the notification all happen inside one Convex
 * transaction, and the client can never store an account without Paystack
 * having confirmed the name first.
 *
 * Policy, stated once: **verification is one-shot per instructor.** After the
 * first success the mutation refuses further saves and points at support.
 * That is a deliberate product decision, not a technical limit — a payout
 * destination is the one field worth making hard to change quietly, so
 * changing it is a human process. If that ever softens, the only code to
 * touch is the `already saved` branch in `persistVerifiedAccount` and the
 * copy in `components/bank-setup-modal.tsx`.
 */

/** Result shape the Earnings receipt renders. Never includes the raw number. */
export interface BankInfoView {
  /** True once a Paystack-verified account is on file. */
  verified: boolean;
  /** Last four digits, for display. Null before verification. */
  accountNumberMasked: string | null;
  /** Paystack bank code, e.g. "058" for GTBank. */
  bankCode: string | null;
  /** The account name Paystack resolved — the proof the check passed. */
  accountName: string | null;
  updatedAt: number | null;
}

const EMPTY: BankInfoView = {
  verified: false,
  accountNumberMasked: null,
  bankCode: null,
  accountName: null,
  updatedAt: null,
};

/**
 * The caller's payout details, masked.
 *
 * The raw number is decrypted only in memory to derive the last-four mask and
 * is never returned; the client only ever sees `****1234`.
 */
export const getBankInfo = query({
  args: {},
  handler: async (ctx): Promise<BankInfoView> => {
    const user = await requireUser(ctx);
    if (!user.bankVerified || !user.bankAccountEncrypted) return EMPTY;

    let accountNumberMasked: string | null = null;
    try {
      accountNumberMasked = maskAccountNumber(
        await decryptAccountNumber(user.bankAccountEncrypted),
      );
    } catch {
      // A key rotation (or a corrupted row) must not break the receipt:
      // the account stays "verified" and support can read the ciphertext.
      accountNumberMasked = null;
    }

    return {
      verified: true,
      accountNumberMasked,
      bankCode: user.bankCode ?? null,
      accountName: user.bankAccountName ?? null,
      updatedAt: user.bankDetailsUpdatedAt ?? null,
    };
  },
});

/**
 * The nudge the dashboard banner reads.
 *
 * A separate query from `getBankInfo` so the banner — which renders for
 * students, instructors and admins alike on the shared dashboard — can ask
 * "is this person an instructor still missing payout details?" without
 * dragging the rest of the bank view into that subscription. Returning
 * `null` for everyone else is what makes the banner invisible to learners.
 */
export const needsPayoutSetup = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const user = await requireUser(ctx);
    return user.role === "instructor" && !user.bankVerified;
  },
});

/**
 * Write the nudge into the instructor's inbox, once.
 *
 * Called from the dashboard after {@link needsPayoutSetup} reports true. It
 * is idempotent — a second call finds the existing unread row and does
 * nothing — so re-renders, StrictMode double-effects and every future login
 * are all safe. Deliberately its own mutation rather than folded into a
 * login hook elsewhere: the instructor console is the only place this
 * matters, and the check belongs next to the policy it implements.
 */
export const ensurePayoutNudge = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "instructor" || user.bankVerified) return { created: false };

    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("readAt", undefined),
      )
      .filter((q) => q.eq(q.field("type"), "bank_info_required"))
      .first();

    if (existing) return { created: false };

    await createNotification(ctx, {
      userId: user._id,
      type: "bank_info_required",
      title: "Add your payout account",
      body: "We need a verified Nigerian bank account before we can pay out your earnings.",
      // Anchored to the receipt section on Earnings, which carries the
      // "Add payout account" button. The setup dialog has no route of its
      // own, so a notification has to land on a page.
      href: "/dashboard/instructor/earnings#payout-account",
    });

    return { created: true };
  },
});

/**
 * Store a Paystack-verified account. Internal: only `bankVerification.ts`
 * calls it, after the resolve endpoint has returned the account name, so
 * "verified" in this schema always means "Paystack said so".
 *
 * The second save is refused with the support route spelled out — this is
 * the one-shot rule from the module comment, and the error text is what the
 * instructor actually reads, so it names the email address to write to.
 */
export const persistVerifiedAccount = internalMutation({
  args: {
    accountNumber: v.string(),
    bankCode: v.string(),
    accountName: v.string(),
  },
  handler: async (ctx, args): Promise<SavedBankView> => {
    const user = await requireUser(ctx);
    if (user.role !== "instructor") {
      throw new Error("Only instructors can save payout bank details");
    }

    if (user.bankVerified) {
      throw new Error(
        "Your bank details are already saved and cannot be changed here. " +
          `To update your payout account, email ${supportEmail()} ` +
          "from the address on your account.",
      );
    }

    // Ten digits, as an account number — and as a size cap on what reaches
    // the encryptor, so a fat-fingered paste cannot become a large ciphertext.
    const accountNumber = args.accountNumber.trim();
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error("Account number must be exactly 10 digits");
    }

    const bankCode = args.bankCode.trim();
    if (!/^\d{3,6}$/.test(bankCode)) {
      throw new Error("Invalid bank code");
    }

    // Defensive: the action only calls this with a resolved name, but a
    // blank name would render an empty "verified as" line on the page.
    const accountName = args.accountName.trim();
    if (accountName.length === 0) {
      throw new Error("Paystack returned no account name for these details");
    }

    const encrypted = await encryptAccountNumber(accountNumber);
    const now = Date.now();

    await ctx.db.patch(user._id, {
      bankAccountEncrypted: encrypted,
      bankCode,
      bankAccountName: accountName,
      bankVerified: true,
      bankDetailsUpdatedAt: now,
    });

    // Masked, never the raw number — audit rows are read by admins.
    await logAudit(ctx, {
      actorId: user._id,
      action: "user.save_bank_details",
      targetType: "user",
      targetId: user._id,
      details: {
        bankCode,
        bankAccountName: accountName,
        accountNumberMasked: maskAccountNumber(accountNumber),
      },
    });

    await createNotification(ctx, {
      userId: user._id,
      type: "bank_details_added",
      title: "Payout account verified",
      body: `${accountName} — we'll send your earnings here.`,
      // Same anchor as the nudge: the read-only receipt on Earnings.
      href: "/dashboard/instructor/earnings#payout-account",
    });

    return {
      accountNumberMasked: maskAccountNumber(accountNumber),
      bankCode,
      accountName,
      updatedAt: now,
    };
  },
});

/**
 * Result shape of `persistVerifiedAccount` — mask and provenance only,
 * never the raw number.
 *
 * Named explicitly because `confirmBankAccount` reads it back through
 * `internal.instructorBank.persistVerifiedAccount`, and letting TypeScript
 * infer that cycle (mutation → generated api → this module → mutation)
 * collapses the whole export to `any` (TS7022).
 */
export interface SavedBankView {
  accountNumberMasked: string;
  bankCode: string;
  accountName: string;
  updatedAt: number;
}

/**
 * Public wrapper around the internal persist — called after the instructor
 * has seen the resolved name and clicks "Save". This mutation does the
 * encryption, audit, notification and email (via the same action pattern,
 * but the email is fire-and-forget from here since the action already ran).
 *
 * The action flow is: verifyBankAccount (action) → confirmBankAccount (mutation).
 * This split lets the UI show the resolved name before the instructor commits.
 */
export const confirmBankAccount = mutation({
  args: {
    accountNumber: v.string(),
    bankCode: v.string(),
    accountName: v.string(),
  },
  handler: async (ctx, args) => {
    const saved: SavedBankView = await ctx.runMutation(
      internal.instructorBank.persistVerifiedAccount,
      args,
    );
    // The persist mutation returns the mask etc., but we also need to send
    // the confirmation email. Since we're in a mutation (no fetch), we schedule
    // the email action.
    await ctx.scheduler.runAfter(0, internal.bankVerification.sendBankConfirmationEmail, {
      accountNumber: args.accountNumber,
      bankCode: args.bankCode,
      accountName: args.accountName,
      accountNumberMasked: saved.accountNumberMasked,
    });
    return saved;
  },
});

/**
 * Rate-limit guard for the resolve attempt, run before the Paystack call so
 * a hammering client never reaches the network. Separate from the persist
 * mutation because a failed *verification* (wrong number) must still burn
 * quota — otherwise a typo loop is free while a successful save is not.
 */
export const consumeVerifyAttempt = internalMutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    // Generous for a human correcting a typo, useless for scraping the
    // resolve endpoint: 5 per hour per account.
    await requireRateLimit(ctx, `bankVerify:${user._id}`, 5, 60 * 60 * 1000);
  },
});
