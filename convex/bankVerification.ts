"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  sendMail,
  siteUrl,
  isMailConfigured,
  escapeHtml,
} from "../lib/mail";
import { renderEmail } from "../lib/emails/templates";
import {
  emailKeyValueRows,
  emailLayout,
  emailParagraph,
} from "../lib/emails/layout";
import { supportEmail } from "../lib/support";

/**
 * Paystack account resolution for staff payout accounts.
 *
 * "use node" because the default Convex runtime has no outbound `fetch` —
 * same reason `paystack.ts` (checkout) and `certificateArtifacts.ts` (PDF +
 * email) are node modules. The flow is deliberately split:
 *
 *   1. `consumeVerifyAttempt` (internal mutation) burns rate-limit quota
 *      *before* any network call, so a hammering client never reaches
 *      Paystack, and so a failed lookup still costs quota.
 *   2. This action calls Paystack's resolve endpoint with the secret key,
 *      which stays server-side.
 *   3. The result is staged on the caller's row by
 *      `storePendingVerification` — encrypted, expiring in 15 minutes.
 *   4. `confirmBankAccount` (a public mutation taking **no** account
 *      arguments) consumes that record and calls `persistVerifiedAccount`,
 *      which writes the encrypted account, the audit row and the notification
 *      in one transaction.
 *
 * The client therefore cannot store an unverified account: it can only ask
 * "verify this pair" and then "commit what you verified", and every database
 * effect is server-authored (M-1).
 */

const PAYSTACK_BASE = "https://api.paystack.co";

/** Ten digits, as Nigerian account numbers are. Mirrors the mutation check. */
const ACCOUNT_NUMBER = /^\d{10}$/;
/** Paystack bank codes are 3–5 digits today; 6 leaves headroom. */
const BANK_CODE = /^\d{3,6}$/;

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not set. Add it with: npx convex env set PAYSTACK_SECRET_KEY sk_test_...",
    );
  }
  return key;
}

/**
 * Verify-only step: resolves the account name via Paystack and stages it for
 * `confirmBankAccount` to commit — it does **not** save anything itself.
 * Burns rate-limit quota so a typo loop isn't free.
 */
export const verifyBankAccount = action({
  args: {
    accountNumber: v.string(),
    bankCode: v.string(),
  },
  handler: async (ctx, args): Promise<{ accountName: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const accountNumber = args.accountNumber.trim();
    const bankCode = args.bankCode.trim();
    if (!ACCOUNT_NUMBER.test(accountNumber)) {
      throw new Error("Account number must be exactly 10 digits");
    }
    if (!BANK_CODE.test(bankCode)) {
      throw new Error("Invalid bank code");
    }

    await ctx.runMutation(internal.instructorBank.consumeVerifyAttempt, {});

    const url = new URL(`${PAYSTACK_BASE}/bank/resolve`);
    url.searchParams.set("account_number", accountNumber);
    url.searchParams.set("bank_code", bankCode);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${secretKey()}` },
    });

    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { account_name?: string } | null;
    } | null;

    const accountName = json?.data?.account_name?.trim();
    if (!res.ok || !json?.status || !accountName) {
      throw new Error(
        json?.message ??
          "We could not verify that account. Check the number and bank, then try again.",
      );
    }

    // Stage what Paystack actually returned. This is what the confirm mutation
    // will later commit — the client's copy of these values is display-only
    // (M-1).
    await ctx.runMutation(internal.instructorBank.storePendingVerification, {
      accountNumber,
      bankCode,
      accountName,
    });

    return { accountName };
  },
});

/**
 * Internal action to send the confirmation email, scheduled from the
 * confirmBankAccount mutation. Reads the caller's identity from the
 * scheduled action context.
 */
export const sendBankConfirmationEmail = internalAction({
  args: {
    accountName: v.string(),
    accountNumberMasked: v.string(),
    /**
     * Deliberately explicit rather than read from `ctx.auth`: a function
     * scheduled with `scheduler.runAfter` runs without the caller's auth
     * context, so the old `identity.email` read returned nothing and the
     * confirmation was silently skipped. These come from the user row the
     * mutation already loaded, so they are server-authored either way.
     */
    recipientEmail: v.optional(v.string()),
    recipientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.recipientEmail) return;

    if (!isMailConfigured()) {
      console.warn("No mail provider configured — skipping bank confirmation email");
      return;
    }

    const email = renderEmail("payoutAccountConfirmed", {
      name: args.recipientName ?? "",
      accountName: args.accountName,
      accountNumberMasked: args.accountNumberMasked,
      supportEmail: supportEmail(),
      dashboardUrl: `${siteUrl()}/dashboard/instructor`,
    });

    try {
      await sendMail({
        group: "instructors",
        to: args.recipientEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
    } catch (error) {
      console.error("Failed to send bank confirmation email:", error);
    }
  },
});

/**
 * Internal action to email support about a bank change request from an instructor.
 */
export const sendBankChangeRequestEmail = internalAction({
  args: {
    reason: v.string(),
    userId: v.string(),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    bankInfo: v.optional(
      v.object({
        accountName: v.optional(v.string()),
        bankCode: v.optional(v.string()),
        accountNumberMasked: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (!isMailConfigured()) {
      console.warn("No mail provider configured — skipping bank change request email");
      return;
    }

    const reason = args.reason.trim();
    const fields: Array<[string, string]> = [
      ["User ID", args.userId],
      ["Name", args.userName ?? "(not set)"],
      ["Email", args.userEmail ?? "(not available from identity)"],
    ];

    if (args.bankInfo) {
      if (args.bankInfo.accountName) {
        fields.push(["Current account holder", args.bankInfo.accountName]);
      }
      if (args.bankInfo.bankCode) {
        fields.push(["Current bank code", args.bankInfo.bankCode]);
      }
      if (args.bankInfo.accountNumberMasked) {
        fields.push(["Current account number", args.bankInfo.accountNumberMasked]);
      }
    }

    const bodyHtml =
      emailParagraph(
        "A staff member has requested a payout bank account change. " +
          "Payout accounts are one-shot, so this has to be handled by hand.",
      ) +
      emailKeyValueRows(fields) +
      emailParagraph(`Reason given: ${escapeHtml(reason)}`);

    try {
      await sendMail({
        group: "instructors",
        to: supportEmail(),
        // Replies reach the instructor directly, so support can resolve the
        // change from their inbox without a lookup.
        ...(args.userEmail ? { replyTo: args.userEmail } : {}),
        subject: `Payout account change request: ${args.userName ?? args.userId}`,
        text: [
          "A staff member has requested a payout bank account change.",
          "",
          ...fields.map(([label, value]) => `${label}: ${value}`),
          "",
          `Reason given: ${reason}`,
        ].join("\n"),
        html: emailLayout({
          preheader: `${args.userName ?? args.userId} requested a payout account change`,
          eyebrow: "Payout account change",
          heading: "Payout account change request",
          body: bodyHtml,
          footnote:
            "Payout accounts are one-shot. Verify the request before updating the account.",
        }),
      });
    } catch (error) {
      console.error("Failed to send bank change request email:", error);
    }
  },
});

/**
 * Human-readable naira for an email body.
 *
 * Deliberately not `lib/instructor-earnings.formatNaira`: this runs in a Node
 * action where ICU data is not guaranteed, and the money figure in a "please
 * send this" email must be exactly the number the admin saw in the queue. The
 * grouping regex is deterministic on every runtime.
 */
function formatKoboAsNaira(kobo: number): string {
  const whole = Math.round(kobo / 100);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${grouped}`;
}

/**
 * Internal action to email support about a payout request.
 *
 * The requester gets an in-app confirmation (see `convex/payouts.ts`); this is
 * the *actionable* copy — the one that means a person opens a transfer form —
 * so it goes to the support inbox with the figures already resolved, exactly as
 * the bank-change email does. Nightly payouts still depend on a human, and this
 * email is how that human finds out.
 */
export const sendPayoutRequestEmail = internalAction({
  args: {
    payoutId: v.string(),
    amountKobo: v.number(),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isMailConfigured()) {
      console.warn("No mail provider configured — skipping payout request email");
      return;
    }

    const amount = formatKoboAsNaira(args.amountKobo);
    const fields: Array<[string, string]> = [
      ["Payout request", args.payoutId],
      ["Instructor", args.userName ?? "(not set)"],
      ["Email", args.userEmail ?? "(not available from identity)"],
      ["Amount requested", amount],
    ];
    if (args.note) fields.push(["Note", args.note]);

    const bodyHtml =
      emailParagraph(
        "An instructor has asked to be paid their available balance. " +
          "Payouts are arranged by hand, so someone has to send this.",
      ) +
      emailKeyValueRows(fields);

    try {
      await sendMail({
        group: "instructors",
        to: supportEmail(),
        // Replies reach the instructor directly.
        ...(args.userEmail ? { replyTo: args.userEmail } : {}),
        subject: `Payout request: ${args.userName ?? args.payoutId} — ${amount}`,
        text: [
          "An instructor has asked to be paid their available balance.",
          "",
          ...fields.map(([label, value]) => `${label}: ${value}`),
        ].join("\n"),
        html: emailLayout({
          preheader: `${args.userName ?? args.payoutId} requested a payout of ${amount}`,
          eyebrow: "Payout request",
          heading: "Payout requested",
          body: bodyHtml,
          footnote:
            "Mark the request paid on /dashboard/admin/payouts once the transfer is sent.",
        }),
      });
    } catch (error) {
      console.error("Failed to send payout request email:", error);
    }
  },
});
