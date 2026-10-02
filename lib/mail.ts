import nodemailer, { type Transporter } from "nodemailer";

/**
 * Shared SMTP transport. Previously inlined in the instructor-application API
 * route; certificate issuance needs the same transport, and duplicating env
 * handling in two places invites drift.
 */

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let cached: Transporter | null = null;

export function getTransporter(): Transporter {
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

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const user = process.env.SMTP_USER;
  const transporter = getTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    ...options,
  });
}

/** Card wrapper so learner-facing mail matches the rest of the product. */
export function emailShell(inner: string): string {
  return (
    `<div style="background:#F7F5F8;padding:24px 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1F1B1D;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E8E3E9;border-radius:16px;">` +
    `<tr><td style="padding:28px 32px 8px;">` +
    `<span style="font-size:18px;font-weight:700;color:#945DA3;">Glypha Learn</span>` +
    `</td></tr>` +
    `<tr><td style="padding:8px 32px 32px;line-height:1.6;font-size:15px;">${inner}</td></tr>` +
    `<tr><td style="padding:0 32px 28px;font-size:12px;color:#6B6570;border-top:1px solid #F0EDF2;">` +
    `You are receiving this because you completed a course on Glypha Learn.` +
    `</td></tr>` +
    `</table></td></tr></table></div>`
  );
}

export function button(label: string, href: string): string {
  return (
    `<a href="${escapeHtml(href)}" style="display:inline-block;background:#945DA3;color:#FFFFFF;` +
    `text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px;">` +
    `${escapeHtml(label)}</a>`
  );
}