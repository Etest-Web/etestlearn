"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendMail, siteUrl } from "../lib/mail";
import { renderEmail } from "../lib/emails/templates";
import { supportEmail } from "../lib/support";

/**
 * Paystack account resolution for instructor payouts.
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
 *   3. `persistVerifiedAccount` (internal mutation) writes the encrypted
 *      account, the audit row and the notification in one transaction.
 *
 * The client therefore cannot store an unverified account: it can only ask
 * "verify this pair", and every database effect is server-authored.
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

export const verifyAndSaveBankAccount = action({
  args: {
    accountNumber: v.string(),
    bankCode: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ accountName: string; accountNumberMasked: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Trim here as well as in the mutation: the regex is the contract with
    // Paystack, and a stray space should fail fast, not after a round trip.
    const accountNumber = args.accountNumber.trim();
    const bankCode = args.bankCode.trim();
    if (!ACCOUNT_NUMBER.test(accountNumber)) {
      throw new Error("Account number must be exactly 10 digits");
    }
    if (!BANK_CODE.test(bankCode)) {
      throw new Error("Invalid bank code");
    }

    // Burns quota before the network call — see the module comment.
    await ctx.runMutation(internal.instructorBank.consumeVerifyAttempt, {});

    const url = new URL(`${PAYSTACK_BASE}/bank/resolve`);
    url.searchParams.set("account_number", accountNumber);
    url.searchParams.set("bank_code", bankCode);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${secretKey()}` },
    });

    // Paystack answers 404 for an account it cannot resolve, and the body
    // carries the human-readable reason — read it rather than inventing a
    // message, so "account does not exist" reaches the instructor verbatim.
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

    const saved = await ctx.runMutation(
      internal.instructorBank.persistVerifiedAccount,
      { accountNumber, bankCode, accountName },
    );

    // Confirmation email, best-effort: the save is already committed, so a
    // mail failure must not surface as a failed save. Same posture as
    // `certificateArtifacts.ts` — log and move on.
    await sendBankConfirmationEmail({
      to: identity.email,
      name: identity.givenName ?? identity.nickname ?? "",
      accountName,
      accountNumberMasked: saved.accountNumberMasked,
    });

    return {
      accountName,
      accountNumberMasked: saved.accountNumberMasked,
    };
  },
});

async function sendBankConfirmationEmail(args: {
  to: string | undefined;
  name: string;
  accountName: string;
  accountNumberMasked: string;
}): Promise<void> {
  if (!args.to) return;

  // Rendered from the shared template rather than hand-built here, so the
  // payout notice looks like every other email and its copy stays in one place.
  const email = renderEmail("payoutAccountConfirmed", {
    name: args.name,
    accountName: args.accountName,
    accountNumberMasked: args.accountNumberMasked,
    supportEmail: supportEmail(),
    dashboardUrl: `${siteUrl()}/dashboard/instructor/bank`,
  });

  await sendMail({
    group: "instructors",
    to: args.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}
