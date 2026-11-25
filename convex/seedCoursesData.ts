/**
 * Seed content for "Conversion Copywriting: From Blank Page to Paid Client".
 *
 * One typed source of truth consumed by `convex/seedCourses.ts`. Pure data — no
 * Convex imports — so the bodies stay readable and the seed mutation stays a
 * dumb inserter. Lesson bodies are full markdown; quizzes carry their own
 * answer key; assignments are brief+rubric article lessons (the LMS has no
 * graded-assignment system, so the rubric is text the learner reads, not state).
 * Toolkits are `presentation` lessons whose `.md` file is uploaded to storage
 * by the seed action and linked via `presentationStorageId`.
 */

export type QuizOption = { text: string; isCorrect: boolean };
export type QuizQuestion = { prompt: string; options: QuizOption[] };
export type QuizSpec = { title: string; passingScore: number; questions: QuizQuestion[] };

export type LessonSpec = {
  title: string;
  contentType: "article" | "quiz" | "presentation";
  section: string;
  content?: string;
  /** Quiz payload when contentType === "quiz". */
  quiz?: QuizSpec;
  /** Toolkit file name + body when contentType === "presentation". */
  toolkit?: { fileName: string; body: string };
};

/**
 * The capstone a graduate walks away with — the job-ready output the whole
 * course builds toward (Assignment 6). Showcased on the public course page via
 * `courseProjects`.
 */
export type CapstoneProject = {
  title: string;
  description: string;
  techStack: string[];
  outcome: string;
};

export const copywritingCapstone: CapstoneProject = {
  title: "Your Job-Ready Conversion Copy Portfolio",
  description:
    "Graduate with a portfolio, not a certificate alone. You leave with three real spec pieces (a landing page, a 5-email welcome flow, and a 3-angle Meta ad campaign), each shown as Before → After → Rationale tied to Voice-of-Customer research. On top of that you record a 2-minute Loom teardown of a real brand's landing page and send five tailored outreach pitches — so the first client conversation starts from proof, not a blank page.",
  techStack: [
    "Voice-of-Customer research",
    "PAS / AIDA / BAB frameworks",
    "Landing page wireframe",
    "Email lifecycle flows",
    "Meta ad angles",
    "Loom audit + cold outreach",
  ],
  outcome:
    "A portfolio, a Loom audit and five pitches you can send today — everything needed to land your first paid copywriting client.",
};

export type CourseSpec = {
  title: string;
  slug: string;
  description: string;
  category: string;
  level: string;
  lessons: LessonSpec[];
};

const M1 = "Module 1: Foundations & Buyer Psychology";
const M2 = "Module 2: Core Mechanics, Hooks & Copy Formulas";
const M3 = "Module 3: Website & Landing Page Copywriting";
const M4 = "Module 4: Email Copywriting & Lifecycle Sequences";
const M5 = "Module 5: Paid Ads & Short-Form Conversion Copy";
const M6 = "Module 6: AI Workflows, Portfolio & Client Acquisition";

const TOOLKITS = "Course Toolkits";

export const copywritingCourse: CourseSpec = {
  title: "Conversion Copywriting: From Blank Page to Paid Client",
  slug: "conversion-copywriting",
  category: "Marketing",
  level: "Beginner to Intermediate",
  description:
    "A 6-module mastery program that takes you from blank page to paying client. Learn to research buyer psychology, write high-converting web, email and ad copy, and package the work into a portfolio that lands your first client. 24 lessons, 6 quizzes, 6 practical assignments and 5 downloadable toolkits.",
  lessons: [
    // ── Module 1 ───────────────────────────────────────────────────────────
    {
      title: "1.1 Copywriting vs. Content Writing",
      contentType: "article",
      section: M1,
      content: `## Two different jobs

**Content writing** educates and entertains. A blog post, a YouTube explainer, a newsletter essay — the goal is attention, trust and SEO. Success looks like reads, shares and rankings.

**Copywriting** drives a measurable action. A landing page, a sales email, an ad — the goal is a click, a signup, a purchase. Success looks like conversions.

Same language, different scoreboard. Confusing the two is why "clever" copy that reads beautifully often sells nothing.

## AIDA: the conversion skeleton

Almost every piece of direct-response copy walks the reader through four stages:

- **Attention** — earn the next three seconds. Headline, hook, first line.
- **Interest** — prove you understand the problem better than they do.
- **Desire** — show the after-state; make the outcome feel real and close.
- **Action** — one clear, low-friction ask.

When a page fails, name the stage that broke. No attention = the headline is weak. No action = the CTA is buried or vague. Diagnose by stage, not by taste.

## Takeaway

Before you write a word, decide what action the reader should take and where they are in AIDA. Content informs; copy moves.`,
    },
    {
      title: "1.2 The 5 Stages of Market Awareness",
      contentType: "article",
      section: M1,
      content: `Eugene Schwartz's framework: write to how aware the reader already is. The same product needs different copy for each stage.

## The five stages

1. **Unaware** — doesn't know they have a problem. Lead with the symptom, not the product. Story and pattern-interrupts.
2. **Problem-Aware** — feels the pain, doesn't know a solution exists. Name the problem precisely; introduce the category.
3. **Solution-Aware** — knows solutions exist, hasn't picked one. Compare approaches; show why yours wins.
4. **Product-Aware** — knows your product, needs a push. Proof, objections, guarantees.
5. **Most Aware** — ready to buy, needs the terms. Price, offer, deadline, CTA.

## Why it matters

Most copy fails because it pitches the product to an audience that is still problem-aware. You cannot sell a solution to someone who doesn't yet feel the problem — and you shouldn't re-educate someone who is most-aware and just wants the buy button.

## Takeaway

Pick one stage per asset. A cold ad is rarely most-aware; a retargeting email often is. Match message to awareness and conversion follows.`,
    },
    {
      title: "1.3 Features vs. Benefits vs. Outcomes",
      contentType: "article",
      section: M1,
      content: `Three layers, increasing emotional pull. Weak copy stops at the first.

## The layers

- **Feature** — what it is. "48-hour battery life."
- **Benefit** — what it does for you. "You can leave the charger at home for a weekend."
- **Outcome** — who you become. "You travel light and never think about battery again."

## The "So What?" drill

Take a feature and ask "so what?" until you reach an emotional or identity-level truth.

- Feature: "Stainless steel, insulated bottle."
- So what? "Keeps drinks cold 24 hours."
- So what? "Your water is still cold after a long hike."
- So what? "You stay sharp and comfortable the whole way, and you trust your gear."

That last line is the outcome. That's what people buy.

## Takeaway

List every feature, then write its benefit and its outcome. Lead the page with outcomes, support with benefits, and let features answer the skeptical "how?" question lower down.`,
    },
    {
      title: "1.4 Deep-Dive Customer Research (Voice of Customer)",
      contentType: "article",
      section: M1,
      content: `The best copy is assembled, not invented. Your customer already wrote it — in reviews, forums and comments. Go collect their exact words.

## Where to mine

- **Reddit** — search "[product] vs", "[product] problems", the niche subreddit.
- **Amazon / G2 / Trustpilot** — read 1- and 5-star reviews; the language is raw.
- **YouTube comments** — objections and desires in plain speech.
- **Competitor reviews** — what people praise and complain about reveals the gap.

## What to extract

- **Pains** — the exact frustrations, in their words.
- **Desires** — the after-state they describe.
- **Objections** — the reasons they hesitate.
- **Phrases** — verbatim lines you can reuse as headlines.

## The rule

Capture verbatim. "It just feels flimsy" beats "low build quality." Your reader trusts their own words more than your paraphrase.

## Takeaway

Spend 30 minutes mining before you write. A Voice-of-Customer sheet is the raw material for every asset that follows — headlines, leads, FAQs and ads all pull from it.`,
    },

    // ── Module 2 ───────────────────────────────────────────────────────────
    {
      title: "2.1 The 80/20 Rule of Headlines & Hooks",
      contentType: "article",
      section: M2,
      content: `On average, five times as many people read the headline as read the body. If the headline fails, the rest is invisible.

## The 4 U's

A strong headline is:

- **Urgent** — why now.
- **Unique** — something new, not a rehash.
- **Ultra-specific** — concrete numbers, names, outcomes.
- **Useful** — a clear payoff for the reader.

Not every headline hits all four, but the more it does, the harder it works.

## Weak vs. strong

- Weak: "Improve Your Copy."
- Strong: "Write 10 Headlines in 5 Minutes Using This PAS Template."

The strong one is specific, useful and unique. The weak one is a wish.

## Takeaway

Write 10–20 headlines before you pick one. Judge each against the 4 U's. The first idea is rarely the best; the tenth usually is.`,
    },
    {
      title: "2.2 Proven Copywriting Frameworks",
      contentType: "article",
      section: M2,
      content: `Frameworks are reusable skeletons. Three that cover most situations:

## PAS — Problem, Agitate, Solution

Name the problem, twist the knife (emotional cost), then offer the solution. Best for pain-aware audiences.

> Struggling to write emails that sell? Every blank page is a day of revenue you won't get back. Our swipe file turns 10 minutes into a full campaign.

## AIDA — Attention, Interest, Desire, Action

The general-purpose arc. Best for cold traffic and landing pages.

## BAB — Before, After, Bridge

Show the current painful state (Before), the desired state (After), then your product as the Bridge. Best for transformation-led offers.

> Before: guessing what to write. After: copy that converts on the first draft. Bridge: a research-backed template.

## Takeaway

Choose the framework by audience awareness: PAS for problem-aware, BAB for outcome-seekers, AIDA for cold. Don't mix three into one muddy message.`,
    },
    {
      title: "2.3 Writing Leads That Slip the Reader Down the Page",
      contentType: "article",
      section: M2,
      content: `Joseph Sugarman's "slippery slide": the only job of the first line is to make the reader read the second line — and so on, effortlessly, to the CTA.

## Four ways to open

- **Story** — drop them into a scene. "The client said no three times. Then I changed one line."
- **Bold claim** — "Most landing pages lose half their buyers in the first screen."
- **Counterintuitive truth** — "Clear copy outsells clever copy every time."
- **Direct question** — "What if your best headline is the one you deleted?"

## The mechanics

Short sentences. One idea per line. Momentum over completeness. Every line should create a small open loop the next line closes.

## Takeaway

Write the first line last. Once the body is solid, craft an opening whose only purpose is to pull the eye to line two. Cut anything that lets the reader stop.`,
    },
    {
      title: "2.4 Micro-Copy, CTAs & Friction Reducers",
      contentType: "article",
      section: M2,
      content: `The button is where intent becomes action — or dies. Micro-copy decides which.

## Fix weak CTAs

- Weak: "Submit", "Buy Now", "Click Here."
- Strong: "Get My Free Audit", "Start My 7-Day Trial", "Send Me the Swipe File."

A good CTA names the outcome in the reader's voice.

## Reduce friction next to the button

- **Risk reversal** — "No card required.", "Cancel anytime."
- **Guarantee** — "30-day money-back."
- **Social proof** — "Join 4,000+ founders."
- **Specificity** — "Takes 2 minutes."

## Takeaway

Pair every CTA with one friction reducer. The button asks for a decision; the line beside it removes the reason to say no. Test CTA copy like a headline — it's the highest-leverage line on the page.`,
    },

    // ── Module 3 ───────────────────────────────────────────────────────────
    {
      title: "3.1 Anatomy of a High-Converting Landing Page",
      contentType: "article",
      section: M3,
      content: `Wireframe the copy before anyone opens a design tool. Structure first, pixels later.

## The section order

1. **Hero** — H1 value prop, H2 subhead, primary CTA.
2. **Problem** — show you understand the pain.
3. **Solution** — how the product resolves it.
4. **Benefits** — outcomes, not a feature dump.
5. **Social proof** — testimonials, logos, numbers.
6. **Objection / FAQ** — the silent closer.
7. **Final CTA** — repeat the ask with a friction reducer.

## Scannability

Readers skim. Short paragraphs, descriptive subheads, one idea per block. Someone should get the gist in five seconds.

## Takeaway

A wireframe in Google Docs or Notion — boxes and copy, no styling — is enough to test flow. Get the order right before you make it pretty.`,
    },
    {
      title: "3.2 Writing the Hero Section",
      contentType: "article",
      section: M3,
      content: `The hero is the 5-second test. A stranger should learn what it is, who it's for, and what to do next — without scrolling.

## The three parts

- **H1 (value proposition)** — the outcome, in plain words. "Ship landing pages that convert, without a designer."
- **H2 (subheadline)** — how it works or who it's for. "Research-backed copy blocks you can paste into any page builder."
- **Primary CTA** — one action. "Build My Page Free."

## The 5-second test

Show the hero to someone for five seconds, then hide it. Ask: what is this, who is it for, what do I do? If they can't answer, the hero is too clever or too vague.

## Takeaway

Clarity beats cleverness above the fold. Specific outcome + clear audience + one button. Save the poetry for the body.`,
    },
    {
      title: "3.3 Social Proof, Authority & Objection Handling",
      contentType: "article",
      section: M3,
      content: `Proof lowers risk; objections are the reasons people don't buy. Handle both on the page.

## Social proof that works

- **Specific testimonials** — name, role, result. "Cut trial-to-paid by 22% in a month."
- **Pull-quotes** — bold the one line that lands; don't bury it in a paragraph.
- **Numbers and logos** — "Trusted by 4,000+ teams" with real logos.

Vague praise ("Great product!") persuades no one. Specific results do.

## FAQ as a silent closer

Turn the FAQ into objection handling. Each answer should kill a buying hesitation:

- Price → justify value / payment options.
- Time → "set up in 10 minutes."
- Trust → guarantee, security, support.

## Takeaway

Place proof near the CTA and the FAQ near the bottom. The best FAQ answers the sentence the buyer is thinking but not saying.`,
    },
    {
      title: "3.4 Editing & Self-Critique Checklist",
      contentType: "article",
      section: M3,
      content: `First drafts are for getting it down; editing is where it starts to sell.

## The pass

- **Cut passive voice** — "Mistakes were made" → "We made mistakes."
- **Kill company-centric language** — replace "we/our" with "you/your."
- **Read it aloud** — anywhere you stumble, the reader stops.
- **One idea per paragraph** — break walls of text.
- **Specific over vague** — "results in 14 days" beats "fast results."

## Rhythm

Vary sentence length. A short line after a long one creates emphasis. Monotone rhythm is a flat page.

## Takeaway

Read the page out loud once. Every place you trip is a place the reader leaves. Editing is not polish — it's conversion work.`,
    },

    // ── Module 4 ───────────────────────────────────────────────────────────
    {
      title: "4.1 Subject Lines & Preview Text Mastery",
      contentType: "article",
      section: M4,
      content: `The subject line and preview text are the open. Lose them and the email never gets read.

## What works

- **Curiosity gap** — open a loop the email closes. "The line that doubled our replies."
- **Pattern interrupt** — say something unexpected. "Don't write your headline first."
- **Specificity** — numbers and names beat adjectives.

## Avoid spam triggers

Skip "FREE!!!", ALL CAPS, and excessive punctuation. They trip filters and erode trust.

## Preview text

It's the second subject line. Extend the hook, don't repeat it. "The line that doubled our replies" + preview "It took 3 words, not 30."

## Takeaway

Write 10 subject lines, pick one, and always pair it with preview text that adds information rather than echoing the subject.`,
    },
    {
      title: "4.2 Anatomy of a High-Converting Email",
      contentType: "article",
      section: M4,
      content: `Most email is read on a phone, in a hurry, with one thumb. Design for that.

## Mobile-first formatting

- **1–2 sentence paragraphs.**
- **One idea per block.**
- **A single focus and a single click.**

## Structure

1. **Hook** — first line earns the second.
2. **Value** — one useful idea, story or insight.
3. **CTA** — one button or link, outcome-focused.

## One email, one job

If the email asks for two things, it gets zero. Pick the single action that matters most and make everything else support it.

## Takeaway

Write for the thumb. Short blocks, one idea, one click. If it reads like a wall on desktop, it's a scroll-past on mobile.`,
    },
    {
      title: "4.3 Building Automated Flows",
      contentType: "article",
      section: M4,
      content: `Flows are emails that send themselves at the right moment. Two every business needs:

## Welcome sequence (3–5 emails)

1. **Indoctrination** — deliver the lead magnet, set expectations.
2. **Origin story** — why you exist; build trust.
3. **Quick win** — one fast, useful action they can take now.
4. **Soft pitch** — introduce the paid offer gently.
5. **(Optional) Urgency** — a reason to act.

## Abandoned cart / objection sequence

1. **Reminder** — "You left something."
2. **Objection handler** — address the top reason they didn't buy.
3. **Proof + urgency** — testimonial and a deadline or stock note.

## Takeaway

Map the moment, not the calendar. A flow converts because it answers the exact question the reader has at that step.`,
    },
    {
      title: "4.4 Story-Driven Broadcast Emails",
      contentType: "article",
      section: M4,
      content: `A broadcast email is a one-off send to your list. The story format ("Seinfeld email") makes it sell without feeling like a pitch.

## The method

1. **A small observation** — something ordinary from your day.
2. **A transition** — connect it to a broader truth about the reader's problem.
3. **The pitch** — introduce the product as the natural next step.

> I watched a founder rewrite the same headline for an hour. The problem wasn't effort — it was that no one had given him a system. That's exactly why we built the swipe file…

## Why it works

The story earns attention; the transition earns relevance; only then does the pitch feel earned rather than abrupt.

## Takeaway

Keep a note of daily observations. Each one is a future email. The pitch lands because the story made the reader nod first.`,
    },

    // ── Module 5 ───────────────────────────────────────────────────────────
    {
      title: "5.1 Stopping the Scroll (Visual + Copy Synergy)",
      contentType: "article",
      section: M5,
      content: `In a crowded feed you have about two seconds. The ad's first job is to stop the thumb.

## Copy + creative as one unit

The headline, the image and the first line must agree. A bold visual with a timid headline wastes both. Write copy and brief the creative together.

## Hook patterns

- **Pattern interrupt** — something that doesn't look like an ad.
- **Bold claim** — "Stop writing headlines by hand."
- **Callout** — "For course creators who hate blank pages."

## The first frame

For video, the first frame is the headline. If it doesn't earn the next second, nothing else matters.

## Takeaway

Never brief creative and copy separately. The scroll-stopper is a single message delivered by image and words at once.`,
    },
    {
      title: "5.2 Writing Facebook/Instagram (Meta) Ads",
      contentType: "article",
      section: M5,
      content: `Meta ads reward testing multiple angles against one audience.

## Three angles to test

- **Pain angle** — lead with the frustration. "Blank page again?"
- **Us vs. Them** — contrast the old way with the new. "Most copy sounds like everyone else's. Yours won't."
- **Social proof angle** — "4,000+ founders write with this."

## Short vs. long form

- **Short copy** — punchy, one idea, fast.
- **Long-form story ad** — a mini VSL in text; story → problem → solution → CTA.

## Structure

Hook line → 1–2 value lines → CTA. Front-load the hook; Meta truncates.

## Takeaway

Run at least three angles, not three versions of one. Different angles find different buyers; the winner tells you which pain to lead with everywhere.`,
    },
    {
      title: "5.3 B2B & LinkedIn Ad Copy",
      contentType: "article",
      section: M5,
      content: `B2B buyers aren't a different species — but the stakes and the language change.

## Speak to

- **ROI** — time and money saved.
- **Career risk** — the cost of a bad decision to the person making it.
- **Efficiency** — fewer hours, faster output.

## Tone

Professional, specific, low-hype. A B2B buyer is often spending someone else's money and answerable for it; proof and clarity beat excitement.

## Example

"Your team ships 3x more landing pages without hiring. See how Acme cut campaign build time from days to hours — 14-day pilot, no card."

## Takeaway

For B2B, swap "dream" for "de-risked decision." Lead with measurable return and make the buyer look smart to their boss.`,
    },
    {
      title: "5.4 UGC & Short-Form Video Ad Scripts",
      contentType: "article",
      section: M5,
      content: `Short-form video (TikTok, Reels) lives or dies in the first three seconds and the pacing after.

## The 30-second structure

- **Hook (0–3s)** — stop the scroll. A bold line or a visual surprise.
- **Problem / Demo (3–20s)** — show the pain, then the product solving it.
- **Proof & CTA (20–30s)** — result + one action.

## UGC feel

Lo-fi, first-person, native to the platform. Over-produced reads as an ad and gets skipped. Talk like a person, not a brand.

## Example beats

- 0–3s: "I wrote this email in 4 minutes."
- 3–20s: screen-record the template filling in.
- 20–30s: "4,000 founders use it. Link in bio."

## Takeaway

Write to the clock. If a second doesn't move toward the CTA, cut it. Native beats polished on short-form.`,
    },

    // ── Module 6 ───────────────────────────────────────────────────────────
    {
      title: "6.1 Ethical & Effective AI-Assisted Copywriting",
      contentType: "article",
      section: M6,
      content: `AI is a research assistant and a sparring partner — not the voice. Use it to go faster without sounding like a robot.

## Good uses

- **Summarize reviews** — cluster 200 reviews into pains and desires.
- **Generate angle variations** — 10 PAS hooks to edit down.
- **Stress-test objections** — "what would a skeptic say about this claim?"

## Guardrails

- **Keep the human voice** — AI drafts are a starting point, never the final.
- **Verify claims** — it will invent specifics; never ship an unverified number.
- **Preserve nuance** — emotion and cultural context are yours to add.

## Takeaway

Use AI to widen the top of the funnel (research, variations) and your judgment to close it (selection, voice, truth). The output is only as good as the VoC sheet you feed it.`,
    },
    {
      title: "6.2 Building a Spec Portfolio That Looks Real",
      contentType: "article",
      section: M6,
      content: `With no clients yet, spec work is proof. Redesign a real brand's weak copy and show the thinking.

## Three spec pieces

Pick three real brands with weak copy. For each:

1. **Before** — screenshot their current page/email/ad.
2. **After** — your rewrite.
3. **Rationale** — the research and framework behind each change.

## Why rationale matters

Clients hire judgment, not words. The "why" is what separates a copywriter from a rewriter. Tie every change to a VoC insight or a framework (PAS, 4 U's).

## Takeaway

A portfolio of three before/after/rationale pieces reads as paid work. Lead with the rationale — it's the part nobody can fake.`,
    },
    {
      title: "6.3 Pricing, Packaging & Proposals",
      contentType: "article",
      section: M6,
      content: `Hourly billing punishes speed and confuses buyers. Package by outcome.

## Package, don't bill time

- **Landing Page Package** — one page, fixed fee.
- **Email Flow Package** — a 5-email sequence, fixed fee.
- **Retainer** — ongoing monthly copy for a set scope.

## Proposals that close

1. **Their problem** — in their words (from research).
2. **The outcome** — what changes.
3. **The package + price** — clear, fixed.
4. **Next step** — one action.

## Takeaway

Price the result, not the hours. A fixed package with a clear outcome is easier to say yes to than an hourly estimate that makes the buyer fear a runaway bill.`,
    },
    {
      title: "6.4 Inbound & Outbound Client Acquisition",
      contentType: "article",
      section: M6,
      content: `Clients come from two directions: they find you (inbound) or you find them (outbound). Both reward specificity.

## Outbound: the Loom audit

Record a 2-minute personalized video walking through one real improvement to the prospect's page. It proves skill and effort before the first reply. Pair with a short, specific email — not a mass template.

## Inbound: profile optimization

Your LinkedIn/X headline should say who you help and how. "I write landing pages that turn readers into trials for B2B SaaS." Pin your best spec work.

## The pitch email

- **Specific** — name their page and the one change.
- **Short** — under 100 words.
- **One ask** — a reply, not a sale.

## Takeaway

Specific beats volume. Five tailored pitches with Loom audits outperform five hundred templates. Optimize the profile so inbound compounds while you do outbound.`,
    },

    // ── Assignments (article briefs, one per module) ─────────────────────────
    {
      title: "Assignment 1: Voice-of-Customer (VoC) Sheet",
      contentType: "article",
      section: M1,
      content: `## Brief

Pick a real product. Spend 30 minutes mining reviews (Amazon, G2, Trustpilot, Reddit, YouTube comments). Complete a VoC sheet: **top 5 pains, top 5 desires, 3 major objections** — all in verbatim customer language.

## Rubric (100 points)

- **Research depth & verbatim quotes (35)** — real phrasing from reviews/forums, not generic assumptions.
- **5 pains & 5 desires mapped (30)** — surface symptom vs. emotional driver vs. desired outcome clearly separated.
- **3 objections & counter-angles (20)** — realistic blockers paired with practical responses.
- **Clarity & organization (15)** — clean structure ready for downstream copy.

## Note

This is a practical task for you to complete and keep — it feeds every later assignment. The LMS does not grade submissions; use the rubric to self-assess.`,
    },
    {
      title: "Assignment 2: 10 Headlines & 3 Opening Leads",
      contentType: "article",
      section: M2,
      content: `## Brief

For the product you researched in Module 1, write **10 distinct headlines** and **3 opening leads** using PAS, AIDA and BAB. Pair each with a CTA and a friction reducer.

## Rubric (100 points)

- **10 headlines across angles (35)** — specificity, urgency, uniqueness, utility; no clickbait.
- **3 formula-driven leads (35)** — PAS, AIDA, BAB tied to the Module 1 VoC sheet.
- **CTA & friction-reducer pairings (15)** — action-specific CTAs with relevant risk reversal or proof.
- **Voice alignment (15)** — consistent tone for the audience.

## Note

Practical task to complete and keep. Self-assess against the rubric; not graded in the LMS.`,
    },
    {
      title: "Assignment 3: Full Landing Page Copy & Wireframe",
      contentType: "article",
      section: M3,
      content: `## Brief

Write and wireframe (Google Docs or Notion) a complete landing page for a B2B SaaS tool or D2C physical product. Copy + section order, no styling.

## Rubric (100 points)

- **Above-the-fold hero & wireframe flow (25)** — clear H1, H2, primary CTA, logical order.
- **Body copy & benefit progression (25)** — scannable, problem → solution, no filler.
- **Proof & objection / FAQ handling (25)** — credible proof and FAQs that address real hesitation.
- **Editing polish (25)** — active voice, reader-focused, clean formatting.

## Instructor feedback priority

This is one of two assignments that carry the highest weight in client acquisition — get a Loom critique if you're in a cohort. Self-assess with the rubric otherwise.`,
    },
    {
      title: "Assignment 4: 5-Part Welcome & Onboarding Sequence",
      contentType: "article",
      section: M4,
      content: `## Brief

Write a 5-email Welcome & Onboarding sequence for an e-commerce brand or newsletter. Include subject lines, preview text and CTAs for each.

## Rubric (100 points)

- **Subject lines & preview text (20)** — compelling, non-spammy pairs across all 5.
- **Sequence arc & progression (30)** — welcome → value → trust → conversion.
- **Mobile readability & single CTA focus (30)** — short paragraphs, rhythm, one CTA per email.
- **Brand consistency (20)** — cohesive voice across the sequence.

## Instructor feedback priority

High-weight for client acquisition — get a Loom critique if cohort-based. Self-assess with the rubric otherwise.`,
    },
    {
      title: "Assignment 5: 3-Angle Ad Campaign + 30s Video Script",
      contentType: "article",
      section: M5,
      content: `## Brief

Create a 3-angle Meta ad campaign (3 primary texts, 3 headlines, 3 creative briefs) plus one 30-second video ad script.

## Rubric (100 points)

- **3 distinct ad angles (35)** — pain, comparison/contrast, proof.
- **Creative briefs (20)** — visual/concept direction aligned to each angle.
- **30-second video script (30)** — tight pacing across hook, problem/demo, proof/CTA.
- **Platform fit (15)** — copy tuned to feed and short-form pacing.

## Note

Practical task to complete and keep. Self-assess against the rubric; not graded in the LMS.`,
    },
    {
      title: "Assignment 6: Live Portfolio, Loom Teardown & 5 Pitches",
      contentType: "article",
      section: M6,
      content: `## Brief

Assemble your 3 earlier assignments into a clean online portfolio, record a 2-minute Loom teardown of a real brand's landing page, and send 5 tailored outreach pitches.

## Rubric (200 points)

- **Online portfolio presentation (60)** — curated work with context and rationale, not raw drafts.
- **2-minute Loom landing page audit (60)** — concise, constructive, high-impact improvements within time.
- **5 tailored outreach pitches (50)** — personalized to real prospect context, not mass templates.
- **Professionalism & completeness (30)** — all links, assets and notes submitted cleanly.

## Note

Capstone practical task. The LMS does not grade or store submissions — this is your job-ready output. Self-assess with the rubric.`,
    },

    // ── Toolkits (presentation lessons with uploaded .md files) ──────────────
    {
      title: "Toolkit 1: Voice-of-Customer Research Template",
      contentType: "presentation",
      section: TOOLKITS,
      toolkit: {
        fileName: "voc-research-template.md",
        body: `# Voice-of-Customer (VoC) Research Template

Product: ____________________  Date: ____________

## Sources mined (URLs)
- Reddit:
- Amazon / G2 / Trustpilot:
- YouTube comments:
- Competitor reviews:

## Top 5 Pains (verbatim)
1.
2.
3.
4.
5.

## Top 5 Desires (verbatim)
1.
2.
3.
4.
5.

## 3 Major Objections + Counter-Angles
| Objection | Counter-angle |
|-----------|---------------|
|           |               |
|           |               |
|           |               |

## Best verbatim phrases (for headlines)
-
-
`,
      },
    },
    {
      title: "Toolkit 2: Headline & Hook Swipe File",
      contentType: "presentation",
      section: TOOLKITS,
      toolkit: {
        fileName: "headline-hook-swipe-file.md",
        body: `# Headline & Hook Swipe File (100+ patterns)

## The 4 U's checklist
Urgent · Unique · Ultra-specific · Useful

## Number / list
- "7 ways to ___ without ___"
- "3 mistakes that ___"
- "The 5-minute ___"

## Question
- "What if ___?"
- "Why does ___ keep ___?"
- "Are you ___?"

## How-to
- "How to ___ in ___ (even if ___)"
- "The fastest way to ___"

## Before/After (BAB)
- "From ___ to ___ in ___"
- "___ without ___"

## Us vs. Them
- "Most ___. We ___."
- "Stop ___. Start ___."

## Proof
- "How ___ cut ___ by ___%"
- "Join ___+ ___ who ___"

## Curiosity gap
- "The one line that ___"
- "Don't ___ until you ___"

## Negative / contrarian
- "Don't ___ first."
- "Why ___ is killing your ___"

## Fill-in templates (complete 20)
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
11.
12.
13.
14.
15.
16.
17.
18.
19.
20.
`,
      },
    },
    {
      title: "Toolkit 3: Landing Page Wireframe Blueprint",
      contentType: "presentation",
      section: TOOLKITS,
      toolkit: {
        fileName: "landing-page-wireframe.md",
        body: `# Landing Page Wireframe Blueprint

## 1. Hero
- H1 (value prop):
- H2 (subhead / audience):
- Primary CTA:
- Friction reducer:

## 2. Problem
- The pain, in the reader's words:

## 3. Solution
- How the product resolves it:

## 4. Benefits (outcomes first)
- Outcome 1:
- Outcome 2:
- Outcome 3:
- (Features that prove it:)

## 5. Social proof
- Testimonial (name, role, result):
- Numbers / logos:

## 6. Objection / FAQ
- Price objection → answer:
- Time objection → answer:
- Trust objection → answer:

## 7. Final CTA
- Repeat ask + friction reducer:

---
Editing pass: [ ] active voice [ ] you/your over we/our [ ] read aloud [ ] one idea per block
`,
      },
    },
    {
      title: "Toolkit 4: 25-Point Copy Editing Checklist",
      contentType: "presentation",
      section: TOOLKITS,
      toolkit: {
        fileName: "copy-editing-checklist.md",
        body: `# 25-Point Copy Editing Checklist

## Clarity
1. H1 passes the 5-second test
2. One idea per paragraph
3. Jargon removed
4. Sentences under ~20 words on average
5. Rhythm varies (short after long)

## Voice
6. Active voice throughout
7. "You/your" over "we/our"
8. Consistent tone
9. No AI filler ("in today's fast-paced world")
10. Reads aloud without stumbling

## Conversion
11. One CTA per section
12. CTA names the outcome
13. Friction reducer next to each CTA
14. Objections handled (FAQ)
15. Proof is specific (names, numbers)

## Specificity
16. Numbers over adjectives
17. Verbatim customer phrases used
18. Claims are verifiable
19. No unverified stats
20. Outcome > feature in headlines

## Mechanics
21. Headline uses 4 U's
22. Subject + preview text both written
23. Formatting scannable (subheads, short blocks)
24. Links/buttons tested
25. Final read-aloud pass done
`,
      },
    },
    {
      title: "Toolkit 5: Cold Outreach & Loom Audit Script Pack",
      contentType: "presentation",
      section: TOOLKITS,
      toolkit: {
        fileName: "cold-outreach-loom-scripts.md",
        body: `# Cold Outreach & Loom Audit Script Pack

## The 2-minute Loom audit structure
1. (0–10s) Intro: who you are, why you made this for them.
2. (10–30s) The one thing that's working.
3. (30–90s) The one high-impact improvement (show, don't just tell).
4. (90–120s) The rewrite + soft CTA ("want the full version?").

## Cold email (<100 words)
Subject: one specific observation about their page
- Line 1: the specific thing you noticed.
- Line 2: the one improvement (link the Loom).
- Line 3: one ask — a reply.

## Follow-up (day 3)
- One new idea or a different angle. No "just bumping this."

## Agency pitch
- "I write conversion copy for [niche]. Here's a 2-min audit of [their client's page]. Want me to do one for your roster?"

## Founder pitch
- "I rebuilt your hero headline using 5 lines from your own reviews. 2-min video here."

## Profile headline formulas
- "I write [asset] that [outcome] for [audience]."
- "[Outcome] for [audience] through [mechanism]."
`,
      },
    },

    // ── Module quizzes (one quiz lesson per module, 10 MCQ each) ─────────────
    {
      title: "Module 1 Quiz",
      contentType: "quiz",
      section: M1,
      quiz: {
        title: "Module 1 Quiz: Foundations & Buyer Psychology",
        passingScore: 75,
        questions: [
          {
            prompt: "What is the primary goal of copywriting (vs. content writing)?",
            options: [
              { text: "To educate and entertain", isCorrect: false },
              { text: "To drive a measurable action", isCorrect: true },
              { text: "To improve SEO rankings", isCorrect: false },
              { text: "To build a social following", isCorrect: false },
            ],
          },
          {
            prompt: "What does the 'A' in AIDA stand for?",
            options: [
              { text: "Authority", isCorrect: false },
              { text: "Attention", isCorrect: true },
              { text: "Action", isCorrect: false },
              { text: "Audience", isCorrect: false },
            ],
          },
          {
            prompt: "A reader who feels a problem but doesn't know a solution exists is in which awareness stage?",
            options: [
              { text: "Unaware", isCorrect: false },
              { text: "Problem-Aware", isCorrect: true },
              { text: "Solution-Aware", isCorrect: false },
              { text: "Most Aware", isCorrect: false },
            ],
          },
          {
            prompt: "Which is an example of an 'outcome' (vs. feature or benefit)?",
            options: [
              { text: "48-hour battery life", isCorrect: false },
              { text: "Leave the charger at home for a weekend", isCorrect: false },
              { text: "You travel light and never think about battery again", isCorrect: true },
              { text: "USB-C charging", isCorrect: false },
            ],
          },
          {
            prompt: "The 'So What?' drill is used to translate a feature into…",
            options: [
              { text: "A technical spec", isCorrect: false },
              { text: "An emotional or identity-level outcome", isCorrect: true },
              { text: "A competitor comparison", isCorrect: false },
              { text: "An SEO keyword", isCorrect: false },
            ],
          },
          {
            prompt: "For a 'Most Aware' audience, the copy should focus on…",
            options: [
              { text: "Explaining the problem from scratch", isCorrect: false },
              { text: "Introducing the product category", isCorrect: false },
              { text: "Price, offer, terms and a clear CTA", isCorrect: true },
              { text: "A long origin story", isCorrect: false },
            ],
          },
          {
            prompt: "Voice-of-Customer research is best sourced from…",
            options: [
              { text: "Your own assumptions", isCorrect: false },
              { text: "Verbatim reviews, forums and comments", isCorrect: true },
              { text: "Competitor ad copy only", isCorrect: false },
              { text: "Industry white papers", isCorrect: false },
            ],
          },
          {
            prompt: "Why capture verbatim customer phrases?",
            options: [
              { text: "To avoid plagiarism claims", isCorrect: false },
              { text: "Readers trust their own words more than a paraphrase", isCorrect: true },
              { text: "It is faster to write", isCorrect: false },
              { text: "Search engines require it", isCorrect: false },
            ],
          },
          {
            prompt: "When a landing page fails to convert, the first step is to…",
            options: [
              { text: "Rewrite every word", isCorrect: false },
              { text: "Name which AIDA stage broke", isCorrect: true },
              { text: "Change the color scheme", isCorrect: false },
              { text: "Add more features", isCorrect: false },
            ],
          },
          {
            prompt: "Which statement best distinguishes copy from content?",
            options: [
              { text: "Copy is always longer", isCorrect: false },
              { text: "Content informs; copy moves the reader to act", isCorrect: true },
              { text: "Copy is only for ads", isCorrect: false },
              { text: "Content never uses emotion", isCorrect: false },
            ],
          },
        ],
      },
    },
    {
      title: "Module 2 Quiz",
      contentType: "quiz",
      section: M2,
      quiz: {
        title: "Module 2 Quiz: Core Mechanics, Hooks & Formulas",
        passingScore: 75,
        questions: [
          {
            prompt: "Roughly how many readers read the headline vs. the body?",
            options: [
              { text: "Everyone reads both equally", isCorrect: false },
              { text: "Five times as many read the headline", isCorrect: true },
              { text: "Half read the body", isCorrect: false },
              { text: "Only subscribers read the body", isCorrect: false },
            ],
          },
          {
            prompt: "Which is NOT one of the 4 U's?",
            options: [
              { text: "Urgent", isCorrect: false },
              { text: "Unique", isCorrect: false },
              { text: "Universal", isCorrect: true },
              { text: "Ultra-specific", isCorrect: false },
            ],
          },
          {
            prompt: "PAS stands for…",
            options: [
              { text: "Problem, Agitate, Solution", isCorrect: true },
              { text: "Promise, Action, Support", isCorrect: false },
              { text: "Problem, Answer, Summary", isCorrect: false },
              { text: "Pitch, Agitate, Sell", isCorrect: false },
            ],
          },
          {
            prompt: "BAB is best suited to…",
            options: [
              { text: "A most-aware audience ready to buy", isCorrect: false },
              { text: "A transformation-led / outcome-seeking offer", isCorrect: true },
              { text: "Pure SEO content", isCorrect: false },
              { text: "Internal documentation", isCorrect: false },
            ],
          },
          {
            prompt: "The 'slippery slide' concept says the first line's job is to…",
            options: [
              { text: "List every feature", isCorrect: false },
              { text: "Make the reader read the next line", isCorrect: true },
              { text: "State the price", isCorrect: false },
              { text: "Repeat the headline", isCorrect: false },
            ],
          },
          {
            prompt: "Which is a stronger CTA?",
            options: [
              { text: "Submit", isCorrect: false },
              { text: "Click Here", isCorrect: false },
              { text: "Get My Free Audit", isCorrect: true },
              { text: "Buy Now", isCorrect: false },
            ],
          },
          {
            prompt: "A friction reducer placed next to a CTA is meant to…",
            options: [
              { text: "Increase the word count", isCorrect: false },
              { text: "Remove a reason to say no", isCorrect: true },
              { text: "Add more features", isCorrect: false },
              { text: "Replace the CTA", isCorrect: false },
            ],
          },
          {
            prompt: "How many headlines should you write before picking one?",
            options: [
              { text: "One", isCorrect: false },
              { text: "Exactly three", isCorrect: false },
              { text: "10–20, then judge against the 4 U's", isCorrect: true },
              { text: "As few as possible", isCorrect: false },
            ],
          },
          {
            prompt: "Which opening is an example of a 'counterintuitive truth'?",
            options: [
              { text: "Buy our product today", isCorrect: false },
              { text: "Clear copy outsells clever copy every time", isCorrect: true },
              { text: "Our features include X, Y, Z", isCorrect: false },
              { text: "Sign up for our newsletter", isCorrect: false },
            ],
          },
          {
            prompt: "When should you write the first line of a lead?",
            options: [
              { text: "Before anything else", isCorrect: false },
              { text: "Last, once the body is solid", isCorrect: true },
              { text: "Never — let the template decide", isCorrect: false },
              { text: "Only after the design is done", isCorrect: false },
            ],
          },
        ],
      },
    },
    {
      title: "Module 3 Quiz",
      contentType: "quiz",
      section: M3,
      quiz: {
        title: "Module 3 Quiz: Website & Landing Page Copywriting",
        passingScore: 75,
        questions: [
          {
            prompt: "What should you do before opening a design tool?",
            options: [
              { text: "Pick a color palette", isCorrect: false },
              { text: "Wireframe the copy / section order", isCorrect: true },
              { text: "Choose a font", isCorrect: false },
              { text: "Buy a domain", isCorrect: false },
            ],
          },
          {
            prompt: "The hero section must pass which test?",
            options: [
              { text: "The 5-second test", isCorrect: true },
              { text: "The 5-page test", isCorrect: false },
              { text: "The spell-check test", isCorrect: false },
              { text: "The mobile-only test", isCorrect: false },
            ],
          },
          {
            prompt: "The H1 of a hero should communicate…",
            options: [
              { text: "The company's founding year", isCorrect: false },
              { text: "The value proposition / outcome in plain words", isCorrect: true },
              { text: "A full feature list", isCorrect: false },
              { text: "The CEO's name", isCorrect: false },
            ],
          },
          {
            prompt: "Which testimonial is most persuasive?",
            options: [
              { text: "\"Great product!\"", isCorrect: false },
              { text: "\"It's nice.\"", isCorrect: false },
              { text: "\"Cut trial-to-paid by 22% in a month.\" — name, role", isCorrect: true },
              { text: "A logo with no context", isCorrect: false },
            ],
          },
          {
            prompt: "The FAQ section works best as…",
            options: [
              { text: "A keyword dump", isCorrect: false },
              { text: "A silent closer that handles objections", isCorrect: true },
              { text: "A place to repeat the hero", isCorrect: false },
              { text: "An afterthought", isCorrect: false },
            ],
          },
          {
            prompt: "Which edit improves conversion copy?",
            options: [
              { text: "Add more passive voice", isCorrect: false },
              { text: "Replace 'we/our' with 'you/your'", isCorrect: true },
              { text: "Lengthen every sentence", isCorrect: false },
              { text: "Remove all subheads", isCorrect: false },
            ],
          },
          {
            prompt: "Why read copy aloud when editing?",
            options: [
              { text: "To fill time", isCorrect: false },
              { text: "Anywhere you stumble, the reader stops", isCorrect: true },
              { text: "To check spelling only", isCorrect: false },
              { text: "It is a legal requirement", isCorrect: false },
            ],
          },
          {
            prompt: "A scannable page uses…",
            options: [
              { text: "Walls of text", isCorrect: false },
              { text: "Short paragraphs and descriptive subheads", isCorrect: true },
              { text: "Only images", isCorrect: false },
              { text: "No headings", isCorrect: false },
            ],
          },
          {
            prompt: "Where should social proof sit relative to the CTA?",
            options: [
              { text: "Nowhere near it", isCorrect: false },
              { text: "Near the CTA to lower perceived risk", isCorrect: true },
              { text: "Only in the footer", isCorrect: false },
              { text: "On a separate page", isCorrect: false },
            ],
          },
          {
            prompt: "Features belong on the page mainly to…",
            options: [
              { text: "Open the page", isCorrect: false },
              { text: "Answer the skeptical 'how?' lower down", isCorrect: true },
              { text: "Replace benefits", isCorrect: false },
              { text: "Fill space", isCorrect: false },
            ],
          },
        ],
      },
    },
    {
      title: "Module 4 Quiz",
      contentType: "quiz",
      section: M4,
      quiz: {
        title: "Module 4 Quiz: Email Copywriting & Lifecycle Sequences",
        passingScore: 75,
        questions: [
          {
            prompt: "Preview text should…",
            options: [
              { text: "Repeat the subject line exactly", isCorrect: false },
              { text: "Extend the hook with new information", isCorrect: true },
              { text: "Be left blank", isCorrect: false },
              { text: "Contain only the brand name", isCorrect: false },
            ],
          },
          {
            prompt: "Which subject line is most likely to hit spam filters?",
            options: [
              { text: "The line that doubled our replies", isCorrect: false },
              { text: "FREE!!! ACT NOW!!!", isCorrect: true },
              { text: "A quick thought on your headline", isCorrect: false },
              { text: "3 words, not 30", isCorrect: false },
            ],
          },
          {
            prompt: "High-converting email copy is formatted for…",
            options: [
              { text: "Desktop only", isCorrect: false },
              { text: "Mobile: 1–2 sentence paragraphs, one click", isCorrect: true },
              { text: "Long paragraphs", isCorrect: false },
              { text: "Print", isCorrect: false },
            ],
          },
          {
            prompt: "How many primary actions should one email ask for?",
            options: [
              { text: "As many as possible", isCorrect: false },
              { text: "One", isCorrect: true },
              { text: "At least three", isCorrect: false },
              { text: "Zero", isCorrect: false },
            ],
          },
          {
            prompt: "In a welcome sequence, the first email should…",
            options: [
              { text: "Hard-sell the product", isCorrect: false },
              { text: "Deliver the lead magnet and set expectations", isCorrect: true },
              { text: "Ask for a referral", isCorrect: false },
              { text: "Share the full price list", isCorrect: false },
            ],
          },
          {
            prompt: "The 'Seinfeld email' method refers to…",
            options: [
              { text: "A no-spam subject line", isCorrect: false },
              { text: "A story-driven broadcast that transitions to a pitch", isCorrect: true },
              { text: "A daily newsletter", isCorrect: false },
              { text: "An abandoned cart flow", isCorrect: false },
            ],
          },
          {
            prompt: "An abandoned cart sequence's second email typically…",
            options: [
              { text: "Adds more products", isCorrect: false },
              { text: "Handles the top objection", isCorrect: true },
              { text: "Ends the sequence", isCorrect: false },
              { text: "Resends the receipt", isCorrect: false },
            ],
          },
          {
            prompt: "A curiosity-gap subject line works by…",
            options: [
              { text: "Revealing everything upfront", isCorrect: false },
              { text: "Opening a loop the email closes", isCorrect: true },
              { text: "Using all caps", isCorrect: false },
              { text: "Listing features", isCorrect: false },
            ],
          },
          {
            prompt: "Flows should be mapped by…",
            options: [
              { text: "The calendar alone", isCorrect: false },
              { text: "The moment / the reader's question at that step", isCorrect: true },
              { text: "The sender's convenience", isCorrect: false },
              { text: "Random timing", isCorrect: false },
            ],
          },
          {
            prompt: "The single-focus rule means…",
            options: [
              { text: "One idea and one CTA per email", isCorrect: true },
              { text: "One email per year", isCorrect: false },
              { text: "Only images, no text", isCorrect: false },
              { text: "No links at all", isCorrect: false },
            ],
          },
        ],
      },
    },
    {
      title: "Module 5 Quiz",
      contentType: "quiz",
      section: M5,
      quiz: {
        title: "Module 5 Quiz: Paid Ads & Short-Form Conversion Copy",
        passingScore: 75,
        questions: [
          {
            prompt: "In a crowded feed, an ad's first job is to…",
            options: [
              { text: "List all features", isCorrect: false },
              { text: "Stop the scroll in ~2 seconds", isCorrect: true },
              { text: "State the warranty", isCorrect: false },
              { text: "Show the logo", isCorrect: false },
            ],
          },
          {
            prompt: "Copy and creative should be…",
            options: [
              { text: "Briefed separately", isCorrect: false },
              { text: "One unit — headline, image and first line agree", isCorrect: true },
              { text: "Unrelated", isCorrect: false },
              { text: "Identical to competitors'", isCorrect: false },
            ],
          },
          {
            prompt: "Which is a Meta ad angle to test?",
            options: [
              { text: "Only one version of one angle", isCorrect: false },
              { text: "Pain, Us vs. Them, Social Proof", isCorrect: true },
              { text: "A 10-page whitepaper", isCorrect: false },
              { text: "The company history", isCorrect: false },
            ],
          },
          {
            prompt: "For B2B / LinkedIn ads, lead with…",
            options: [
              { text: "Dreams and hype", isCorrect: false },
              { text: "ROI, time saved, and de-risked decisions", isCorrect: true },
              { text: "Pop culture references", isCorrect: false },
              { text: "A long poem", isCorrect: false },
            ],
          },
          {
            prompt: "The 30-second short-form video structure is…",
            options: [
              { text: "Intro → credits → logo", isCorrect: false },
              { text: "Hook (0–3s) → Problem/Demo (3–20s) → Proof & CTA (20–30s)", isCorrect: true },
              { text: "Features for 30s", isCorrect: false },
              { text: "A single static frame", isCorrect: false },
            ],
          },
          {
            prompt: "UGC-style ads perform better when they…",
            options: [
              { text: "Look highly over-produced", isCorrect: false },
              { text: "Feel lo-fi and native to the platform", isCorrect: true },
              { text: "Read like a press release", isCorrect: false },
              { text: "Use no voice", isCorrect: false },
            ],
          },
          {
            prompt: "Testing multiple angles reveals…",
            options: [
              { text: "Which pain resonates with which buyers", isCorrect: true },
              { text: "Nothing useful", isCorrect: false },
              { text: "Only the best font", isCorrect: false },
              { text: "The cheapest color", isCorrect: false },
            ],
          },
          {
            prompt: "A long-form story ad is essentially…",
            options: [
              { text: "A feature checklist", isCorrect: false },
              { text: "A mini VSL in text: story → problem → solution → CTA", isCorrect: true },
              { text: "A legal disclaimer", isCorrect: false },
              { text: "A product manual", isCorrect: false },
            ],
          },
          {
            prompt: "For video ads, the first frame functions as…",
            options: [
              { text: "A blank slate", isCorrect: false },
              { text: "The headline", isCorrect: true },
              { text: "The terms and conditions", isCorrect: false },
              { text: "A loading screen", isCorrect: false },
            ],
          },
          {
            prompt: "Short-form copy should be…",
            options: [
              { text: "Front-loaded with the hook; Meta truncates", isCorrect: true },
              { text: "A slow build to the point", isCorrect: false },
              { text: "All brand history", isCorrect: false },
              { text: "Hidden below a fold of text", isCorrect: false },
            ],
          },
        ],
      },
    },
    {
      title: "Module 6 Quiz",
      contentType: "quiz",
      section: M6,
      quiz: {
        title: "Module 6 Quiz: AI Workflows, Portfolio & Client Acquisition",
        passingScore: 75,
        questions: [
          {
            prompt: "A good use of AI in copywriting is…",
            options: [
              { text: "Shipping its draft unchanged", isCorrect: false },
              { text: "Summarizing reviews and generating angle variations to edit", isCorrect: true },
              { text: "Inventing statistics", isCorrect: false },
              { text: "Replacing all human judgment", isCorrect: false },
            ],
          },
          {
            prompt: "A key guardrail when using AI is to…",
            options: [
              { text: "Trust every number it produces", isCorrect: false },
              { text: "Verify claims and preserve the human voice", isCorrect: true },
              { text: "Skip editing", isCorrect: false },
              { text: "Use it only for spelling", isCorrect: false },
            ],
          },
          {
            prompt: "A spec portfolio piece should include…",
            options: [
              { text: "Only the rewrite", isCorrect: false },
              { text: "Before, After, and the rationale", isCorrect: true },
              { text: "A price list", isCorrect: false },
              { text: "A competitor's logo", isCorrect: false },
            ],
          },
          {
            prompt: "Why does the 'rationale' matter in a spec piece?",
            options: [
              { text: "It pads word count", isCorrect: false },
              { text: "Clients hire judgment, not just words", isCorrect: true },
              { text: "It hides the rewrite", isCorrect: false },
              { text: "It is required by law", isCorrect: false },
            ],
          },
          {
            prompt: "Compared to hourly billing, package pricing…",
            options: [
              { text: "Punishes speed", isCorrect: false },
              { text: "Prices the outcome and is easier to say yes to", isCorrect: true },
              { text: "Always costs more", isCorrect: false },
              { text: "Is illegal", isCorrect: false },
            ],
          },
          {
            prompt: "A closing proposal should lead with…",
            options: [
              { text: "Your hourly rate", isCorrect: false },
              { text: "Their problem, in their words", isCorrect: true },
              { text: "Your company history", isCorrect: false },
              { text: "A generic template", isCorrect: false },
            ],
          },
          {
            prompt: "A high-converting cold pitch is…",
            options: [
              { text: "A 1,000-word mass template", isCorrect: false },
              { text: "Specific, under ~100 words, with one ask", isCorrect: true },
              { text: "All about you", isCorrect: false },
              { text: "Sent to 500 people identically", isCorrect: false },
            ],
          },
          {
            prompt: "A Loom audit converts because it…",
            options: [
              { text: "Proves skill and effort before the first reply", isCorrect: true },
              { text: "Replaces the product", isCorrect: false },
              { text: "Is longer than 30 minutes", isCorrect: false },
              { text: "Avoids showing the work", isCorrect: false },
            ],
          },
          {
            prompt: "An optimized inbound profile headline says…",
            options: [
              { text: "Only your job title", isCorrect: false },
              { text: "Who you help and how", isCorrect: true },
              { text: "Your favorite quote", isCorrect: false },
              { text: "Nothing specific", isCorrect: false },
            ],
          },
          {
            prompt: "The overall message of client acquisition is…",
            options: [
              { text: "Volume beats relevance", isCorrect: false },
              { text: "Specific beats volume; tailored outreach wins", isCorrect: true },
              { text: "Wait for clients to find you only", isCorrect: false },
              { text: "Never do outbound", isCorrect: false },
            ],
          },
        ],
      },
    },
  ],
};