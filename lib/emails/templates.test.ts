import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  EMAIL_TEMPLATES,
  emailCategoryFor,
  emailGroupFor,
  renderEmail,
  type EmailData,
} from "./templates";
import type { EmailCategory, EmailTemplateId } from "./types";

/**
 * Two things are being protected here.
 *
 * The first is mechanical: every template renders, escapes, and carries the
 * right sender and category. Those are the failures that reach a real inbox.
 *
 * The second is the copy. The banned-phrase block at the bottom is the reason
 * this file is longer than a smoke test would be: the house rules for these
 * emails (no em dashes, no marketing register, no emoji, sentence case) are
 * easy to state and easy to break six months later when someone adds a line,
 * so they are asserted instead of trusted.
 */

const SITE_URL = "https://glypha.example.ng";

let savedSiteUrl: string | undefined;

beforeEach(() => {
  savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
});

afterEach(() => {
  if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
});

/** Realistic data for every template. Keyed by id so a new id cannot be skipped. */
const DATA: { [K in EmailTemplateId]: EmailData[K] } = {
  welcome: { name: "Ada Obi" },

  securityNotice: {
    name: "Ada Obi",
    event: "New sign-in",
    when: "14 October 2026, 09:41 WAT",
    ipAddress: "102.89.34.17",
    device: "Chrome on Android",
  },

  enrollmentConfirmed: {
    name: "Ada Obi",
    courseTitle: "Data structures and algorithms",
    courseSlug: "data-structures-and-algorithms",
    instructorName: "Tunde Bakare",
    lessonCount: 24,
    totalMinutes: 310,
    isPaid: true,
  },

  courseNotStarted: {
    name: "Ada Obi",
    courseTitle: "Financial accounting basics",
    courseSlug: "financial-accounting-basics",
    instructorName: "Ngozi Eze",
    firstLessonTitle: "The double entry rule",
    totalLessons: 12,
    enrolledDaysAgo: 4,
  },

  courseStalled: {
    name: "Ada Obi",
    courseTitle: "Data structures and algorithms",
    courseSlug: "data-structures-and-algorithms",
    instructorName: "Tunde Bakare",
    progressPercent: 62,
    completedLessons: 9,
    totalLessons: 15,
    idleDays: 12,
  },

  courseAlmostDone: {
    name: "Ada Obi",
    courseTitle: "Data structures and algorithms",
    courseSlug: "data-structures-and-algorithms",
    progressPercent: 88,
    completedLessons: 14,
    totalLessons: 16,
    idleDays: 3,
  },

  courseCompleted: {
    name: "Ada Obi",
    courseTitle: "Data structures and algorithms",
    courseSlug: "data-structures-and-algorithms",
    instructorName: "Tunde Bakare",
    lessonCount: 16,
    totalMinutes: 205,
  },

  newCourseDigest: {
    name: "Ada Obi",
    courses: [
      {
        title: "Flutter for beginners",
        slug: "flutter-for-beginners",
        description: "Build a real app on your phone, from the first screen to the build step.",
        category: "Development",
        level: "Beginner",
        instructorName: "Tunde Bakare",
        priceKobo: 1500000,
      },
      {
        title: "Writing grant proposals",
        slug: "writing-grant-proposals",
        description: "A working template for NGOs applying to funders.",
        category: "Business",
        instructorName: "Amaka Obi",
      },
    ],
  },

  paymentReceipt: {
    name: "Ada Obi",
    courseTitle: "Data structures and algorithms",
    courseSlug: "data-structures-and-algorithms",
    amountFormatted: "₦15,000.00",
    reference: "PSK-4H2K9LMQ",
    paidAt: "12 October 2026, 16:02 WAT",
    method: "Card, Visa ending 4417",
  },

  refundIssued: {
    name: "Ada Obi",
    courseTitle: "Financial accounting basics",
    amountFormatted: "₦7,500.00",
    reference: "RFND-8KD2P1",
    reason: "Requested by the learner",
    refundedAt: "13 October 2026, 10:15 WAT",
  },

  certificateIssued: {
    name: "Ada Obi",
    courseTitle: "Data structures and algorithms",
    serial: "GL-2026-3F9A1C77",
    issuedOn: "12 October 2026",
    verifyUrl: "https://glypha.example.ng/verify/GL-2026-3F9A1C77",
  },

  discussionReply: {
    name: "Ada Obi",
    threadTitle: "Why quicksort over mergesort",
    courseTitle: "Data structures and algorithms",
    replierName: "Tunde Bakare",
    excerpt:
      "Quicksort sorts in place, so it avoids the extra array mergesort needs. That is the whole tradeoff in most cases.",
    threadUrl: "https://glypha.example.ng/dashboard/courses/data-structures-and-algorithms/threads/9",
  },

  assignmentGraded: {
    name: "Ada Obi",
    assignmentTitle: "Balance sheet exercise",
    courseTitle: "Financial accounting basics",
    score: 17,
    maxPoints: 20,
    feedback: "Your entries balance. Check the depreciation line, it is carried at cost here.",
    url: "https://glypha.example.ng/dashboard/courses/financial-accounting-basics/assignments/3",
  },

  instructorApplicationReceived: {
    fullName: "Amaka Obi",
    submittedAt: "11 October 2026, 14:30 WAT",
  },

  instructorApplicationDecision: {
    fullName: "Amaka Obi",
    decision: "approved" as const,
    reviewNote: "Portfolio shows real classroom experience.",
  },

  payoutAccountConfirmed: {
    name: "Amaka Obi",
    accountName: "Amaka Obi",
    accountNumberMasked: "•••• 4417",
    supportEmail: "support@glypha.example.ng",
    dashboardUrl: "https://glypha.example.ng/dashboard/instructor",
  },

  platformAnnouncement: {
    title: "Certificates can now be checked by anyone",
    body:
      "Every certificate carries a serial number.\nEnter it on the verification page and the record appears, without needing an account.\n\nWe are rolling the same check out to older certificates over the next few weeks.",
    publishedAt: "14 October 2026",
    ctaLabel: "Read the announcement",
    ctaUrl: "https://glypha.example.ng/updates/certificate-verification",
  },

  supportTicketReceived: {
    name: "Ada Obi",
    ticketNumber: "TICK-2026-9012",
    subject: "Cannot view certificate",
    category: "certificates",
    messageExcerpt: "I completed the lessons but cannot download certificate.",
    ticketUrl: "https://glypha.example.ng/support?ticketNumber=TICK-2026-9012",
  },

  supportTicketStaffReply: {
    name: "Ada Obi",
    ticketNumber: "TICK-2026-9012",
    subject: "Cannot view certificate",
    staffName: "Tunde Support",
    replyExcerpt: "We corrected the name spelling and reissued it.",
    ticketUrl: "https://glypha.example.ng/support?ticketNumber=TICK-2026-9012",
  },

  supportTicketResolved: {
    name: "Ada Obi",
    ticketNumber: "TICK-2026-9012",
    subject: "Cannot view certificate",
    ticketUrl: "https://glypha.example.ng/support?ticketNumber=TICK-2026-9012",
  },
};

/** Which group each email goes out as, and whether it can be turned off. */
const EXPECTED: Record<EmailTemplateId, { group: string; category: EmailCategory }> = {
  welcome: { group: "account", category: "transactional" },
  securityNotice: { group: "account", category: "transactional" },
  enrollmentConfirmed: { group: "courses", category: "transactional" },
  courseNotStarted: { group: "courses", category: "nudge" },
  courseStalled: { group: "courses", category: "nudge" },
  courseAlmostDone: { group: "courses", category: "nudge" },
  courseCompleted: { group: "courses", category: "transactional" },
  newCourseDigest: { group: "courses", category: "broadcast" },
  paymentReceipt: { group: "billing", category: "transactional" },
  refundIssued: { group: "billing", category: "transactional" },
  certificateIssued: { group: "certificates", category: "transactional" },
  discussionReply: { group: "notifications", category: "transactional" },
  assignmentGraded: { group: "notifications", category: "transactional" },
  instructorApplicationReceived: { group: "instructors", category: "transactional" },
  instructorApplicationDecision: { group: "instructors", category: "transactional" },
  payoutAccountConfirmed: { group: "instructors", category: "transactional" },
  platformAnnouncement: { group: "updates", category: "broadcast" },
  supportTicketReceived: { group: "account", category: "transactional" },
  supportTicketStaffReply: { group: "account", category: "transactional" },
  supportTicketResolved: { group: "account", category: "transactional" },
};

/** The value each template must visibly carry into the rendered mail. */
const KEY_VALUE: Record<EmailTemplateId, string[]> = {
  welcome: ["Ada Obi"],
  securityNotice: ["Ada Obi", "New sign-in", "14 October 2026", "102.89.34.17", "Chrome on Android"],
  enrollmentConfirmed: ["Ada Obi", "Data structures and algorithms", "Tunde Bakare", "24 lessons"],
  courseNotStarted: ["Ada Obi", "Financial accounting basics", "The double entry rule", "Ngozi Eze"],
  courseStalled: ["Ada Obi", "Data structures and algorithms", "9 lessons of 15", "Tunde Bakare"],
  courseAlmostDone: ["Ada Obi", "Data structures and algorithms", "14 lessons of 16"],
  courseCompleted: ["Ada Obi", "Data structures and algorithms", "Tunde Bakare", "16 lessons"],
  newCourseDigest: ["Ada Obi", "Flutter for beginners", "Writing grant proposals", "Tunde Bakare"],
  paymentReceipt: ["Ada Obi", "Data structures and algorithms", "₦15,000.00", "PSK-4H2K9LMQ"],
  refundIssued: ["Ada Obi", "Financial accounting basics", "₦7,500.00", "RFND-8KD2P1"],
  certificateIssued: ["Ada Obi", "Data structures and algorithms", "GL-2026-3F9A1C77", "12 October 2026"],
  discussionReply: [
    "Ada Obi",
    "Tunde Bakare",
    "Why quicksort over mergesort",
    "Data structures and algorithms",
  ],
  assignmentGraded: ["Ada Obi", "Balance sheet exercise", "Financial accounting basics", "17 out of 20"],
  instructorApplicationReceived: ["Amaka Obi", "11 October 2026"],
  instructorApplicationDecision: ["Amaka Obi"],
  payoutAccountConfirmed: ["Amaka Obi", "•••• 4417", "support@glypha.example.ng"],
  platformAnnouncement: ["Certificates can now be checked by anyone", "14 October 2026"],
  supportTicketReceived: ["Ada Obi", "TICK-2026-9012", "Cannot view certificate"],
  supportTicketStaffReply: ["Ada Obi", "TICK-2026-9012", "Tunde Support"],
  supportTicketResolved: ["Ada Obi", "TICK-2026-9012", "Cannot view certificate"],
};

const IDS = Object.keys(EXPECTED) as EmailTemplateId[];

describe("every template renders", () => {
  test("the registry holds exactly the ids the tests know about", () => {
    // A new email added to the registry without a row in EXPECTED would
    // otherwise skip every check below.
    expect(Object.keys(EMAIL_TEMPLATES).sort()).toEqual([...IDS].sort());
  });

  for (const id of IDS) {
    test(`${id} produces a subject, text and html`, () => {
      const rendered = renderEmail(id, DATA[id]);

      expect(rendered.subject.trim()).not.toBe("");
      expect(rendered.text.trim()).not.toBe("");
      expect(rendered.html.trim()).not.toBe("");
      expect(rendered.html).toContain("<!doctype html>");
      expect(rendered.html).toContain("Glypha Learn");
      expect(rendered.html).toContain("</html>");
    });

    test(`${id} writes plain text, not stripped markup`, () => {
      const { text } = renderEmail(id, DATA[id]);

      expect(text).not.toContain("<");
      expect(text).not.toContain(">");
      expect(text).not.toContain("&amp;");
      // The only {{ }} placeholder in the product is {{recipient_email}},
      // which the delivery layer fills in, and it belongs in the html footer.
      expect(text).not.toContain("{{");
      expect(text).not.toContain("}}");
    });

    test(`${id} carries its key values into the html`, () => {
      const { html } = renderEmail(id, DATA[id]);

      for (const value of KEY_VALUE[id]) {
        expect(html).toContain(value);
      }
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("[object Object]");
    });

    test(`${id} sends from its own group with its own category`, () => {
      expect(emailGroupFor(id)).toBe(EXPECTED[id].group);
      expect(emailCategoryFor(id)).toBe(EXPECTED[id].category);
    });
  }
});

describe("links", () => {
  test("are built from siteUrl rather than a hardcoded host", () => {
    const { html } = renderEmail("enrollmentConfirmed", DATA.enrollmentConfirmed);

    expect(html).toContain(`${SITE_URL}/dashboard/courses/data-structures-and-algorithms`);
    expect(html).not.toContain("localhost");
    expect(html).not.toContain("glypha.com.ng/");
  });

  test("follow a change to the configured site url", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.example.ng";
    const { html } = renderEmail("paymentReceipt", DATA.paymentReceipt);

    expect(html).toContain("https://staging.example.ng/dashboard/courses/");
  });

  test("encode a slug that needs it", () => {
    const { html } = renderEmail("courseCompleted", {
      ...DATA.courseCompleted,
      courseSlug: "data structures/algorithms",
    });

    expect(html).toContain("/dashboard/courses/data%20structures%2Falgorithms");
  });
});

describe("unsubscribable mail", () => {
  for (const id of IDS.filter(
    (k) => EXPECTED[k].category !== "transactional",
  )) {
    test(`${id} carries the unsubscribe link`, () => {
      const { html, text } = renderEmail(id, DATA[id]);

      expect(html).toContain(`${SITE_URL}/dashboard/settings`);
      expect(html).toContain("Turn these emails off");
      // It has to survive in the text version too, which is the part a reader
      // sees in a client that prefers plain text.
      expect(text).toContain(`${SITE_URL}/dashboard/settings`);
    });
  }

  for (const id of IDS.filter(
    (k) => EXPECTED[k].category === "transactional",
  )) {
    test(`${id} does not offer to switch it off`, () => {
      // A receipt or a security notice is not something you opt out of.
      const { html } = renderEmail(id, DATA[id]);

      expect(html).not.toContain("Turn these emails off");
    });
  }
});

describe("platformAnnouncement", () => {
  test("splits the body into paragraphs", () => {
    const { html, text } = renderEmail("platformAnnouncement", DATA.platformAnnouncement);

    expect(html).toContain("Every certificate carries a serial number.");
    expect(html).toContain("Enter it on the verification page");
    expect(html).toContain("We are rolling the same check out");
    expect(text.split("\n\n").length).toBeGreaterThan(2);
  });

  test("renders a body with nothing in it", () => {
    const rendered = renderEmail("platformAnnouncement", {
      ...DATA.platformAnnouncement,
      body: "",
      ctaLabel: undefined,
      ctaUrl: undefined,
    });

    expect(rendered.subject).toBe("Certificates can now be checked by anyone");
    expect(rendered.html).toContain("<!doctype html>");
    expect(rendered.text).toContain("Glypha Learn");
    expect(rendered.html).not.toContain("undefined");
  });

  test("shows the call to action only when label and url are both present", () => {
    const withCta = renderEmail("platformAnnouncement", DATA.platformAnnouncement);
    expect(withCta.html).toContain("Read the announcement");
    expect(withCta.html).toContain(
      "https://glypha.example.ng/updates/certificate-verification",
    );
    expect(withCta.text).toContain(
      "https://glypha.example.ng/updates/certificate-verification",
    );

    // A label with no url is a button that goes nowhere, so both have to be
    // there for the button to appear.
    for (const partial of [
      { ctaLabel: "Read the announcement", ctaUrl: undefined },
      { ctaLabel: undefined, ctaUrl: "https://glypha.example.ng/updates/x" },
    ]) {
      const rendered = renderEmail("platformAnnouncement", {
        ...DATA.platformAnnouncement,
        ...partial,
      });
      expect(rendered.html).not.toContain('role="button"');
    }
  });

  test("takes its subject from the title", () => {
    const rendered = renderEmail("platformAnnouncement", {
      ...DATA.platformAnnouncement,
      title: "New course catalog design",
    });

    expect(rendered.subject).toBe("New course catalog design");
  });

  test("escapes an announcement body rather than injecting it", () => {
    const rendered = renderEmail("platformAnnouncement", {
      ...DATA.platformAnnouncement,
      title: "Careful with <b>markup</b>",
      body: "Do not paste <script>alert(1)</script> into your bio.",
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.subject).toBe("Careful with <b>markup</b>");
  });
});

describe("newCourseDigest", () => {
  const withCourses = (priceKobo?: number) =>
    renderEmail("newCourseDigest", {
      name: "Ada Obi",
      courses: [
        {
          title: "Flutter for beginners",
          slug: "flutter-for-beginners",
          description: "Build a real app on your phone.",
          instructorName: "Tunde Bakare",
          ...(priceKobo === undefined ? {} : { priceKobo }),
        },
      ],
    });

  test("shows the price when it is a positive amount", () => {
    expect(withCourses(1500000).html).toContain("₦15,000");
    expect(withCourses(1500000).text).toContain("₦15,000");
  });

  test("omits the price when it is absent", () => {
    const rendered = withCourses(undefined);

    expect(rendered.html).not.toContain("₦");
    expect(rendered.text).not.toContain("₦");
  });

  test("omits the price when it is zero or negative", () => {
    for (const priceKobo of [0, -5000]) {
      const rendered = withCourses(priceKobo);
      expect(rendered.html).not.toContain("₦");
      expect(rendered.text).not.toContain("₦");
    }
  });

  test("keeps fractional naira rather than rounding to the wrong price", () => {
    expect(withCourses(12550).html).toContain("₦125.50");
  });

  test("renders sensibly with no courses at all", () => {
    const rendered = renderEmail("newCourseDigest", {
      name: "Ada Obi",
      courses: [],
    });

    expect(rendered.subject).toBe("New courses on Glypha Learn");
    expect(rendered.html).toContain("<!doctype html>");
    expect(rendered.html).toContain("No new courses have been published");
    expect(rendered.html).not.toContain("undefined");
    expect(rendered.text).toContain(`${SITE_URL}/courses`);
  });

  test("sends at most six courses and points at the catalog for the rest", () => {
    const rendered = renderEmail("newCourseDigest", {
      name: "Ada Obi",
      courses: Array.from({ length: 9 }, (_, i) => ({
        title: `Course number ${i + 1}`,
        slug: `course-${i + 1}`,
        description: "A description.",
        instructorName: "Tunde Bakare",
      })),
    });

    expect(rendered.html).toContain("Course number 6");
    expect(rendered.html).not.toContain("Course number 7");
    expect(rendered.html).toContain("3 more courses waiting in the catalog");
  });

  test("escapes a course title", () => {
    const rendered = renderEmail("newCourseDigest", {
      name: "Ada Obi",
      courses: [
        {
          title: "Bugs <script>alert(1)</script>",
          slug: "bugs",
          description: "A description.",
          instructorName: "Tunde Bakare",
        },
      ],
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });
});

describe("course progress", () => {
  test("courseStalled shows the progress percentage", () => {
    const { html, text } = renderEmail("courseStalled", DATA.courseStalled);

    expect(html).toContain("62%");
    expect(text).toContain("62%");
    expect(html).toContain("9 lessons");
    expect(html).toContain("6 lessons");
  });

  test("courseStalled counts down to zero without going negative", () => {
    const { html } = renderEmail("courseStalled", {
      ...DATA.courseStalled,
      completedLessons: 15,
      totalLessons: 15,
      progressPercent: 100,
    });

    expect(html).not.toContain("-1 lessons");
    expect(html).toContain("0 lessons");
    expect(html).toContain("100%");
  });

  test("states how long someone has been away without blaming them", () => {
    const sentence = (idleDays: number) =>
      renderEmail("courseStalled", { ...DATA.courseStalled, idleDays }).html;

    expect(sentence(0)).toContain("You were last here today.");
    expect(sentence(1)).toContain("You were last here yesterday.");
    expect(sentence(12)).toContain("You were last here 12 days ago.");
  });

  test("courseAlmostDone counts what is left, in the singular too", () => {
    const one = renderEmail("courseAlmostDone", {
      ...DATA.courseAlmostDone,
      completedLessons: 15,
      totalLessons: 16,
      progressPercent: 94,
    });

    expect(one.subject).toContain("1 lesson left");
    expect(one.html).toContain("1 lesson to go");
    // "Only 1 lesson are left" is the kind of thing that ships.
    expect(one.html).toContain("Only 1 lesson is left");
    expect(one.text).toContain("Only 1 lesson is left");
    expect(one.html).not.toContain("are left");

    const two = renderEmail("courseAlmostDone", DATA.courseAlmostDone);
    expect(two.html).toContain("Only 2 lessons are left");
  });

  test("courseCompleted states the certificate is on its way", () => {
    // It is issued by a separate scheduled mutation, so this mail cannot claim
    // it has arrived.
    const { html } = renderEmail("courseCompleted", DATA.courseCompleted);

    expect(html).toContain("certificate is on its way");
    expect(html).not.toContain("Your certificate is ready");
  });

  test("enrollmentConfirmed mentions payment only when the course was paid", () => {
    const paid = renderEmail("enrollmentConfirmed", DATA.enrollmentConfirmed);
    expect(paid.html).toContain("Your payment went through");

    const free = renderEmail("enrollmentConfirmed", {
      ...DATA.enrollmentConfirmed,
      isPaid: false,
    });
    expect(free.html).not.toContain("payment");
    expect(free.text).not.toContain("payment");
  });

  test("renders a rough duration rather than a false precision", () => {
    expect(
      renderEmail("enrollmentConfirmed", {
        ...DATA.enrollmentConfirmed,
        totalMinutes: 205,
      }).html,
    ).toContain("3 hours 25 minutes");

    expect(
      renderEmail("enrollmentConfirmed", {
        ...DATA.enrollmentConfirmed,
        totalMinutes: 45,
      }).html,
    ).toContain("45 minutes");

    expect(
      renderEmail("enrollmentConfirmed", {
        ...DATA.enrollmentConfirmed,
        totalMinutes: 120,
      }).html,
    ).toContain("2 hours");
  });

  test("courseNotStarted quotes the lesson title in plain text", () => {
    // A lesson title starts with a capital, so it is quoted in the text
    // version where nothing else sets it apart from the sentence.
    const { text } = renderEmail("courseNotStarted", DATA.courseNotStarted);

    expect(text).toContain('It begins with "The double entry rule"');
    expect(text).toContain("lesson one of 12");
    expect(text).toContain("4 days ago");
  });

  test("discussionReply names the course without a doubled comma", () => {
    const { html } = renderEmail("discussionReply", DATA.discussionReply);

    expect(html).toContain("part of");
    expect(html).not.toContain('", in ');
  });
});

describe("securityNotice", () => {
  test("leaves out the device and ip when the event did not carry them", () => {
    const rendered = renderEmail("securityNotice", {
      name: "Ada Obi",
      event: "Password changed",
      when: "14 October 2026, 09:41 WAT",
    });

    expect(rendered.html).toContain("Password changed");
    expect(rendered.html).not.toContain("Chrome on Android");
    expect(rendered.html).not.toContain("IP address");
    expect(rendered.html).not.toContain("undefined");
    expect(rendered.text).not.toContain("undefined");
  });

  test("tells the reader what to do if it was not them", () => {
    const { text } = renderEmail("securityNotice", DATA.securityNotice);

    expect(text).toContain("change your password");
    expect(text).toContain(`${SITE_URL}/dashboard/settings`);
  });
});

describe("instructorApplicationDecision", () => {
  const base = DATA.instructorApplicationDecision;

  test("approved welcomes and links to the instructor dashboard", () => {
    const approved = renderEmail("instructorApplicationDecision", {
      ...base,
      decision: "approved",
    });

    expect(approved.subject).toContain("approved");
    expect(approved.html).toContain("approved");
    expect(approved.html).toContain(`${SITE_URL}/dashboard/instructor`);
    // The payout setup dialog has no route; the link lands on the receipt
    // section on Earnings, which holds the button that opens the dialog.
    expect(approved.html).toContain(
      `${SITE_URL}/dashboard/instructor/earnings#payout-account`,
    );
    expect(approved.html).not.toContain("not approved");
  });

  test("rejected states it plainly, without inviting an argument", () => {
    const rejected = renderEmail("instructorApplicationDecision", {
      ...base,
      decision: "rejected",
      reviewNote: "Portfolio shows real classroom experience.",
    });

    expect(rejected.subject).not.toContain("approved");
    expect(rejected.html).toContain("not approved");
    expect(rejected.html).toContain("Portfolio shows real classroom experience.");
    expect(rejected.text).toContain("Portfolio shows real classroom experience.");
    // No reply invitation, no link to argue the decision.
    expect(rejected.html).not.toContain("reply to");
    expect(rejected.html).not.toContain("mailto:");
  });

  test("the two decisions do not read alike", () => {
    const approved = renderEmail("instructorApplicationDecision", {
      ...base,
      decision: "approved",
    });
    const rejected = renderEmail("instructorApplicationDecision", {
      ...base,
      decision: "rejected",
    });

    expect(approved.subject).not.toBe(rejected.subject);
    expect(approved.html).not.toBe(rejected.html);
    expect(approved.text).not.toBe(rejected.text);
  });
});

describe("argument validation", () => {
  test("throws naming the template and the field that is missing", () => {
    expect(() =>
      renderEmail("paymentReceipt", {
        ...DATA.paymentReceipt,
        amountFormatted: undefined as never,
      }),
    ).toThrow(/paymentReceipt/);
    expect(() =>
      renderEmail("paymentReceipt", {
        ...DATA.paymentReceipt,
        amountFormatted: undefined as never,
      }),
    ).toThrow(/amountFormatted/);
  });

  test("throws on an empty object", () => {
    expect(() => renderEmail("certificateIssued", {} as never)).toThrow(
      /certificateIssued/,
    );
    expect(() => renderEmail("welcome", undefined as never)).toThrow(
      /welcome/,
    );
  });

  test("throws on an empty string, which renders as a hole in a sentence", () => {
    expect(() =>
      renderEmail("discussionReply", {
        ...DATA.discussionReply,
        threadTitle: "   ",
      }),
    ).toThrow(/threadTitle/);
  });

  test("throws on a NaN number rather than mailing one", () => {
    expect(() =>
      renderEmail("courseStalled", {
        ...DATA.courseStalled,
        progressPercent: Number.NaN,
      }),
    ).toThrow(/progressPercent/);
  });

  test("throws when a digest entry has no title to print", () => {
    expect(() =>
      renderEmail("newCourseDigest", {
        name: "Ada Obi",
        courses: [
          {
            title: "",
            slug: "flutter-for-beginners",
            description: "A description.",
            instructorName: "Tunde Bakare",
          },
        ],
      }),
    ).toThrow(/courses\[0\]\.title/);
  });

  test("accepts zero, which is a real value rather than a missing one", () => {
    expect(
      renderEmail("assignmentGraded", {
        ...DATA.assignmentGraded,
        score: 0,
        maxPoints: 0,
      }).subject,
    ).not.toBe("");
  });
});

describe("copy rules", () => {
  // The house style for these emails, asserted so it survives the next person
  // who adds a line.
  const BANNED = [
    "dive in",
    "unlock",
    "elevate",
    "supercharge",
    "seamless",
    "journey",
    "passion",
    "empower",
    "game-changer",
    "transformative",
    "leverage",
    "delve",
    "crucial",
    "vital",
    "thriving",
    "at the end of the day",
    "we're excited",
    "we are excited",
    "we're thrilled",
    "we are thrilled",
  ];

  const EMOJI =
    /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

  /** Names that are capitalised by definition, so not Title Case offenders. */
  const PROPER_NOUNS = ["Glypha Learn", "Paystack", "WAT"];

  for (const id of IDS) {
    test(`${id} reads in the house voice`, () => {
      const rendered = renderEmail(id, DATA[id]);
      // The html carries the copy with entities in it, so the subject and the
      // text version are what get checked. Both are written by the same person
      // from the same strings.
      const copy = `${rendered.subject}\n${rendered.text}`;

      expect(copy).not.toMatch(/—/); // em dash
      expect(copy).not.toMatch(EMOJI);

      for (const phrase of BANNED) {
        expect(copy.toLowerCase()).not.toContain(phrase);
      }

      // Transactional mail reports facts, so it does not cheer.
      if (EXPECTED[id].category === "transactional") {
        expect(copy).not.toContain("!");
      }
    });

    test(`${id} writes sentence case headings`, () => {
      const rendered = renderEmail(id, DATA[id]);
      const headings = [
        ...rendered.html.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g),
        ...rendered.html.matchAll(/<title>([^<]*)<\/title>/g),
      ].map((match) => match[1]);

      expect(headings.length).toBeGreaterThan(0);
      for (const heading of headings) {
        // Proper nouns are capitalised wherever they fall, so they are removed
        // before the check. What is left is the start of a sentence and
        // ordinary words, and Title Case would leave two capitals in a row.
        const plain = PROPER_NOUNS.reduce(
          (text, noun) => text.replaceAll(noun, " "),
          heading,
        );
        // Sentences may start with a capital, so only later words are checked.
        const words = plain.split(/\s+/);
        expect(words.slice(1).join(" ")).not.toMatch(/\b[A-Z][a-z]+ [A-Z][a-z]+/);
      }
    });
  }

  test("the subject is a single line", () => {
    for (const id of IDS) {
      const { subject } = renderEmail(id, DATA[id]);
      expect(subject).not.toMatch(/[\r\n]/);
    }
  });
});