import { escapeHtml, siteUrl } from "../mail";
import type { MailSenderGroup } from "../mail-senders";
import {
  emailKeyValueRows,
  emailLayout,
  emailLink,
  emailMuted,
  emailPanel,
  emailParagraph,
  emailProgressBar,
  emailReference,
  emailStrong,
  emailSuccessNote,
} from "./layout";
import type {
  EmailCategory,
  EmailRegistry,
  EmailTemplateId,
  RenderedEmail,
} from "./types";

/**
 * Every email the product sends.
 *
 * Two rules shape this file.
 *
 * **One place per email.** The registry below is the only place an email is
 * named, so adding one is an entry here rather than a new branch somewhere
 * else. The sender group and the category live on the same object as the copy,
 * which means the address a receipt is sent from and whether the recipient can
 * turn it off are decided next to the sentence that explains what it is for.
 *
 * **Copy is part of the code.** These are read by people, not parsers, and the
 * difference between "we're thrilled to have you on board" and "your account is
 * ready" is the difference between mail people read and mail people filter. So:
 * plain sentences, no marketing register, no exclamation marks in anything that
 * reports a fact, and the real numbers (the course title, the amount, the
 * lesson count) rather than a phrase about a journey.
 *
 * Escaping discipline: `emailLayout` escapes the heading, preheader, eyebrow,
 * footnote and address, but it takes `body` as trusted HTML. So every value out
 * of `EmailData` is escaped at the point of interpolation, and never escaped
 * twice: escape the raw value, then build on it with the helpers in
 * `layout.ts`, which escape only the arguments they are given.
 */

/** What each template needs in order to say something true. */
export type EmailData = {
  welcome: { name: string };
  securityNotice: {
    name: string;
    event: string;
    when: string;
    ipAddress?: string;
    device?: string;
  };
  enrollmentConfirmed: {
    name: string;
    courseTitle: string;
    courseSlug: string;
    instructorName: string;
    lessonCount: number;
    totalMinutes: number;
    isPaid: boolean;
  };
  courseNotStarted: {
    name: string;
    courseTitle: string;
    courseSlug: string;
    instructorName: string;
    firstLessonTitle: string;
    totalLessons: number;
    enrolledDaysAgo: number;
  };
  courseStalled: {
    name: string;
    courseTitle: string;
    courseSlug: string;
    instructorName: string;
    progressPercent: number;
    completedLessons: number;
    totalLessons: number;
    idleDays: number;
  };
  courseAlmostDone: {
    name: string;
    courseTitle: string;
    courseSlug: string;
    progressPercent: number;
    completedLessons: number;
    totalLessons: number;
    idleDays: number;
  };
  courseCompleted: {
    name: string;
    courseTitle: string;
    courseSlug: string;
    instructorName: string;
    lessonCount: number;
    totalMinutes: number;
  };
  newCourseDigest: {
    name: string;
    courses: Array<{
      title: string;
      slug: string;
      description: string;
      category?: string;
      level?: string;
      instructorName: string;
      priceKobo?: number;
    }>;
  };
  paymentReceipt: {
    name: string;
    courseTitle: string;
    courseSlug: string;
    amountFormatted: string;
    reference: string;
    paidAt: string;
    method: string;
  };
  refundIssued: {
    name: string;
    courseTitle: string;
    amountFormatted: string;
    reference: string;
    reason: string;
    refundedAt: string;
  };
  certificateIssued: {
    name: string;
    courseTitle: string;
    serial: string;
    issuedOn: string;
    verifyUrl: string;
  };
  discussionReply: {
    name: string;
    threadTitle: string;
    courseTitle: string;
    replierName: string;
    excerpt: string;
    threadUrl: string;
  };
  assignmentGraded: {
    name: string;
    assignmentTitle: string;
    courseTitle: string;
    score: number;
    maxPoints: number;
    feedback?: string;
    url: string;
  };
  instructorApplicationReceived: { fullName: string; submittedAt: string };
  instructorApplicationDecision: {
    fullName: string;
    decision: "approved" | "rejected";
    reviewNote?: string;
  };
  payoutAccountConfirmed: {
    name: string;
    accountName: string;
    accountNumberMasked: string;
    supportEmail: string;
    dashboardUrl: string;
  };
  platformAnnouncement: {
    title: string;
    body: string;
    publishedAt: string;
    ctaLabel?: string;
    ctaUrl?: string;
  };
  supportTicketReceived: {
    name: string;
    ticketNumber: string;
    subject: string;
    category: string;
    messageExcerpt: string;
    ticketUrl: string;
  };
  supportTicketStaffReply: {
    name: string;
    ticketNumber: string;
    subject: string;
    staffName: string;
    replyExcerpt: string;
    ticketUrl: string;
  };
  supportTicketResolved: {
    name: string;
    ticketNumber: string;
    subject: string;
    ticketUrl: string;
  };
};

/* -------------------------------------------------------------------------- */
/* Markup helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A paragraph from plain text. Escapes on the way in, because
 * `emailParagraph` takes trusted HTML and this is where trusted becomes
 * trusted.
 */
function para(text: string): string {
  return emailParagraph(escapeHtml(text));
}

/** A paragraph that already contains built markup: links, `emailStrong`, rows. */
function paraHtml(markup: string): string {
  return emailParagraph(markup);
}

/**
 * Nudge and broadcast mail respects the recipient's marketing preference, so it
 * always carries the unsubscribe link. Transactional mail reports something
 * that happened to the account and is never suppressible, so it gets none.
 */
function unsubscribeUrlFor(category: EmailCategory): string | undefined {
  return category === "transactional" ? undefined : settingsUrl();
}

/**
 * The same opt-out for the plain-text version. The html footer carries it
 * already, but a reader in a client that prefers text/plain would otherwise
 * have no way to switch these off at all.
 */
function unsubscribeLines(): string[] {
  return ["", "Turn these emails off:", settingsUrl()];
}

/* -------------------------------------------------------------------------- */
/* Links                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every link is built from `siteUrl()` rather than a literal hostname, so a
 * preview deployment and production both send mail pointing at themselves.
 * `siteUrl()` is read per call, not cached at module load, because tests change
 * the environment between cases.
 */
function courseUrl(slug: string): string {
  return `${siteUrl()}/dashboard/courses/${encodeURIComponent(slug)}`;
}

function catalogUrl(): string {
  return `${siteUrl()}/courses`;
}

function settingsUrl(): string {
  return `${siteUrl()}/dashboard/settings`;
}

function dashboardUrl(): string {
  return `${siteUrl()}/dashboard`;
}

function instructorUrl(): string {
  return `${siteUrl()}/dashboard/instructor`;
}

/**
 * The read-only receipt on Earnings, anchored to it. The setup dialog has no
 * route of its own, so every link out of an email lands here.
 */
function bankUrl(): string {
  return `${siteUrl()}/dashboard/instructor/earnings#payout-account`;
}

/* -------------------------------------------------------------------------- */
/* Words and numbers                                                         */
/* -------------------------------------------------------------------------- */

/** Collapses whitespace. Subjects are one line and cannot survive a newline. */
function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Number formatting that cannot produce "NaN" or "1.5000000000000002". The
 * assertion helpers below reject non-finite numbers at the door, but the copy
 * is also defended here, because a template that renders the word NaN is worse
 * than one that renders a slightly wrong zero.
 */
function num(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function whole(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/** "1 lesson", "12 lessons". Avoids "1 lessons" without a special case per copy. */
function countLabel(value: number, one: string, many: string): string {
  const n = whole(value);
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 hours 15 minutes". The "about" belongs to the sentence around it. */
function durationLabel(minutes: number): string {
  const total = Math.max(0, whole(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} minutes`;
  if (rest === 0) return countLabel(hours, "hour", "hours");
  return `${countLabel(hours, "hour", "hours")} ${rest} minutes`;
}

/** "1 lesson is left" / "2 lessons are left". */
function leftLabel(value: number): string {
  const n = whole(value);
  return `${countLabel(n, "lesson", "lessons")} ${n === 1 ? "is" : "are"} left`;
}

/** "3 days ago", "today". */
function daysAgo(days: number): string {
  const n = whole(days);
  if (n <= 0) return "today";
  return `${countLabel(n, "day", "days")} ago`;
}

/** States the gap without a nudge of guilt. */
function idleSentence(days: number): string {
  const n = whole(days);
  if (n <= 0) return "You were last here today.";
  if (n === 1) return "You were last here yesterday.";
  return `You were last here ${n} days ago.`;
}

/** Kobo is how prices are stored. Renders "₦15,000" without Intl drift. */
function naira(kobo: number): string {
  const value = Math.max(0, whole(kobo)) / 100;
  const major = Math.floor(value);
  const minor = Math.round((value - major) * 100);
  const head = `₦${major.toLocaleString("en-US")}`;
  return minor > 0 ? `${head}.${String(minor).padStart(2, "0")}` : head;
}

/** Percentage of a score. Returns null rather than dividing by zero. */
function scorePercent(score: number, max: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return whole((score / max) * 100);
}

/** Trims a quote or a course blurb to something a person will read. */
function clamp(value: string, limit: number): string {
  const flat = clean(value);
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).replace(/[\s,.;:!?-]+$/, "")}...`;
}

const DIGEST_LIMIT = 6;
const EXCERPT_LIMIT = 280;
const BLURB_LIMIT = 200;

/* -------------------------------------------------------------------------- */
/* The registry                                                              */
/* -------------------------------------------------------------------------- */

export const EMAIL_TEMPLATES: EmailRegistry<EmailData> = {
  /* ---------------------------------------------------------------- account */

  welcome: {
    group: "account",
    category: "transactional",
    subject: (d) => `Welcome to Glypha Learn, ${clean(d.name)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        "Glypha Learn is a place to take online courses. Lessons are short, some of them end with a quiz, and finishing a course gives you a certificate with a public verification link.",
        "",
        "Your account is ready to use. There is nothing else to set up.",
        "",
        "One thing to do next: open the catalog and pick a course. Everything published is listed there, and once you enroll one it appears on your dashboard.",
        "",
        "Browse courses:",
        catalogUrl(),
        "",
        "Your dashboard:",
        dashboardUrl(),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: "Your account is ready. The next step takes a minute.",
        heading: "Your account is ready",
        body:
          para(`Hi ${d.name},`) +
          para(
            "Glypha Learn is a place to take online courses. Lessons are short, some of them end with a quiz, and finishing a course gives you a certificate with a public verification link.",
          ) +
          para("Your account is ready to use. There is nothing else to set up.") +
          para(
            "One thing to do next: open the catalog and pick a course. Everything published is listed there, and once you enroll one it appears on your dashboard.",
          ),
        action: { label: "Browse courses", href: catalogUrl() },
        secondaryActions: [
          { label: "Go to your dashboard", href: dashboardUrl() },
        ],
      }),
  },

  securityNotice: {
    group: "account",
    category: "transactional",
    subject: (d) => `${clean(d.event)} on your Glypha Learn account`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        "We are letting you know about a change to your account.",
        "",
        `Event: ${clean(d.event)}`,
        `Time: ${clean(d.when)}`,
        ...(d.device ? [`Device: ${clean(d.device)}`] : []),
        ...(d.ipAddress ? [`IP address: ${clean(d.ipAddress)}`] : []),
        "",
        "If this was you, there is nothing to do.",
        "",
        "If it was not you, change your password now from your settings, then sign out of the sessions you do not recognise.",
        "",
        "Account settings:",
        settingsUrl(),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) => {
      // Device and IP are optional, because the event that produced this mail
      // may not have carried them. Built as a statement so the inferred element
      // type stays a tuple rather than widening to string[].
      const rows: Array<[string, string]> = [
        ["Event", d.event],
        ["Time", d.when],
      ];
      if (d.device) rows.push(["Device", d.device]);
      if (d.ipAddress) rows.push(["IP address", d.ipAddress]);

      return emailLayout({
        preheader: "A change was made to your account.",
        eyebrow: "Security",
        heading: "Was this you?",
        body:
          para(`Hi ${d.name},`) +
          para("We are letting you know about a change to your account:") +
          emailPanel(emailKeyValueRows(rows)) +
          para("If this was you, there is nothing to do.") +
          para(
            "If it was not you, change your password now from your settings, then sign out of the sessions you do not recognise.",
          ),
        action: { label: "Open account settings", href: settingsUrl() },
        footnote:
          "We send this whenever something happens to your account that could affect its security.",
      });
    },
  },

  /* ----------------------------------------------------------------- courses */

  enrollmentConfirmed: {
    group: "courses",
    category: "transactional",
    subject: (d) => `You are enrolled in ${clean(d.courseTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        `You are enrolled in ${clean(d.courseTitle)}, taught by ${clean(d.instructorName)}.`,
        ...(d.isPaid
          ? ["", "Your payment went through and the course is open to you now."]
          : []),
        "",
        `The course has ${countLabel(d.lessonCount, "lesson", "lessons")} in it, about ${durationLabel(d.totalMinutes)} of material in total.`,
        "",
        "Progress saves as you go, so you can stop and pick up where you left off.",
        "",
        "Start the first lesson:",
        courseUrl(d.courseSlug),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${clean(d.courseTitle)} is ready. ${countLabel(
          d.lessonCount,
          "lesson",
          "lessons",
        )}, about ${durationLabel(d.totalMinutes)}.`,
        eyebrow: "Enrollment",
        heading: "You are enrolled",
        body:
          para(`Hi ${d.name},`) +
          paraHtml(
            `You are enrolled in ${emailStrong(d.courseTitle)}, taught by ${emailStrong(
              d.instructorName,
            )}.`,
          ) +
          // The receipt carries the money. This line only confirms it landed,
          // because a learner who paid and is unsure whether it worked is the
          // person who needs to read this one twice.
          (d.isPaid
            ? emailSuccessNote(
                escapeHtml("Your payment went through and the course is open to you now."),
              )
            : "") +
          para(
            `The course has ${countLabel(
              d.lessonCount,
              "lesson",
              "lessons",
            )} in it, about ${durationLabel(d.totalMinutes)} of material in total.`,
          ) +
          para("Progress saves as you go, so you can stop and pick up where you left off."),
        action: { label: "Start the first lesson", href: courseUrl(d.courseSlug) },
      }),
  },

  courseNotStarted: {
    group: "courses",
    category: "nudge",
    subject: (d) => `${clean(d.courseTitle)}: your first lesson is ready`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        `You have not started ${clean(d.courseTitle)} yet. You enrolled ${daysAgo(
          d.enrolledDaysAgo,
        )}, and there is no deadline on it.`,
        "",
        `It begins with "${clean(d.firstLessonTitle)}", taught by ${clean(
          d.instructorName,
        )}. That is lesson one of ${whole(d.totalLessons)}.`,
        "",
        "Open it when you have a few minutes. You do not have to finish in one sitting, and your progress is kept.",
        "",
        "Open the first lesson:",
        courseUrl(d.courseSlug),
        ...unsubscribeLines(),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${clean(d.firstLessonTitle)} is lesson one of ${whole(
          d.totalLessons,
        )}.`,
        eyebrow: "Reminder",
        heading: "Your first lesson is ready",
        body:
          para(`Hi ${d.name},`) +
          paraHtml(
            `You have not started ${emailStrong(
              d.courseTitle,
            )} yet. You enrolled ${daysAgo(d.enrolledDaysAgo)}, and there is no deadline on it.`,
          ) +
          para(
            `It begins with "${clean(
              d.firstLessonTitle,
            )}", taught by ${clean(d.instructorName)}. That is lesson one of ${whole(
              d.totalLessons,
            )}.`,
          ) +
          para(
            "Open it when you have a few minutes. You do not have to finish in one sitting, and your progress is kept.",
          ),
        action: { label: "Open the first lesson", href: courseUrl(d.courseSlug) },
        footnote:
          "You are getting this because you enrolled in a course and have not started it yet.",
        unsubscribeUrl: unsubscribeUrlFor("nudge"),
      }),
  },

  courseStalled: {
    group: "courses",
    category: "nudge",
    subject: (d) => `Continue ${clean(d.courseTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        `You have finished ${countLabel(
          d.completedLessons,
          "lesson",
          "lessons",
        )} of ${whole(d.totalLessons)} in ${clean(
          d.courseTitle,
        )}, taught by ${clean(d.instructorName)}. That leaves ${countLabel(
          whole(d.totalLessons) - whole(d.completedLessons),
          "lesson",
          "lessons",
        )}.`,
        "",
        `${num(d.progressPercent)}% complete.`,
        "",
        idleSentence(d.idleDays),
        "",
        "Your place in the course is kept.",
        "",
        "Continue the course:",
        courseUrl(d.courseSlug),
        ...unsubscribeLines(),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${countLabel(d.completedLessons, "lesson", "lessons")} of ${whole(
          d.totalLessons,
        )} done in ${clean(d.courseTitle)}.`,
        eyebrow: "Reminder",
        heading: "Pick up where you left off",
        body:
          para(`Hi ${d.name},`) +
          paraHtml(
            `You have finished ${emailStrong(
              `${countLabel(d.completedLessons, "lesson", "lessons")} of ${whole(
                d.totalLessons,
              )}`,
            )} in ${emailStrong(d.courseTitle)}, taught by ${emailStrong(
              d.instructorName,
            )}. That leaves ${countLabel(
              whole(d.totalLessons) - whole(d.completedLessons),
              "lesson",
              "lessons",
            )}.`,
          ) +
          emailProgressBar(d.progressPercent) +
          para(idleSentence(d.idleDays)) +
          para("Your place in the course is kept."),
        action: { label: "Continue the course", href: courseUrl(d.courseSlug) },
        footnote: "You are getting this because a course you enrolled in has been left unfinished.",
        unsubscribeUrl: unsubscribeUrlFor("nudge"),
      }),
  },

  courseAlmostDone: {
    group: "courses",
    category: "nudge",
    subject: (d) =>
      `${countLabel(
        whole(d.totalLessons) - whole(d.completedLessons),
        "lesson",
        "lessons",
      )} left in ${clean(d.courseTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        `You have completed ${countLabel(
          d.completedLessons,
          "lesson",
          "lessons",
        )} of ${whole(d.totalLessons)} in ${clean(d.courseTitle)}.`,
        "",
        `${num(d.progressPercent)}% complete.`,
        "",
        `Only ${leftLabel(
          whole(d.totalLessons) - whole(d.completedLessons),
        )}, and the long stretch is behind you.`,
        "",
        "Finish the lessons, pass any remaining quizzes, and your certificate is issued automatically.",
        "",
        idleSentence(d.idleDays),
        "",
        "Finish the course:",
        courseUrl(d.courseSlug),
        ...unsubscribeLines(),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${countLabel(
          whole(d.totalLessons) - whole(d.completedLessons),
          "lesson",
          "lessons",
        )} left in ${clean(d.courseTitle)}.`,
        eyebrow: "Reminder",
        heading: `${countLabel(
          whole(d.totalLessons) - whole(d.completedLessons),
          "lesson",
          "lessons",
        )} to go`,
        body:
          para(`Hi ${d.name},`) +
          paraHtml(
            `You have completed ${emailStrong(
              `${countLabel(d.completedLessons, "lesson", "lessons")} of ${whole(
                d.totalLessons,
              )}`,
            )} in ${emailStrong(d.courseTitle)}.`,
          ) +
          emailProgressBar(d.progressPercent) +
          para(
            `Only ${leftLabel(
              whole(d.totalLessons) - whole(d.completedLessons),
            )}, and the long stretch is behind you.`,
          ) +
          // Stated the way the product actually works: lessons plus every quiz,
          // not lessons alone.
          para(
            "Finish the lessons, pass any remaining quizzes, and your certificate is issued automatically.",
          ) +
          para(idleSentence(d.idleDays)),
        action: { label: "Finish the course", href: courseUrl(d.courseSlug) },
        footnote: "You are getting this because you are close to finishing a course.",
        unsubscribeUrl: unsubscribeUrlFor("nudge"),
      }),
  },

  courseCompleted: {
    group: "courses",
    category: "transactional",
    subject: (d) => `You finished ${clean(d.courseTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        `You finished ${clean(d.courseTitle)}. All ${countLabel(
          d.lessonCount,
          "lesson",
          "lessons",
        )}, taught by ${clean(d.instructorName)}.`,
        "",
        `That is about ${durationLabel(d.totalMinutes)} of lessons completed.`,
        "",
        "Your certificate is on its way and arrives in a separate email. Anyone can check it with the serial number printed on it.",
        "",
        "The course stays in your dashboard, so you can go back to any lesson.",
        "",
        "Open the course:",
        courseUrl(d.courseSlug),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `All ${countLabel(d.lessonCount, "lesson", "lessons")} done in ${clean(
          d.courseTitle,
        )}.`,
        eyebrow: "Completed",
        heading: "You finished the course",
        body:
          para(`Hi ${d.name},`) +
          paraHtml(
            `You finished ${emailStrong(d.courseTitle)}. All ${countLabel(
              d.lessonCount,
              "lesson",
              "lessons",
            )}, taught by ${emailStrong(d.instructorName)}.`,
          ) +
          para(`That is about ${durationLabel(d.totalMinutes)} of lessons completed.`) +
          emailSuccessNote(
            escapeHtml(
              "Your certificate is on its way and arrives in a separate email. Anyone can check it with the serial number printed on it.",
            ),
          ) +
          para("The course stays in your dashboard, so you can go back to any lesson."),
        action: { label: "Open the course", href: courseUrl(d.courseSlug) },
      }),
  },

  newCourseDigest: {
    group: "courses",
    category: "broadcast",
    subject: (d) =>
      d.courses.length > 0
        ? `${countLabel(d.courses.length, "new course", "new courses")} on Glypha Learn`
        : "New courses on Glypha Learn",
    text: (d) => {
      const shown = d.courses.slice(0, DIGEST_LIMIT);
      const extra = d.courses.length - shown.length;
      if (shown.length === 0) {
        return [
          `Hi ${clean(d.name)},`,
          "",
          "No new courses have been published since the last roundup. The catalog is where the current list lives, and it changes as instructors publish.",
          "",
          "Open the catalog:",
          catalogUrl(),
          ...unsubscribeLines(),
          "",
          "Glypha Learn",
        ].join("\n");
      }
      return [
        `Hi ${clean(d.name)},`,
        "",
        "New on Glypha Learn:",
        "",
        ...shown.flatMap((course) => {
          const meta = [
            clean(course.instructorName),
            clean(course.category ?? ""),
            clean(course.level ?? ""),
            typeof course.priceKobo === "number" && course.priceKobo > 0
              ? naira(course.priceKobo)
              : "",
          ].filter(Boolean);
          return [
            `${clean(course.title)}`,
            meta.join(" \u00b7 "),
            clamp(course.description, BLURB_LIMIT),
            courseUrl(course.slug),
            "",
          ];
        }),
        ...(extra > 0 ? [`Plus ${countLabel(extra, "more course", "more courses")} in the catalog.`] : []),
        "Open the catalog:",
        catalogUrl(),
        ...unsubscribeLines(),
        "",
        "Glypha Learn",
      ].join("\n");
    },
    html: (d) => {
      const shown = d.courses.slice(0, DIGEST_LIMIT);
      const extra = d.courses.length - shown.length;

      const opening = para(`Hi ${d.name},`);

      if (shown.length === 0) {
        return emailLayout({
          preheader: "What was published since the last roundup.",
          eyebrow: "New courses",
          heading: "Nothing new yet",
          body:
            opening +
            para(
              "No new courses have been published since the last roundup. The catalog is where the current list lives, and it changes as instructors publish.",
            ),
          action: { label: "Open the catalog", href: catalogUrl() },
          footnote:
            "You are getting this because new courses were published. Nothing else.",
          unsubscribeUrl: unsubscribeUrlFor("broadcast"),
        });
      }

      const panels = shown
        .map((course) => {
          const meta = [
            clean(course.instructorName),
            clean(course.category ?? ""),
            clean(course.level ?? ""),
            typeof course.priceKobo === "number" && course.priceKobo > 0
              ? naira(course.priceKobo)
              : "",
          ]
            .filter(Boolean)
            .join(" \u00b7 ");

          return (
            emailPanel(
              paraHtml(`<strong style="color:#1F1B1D;font-weight:600;">${escapeHtml(course.title)}</strong>`) +
                paraHtml(emailMuted(meta)) +
                para(clamp(course.description, BLURB_LIMIT)) +
                paraHtml(emailLink("View the course", courseUrl(course.slug)))
            )
          );
        })
        .join("");

      return emailLayout({
        preheader: "What was published since the last roundup.",
        eyebrow: "New courses",
        heading: "New on Glypha Learn",
        body:
          opening +
          para(
            `${countLabel(shown.length, "course", "courses")} published since the last roundup.`,
          ) +
          panels +
          (extra > 0
            ? para(
                `${countLabel(extra, "more course", "more courses")} waiting in the catalog.`,
              )
            : ""),
        action: { label: "Browse the catalog", href: catalogUrl() },
        footnote: "You are getting this because new courses were published.",
        unsubscribeUrl: unsubscribeUrlFor("broadcast"),
      });
    },
  },

  /* ----------------------------------------------------------------- billing */

  paymentReceipt: {
    group: "billing",
    category: "transactional",
    subject: (d) => `Receipt for ${clean(d.courseTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        "Your payment went through. The details are below.",
        "",
        `Course: ${clean(d.courseTitle)}`,
        `Amount: ${clean(d.amountFormatted)}`,
        `Reference: ${clean(d.reference)}`,
        `Paid: ${clean(d.paidAt)}`,
        `Method: ${clean(d.method)}`,
        "",
        "This email is your receipt, so there is nothing else to keep.",
        "",
        "Access to the course is open now, and it stays open on your dashboard.",
        "",
        "Open the course:",
        courseUrl(d.courseSlug),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${clean(d.amountFormatted)} for ${clean(d.courseTitle)}.`,
        eyebrow: "Payment",
        heading: "Your receipt",
        body:
          para(`Hi ${d.name},`) +
          para("Your payment went through. The details are below.") +
          emailPanel(
            emailKeyValueRows([
              ["Course", d.courseTitle],
              ["Amount", d.amountFormatted],
              ["Reference", d.reference],
              ["Paid", d.paidAt],
              ["Method", d.method],
            ]),
          ) +
          para("This email is your receipt, so there is nothing else to keep.") +
          para("Access to the course is open now, and it stays open on your dashboard."),
        action: { label: "Open the course", href: courseUrl(d.courseSlug) },
      }),
  },

  refundIssued: {
    group: "billing",
    category: "transactional",
    subject: (d) => `Refund issued for ${clean(d.courseTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        "Your refund has been issued.",
        "",
        `Course: ${clean(d.courseTitle)}`,
        `Amount refunded: ${clean(d.amountFormatted)}`,
        `Reference: ${clean(d.reference)}`,
        `Reason: ${clean(d.reason)}`,
        `Refunded: ${clean(d.refundedAt)}`,
        "",
        "The money goes back to the payment method you paid with. A card or a bank transfer can take a few days to show it.",
        "",
        `Access to ${clean(
          d.courseTitle,
        )} has ended. Your account and any other courses you bought are not affected.`,
        "",
        "Browse other courses:",
        catalogUrl(),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${clean(d.amountFormatted)} back on ${clean(d.courseTitle)}.`,
        eyebrow: "Refund",
        heading: "Your refund",
        body:
          para(`Hi ${d.name},`) +
          para("Your refund has been issued.") +
          emailPanel(
            emailKeyValueRows([
              ["Course", d.courseTitle],
              ["Amount refunded", d.amountFormatted],
              ["Reference", d.reference],
              ["Reason", d.reason],
              ["Refunded", d.refundedAt],
            ]),
          ) +
          para(
            "The money goes back to the payment method you paid with. A card or a bank transfer can take a few days to show it.",
          ) +
          // Access is keyed on the enrollment, so a refund is the only thing
          // that takes it away. Saying so plainly is kinder than leaving the
          // recipient to discover it on the next lesson click.
          paraHtml(
            `Access to ${emailStrong(
              d.courseTitle,
            )} has ended. Your account and any other courses you bought are not affected.`,
          ),
        action: { label: "Browse other courses", href: catalogUrl() },
      }),
  },

  /* ------------------------------------------------------------ certificates */

  certificateIssued: {
    group: "certificates",
    category: "transactional",
    subject: (d) => `Your certificate for ${clean(d.courseTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        `Your certificate for ${clean(d.courseTitle)} is ready.`,
        "",
        `Serial: ${clean(d.serial)}`,
        `Issued on: ${clean(d.issuedOn)}`,
        "",
        "Anyone can check it without an account. They enter the serial at the verification link.",
        "",
        "View your certificate:",
        d.verifyUrl,
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `Serial ${clean(d.serial)} for ${clean(d.courseTitle)}.`,
        eyebrow: "Certificate",
        heading: "Your certificate is ready",
        body:
          para(`Hi ${d.name},`) +
          emailSuccessNote(escapeHtml(`Issued for ${clean(d.courseTitle)}.`)) +
          para(
            "Anyone can check this certificate without an account. They enter the serial below at the verification link.",
          ) +
          emailReference("Serial", d.serial) +
          para(`Issued on ${clean(d.issuedOn)}.`),
        action: { label: "View your certificate", href: d.verifyUrl },
        // Verification URLs carry the serial, so they are long and worth
        // printing in full for anyone whose client hides the button.
        actionFallbackLink: true,
      }),
  },

  /* ----------------------------------------------------------- notifications */

  discussionReply: {
    group: "notifications",
    category: "transactional",
    subject: (d) => `New reply in ${clean(d.threadTitle)}`,
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        `${clean(d.replierName)} replied in "${clean(
          d.threadTitle,
        )}", part of ${clean(d.courseTitle)}.`,
        "",
        clamp(d.excerpt, EXCERPT_LIMIT),
        "",
        "Open the discussion:",
        d.threadUrl,
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${clean(d.replierName)} replied in ${clean(d.threadTitle)}.`,
        eyebrow: "Discussion",
        heading: `New reply in "${clean(d.threadTitle)}"`,
        body:
          para(`Hi ${d.name},`) +
          paraHtml(
            `${emailStrong(d.replierName)} replied in ${emailStrong(
              d.threadTitle,
            )}, part of ${emailStrong(d.courseTitle)}.`,
          ) +
          para(clamp(d.excerpt, EXCERPT_LIMIT)),
        action: { label: "Open the discussion", href: d.threadUrl },
        actionFallbackLink: true,
      }),
  },

  assignmentGraded: {
    group: "notifications",
    category: "transactional",
    subject: (d) => `Graded: ${clean(d.assignmentTitle)}`,
    text: (d) => {
      const percent = scorePercent(d.score, d.maxPoints);
      return [
        `Hi ${clean(d.name)},`,
        "",
        `Your work on ${clean(d.assignmentTitle)} in ${clean(
          d.courseTitle,
        )} has been graded.`,
        "",
        `Score: ${num(d.score)} out of ${num(d.maxPoints)}${
          percent === null ? "" : ` (${percent}%)`
        }`,
        ...(d.feedback ? ["", "Feedback:", clean(d.feedback)] : []),
        "",
        "The result is saved on the assignment, so you can come back to it.",
        "",
        "See the result:",
        d.url,
        "",
        "Glypha Learn",
      ].join("\n");
    },
    html: (d) => {
      const percent = scorePercent(d.score, d.maxPoints);
      const rows: Array<[string, string]> = [
        ["Score", `${num(d.score)} out of ${num(d.maxPoints)}`],
      ];
      if (percent !== null) rows.push(["Percentage", `${percent}%`]);
      rows.push(["Assignment", d.assignmentTitle], ["Course", d.courseTitle]);

      return emailLayout({
        preheader: `${num(d.score)} out of ${num(d.maxPoints)} on ${clean(
          d.assignmentTitle,
        )}.`,
        eyebrow: "Graded",
        heading: "Your result",
        body:
          para(`Hi ${d.name},`) +
          paraHtml(
            `Your work on ${emailStrong(d.assignmentTitle)} in ${emailStrong(
              d.courseTitle,
            )} has been graded.`,
          ) +
          // The score, plainly. No "great job" and no "almost there": the mark
          // is the fact, and the feedback is where the instructor says
          // something about it.
          emailPanel(emailKeyValueRows(rows)) +
          (d.feedback ? paraHtml(emailMuted("Feedback")) + para(d.feedback) : "") +
          para("The result is saved on the assignment, so you can come back to it."),
        action: { label: "See the result", href: d.url },
        actionFallbackLink: true,
      });
    },
  },

  /* ------------------------------------------------------------- instructors */

  instructorApplicationReceived: {
    group: "instructors",
    category: "transactional",
    subject: () => "We received your instructor application",
    text: (d) =>
      [
        `Hi ${clean(d.fullName)},`,
        "",
        "Thank you for applying to teach on Glypha Learn. This email confirms that your application reached us.",
        "",
        `Submitted: ${clean(d.submittedAt)}`,
        "",
        "A person on the team reads every application. Most are decided within a week, and you get an email either way.",
        "",
        "Nothing is needed from you right now.",
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: "We have your application. A person will read it.",
        eyebrow: "Instructor application",
        heading: "We received your application",
        body:
          para(`Hi ${clean(d.fullName)},`) +
          para(
            "Thank you for applying to teach on Glypha Learn. This email confirms that your application reached us.",
          ) +
          emailPanel(emailKeyValueRows([["Submitted", d.submittedAt]])) +
          para(
            "A person on the team reads every application. Most are decided within a week, and you get an email either way.",
          ) +
          para("Nothing is needed from you right now."),
      }),
  },

  instructorApplicationDecision: {
    group: "instructors",
    category: "transactional",
    subject: (d) =>
      d.decision === "approved"
        ? "Your instructor application was approved"
        : "An update on your instructor application",
    text: (d) =>
      d.decision === "approved"
        ? [
            `Hi ${clean(d.fullName)},`,
            "",
            "Your application to teach on Glypha Learn was approved.",
            "",
            "You can now create courses, publish lessons and quizzes, and earn from every enrollment that pays.",
            "",
            "Earnings appear in your instructor dashboard. Add a payout account whenever you are ready and money goes to your bank from then on.",
            "",
            "Open your instructor dashboard:",
            instructorUrl(),
            "",
            "Glypha Learn",
          ].join("\n")
        : [
            `Hi ${clean(d.fullName)},`,
            "",
            "We reviewed your application and decided not to approve it this time.",
            ...(d.reviewNote ? ["", "Why:", clean(d.reviewNote)] : []),
            "",
            "We receive more applications than we can take, so this is a decision about fit and timing rather than about you. You are welcome to apply again when you have more to show.",
            "",
            "Glypha Learn",
          ].join("\n"),
    html: (d) =>
      d.decision === "approved"
        ? emailLayout({
            preheader: "You can start building courses on Glypha Learn.",
            eyebrow: "Instructor application",
            heading: "You can start teaching",
            body:
              para(`Hi ${clean(d.fullName)},`) +
              paraHtml(
                `Your application to teach on Glypha Learn was ${emailStrong("approved")}.`,
              ) +
              para(
                "You can now create courses, publish lessons and quizzes, and earn from every enrollment that pays.",
              ) +
              para(
                "Earnings appear in your instructor dashboard. Add a payout account whenever you are ready and money goes to your bank from then on.",
              ),
            action: {
              label: "Open your instructor dashboard",
              href: instructorUrl(),
            },
            secondaryActions: [{ label: "Payout details", href: bankUrl() }],
          })
        : emailLayout({
            preheader: "A decision on your instructor application.",
            eyebrow: "Instructor application",
            heading: "Your application was not approved",
            body:
              para(`Hi ${clean(d.fullName)},`) +
              para(
                "We reviewed your application and decided not to approve it this time.",
              ) +
              (d.reviewNote
                ? paraHtml(emailMuted("Why")) + emailPanel(para(d.reviewNote))
                : "") +
              // No invitation to argue, no "reply to this email if you
              // disagree". The decision is stated, the reason is stated, and
              // the door is left open for later without making it a debate.
              para(
                "We receive more applications than we can take, so this is a decision about fit and timing rather than about you. You are welcome to apply again when you have more to show.",
              ),
          }),
  },

  payoutAccountConfirmed: {
    group: "instructors",
    category: "transactional",
    subject: () => "Your payout account is set",
    text: (d) =>
      [
        `Hi ${clean(d.name)},`,
        "",
        "Your payout account is confirmed.",
        "",
        `Account name: ${clean(d.accountName)}`,
        `Account number: ${clean(d.accountNumberMasked)}`,
        "",
        "Payouts go to this account from now on. It is locked so a change cannot happen without a person on our side checking it.",
        "",
        `To change it, contact support at ${clean(d.supportEmail)}.`,
        "",
        "Open your bank details:",
        bankUrl(),
        "",
        "Glypha Learn",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${clean(d.accountName)} will receive your payouts.`,
        eyebrow: "Payouts",
        heading: "Payout account confirmed",
        body:
          para(`Hi ${d.name},`) +
          emailPanel(
            emailKeyValueRows([
              ["Account name", d.accountName],
              ["Account number", d.accountNumberMasked],
            ]),
          ) +
          para(
            "Payouts go to this account from now on. It is locked so a change cannot happen without a person on our side checking it.",
          ) +
          // Support is the escape hatch for a locked field, so the address has
          // to be reachable from the mail itself.
          paraHtml(
            `To change it, contact support at ${emailLink(
              d.supportEmail,
              `mailto:${d.supportEmail}`,
            )}.`,
          ),
        action: { label: "Open your bank details", href: bankUrl() },
        secondaryActions: [{ label: "Your dashboard", href: d.dashboardUrl }],
      }),
  },

  /* ----------------------------------------------------------------- updates */

  platformAnnouncement: {
    group: "updates",
    category: "broadcast",
    subject: (d) => clean(d.title),
    text: (d) => {
      const paragraphs = d.body
        .split(/\n+/)
        .map((line) => clean(line))
        .filter(Boolean);
      return [
        ...paragraphs,
        ...(d.ctaLabel && d.ctaUrl ? ["", `${clean(d.ctaLabel)}:`, d.ctaUrl] : []),
        "",
        `Posted ${clean(d.publishedAt)}`,
        ...unsubscribeLines(),
        "",
        "Glypha Learn",
      ].join("\n");
    },
    html: (d) => {
      const paragraphs = d.body
        .split(/\n+/)
        .map((line) => clean(line))
        .filter(Boolean);
      const hasCta = Boolean(d.ctaLabel && d.ctaUrl);
      return emailLayout({
        preheader: paragraphs[0]?.slice(0, 110) ?? clean(d.title),
        eyebrow: "Announcement",
        heading: d.title,
        body:
          paragraphs.map((line) => para(line)).join("") +
          paraHtml(`<br>${emailMuted(`Posted ${clean(d.publishedAt)}`)}`),
        action: hasCta ? { label: clean(d.ctaLabel!), href: d.ctaUrl! } : undefined,
        footnote: "You are getting this because we are sending product news.",
        unsubscribeUrl: unsubscribeUrlFor("broadcast"),
      });
    },
  },
  supportTicketReceived: {
    group: "account",
    category: "transactional",
    subject: (d) => `[Ticket #${clean(d.ticketNumber)}] Support request received: ${clean(d.subject)}`,
    text: (d) =>
      [
        `Hi ${d.name},`,
        "",
        `We received your support request "${d.subject}" (Ticket #${d.ticketNumber}).`,
        `Category: ${d.category}`,
        "",
        `"${d.messageExcerpt}"`,
        "",
        "Our team will review your message and respond shortly.",
        `View your ticket: ${d.ticketUrl}`,
        "",
        "Glypha Learn Support",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `Ticket #${clean(d.ticketNumber)} received: ${clean(d.subject)}`,
        eyebrow: "Support Ticket",
        heading: "Request received",
        body:
          para(`Hi ${clean(d.name)}, we've received your support request and assigned it ticket #${emailStrong(clean(d.ticketNumber))}.`) +
          emailPanel(
            emailKeyValueRows([
              ["Subject", clean(d.subject)],
              ["Category", clean(d.category)],
              ["Summary", clean(d.messageExcerpt)],
            ]),
          ) +
          para("Our team is reviewing your message and will reply as soon as possible."),
        action: { label: "View Ticket", href: d.ticketUrl },
        footnote: "This is an automated confirmation of your support request.",
      }),
  },
  supportTicketStaffReply: {
    group: "account",
    category: "transactional",
    subject: (d) => `[Ticket #${clean(d.ticketNumber)}] Reply to: ${clean(d.subject)}`,
    text: (d) =>
      [
        `Hi ${d.name},`,
        "",
        `${d.staffName} from Glypha Learn support has replied to your ticket #${d.ticketNumber}:`,
        "",
        `"${d.replyExcerpt}"`,
        "",
        `View and respond to this ticket: ${d.ticketUrl}`,
        "",
        "Glypha Learn Support",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `${clean(d.staffName)} replied to your support request #${clean(d.ticketNumber)}`,
        eyebrow: "Support Update",
        heading: "New response from support",
        body:
          para(`Hi ${clean(d.name)}, ${clean(d.staffName)} has replied to your support request (${emailStrong(`#${clean(d.ticketNumber)}`)}):`) +
          emailPanel(para(clean(d.replyExcerpt))) +
          para("You can view the full conversation or send a reply online:"),
        action: { label: "View & Reply", href: d.ticketUrl },
        footnote: "You are receiving this because you submitted a support ticket on Glypha Learn.",
      }),
  },
  supportTicketResolved: {
    group: "account",
    category: "transactional",
    subject: (d) => `[Ticket #${clean(d.ticketNumber)}] Ticket resolved: ${clean(d.subject)}`,
    text: (d) =>
      [
        `Hi ${d.name},`,
        "",
        `Your support ticket #${d.ticketNumber} ("${d.subject}") has been marked as resolved.`,
        "",
        `If you still need assistance, you can reopen it or view the history here: ${d.ticketUrl}`,
        "",
        "Thank you for using Glypha Learn.",
      ].join("\n"),
    html: (d) =>
      emailLayout({
        preheader: `Ticket #${clean(d.ticketNumber)} resolved: ${clean(d.subject)}`,
        eyebrow: "Support Ticket",
        heading: "Ticket resolved",
        body:
          para(`Hi ${clean(d.name)}, your support request #${emailStrong(clean(d.ticketNumber))} has been marked as resolved.`) +
          emailSuccessNote("If your issue is not completely solved, you can view the ticket details and send another reply to reopen it.") +
          para("Thank you for your patience."),
        action: { label: "View Ticket Details", href: d.ticketUrl },
        footnote: "This notification was sent regarding your resolved support ticket.",
      }),
  },
};

/* -------------------------------------------------------------------------- */
/* Runtime validation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Required fields per template, checked by `assertEmailData`.
 *
 * These call sites run inside Convex actions, where a renamed field compiles
 * fine and then ships an email reading "Hi undefined," to a real person. The
 * `satisfies` clause makes a typo in a field name a type error here instead.
 */
const REQUIRED_FIELDS = {
  welcome: ["name"],
  securityNotice: ["name", "event", "when"],
  enrollmentConfirmed: [
    "name",
    "courseTitle",
    "courseSlug",
    "instructorName",
    "lessonCount",
    "totalMinutes",
    "isPaid",
  ],
  courseNotStarted: [
    "name",
    "courseTitle",
    "courseSlug",
    "instructorName",
    "firstLessonTitle",
    "totalLessons",
    "enrolledDaysAgo",
  ],
  courseStalled: [
    "name",
    "courseTitle",
    "courseSlug",
    "instructorName",
    "progressPercent",
    "completedLessons",
    "totalLessons",
    "idleDays",
  ],
  courseAlmostDone: [
    "name",
    "courseTitle",
    "courseSlug",
    "progressPercent",
    "completedLessons",
    "totalLessons",
    "idleDays",
  ],
  courseCompleted: [
    "name",
    "courseTitle",
    "courseSlug",
    "instructorName",
    "lessonCount",
    "totalMinutes",
  ],
  newCourseDigest: ["name", "courses"],
  paymentReceipt: [
    "name",
    "courseTitle",
    "courseSlug",
    "amountFormatted",
    "reference",
    "paidAt",
    "method",
  ],
  refundIssued: [
    "name",
    "courseTitle",
    "amountFormatted",
    "reference",
    "reason",
    "refundedAt",
  ],
  certificateIssued: ["name", "courseTitle", "serial", "issuedOn", "verifyUrl"],
  discussionReply: [
    "name",
    "threadTitle",
    "courseTitle",
    "replierName",
    "excerpt",
    "threadUrl",
  ],
  assignmentGraded: [
    "name",
    "assignmentTitle",
    "courseTitle",
    "score",
    "maxPoints",
    "url",
  ],
  instructorApplicationReceived: ["fullName", "submittedAt"],
  instructorApplicationDecision: ["fullName", "decision"],
  payoutAccountConfirmed: [
    "name",
    "accountName",
    "accountNumberMasked",
    "supportEmail",
    "dashboardUrl",
  ],
  platformAnnouncement: ["title", "body", "publishedAt"],
  supportTicketReceived: [
    "name",
    "ticketNumber",
    "subject",
    "category",
    "messageExcerpt",
    "ticketUrl",
  ],
  supportTicketStaffReply: [
    "name",
    "ticketNumber",
    "subject",
    "staffName",
    "replyExcerpt",
    "ticketUrl",
  ],
  supportTicketResolved: [
    "name",
    "ticketNumber",
    "subject",
    "ticketUrl",
  ],
} as const satisfies {
  [K in EmailTemplateId]: readonly (keyof EmailData[K] & string)[];
};

/**
 * Required fields on each item of an array field. A digest entry with no title
 * would render a blank panel and an entry with no slug would render a link to
 * the wrong course, which is worse than not sending.
 */
const REQUIRED_ITEM_FIELDS: Partial<
  Record<EmailTemplateId, readonly (string & {})[]>
> = {
  newCourseDigest: ["title", "slug", "instructorName"],
};

/**
 * Required fields that may still be an empty string.
 *
 * Only one, and only because it is authored content rather than a value read
 * off a record: an announcement can be a title and a link with no body at all,
 * which is a real thing to send and renders as a heading, a date and a button.
 */
const BLANK_ALLOWED_FIELDS: Partial<
  Record<EmailTemplateId, readonly (string & {})[]>
> = {
  platformAnnouncement: ["body"],
};

function assertPresent(
  id: EmailTemplateId,
  path: string,
  value: unknown,
): void {
  if (value === undefined || value === null) {
    throw new Error(
      `Email template "${id}" is missing required field "${path}".`,
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    // NaN reaches the copy as the string "NaN", in a progress bar and in
    // plain text. Better to stop the send.
    throw new Error(
      `Email template "${id}" received a non-finite number for "${path}": ${value}.`,
    );
  }
  if (typeof value === "string" && value.trim() === "" && !allowsBlank(id, path)) {
    // An empty string is missing in every case that matters here: "You
    // enrolled in " is as wrong as "You enrolled in undefined". If the sender
    // genuinely has nothing to say, the field belongs in the optional set.
    throw new Error(
      `Email template "${id}" received an empty "${path}". Pass a real value.`,
    );
  }
}

function allowsBlank(id: EmailTemplateId, path: string): boolean {
  return (BLANK_ALLOWED_FIELDS[id] ?? []).some(
    (field) => field === path || path.endsWith(`.${field}`),
  );
}

function assertEmailData<K extends EmailTemplateId>(
  id: K,
  data: EmailData[K],
): void {
  if (data === null || typeof data !== "object") {
    throw new Error(`Email template "${id}" was called with no data.`);
  }

  const record = data as unknown as Record<string, unknown>;
  const itemFields = REQUIRED_ITEM_FIELDS[id];

  for (const field of REQUIRED_FIELDS[id]) {
    const value = record[field];
    assertPresent(id, field, value);

    if (!itemFields || !Array.isArray(value)) continue;
    value.forEach((item, index) => {
      if (item === null || typeof item !== "object") {
        throw new Error(
          `Email template "${id}" is missing required field "${field}[${index}]".`,
        );
      }
      const entry = item as Record<string, unknown>;
      for (const subField of itemFields) {
        assertPresent(id, `${field}[${index}].${subField}`, entry[subField]);
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Renders one email. Validates first, so a bad call fails at the call site with
 * the template name in the message rather than mailing a sentence with a hole
 * in it.
 */
export function renderEmail<K extends EmailTemplateId>(
  id: K,
  data: EmailData[K],
): RenderedEmail {
  assertEmailData(id, data);

  const template = EMAIL_TEMPLATES[id];

  return {
    subject: clean(template.subject(data)),
    text: template.text(data).trim(),
    html: template.html(data),
  };
}

/** Which sender identity an email goes out as. See `lib/mail-senders.ts`. */
export function emailGroupFor(id: EmailTemplateId): MailSenderGroup {
  return EMAIL_TEMPLATES[id].group;
}

/** Whether the recipient can turn this email off. */
export function emailCategoryFor(id: EmailTemplateId): EmailCategory {
  return EMAIL_TEMPLATES[id].category;
}