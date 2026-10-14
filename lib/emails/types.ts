import type { MailSenderGroup } from "../mail-senders";

/**
 * The contract between the templates, the drip rules and the Convex delivery
 * layer. Every email in the product is named here exactly once, so adding an
 * email is a matter of implementing one entry rather than finding every place
 * that switches on a template name.
 */

/**
 * What kind of email this is, which decides whether the user can turn it off.
 *
 * - `transactional` proves something happened to this person's account. Not
 *   optional, never suppressed.
 * - `nudge` is a reminder the user did not ask for. Respects their marketing
 *   preference and must always carry an unsubscribe link.
 * - `broadcast` goes to many people who did not act. Same preference gate.
 */
export type EmailCategory = "transactional" | "nudge" | "broadcast";

export type EmailTemplateId =
  // account — noreply@
  | "welcome"
  | "securityNotice"
  // courses — courses@
  | "enrollmentConfirmed"
  | "courseNotStarted"
  | "courseStalled"
  | "courseAlmostDone"
  | "courseCompleted"
  | "newCourseDigest"
  // billing — billing@
  | "paymentReceipt"
  | "refundIssued"
  // certificates — certificates@
  | "certificateIssued"
  // notifications — notifications@
  | "discussionReply"
  | "assignmentGraded"
  // instructors — instructors@
  | "instructorApplicationReceived"
  | "instructorApplicationDecision"
  | "payoutAccountConfirmed"
  // updates — updates@
  | "platformAnnouncement";

/** What a template produces. `replyTo` is optional because a receipt has nowhere to reply to. */
export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

/**
 * One email. `subject` is a function rather than a constant because several
 * emails interpolate (a course title, an amount) into the subject line.
 */
export type EmailContent<TData> = {
  group: MailSenderGroup;
  category: EmailCategory;
  subject: (data: TData) => string;
  text: (data: TData) => string;
  html: (data: TData) => string;
};

/** Registry shape. Keyed by id so a missing template is a type error. */
export type EmailRegistry<TData extends Record<EmailTemplateId, unknown>> = {
  [K in EmailTemplateId]: EmailContent<TData[K]>;
};

/** True when the user can opt out of this category. */
export function isSuppressible(category: EmailCategory): boolean {
  return category !== "transactional";
}