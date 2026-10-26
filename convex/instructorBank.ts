import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { isStaff, requireUser } from "./helpers/auth";
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
 * Payout account details for staff (instructors and admins).
 *
 * Verification runs against Paystack's account-resolution endpoint, which
 * lives in `bankVerification.ts` ("use node" — the default runtime has no
 * `fetch` for outbound calls). That action resolves the account name and then
 * hands the result to `persistVerifiedAccount` here, so the database write,
 * the audit row and the notification all happen inside one Convex
 * transaction, and the client can never store an account without Paystack
 * having confirmed the name first.
 *
 * Policy, stated once: **verification is one-shot per staff member.** After
 * the first success the mutation refuses further saves and points at support.
 * That is a deliberate product decision, not a technical limit — a payout
 * destination is the one field worth making hard to change quietly, so
 * changing it is a human process. `requestBankChange` is the self-service
 * *front door* to that process: it records the request, confirms it in-app and
 * emails support, but it never touches the stored account. It is deliberately
 * not an edit path. If the one-shot rule ever softens, the code to touch is the
 * `already saved` branch in `persistVerifiedAccount` and the copy in
 * `components/bank-setup-modal.tsx`.
 *
 * Every role check in here is `isStaff`, never `role === "instructor"`. An
 * admin may teach and therefore earn, and the console already lets them into
 * the instructor mode, so gating the payout account on the narrower role
 * would leave an admin's earnings with nowhere to go.
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
 * "is this member of staff still missing payout details?" without dragging
 * the rest of the bank view into that subscription. Returning `false` for
 * everyone else is what makes the banner invisible to learners.
 *
 * Staff, not instructors: an admin may teach and therefore earn (the console
 * lets them into the instructor mode, and `courses.createCourse` does not
 * stop at the role), so an admin with no account on file is in exactly the
 * position this nudge describes.
 */
export const needsPayoutSetup = query({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const user = await requireUser(ctx);
    return isStaff(user) && !user.bankVerified;
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
    if (!isStaff(user) || user.bankVerified) return { created: false };

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
    // Staff, not instructors. An admin who teaches earns like an instructor
    // does, and refusing here while letting them publish and price a course
    // would leave the money with nowhere to go.
    if (!isStaff(user)) {
      throw new Error("Only instructors and admins can save payout details");
    }

    if (user.bankVerified) {
      throw new Error(
        "Your bank details are already saved and cannot be changed here. " +
          "Request a change from your Earnings page, or email " +
          `${supportEmail()} from the address on your account.`,
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
 * How long a resolved-but-unsaved verification stays committable. Long enough
 * to read the name and decide, short enough that a stale record is not a
 * standing authorization.
 */
const PENDING_VERIFICATION_TTL_MS = 15 * 60 * 1000;

/**
 * Stage a Paystack-resolved account for `confirmBankAccount` to consume.
 *
 * Internal: only the `verifyBankAccount` action calls it, and only after the
 * resolve endpoint has returned an account name. This is the whole of M-1 —
 * the client's `confirmBankAccount` sends nothing about the account, so what
 * lands in the database is whatever *this* record says.
 *
 * The number is encrypted on the way in (same key as the final copy) so the
 * module's "plaintext never stored" rule survives the intermediate step, and
 * the record expires: a resolve that is never confirmed must not become a
 * standing authorization to save an account the instructor walked away from.
 */
export const storePendingVerification = internalMutation({
  args: {
    accountNumber: v.string(),
    bankCode: v.string(),
    accountName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) {
      throw new Error("Only instructors and admins can save payout details");
    }
    // Fail at the same place the final write would, so the user sees the
    // support-route message instead of a confusing "expired" on the next step.
    if (user.bankVerified) {
      throw new Error(
        "Your bank details are already saved and cannot be changed here. " +
          "Request a change from your Earnings page, or email " +
          `${supportEmail()} from the address on your account.`,
      );
    }

    const accountNumber = args.accountNumber.trim();
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error("Account number must be exactly 10 digits");
    }

    await ctx.db.patch(user._id, {
      bankPendingVerification: {
        accountNumberEncrypted: await encryptAccountNumber(accountNumber),
        bankCode: args.bankCode.trim(),
        accountName: args.accountName.trim(),
        expiresAt: Date.now() + PENDING_VERIFICATION_TTL_MS,
      },
    });
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
 * Commit the account Paystack resolved in the preceding `verifyBankAccount`
 * call.
 *
 * **This mutation deliberately takes no account arguments** (M-1). It used to
 * accept `accountNumber`/`bankCode`/`accountName` straight from the client and
 * write them with `bankVerified: true` — the resolve round-trip happened in a
 * separate call whose result was never bound to this one, so any crafted
 * client call could stamp an unverified account as verified, with a name it
 * chose itself. Now the only inputs are read from `bankPendingVerification`,
 * which is written by the server-side action after Paystack answers.
 *
 * Returns the same masked view the UI renders, so the success step can name
 * the account it just stored.
 */
export const confirmBankAccount = mutation({
  args: {},
  handler: async (ctx): Promise<SavedBankView> => {
    const user = await requireUser(ctx);

    // Checked before the pending record so a second save reports the real
    // reason (one-shot policy) rather than "verification expired".
    if (user.bankVerified) {
      throw new Error(
        "Your bank details are already saved and cannot be changed here. " +
          "Request a change from your Earnings page, or email " +
          `${supportEmail()} from the address on your account.`,
      );
    }

    const pending = user.bankPendingVerification;
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error(
        "That verification has expired — enter the account again to verify and save it.",
      );
    }

    const accountNumber = await decryptAccountNumber(pending.accountNumberEncrypted);
    const saved: SavedBankView = await ctx.runMutation(
      internal.instructorBank.persistVerifiedAccount,
      {
        accountNumber,
        bankCode: pending.bankCode,
        accountName: pending.accountName,
      },
    );

    // One-shot: the record is spent the moment it is used, so a replay of this
    // mutation (a retried request, a second tab) has nothing left to commit.
    await ctx.db.patch(user._id, { bankPendingVerification: undefined });

    // Server-authored values throughout — the email cannot be steered by what
    // the client sent. The recipient comes from the stored user rather than
    // from `ctx.auth`, because a function scheduled with `runAfter` runs
    // without the caller's auth context.
    await ctx.scheduler.runAfter(0, internal.bankVerification.sendBankConfirmationEmail, {
      accountName: pending.accountName,
      accountNumberMasked: saved.accountNumberMasked,
      recipientEmail: user.email,
      recipientName: user.name,
    });
    return saved;
  },
});

/**
 * Request a payout account change. Instructors can trigger this when their
 * verified account needs updating; changes are handled through support, not
 * self-service, per the one-shot verification policy.
 */
export const requestBankChange = mutation({
  args: {
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Only staff (instructors/admins) who have bank details can request a change.
    if (!isStaff(user)) {
      throw new Error("Only instructors and admins can request payout account changes");
    }

    if (!user.bankVerified) {
      throw new Error("You need a verified payout account first");
    }

    const reason = args.reason.trim();
    if (reason.length < 10) {
      throw new Error("Please provide a bit more detail about what needs to change");
    }
    if (reason.length > 1000) {
      throw new Error("Reason must be 1000 characters or less");
    }

    // Rate limit change requests to prevent abuse.
    await requireRateLimit(ctx, `bankChangeRequest:${user._id}`, 3, 24 * 60 * 60 * 1000);

    await logAudit(ctx, {
      actorId: user._id,
      action: "user.request_bank_change",
      targetType: "user",
      targetId: user._id,
      details: {
        reasonPreview: reason.slice(0, 200),
      },
    });

    // Create an in-app confirmation for the requester.
    await createNotification(ctx, {
      userId: user._id,
      type: "bank_change_requested",
      title: "Bank change request submitted",
      body: "Support will review your request and get back to you soon.",
      href: "/dashboard/instructor/earnings#payout-account",
    });

    // Gather masked bank info if available for context.
    let bankInfo: {
      accountName?: string;
      bankCode?: string;
      accountNumberMasked?: string;
    } | undefined;

    if (user.bankAccountEncrypted) {
      try {
        const masked = maskAccountNumber(
          await decryptAccountNumber(user.bankAccountEncrypted),
        );
        bankInfo = {
          accountName: user.bankAccountName ?? undefined,
          bankCode: user.bankCode ?? undefined,
          accountNumberMasked: masked,
        };
      } catch {
        bankInfo = {
          accountName: user.bankAccountName ?? undefined,
          bankCode: user.bankCode ?? undefined,
        };
      }
    }

    const identity = await ctx.auth.getUserIdentity();

    await ctx.scheduler.runAfter(0, internal.bankVerification.sendBankChangeRequestEmail, {
      reason,
      userId: user._id,
      userName: user.name ?? identity?.name ?? undefined,
      userEmail: user.email ?? identity?.email ?? undefined,
      bankInfo,
    });

    return { success: true };
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
