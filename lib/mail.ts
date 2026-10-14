import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import {
  envVarForGroup,
  MAIL_SENDER_GROUPS,
  senderForGroup,
  type MailSenderGroup,
} from "./mail-senders";

/**
 * Shared outbound mail transport. Previously inlined in the instructor-
 * application API route; certificate issuance needs the same transport, and
 * duplicating env handling in two places invites drift.
 *
 * Resend is the preferred provider. SMTP (nodemailer) is kept as a fallback so
 * an environment that has not moved its keys over yet still delivers mail
 * instead of silently dropping it. Both providers satisfy the same
 * `sendMail` contract, so no call site knows which one actually ran.
 */

export type MailProvider = "resend" | "smtp";

/**
 * Resend needs an API key and at least one usable From address. A per-group
 * address counts, so a deployment that sets `MAIL_FROM_COURSES` but no global
 * `RESEND_FROM` is still configured.
 */
export function isResendConfigured(): boolean {
  if (!process.env.RESEND_API_KEY) return false;
  return MAIL_SENDER_GROUPS.some((group) => senderForGroup(group) !== null);
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

/**
 * True when at least one provider can actually deliver. Call sites gate on this
 * before doing the work of building a message.
 */
export function isMailConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
}

/** Which provider would handle the next send, or null if none can. */
export function activeMailProvider(): MailProvider | null {
  if (isResendConfigured()) return "resend";
  if (isSmtpConfigured()) return "smtp";
  return null;
}

let cachedResend: Resend | null = null;

function getResend(): Resend {
  if (cachedResend) return cachedResend;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY.");
  }

  cachedResend = new Resend(apiKey);
  return cachedResend;
}

let cached: Transporter | null = null;

function getTransporter(): Transporter {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.",
    );
  }

  const port = Number(process.env.SMTP_PORT ?? "587");

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return cached;
}

/** Public origin used to build links in emails. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type SendMailOptions = {
  /** Which sender identity this email is sent as. See `lib/mail-senders.ts`. */
  group: MailSenderGroup;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

export async function sendMail(options: SendMailOptions): Promise<void> {
  const provider = activeMailProvider();

  if (provider === "resend") return sendViaResend(options);
  if (provider === "smtp") {
    // A half-set-up Resend key is worth a warning: mail still goes out, but
    // from the SMTP identity the operator may not expect.
    if (process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is set but RESEND_FROM is missing or empty — falling back to SMTP.",
      );
    }
    return sendViaSmtp(options);
  }

  throw new Error(
    "No mail provider is configured. Set RESEND_API_KEY and RESEND_FROM, or SMTP_HOST, SMTP_USER and SMTP_PASS.",
  );
}

async function sendViaResend(options: SendMailOptions): Promise<void> {
  const from = senderForGroup(options.group);
  if (!from) {
    throw new Error(
      `No From address is configured for the "${options.group}" group. Set ${envVarForGroup(options.group)} or RESEND_FROM.`,
    );
  }

  const { error } = await getResend().emails.send({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });

  // Resend reports API failures in the response body and still resolves, so an
  // unchecked call would look like a successful send to every caller.
  if (error) {
    throw new Error(
      `Resend rejected the message: ${error.message}${
        error.name ? ` (${error.name})` : ""
      }`,
    );
  }
}

async function sendViaSmtp(options: SendMailOptions): Promise<void> {
  const from = senderForGroup(options.group) ?? process.env.SMTP_USER;
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });
}
