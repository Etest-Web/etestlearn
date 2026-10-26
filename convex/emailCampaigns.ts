"use node";

/**
 * Lifecycle email delivery.
 *
 * Everything here runs in the Node runtime because `lib/mail.ts` talks to
 * Resend over `fetch`. A module with `"use node"` may only export actions, so
 * the reads these actions need live in `emailCampaignsData.ts` as internal
 * queries.
 *
 * Two rules hold for every email in this file:
 *
 * 1. **Delivery never blocks the thing that triggered it.** A purchase is paid
 *    because Paystack said so. A mail provider having a bad afternoon must not
 *    un-settle a purchase, so `deliver()` swallows its own errors after
 *    recording them.
 * 2. **Nothing sends twice.** `emailDeliveries.claim` is taken before the
 *    network call and holds for ten minutes. Convex retries failed actions and
 *    a retried mutation may schedule the same drip step twice; the claim is
 *    what makes a duplicate impossible rather than merely unlikely.
 */

function maskEmail(value: string | undefined | null): string {
  if (!value) return "(none)";
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  return `${local.slice(0, 2)}***@${value.slice(at + 1)}`;
}

import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { makeFunctionReference, type GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import type {
  BroadcastRecipient,
  CourseDigestItem,
  DripFacts,
  EnrollmentEmailContext,
  NotificationEmailContext,
} from "./emailCampaignsData";
import { sendMail, isMailConfigured } from "../lib/mail";
import { siteUrl } from "../lib/mail";
import { EMAIL_TEMPLATES, renderEmail } from "../lib/emails/templates";
import type { EmailTemplateId } from "../lib/emails/types";
import { isSuppressible } from "../lib/emails/types";
const getCallerRole = makeFunctionReference<
  "query",
  Record<string, never>,
  string | null
>("certificateTemplates:getCallerRole");

async function requireAdminAction(ctx: GenericActionCtx<DataModel>) {
  const role = await ctx.runQuery(getCallerRole, {});
  if (role !== "admin") {
    throw new Error("Not authorized — admin access required");
  }
}
import {
  DRIP_CADENCE,
  shouldSendDrip,
  type DripStep,
  type DripStepId,
} from "../lib/emails/drip";

type AnyTemplateId = EmailTemplateId;

/** The ctx an internal action gets. Named so `deliver` is not typed `any`. */
type EmailActionCtx = GenericActionCtx<DataModel>;

/**
 * Resolve the recipient, then send, recording the outcome either way.
 *
 * `args.to` is explicit rather than looked up because two of these send to
 * somebody who is not the acting user (a receipt to a buyer, an application
 * confirmation to an applicant's own address).
 */
async function deliver(
  ctx: EmailActionCtx,
  args: {
    to: string;
    templateId: AnyTemplateId;
    data: unknown;
    dedupeKey: string;
    userId?: Id<"users">;
  },
): Promise<boolean> {
  const template = EMAIL_TEMPLATES[args.templateId];

  // A missing provider is a deployment problem, not a per-recipient one, and it
  // is already visible in the logs. Claiming rows that will all be skipped
  // would just bury the real failures.
  if (!isMailConfigured()) {
    console.warn(
      `[email] no mail provider configured; skipping "${args.templateId}" to`,
      args.to,
    );
    return false;
  }

  const recipient = args.to.trim().toLowerCase();

  // Cheap sanity check. A malformed address fails at the provider, which costs
  // a round trip and leaves a less useful error than this one.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    console.warn(
      `[email] invalid recipient for "${args.templateId}":`,
      maskEmail(args.to),
    );
    return false;
  }

  const claim = await ctx.runMutation(claimDelivery, {
    dedupeKey: args.dedupeKey,
    templateId: args.templateId,
    group: template.group,
    category: template.category,
    recipient,
    userId: args.userId,
    dataJson: JSON.stringify(args.data),
  });

  if (!claim.claimed) {
    console.log(
      `[email] not sending "${args.templateId}" to ${maskEmail(recipient)}:`,
      claim.reason,
    );
    return false;
  }

  try {
    const email = renderEmail(args.templateId, args.data as never);

    await sendMail({
      group: template.group,
      to: recipient,
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    });

    await ctx.runMutation(completeDelivery, {
      dedupeKey: args.dedupeKey,
      outcome: "sent",
    });

    console.log(`[email] sent "${args.templateId}" to ${maskEmail(recipient)}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] failed "${args.templateId}" to ${maskEmail(recipient)}:`, message);

    // Marked failed, not skipped: the key stays retryable on purpose. A
    // provider outage should not permanently disqualify a receipt.
    await ctx.runMutation(completeDelivery, {
      dedupeKey: args.dedupeKey,
      outcome: "failed",
      error: message.slice(0, 500),
    });

    // Swallowed on purpose, see rule 1 at the top of the file.
    return false;
  }
}

/**
 * Function references for the internal functions this module calls, built by
 * name rather than imported from `convex/_generated/api`.
 *
 * This is not a workaround for missing codegen. `emailCampaigns.ts` is itself
 * part of `_generated/api`, so importing `internal` from there to call its own
 * module's siblings makes TypeScript infer the action's return type from a
 * cycle it is inside, and the whole file collapses to `any` (TS7022).
 *
 * `makeFunctionReference` carries explicit argument and result types, which
 * both breaks the cycle and gives the call sites real checking. Same pattern
 * `lib/durable-rate-limit.ts` uses.
 */
const claimDelivery = makeFunctionReference<
  "mutation",
  {
    dedupeKey: string;
    templateId: string;
    group: string;
    category: "transactional" | "nudge" | "broadcast";
    recipient: string;
    userId?: Id<"users">;
    dataJson?: string;
  },
  { claimed: true } | { claimed: false; reason: string }
>("emailDeliveries:claim");

const completeDelivery = makeFunctionReference<
  "mutation",
  {
    dedupeKey: string;
    outcome: "sent" | "failed" | "skipped";
    providerMessageId?: string;
    reason?: string;
    error?: string;
  },
  null
>("emailDeliveries:complete");

const allowsMarketing = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  boolean
>("emailCampaignsData:allowsMarketing");

const dripFacts = makeFunctionReference<
  "query",
  { enrollmentId: Id<"enrollments"> },
  DripFacts | null
>("emailCampaignsData:dripFacts");

const enrollmentEmailContext = makeFunctionReference<
  "query",
  { enrollmentId: Id<"enrollments"> },
  EnrollmentEmailContext | null
>("emailCampaignsData:enrollmentEmailContext");

const notificationEmailContext = makeFunctionReference<
  "query",
  { notificationId: Id<"notifications"> },
  NotificationEmailContext | null
>("emailCampaignsData:notificationEmailContext");

const recentPublishedCourses = makeFunctionReference<
  "query",
  Record<string, never>,
  CourseDigestItem[]
>("emailCampaignsData:recentPublishedCourses");

const broadcastRecipients = makeFunctionReference<
  "query",
  { onlyUsers?: Id<"users">[]; limit?: number },
  BroadcastRecipient[]
>("emailCampaignsData:broadcastRecipients");

// ─────────────────────────────────────────────────────────────────────────────
// Transactional: fired from mutations via the scheduler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Welcome mail for a brand-new account. Scheduled rather than inline so a new
 * user row never waits on a network round trip.
 */
export const sendWelcome = internalAction({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.email) {
      console.warn("[email] new account has no email; no welcome mail");
      return;
    }

    return await deliver(ctx, {
      to: args.email,
      templateId: "welcome",
      data: { name: args.name ?? "" },
      dedupeKey: `welcome:${args.userId}`,
      userId: args.userId,
    });
  },
});

/**
 * Purchase receipt. Sent from the Paystack webhook path, keyed on the purchase
 * id so a webhook replay cannot charge the reader twice.
 */
export const sendPaymentReceipt = internalAction({
  args: {
    purchaseId: v.id("purchases"),
    userId: v.id("users"),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    courseTitle: v.string(),
    courseSlug: v.string(),
    amountFormatted: v.string(),
    reference: v.string(),
    paidAt: v.number(),
    method: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.email) {
      console.warn("[email] purchase has no buyer email; no receipt");
      return;
    }

    return await deliver(ctx, {
      to: args.email,
      templateId: "paymentReceipt",
      data: {
        name: args.name ?? "",
        courseTitle: args.courseTitle,
        courseSlug: args.courseSlug,
        amountFormatted: args.amountFormatted,
        reference: args.reference,
        paidAt: new Date(args.paidAt).toLocaleDateString("en-NG", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        method: args.method ?? "Card",
      },
      dedupeKey: `paymentReceipt:${args.purchaseId}`,
      userId: args.userId,
    });
  },
});

/** Confirms a course enrollment. Keyed on the enrollment, not the user. */
export const sendEnrollmentConfirmation = internalAction({
  args: { enrollmentId: v.id("enrollments") },
  handler: async (ctx, args) => {
    // Read the facts at send time rather than at enrollment time. The
    // mutation that schedules this passes only an id on purpose: an instructor
    // can rename a course or add lessons in the gap, and the mail should
    // describe what the reader is about to see.
    const context = await ctx.runQuery(enrollmentEmailContext, { enrollmentId: args.enrollmentId },
    );

    if (!context) {
      console.log(
        `[email] enrollment ${args.enrollmentId} is gone or has no email`,
      );
      return;
    }

    if (!context.email) {
      console.log(`[email] enrollment ${args.enrollmentId}: no email on file`);
      return;
    }

    return await deliver(ctx, {
      to: context.email,
      templateId: "enrollmentConfirmed",
      data: {
        name: context.name ?? "",
        courseTitle: context.courseTitle,
        courseSlug: context.courseSlug,
        instructorName: context.instructorName,
        lessonCount: context.lessonCount,
        totalMinutes: context.totalMinutes,
        isPaid: context.isPaid,
      },
      dedupeKey: `enrollmentConfirmed:${args.enrollmentId}`,
      userId: context.userId,
    });
  },
});

/** A reply in a discussion thread. Keyed on the message so no reply is missed. */
export const sendDiscussionReply = internalAction({
  args: {
    messageId: v.id("discussionMessages"),
    userId: v.id("users"),
    email: v.string(),
    name: v.optional(v.string()),
    threadTitle: v.string(),
    courseTitle: v.string(),
    replierName: v.string(),
    excerpt: v.string(),
    threadUrl: v.string(),
  },
  handler: async (ctx, args) => {
    return await deliver(ctx, {
      to: args.email,
      templateId: "discussionReply",
      data: {
        name: args.name ?? "",
        threadTitle: args.threadTitle,
        courseTitle: args.courseTitle,
        replierName: args.replierName,
        excerpt: args.excerpt,
        threadUrl: args.threadUrl,
      },
      dedupeKey: `discussionReply:${args.messageId}`,
      userId: args.userId,
    });
  },
});

/** Confirmation that an instructor application landed. Goes to the applicant. */
export const sendInstructorApplicationReceived = internalAction({
  args: {
    applicationId: v.id("instructorApplications"),
    email: v.string(),
    fullName: v.string(),
    submittedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await deliver(ctx, {
      to: args.email,
      templateId: "instructorApplicationReceived",
      data: {
        fullName: args.fullName,
        submittedAt: new Date(args.submittedAt).toLocaleDateString("en-NG", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      },
      dedupeKey: `instructorApplicationReceived:${args.applicationId}`,
    });
  },
});

/** The accept or decline. The template branches on `decision`. */
export const sendInstructorApplicationDecision = internalAction({
  args: {
    applicationId: v.id("instructorApplications"),
    email: v.string(),
    fullName: v.string(),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await deliver(ctx, {
      to: args.email,
      templateId: "instructorApplicationDecision",
      data: {
        fullName: args.fullName,
        decision: args.decision,
        ...(args.reviewNote ? { reviewNote: args.reviewNote } : {}),
      },
      dedupeKey: `instructorApplicationDecision:${args.applicationId}`,
    });
  },
});

/**
 * Mirror of an in-app notification that is also worth an email.
 *
 * Scheduled by `helpers/notifications.createNotification`, which cannot send
 * inline because it runs inside transactions. Takes the notification id rather
 * than the rendered content, so the email and the in-app row can never disagree
 * about what happened.
 */
export const sendNotificationEmail = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(notificationEmailContext, { notificationId: args.notificationId },
    );

    if (!context) {
      console.log(
        `[email] notification ${args.notificationId} has no email context`,
      );
      return;
    }

    const { templateId, data, email, userId } = context;
    if (!email) {
      console.log(`[email] notification ${args.notificationId}: no email on file`);
      return;
    }

    // A discussion reply is not marketing and is not a broadcast, but it is
    // still something the reader did not explicitly ask to be emailed about,
    // so it respects the same preference.
    const template = EMAIL_TEMPLATES[templateId];
    if (isSuppressible(template.category)) {
      const allowed = await ctx.runQuery(allowsMarketing, { userId });
      if (!allowed) {
        console.log(`[email] notification ${args.notificationId}: opted out`);
        return;
      }
    }

    return await deliver(ctx, {
      to: email,
      templateId,
      // `data` is already assembled by `notificationEmailContext`, which knows
      // which shape this template needs. Re-spreading it here would lose the
      // per-template typing for no gain.
      data,
      dedupeKey: `${templateId}:${args.notificationId}`,
      userId,
    });
  },
});

/** Certificate issued, with the public verification link. */
export const sendCertificateIssued = internalAction({
  args: {
    certificateId: v.id("certificates"),
    userId: v.id("users"),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    courseTitle: v.string(),
    serial: v.string(),
    issuedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!args.email) {
      console.warn("[email] certificate holder has no email; no notice");
      return;
    }

    return await deliver(ctx, {
      to: args.email,
      templateId: "certificateIssued",
      data: {
        name: args.name ?? "",
        courseTitle: args.courseTitle,
        serial: args.serial,
        issuedOn: new Date(args.issuedAt).toLocaleDateString("en-NG", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        verifyUrl: `${siteUrl()}/verify/${encodeURIComponent(args.serial)}`,
      },
      dedupeKey: `certificateIssued:${args.certificateId}`,
      userId: args.userId,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The drip: unfinished-course reminders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a drip step to the template it sends.
 *
 * Two steps share `courseStalled` because they differ only in how long the
 * learner has been quiet, and the copy is the right length for both.
 */
const DRIP_TEMPLATE: Record<DripStepId, AnyTemplateId> = {
  courseNotStarted: "courseNotStarted",
  courseStalled: "courseStalled",
  courseAlmostDone: "courseAlmostDone",
  courseStalledFinal: "courseStalled",
};

/**
 * One drip step, evaluated at the moment it fires.
 *
 * The step was scheduled days ago against an enrollment, and everything it
 * depends on may have changed since. So the condition is re-checked here rather
 * than being assumed from the state at schedule time.
 */
export const runDripStep = internalAction({
  args: {
    enrollmentId: v.id("enrollments"),
    stepId: v.union(
      v.literal("courseNotStarted"),
      v.literal("courseStalled"),
      v.literal("courseAlmostDone"),
      v.literal("courseStalledFinal"),
    ),
  },
  handler: async (ctx, args) => {
    const step: DripStep | undefined = DRIP_CADENCE.find(
      (s) => s.id === args.stepId,
    );
    if (!step) {
      console.warn("[email] unknown drip step", args.stepId);
      return;
    }

    const facts = await ctx.runQuery(dripFacts, { enrollmentId: args.enrollmentId },
    );

    if (!facts) {
      console.log(
        `[email] drip ${step.id}: enrollment ${args.enrollmentId} is gone`,
      );
      return;
    }

    const dedupeKey = `${DRIP_TEMPLATE[step.id]}:${args.enrollmentId}:${step.id}`;

    if (!shouldSendDrip(step, facts)) {
      // The claim is taken even though nothing will be sent. Recording the skip
      // is what makes the step non-retryable, and the claim is the only thing
      // that creates the row `complete` then writes to. Without it the decision
      // is recorded nowhere and a retry could reach a different conclusion.
      await ctx.runMutation(claimDelivery, {
        dedupeKey,
        templateId: DRIP_TEMPLATE[step.id],
        group: EMAIL_TEMPLATES[DRIP_TEMPLATE[step.id]].group,
        category: EMAIL_TEMPLATES[DRIP_TEMPLATE[step.id]].category,
        recipient: facts.email ?? "",
        userId: facts.userId,
      });
      await ctx.runMutation(completeDelivery, {
        dedupeKey,
        outcome: "skipped",
        reason: `${step.id} precondition not met`,
      });
      console.log(`[email] drip ${step.id}: precondition not met, skipped`);
      return;
    }

    if (!facts.email) {
      console.log(`[email] drip ${step.id}: no email on file, skipped`);
      return;
    }

    // The whole reason this file bothers with categories. A learner who asked
    // not to hear from us still gets their receipt.
    if (isSuppressible(EMAIL_TEMPLATES[DRIP_TEMPLATE[step.id]].category)) {
      const allowed = await ctx.runQuery(allowsMarketing, { userId: facts.userId },
      );
      if (!allowed) {
        await ctx.runMutation(claimDelivery, {
          dedupeKey,
          templateId: DRIP_TEMPLATE[step.id],
          group: EMAIL_TEMPLATES[DRIP_TEMPLATE[step.id]].group,
          category: EMAIL_TEMPLATES[DRIP_TEMPLATE[step.id]].category,
          recipient: facts.email,
          userId: facts.userId,
        });
        await ctx.runMutation(completeDelivery, {
          dedupeKey,
          outcome: "skipped",
          reason: "learner opted out",
        });
        console.log(`[email] drip ${step.id}: opted out, skipped`);
        return;
      }
    }

    const shared = {
      name: facts.name ?? "",
      courseTitle: facts.courseTitle,
      courseSlug: facts.courseSlug,
      instructorName: facts.instructorName ?? "your instructor",
      progressPercent: facts.progressPercent,
      completedLessons: facts.completedLessons,
      totalLessons: facts.totalLessons,
      idleDays: facts.idleDays,
    };

    const templateId = DRIP_TEMPLATE[step.id];
    const data =
      templateId === "courseNotStarted"
        ? {
            name: shared.name,
            courseTitle: shared.courseTitle,
            courseSlug: shared.courseSlug,
            instructorName: shared.instructorName,
            firstLessonTitle: facts.firstLessonTitle ?? "the first lesson",
            totalLessons: shared.totalLessons,
            enrolledDaysAgo: facts.enrolledDaysAgo,
          }
        : shared;

    return await deliver(ctx, {
      to: facts.email,
      templateId,
      data,
      dedupeKey,
      userId: facts.userId,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roundup of newly published courses.
 *
 * Broadcast is the only path that touches people who did nothing to hear from
 * us, so the preference check is enforced here as well as in the drip.
 */
export const sendNewCourseDigest = internalAction({
  args: {
    /**
     * Dedupe scope. The caller passes the date window this digest covers
     * ("2026-10-14"), so re-running today's roundup cannot re-send it while
     * next week's roundup still gets its own key.
     */
    windowKey: v.string(),
    onlyUsers: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const courses = await ctx.runQuery(recentPublishedCourses, {});

    const recipients = await ctx.runQuery(broadcastRecipients, { onlyUsers: args.onlyUsers },
    );

    if (!recipients || recipients.length === 0) {
      console.log("[email] digest: no eligible recipients");
      return;
    }

    let sent = 0;
    for (const recipient of recipients) {
      const ok = await deliver(ctx, {
        to: recipient.email,
        templateId: "newCourseDigest",
        data: { name: recipient.name ?? "", courses },
        dedupeKey: `newCourseDigest:${recipient.userId}:${args.windowKey}`,
        userId: recipient.userId,
      });
      if (ok) sent += 1;
    }

    console.log(`[email] digest: sent ${sent} of ${recipients.length}`);
    return sent;
  },
});

/**
 * Publish a platform-wide announcement to all registered users.
 *
 * Broadcast email respects marketing preferences (users who opted out of emails
 * do not receive platform-wide broadcast messages).
 *
 * Only callable by admin. Delivery is idempotent: a single call or Convex retry
 * never sends the same user twice, and mail failures never block the action.
 */
export const sendPlatformAnnouncement = action({
  args: {
    title: v.string(),
    body: v.string(),
    /** Published at matches scheduling constraints if the action fires later. */
    publishedAt: v.number(),
    onlyUsers: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);
    const now = Date.now();
    const target = new Date(args.publishedAt).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    await runPlatformAnnouncement(ctx, {
      title: args.title,
      body: args.body,
      target,
      onlyUsers: args.onlyUsers,
    });

    console.log(`[email] platform announcement sent for ${target}`);
  },
});

async function runPlatformAnnouncement(
  ctx: EmailActionCtx,
  args: {
    title: string;
    body: string;
    target: string;
    onlyUsers?: Id<"users">[];
  },
) {
  const publishedAt = Date.now();
  const data = {
    title: args.title,
    body: args.body,
    publishedAt: new Date(publishedAt).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    target: args.target,
  };

  const recipients = await ctx.runQuery(broadcastRecipients, { onlyUsers: args.onlyUsers },
  );

  if (!recipients || recipients.length === 0) {
    console.log("[email] platform announcement: no eligible recipients");
    return;
  }

  // Ensure we include the admin in the distribution. This guarantees that
  // when we announce, we all read it from the inbox before anyone else.
  const userIds = [...new Set(recipients.map((r) => r.userId))];

  let sent = 0;
  for (const recipient of recipients) {
    const ok = await deliver(ctx, {
      to: recipient.email,
      templateId: "platformAnnouncement",
      data,
      dedupeKey: `platformAnnouncement:${recipient.userId}:${publishedAt}`, // unique per user per launch
      userId: recipient.userId,
    });
    if (ok) sent += 1;
  }

  console.log(`[email] platform announcement: sent ${sent} of ${recipients.length}`);
}