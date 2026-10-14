/**
 * Sender identities, grouped by what the email is about.
 *
 * One shared address for everything makes it impossible for a learner to tell a
 * receipt from a nudge, and impossible to point a filter or an SPF record at the
 * right place. Each group below is a subaddress of the platform domain, so
 * replies land where a human actually reads them.
 *
 * Configured one variable per group, `MAIL_FROM_<GROUP>`:
 *
 *   MAIL_FROM_ACCOUNT="Glypha Learn <noreply@glypha.com.ng>"
 *   MAIL_FROM_COURSES="Glypha Learn <courses@glypha.com.ng>"
 *
 * Any group left unset falls back to `RESEND_FROM`, then `SMTP_FROM`, so a
 * deployment that sets one global address keeps working unchanged.
 */

export const MAIL_SENDER_GROUPS = [
  "account",
  "courses",
  "billing",
  "certificates",
  "notifications",
  "instructors",
  "updates",
] as const;

export type MailSenderGroup = (typeof MAIL_SENDER_GROUPS)[number];

/** What each address is for, and what a reply to it should reach. */
export const MAIL_SENDER_GROUP_PURPOSE: Record<MailSenderGroup, string> = {
  account:
    "Signups, sign-ins, profile and security notices. Nothing here is a nudge.",
  courses:
    "Enrollments, lesson progress, and the reminder drip for unfinished courses.",
  billing:
    "Payment receipts, refunds, referral credits and instructor payouts.",
  certificates: "Certificate issuance, verification links and reissue notices.",
  notifications:
    "Per-event alerts worth an immediate email: discussion replies, direct messages, graded work.",
  instructors:
    "Instructor applications, review outcomes, and getting an instructor set up for payouts.",
  updates:
    "Platform announcements, new course roundups and product news. The only group that is broadcast.",
};

export function envVarForGroup(group: MailSenderGroup): string {
  return `MAIL_FROM_${group.toUpperCase()}`;
}

/**
 * The From value for a group, or null when nothing is configured anywhere.
 *
 * Read at call time, never cached: the certificate action reads this from
 * Convex's env store and the notify route from `.env.local`, and tests set
 * variables between cases.
 */
export function senderForGroup(group: MailSenderGroup): string | null {
  const candidates = [
    process.env[envVarForGroup(group)],
    process.env.RESEND_FROM,
    process.env.SMTP_FROM,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }

  return null;
}

/**
 * The From value for a group, or throws.
 *
 * `senderForGroup` returns null when nothing is configured, which is the right
 * answer for a predicate like `isResendConfigured`. This is for a send that is
 * about to happen: a missing address is a bug in the deployment, and the error
 * says which group to fix rather than silently sending from nowhere.
 */
export function requireSenderForGroup(group: MailSenderGroup): string {
  const from = senderForGroup(group);
  if (!from) {
    throw new Error(
      `No From address is configured for the "${group}" group. Set ${envVarForGroup(group)} or RESEND_FROM.`,
    );
  }
  return from;
}

/** Every group's resolved address, for a diagnostics view. */
export function configuredSenders(): Record<MailSenderGroup, string | null> {
  const out = {} as Record<MailSenderGroup, string | null>;
  for (const group of MAIL_SENDER_GROUPS) {
    out[group] = senderForGroup(group);
  }
  return out;
}