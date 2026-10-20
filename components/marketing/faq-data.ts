/**
 * The FAQ content, kept out of the component so the schema can be built on the
 * server.
 *
 * The accordion is a client component (it toggles), but the structured data
 * has to be in the server-rendered HTML — a schema injected after hydration is
 * invisible to a crawler that does not run JavaScript. Holding the copy here
 * means one list serves both, and the two cannot drift apart.
 */

export interface FaqEntry {
  q: string;
  a: string;
}

export const FAQS: readonly FaqEntry[] = [
  {
    q: "Are the certificates actually verifiable?",
    a: "Yes. Each certificate is issued with a unique ID and a public verification page of its own. An employer, a client or a school can confirm it in seconds without contacting us.",
  },
  {
    q: "How much do courses cost?",
    a: "It depends on the course. Many are free, and paid ones are priced in naira and settled through Paystack. The price is always on the listing before you enroll, and there are no added fees at checkout.",
  },
  {
    q: "What exactly is the preference star?",
    a: "It appears next to your name across the GlyphaWeb platform once you complete a course. It marks you as someone whose skills have been verified, and it stays there.",
  },
  {
    q: "Who can become an instructor?",
    a: "Anyone with real expertise. You apply with your portfolio and bio, and a person reads it before publishing access is granted. That review is how the catalog stays curated.",
  },
  {
    q: "Do I need an account to browse?",
    a: "No. The whole catalog is open. You only need to sign in to enroll, track your progress, take quizzes and earn certificates.",
  },
];
