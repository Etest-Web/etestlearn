/**
 * Blueprints: Social Media Strategy + No-Code Automation.
 * Consumed by seedSkills.ts through compileCourse() in seedSkillsKit.ts.
 */

import { compileCourse, type SkillCourseBlueprint } from "./seedSkillsKit";

const socialMedia: SkillCourseBlueprint = {
  title: "Social Media Strategy: Content That Earns Attention",
  slug: "social-media-strategy",
  category: "Marketing",
  level: "Beginner to Intermediate",
  description:
    "Eight modules that replace posting randomly with a system: strategy and goals, audience and positioning, platform choice, content pillars and formats, hooks and storytelling, a sustainable calendar, community and growth, and measurement that leads to decisions. Two articles, two knowledge checks and a real graded assignment in every module.",
  modules: [
    {
      title: "Strategy Before Posting",
      concepts: [
        ["Goal over channel", "Start with the business outcome — awareness, leads, retention — then pick platforms. 'Be on Instagram' is not a goal; it is a guess about a channel.", "A 'reduce support load' goal points to community and help content, not a new account."],
        ["One audience, one job", "A clear account serves a specific person with a specific need. Broad accounts speak to nobody in particular and get ignored by everyone.", "'Freelance designers who want to raise rates' beats 'creative people'."],
        ["The funnel is not a post", "Awareness, consideration and conversion content do different jobs. A feed of only sales posts starves the top; a feed of only tips never converts.", "Tag each planned post with the stage it serves."],
        ["Constraints are strategy", "Time, skill and budget decide what you can sustain. A plan you cannot keep for eight weeks is worse than a smaller one you can.", "Two strong posts a week beat seven rushed ones."],
      ],
      workflow: [
        "Write one business goal and the behaviour that would prove it.",
        "Name one audience and the problem you solve for them.",
        "Choose the one or two platforms where that audience already spends time.",
        "Define what you will not post about, to keep focus.",
      ],
      pitfalls: [
        "Joining five platforms because a competitor is on all five.",
        "Measuring success by follower count alone.",
      ],
      questions: [
        ["What comes before choosing a platform?", "The goal and audience", "A posting schedule", "A logo redesign", "A hashtag list"],
        ["What does 'one audience, one job' mean?", "Serve a specific person with a specific need", "Post to everyone", "Copy a competitor", "Use every format"],
        ["Why tag a post by funnel stage?", "So the feed serves awareness and conversion", "It makes captions longer", "It is required by algorithms", "It replaces a goal"],
        ["Why are constraints part of strategy?", "They decide what you can sustain", "They remove the need for goals", "They lower quality", "They are irrelevant"],
        ["Which is a weak goal?", "Be more social", "Get 30 demo requests a month", "Grow email list by 500", "Reduce support tickets"],
        ["What should a strategy name explicitly?", "What you will not post", "Only what you will post", "Nothing negative", "Every hashtag"],
      ],
      takeaway: "Goal first, audience second, channel third. A strategy you can sustain beats a perfect one you abandon.",
      assignment: {
        title: "One-page social strategy",
        instructions: "Write a one-page strategy for a real brand or your own work: one business goal with a proof behaviour, one specific audience, the one or two platforms you will use and why, and a list of three things you will deliberately not post. No graphics needed. Submit the page.",
        maxPoints: 100,
      },
    },
    {
      title: "Knowing Your Audience",
      concepts: [
        ["Pain over persona", "A useful audience profile is built on the problem they are trying to solve and the words they use for it, not on age and job title alone.", "They search 'why do clients ghost after a proposal', not 'solve churn'."],
        ["Jobs to be done", "People 'hire' content to make progress. Name the situation, the job and the expected outcome, then write to that moment.", "When a proposal goes quiet, they need a follow-up script that does not feel desperate."],
        ["Listen where they already talk", "Comments, forums, reviews and support tickets are a free research corpus. Mine the exact phrasing before you write a single caption.", "Pull twenty real questions and use their wording as headings."],
        ["Objections are content", "Every hesitation a buyer voices is a post waiting to be written. Answer it plainly and you remove a reason not to act.", "'Is this too expensive?' becomes a cost-versus-time breakdown."],
      ],
      workflow: [
        "Collect twenty real questions or complaints from comments, forums or tickets.",
        "Group them into pains, jobs and objections.",
        "Write one audience sentence using their exact words.",
        "Turn the top three objections into planned posts.",
      ],
      pitfalls: [
        "Inventing a persona from demographics with no evidence.",
        "Writing about what you want to say instead of what they are asking.",
      ],
      questions: [
        ["What should an audience profile lead with?", "The problem and their words", "Age and job title", "Favourite colour", "Where they live only"],
        ["What is a 'job to be done'?", "The progress a person wants in a situation", "A daily chore", "A job listing", "A software feature"],
        ["Where can you hear a real audience's language?", "Comments, forums and support tickets", "Only in textbooks", "Nowhere", "Only in ads"],
        ["What does an objection become?", "A post that answers it", "Something to ignore", "A reason to stop", "A private note"],
        ["Why use their exact phrasing?", "It signals you understand the problem", "It is shorter", "It is required by law", "It hides your point"],
        ["What is the output of audience research?", "A sentence and a list of objections to answer", "Only a demographic table", "A logo", "A posting time"],
      ],
      takeaway: "Research pains and phrasing, not demographics. Their objections are your content plan.",
      assignment: {
        title: "Audience research brief",
        instructions: "Collect twenty real questions, complaints or objections from comments, forums or support tickets for one audience. Group them into pains, jobs and objections. Write one audience sentence in their words and list the three posts you would write first. Submit the raw list, the groups and the sentence.",
        maxPoints: 110,
      },
    },
    {
      title: "Choosing the Right Platforms",
      concepts: [
        ["Fit over popularity", "A platform is right when your audience and your format match it. A large user base is irrelevant if your people are not there.", "A B2B tool may win on one professional network and lose on a short-video app."],
        ["Format dictates effort", "Video, text, audio and image cost very different amounts to produce well. Pick the format you can make consistently.", "If you hate editing video, lead with written carousels."],
        ["One home, many outposts", "Have one primary platform where you build depth. Repurpose to others lightly instead of starting from scratch everywhere.", "Publish the full post on the blog, a short take on the network."],
        ["Native or nothing", "Content made for one platform rarely works copied verbatim to another. Adapt hook, length and format to the place.", "A long caption becomes a three-slide carousel, not a repost."],
      ],
      workflow: [
        "List where your audience already spends time, from evidence not assumption.",
        "Match that to a format you can produce weekly.",
        "Choose one primary platform and at most one secondary.",
        "Define how you will repurpose without cross-posting raw files.",
      ],
      pitfalls: [
        "Being everywhere at once and posting poorly on all of it.",
        "Copying the exact same post to every network.",
      ],
      questions: [
        ["What makes a platform right?", "Audience and format fit", "It has the most users", "It is the newest", "A competitor uses it"],
        ["Why does format matter?", "Different formats cost different effort to do well", "Formats do not matter", "Only video works", "Only text works"],
        ["What is a 'primary platform'?", "The one where you build depth", "The one you log into least", "Every platform equally", "The one with no rules"],
        ["Why adapt content per platform?", "The hook and format must fit the place", "It takes more time", "It is required by law", "It avoids all work"],
        ["What is healthy repurposing?", "Rebuild the idea in the new platform's format", "Copy and paste everywhere", "Never reuse an idea", "Post the same file daily"],
        ["What should a secondary platform be?", "At most one outpost, lightly maintained", "Another five accounts", "The same as primary", "Chosen at random"],
      ],
      takeaway: "One home, one outpost, one format you can sustain. Fit beats popularity every time.",
      assignment: {
        title: "Platform selection memo",
        instructions: "Using your strategy brief, choose one primary and one secondary platform. For each, cite two pieces of evidence that your audience is there and one reason the format fits your skills. Write a short memo on how you will repurpose one idea for both, including what changes between versions. Submit the memo.",
        maxPoints: 110,
      },
    },
    {
      title: "Content Pillars & Formats",
      concepts: [
        ["Pillars give consistency", "Three to five recurring themes let an audience know what to expect and make ideation faster. Every post should map to a pillar.", "Educate, behind-the-scenes, proof, opinion."],
        ["Mix the value types", "Teach, inspire, entertain and prove. A feed of only tips becomes a manual; a feed of only opinions becomes noise.", "Alternate a how-to with a result and a point of view."],
        ["One idea, one post", "A post that tries to say three things says none clearly. Split it or cut it.", "If you need 'and also', it is two posts."],
        ["Format serves the idea", "Choose carousel, short video, text or image based on what shows the idea best, not what is trending.", "A step-by-step is a carousel; a before/after is a short video."],
      ],
      workflow: [
        "Define three to five pillars tied to your audience's pains.",
        "Assign a value type and a default format to each pillar.",
        "Draft ten ideas and tag each with one pillar.",
        "Cut any idea that crosses two pillars or carries two messages.",
      ],
      pitfalls: [
        "Posting about whatever is trending with no through-line.",
        "Cramming several lessons into one long caption.",
      ],
      questions: [
        ["What are content pillars?", "Recurring themes that give consistency", "Colour schemes", "Hashtag groups", "Posting times"],
        ["How many pillars is sensible?", "Three to five", "Exactly twenty", "Only one forever", "As many as possible"],
        ["Why one idea per post?", "It makes the takeaway clear", "It saves characters only", "It is required by platforms", "It removes the need for a hook"],
        ["What decides the format?", "What shows the idea best", "Whatever is trending", "The day of the week", "A competitor's choice"],
        ["Which is a value mix problem?", "Every post is a sales pitch", "Alternating tips and proof", "Using carousels weekly", "Having four pillars"],
        ["What is the point of tagging ideas by pillar?", "To keep focus and balance the feed", "To count words", "To choose a font", "To schedule faster"],
      ],
      takeaway: "Three to five pillars, one idea per post, format chosen to fit. Consistency compounds.",
      assignment: {
        title: "Pillar and idea bank",
        instructions: "Define three to five content pillars for your account, each with a value type and a default format. Write fifteen concrete post ideas, tag each with one pillar, and cut any that carry two messages. Submit the pillar table and the idea bank.",
        maxPoints: 120,
      },
    },
    {
      title: "Hooks & Storytelling",
      concepts: [
        ["The hook earns the next line", "The first line decides whether anyone reads the rest. It should create a specific gap, a concrete promise or a recognisable tension.", "'I raised my rates 40% and kept every client' beats 'Some tips on pricing'."],
        ["Specificity beats hype", "Numbers, named situations and surprises outperform vague superlatives. Concrete claims are easier to believe and to share.", "'Three words that fixed my follow-ups' not 'game-changing advice'."],
        ["Tension then resolution", "A story holds attention by setting up a problem and delaying the answer. State the stakes early and pay them off cleanly.", "The mistake, the consequence, the fix, the result."],
        ["Payoff must match promise", "A strong hook with a weak body trains your audience to ignore you. The content has to deliver the gap the hook opened.", "If the hook says 'three steps', give three real steps."],
      ],
      workflow: [
        "Write the single takeaway before the hook.",
        "Draft five hooks: a number, a contradiction, a question, a before/after and a stakes line.",
        "Pick the most specific one and make sure the body pays it off.",
        "Read only the first line — would you stop scrolling for it?",
      ],
      pitfalls: [
        "Clickbait that the content never resolves.",
        "Hooks that promise everything and deliver a platitude.",
      ],
      questions: [
        ["What does a hook do?", "Earns the next line", "Summarises the whole post", "Replaces the body", "Hides the point"],
        ["Which hook is strongest?", "I tripled replies with one sentence", "Some thoughts on replies", "Here is advice", "Interesting topic today"],
        ["What holds attention in a story?", "Tension then resolution", "A long intro", "Many hashtags", "A logo"],
        ["Why must payoff match the hook?", "It keeps audience trust", "It makes captions longer", "It is required by law", "It removes the takeaway"],
        ["Write the takeaway before the hook because...", "The hook must open a gap the body closes", "Hooks are optional", "It is faster to type", "It avoids punctuation"],
        ["What is a good hook test?", "Would you stop scrolling for line one?", "Count the emojis", "Check the posting hour", "Ask a stranger to guess the length"],
      ],
      takeaway: "Specific hook, real tension, honest payoff. Write the takeaway first and earn the next line.",
      assignment: {
        title: "Hook laboratory",
        instructions: "Pick one idea from your idea bank. Write five different hooks for it using: a number, a contradiction, a question, a before/after and a stakes line. Choose one, then draft the body that fully pays it off. Submit all five hooks, the chosen one and the body, plus one sentence on why you picked it.",
        maxPoints: 130,
      },
    },
    {
      title: "A Calendar You Can Keep",
      concepts: [
        ["Batch, don't improvise", "Ideating, drafting and scheduling in separate blocks is faster and more consistent than writing fresh each day.", "One afternoon a week to draft, ten minutes a day to reply."],
        ["Cadence over frequency", "A predictable rhythm trains the audience and protects your time. Three reliable posts beat daily bursts followed by silence.", "Monday, Wednesday, Friday at the same hour."],
        ["Buffer a week ahead", "Keep a small bank of finished posts so a busy week does not break the streak.", "Five ready posts behind the live schedule."],
        ["Review loop", "A calendar without a weekly review repeats mistakes. Track what worked and feed it into next week's plan.", "Ten minutes every Friday: best, worst, one change."],
      ],
      workflow: [
        "Choose a realistic cadence from your true available time.",
        "Block one weekly session to draft and schedule.",
        "Build a one-week buffer of finished posts.",
        "Hold a short weekly review and log one change.",
      ],
      pitfalls: [
        "Scheduling daily and burning out in week two.",
        "Never reviewing, so the same weak format repeats.",
      ],
      questions: [
        ["What beats high frequency?", "A sustainable cadence", "Posting many times daily", "Only weekend posts", "Random timing"],
        ["Why batch your work?", "It is faster and more consistent", "It is required by platforms", "It removes the need for ideas", "It lowers quality"],
        ["What is a buffer?", "Finished posts ready ahead of schedule", "An empty folder", "A backup account", "A draft hashtag list"],
        ["What happens in a weekly review?", "Log best, worst and one change", "Only count followers", "Nothing", "Rewrite the logo"],
        ["Why keep the posting hour stable?", "It trains the audience and protects time", "It is required by law", "It changes the algorithm", "It removes the need for hooks"],
        ["What is the risk of daily bursts?", "Burnout and then silence", "Too many followers", "Better engagement always", "Lower costs"],
      ],
      takeaway: "Pick a cadence you can keep, batch the work, stay a week ahead, and review every Friday.",
      assignment: {
        title: "Sustainable 30-day calendar",
        instructions: "Build a 30-day calendar at a cadence you can actually maintain. For each post, list the date, pillar, format, hook and funnel stage. Add a one-week buffer plan and a short weekly-review template. Include one sentence on what you will cut if a week goes badly. Submit the calendar.",
        maxPoints: 140,
      },
    },
    {
      title: "Community, Growth & Collaboration",
      concepts: [
        ["Reply before you post", "The first hour of conversation matters more than the broadcast. Show up to answer, not just to publish.", "Block fifteen minutes after each post to reply."],
        ["Give before you ask", "Comment helpfully on other people's work before hoping they notice yours. Reciprocity is the oldest growth channel.", "Leave one useful comment a day in your niche."],
        ["Collaborate around overlap", "Joint live sessions, swaps and round-ups borrow trust from an audience already adjacent to yours.", "Co-host a teardown with a peer who serves the same audience."],
        ["Growth is a byproduct", "Useful, consistent content plus real conversation earns followers. Chasing followers directly usually attracts the wrong ones.", "Optimise for saved and shared posts, not vanity counts."],
      ],
      workflow: [
        "Schedule reply time immediately after each publish.",
        "Leave one genuinely useful comment daily in your niche.",
        "List three peers for a possible collaboration and pitch one.",
        "Track saves, shares and replies alongside follower growth.",
      ],
      pitfalls: [
        "Posting and disappearing, then wondering why engagement is flat.",
        "Buying followers or joining engagement pods that attract nobody real.",
      ],
      questions: [
        ["What matters in the first hour?", "Replying to the conversation", "Changing the caption", "Deleting old posts", "Buying ads"],
        ["What is 'give before you ask'?", "Help others before hoping for attention", "Never promote", "Only follow back", "Post daily"],
        ["Why collaborate?", "It borrows trust from an adjacent audience", "It removes the need for content", "It is required by law", "It lowers quality"],
        ["What is a healthier growth metric than followers?", "Saves and shares", "Profile colour", "Post count", "Bio length"],
        ["Why avoid engagement pods?", "They attract fake attention, not real readers", "They are faster", "They are recommended", "They cost less"],
        ["What should you do daily?", "One useful comment in your niche", "Delete one post", "Change your name", "Repost the same link"],
      ],
      takeaway: "Reply fast, give first, collaborate with peers, and measure saves over vanity counts.",
      assignment: {
        title: "Community engagement plan",
        instructions: "Write a two-week engagement plan: when you will reply after posting, a daily comment routine, three peers you could collaborate with and a specific pitch to one of them, and the metrics you will track beyond followers. Include the one growth tactic you will refuse to use and why. Submit the plan.",
        maxPoints: 120,
      },
    },
    {
      title: "Measurement That Leads to Decisions",
      concepts: [
        ["Metric tied to goal", "Choose numbers that reflect the goal you set in module one. Reach, engagement and conversion answer different questions.", "A lead goal tracks clicks and enquiries, not likes."],
        ["Leading versus lagging", "Saves, shares and comments move before revenue. Watch them to react early instead of waiting months.", "A rise in saves often precedes a rise in inbound questions."],
        ["Compare like with like", "Judge a post against your own baseline and the same time window, not against a viral outlier from someone else.", "Compare month to month, same platform, same format mix."],
        ["Decide, don't just report", "Every review should end in one concrete change: keep, kill or test. A dashboard nobody acts on is decoration.", "Kill the weakest pillar, test a new hook style, keep the winner."],
      ],
      workflow: [
        "Record a baseline for your three chosen metrics.",
        "Track each post's pillar, format and stage alongside its numbers.",
        "Find the best and worst posts and name the reason.",
        "Commit to one change for the next cycle and log the date.",
      ],
      pitfalls: [
        "Reporting numbers without a decision at the end.",
        "Changing five things at once and crediting the wrong one.",
      ],
      questions: [
        ["What should metrics tie to?", "The goal set at the start", "Whatever is trending", "A competitor's numbers", "Nothing in particular"],
        ["Which is a leading indicator?", "Saves and shares", "Revenue next year", "Profit", "Refunds"],
        ["How should you judge a post?", "Against your own baseline in the same window", "Against a viral account", "Against last year only", "At random"],
        ["What should every review end with?", "One concrete decision", "A longer report", "A new chart", "Nothing"],
        ["Why change one thing per cycle?", "So you can attribute the movement", "It is faster", "It is required by law", "It avoids all risk"],
        ["What belongs in a change log?", "Date, change, metric, decision", "Only the final number", "Only the author", "Nothing"],
      ],
      takeaway: "Tie metrics to the goal, watch leading signals, compare like with like, and end every review with one decision.",
      assignment: {
        title: "Measurement dashboard and decision memo",
        instructions: "Define three metrics tied to your strategy goal and record a baseline (real or estimated). Build a simple tracking table for your next ten posts including pillar, format and stage. Write a decision memo naming one change you will make, the signal that would prove it worked and the review date. Submit the table and memo.",
        maxPoints: 150,
      },
    },
  ],
  toolkit: {
    fileName: "Social-Content-Calendar.md",
    body: `# Social Content Calendar\n\n## Strategy anchors\n- Goal: ______\n- Proof behaviour: ______\n- Audience: ______\n- Platforms (max 2): ______\n\n## Pillars\n1. ______  2. ______  3. ______\n\n## Weekly grid\n| Day | Pillar | Format | Hook (first line) | Stage |\n| --- | --- | --- | --- | --- |\n| Mon |  |  |  |  |\n| Wed |  |  |  |  |\n| Fri |  |  |  |  |\n\n## Before publishing\n- [ ] First line earns the stop\n- [ ] One idea, one takeaway\n- [ ] Caption adds context, not repetition\n- [ ] CTA names one action\n\n## Review (weekly)\n- Best post + why\n- Worst post + why\n- One change for next week\n`,
  },
  capstone: {
    title: "A 30-Day Social Content System",
    description:
      "Build a complete, repeatable system for one account: strategy, audience, platform choice, five content pillars, a 30-day calendar, ten written posts with hooks and captions, a community reply plan and a measurement dashboard with a decision rule. The result is a system someone else could run.",
    techStack: ["Goal setting", "Audience research", "Platform fit", "Content pillars", "Hook writing", "Calendar", "Analytics review"],
    outcome: "A folder a teammate can pick up and post from, with a clear rule for what to change next month.",
  },
  showcase: {
    title: "Three-Post Launch Sequence",
    description:
      "A short sequence — teaser, value post, offer — showing how the same message moves a reader from attention to action, with hooks and CTAs written out.",
    techStack: ["Hook writing", "Narrative sequencing", "CTA design"],
    outcome: "A reusable template for launching anything without spamming the same link three times.",
  },
};

const noCodeAutomation: SkillCourseBlueprint = {
  title: "No-Code Automation: Build Systems That Run Themselves",
  slug: "no-code-automation",
  category: "Productivity",
  level: "Beginner to Intermediate",
  description:
    "Eight modules that turn repeated manual work into reliable systems: systems thinking, triggers and data flow, form and spreadsheet automations, connecting apps, a simple lead pipeline, notifications and guardrails, AI inside a workflow, and testing, maintenance and scale. Two articles, two knowledge checks and a real graded assignment in every module.",
  modules: [
    {
      title: "Thinking in Systems",
      concepts: [
        ["Trigger, condition, action", "Every automation is: when this happens, if this is true, do that. Writing it in one sentence exposes most design flaws before you build.", "When a form is submitted, if the budget is over 10k, create a deal and notify sales."],
        ["Automate the boring, not the judgment", "Good automation removes copying and checking. Decisions that need empathy or context should stay with a person.", "Auto-file an application; do not auto-reject it."],
        ["Map before you build", "Draw the current manual steps on paper first. Automating a process nobody has mapped just makes the chaos faster.", "Write each handoff and who owns it before opening a tool."],
        ["One source of truth", "A system needs one canonical record. Duplicated data across sheets and apps drifts the moment it is not synced both ways.", "The form submission is the record; sheets are views of it."],
      ],
      workflow: [
        "Pick one repetitive task with a clear start and end.",
        "Write it as one trigger-condition-action sentence.",
        "Map the manual steps and mark which are copy/paste versus judgment.",
        "Name the single source of truth and who owns each handoff.",
      ],
      pitfalls: [
        "Automating a process you have not written down.",
        "Removing human judgment from a decision that needs it.",
      ],
      questions: [
        ["What is the shape of every automation?", "Trigger, condition, action", "Click, scroll, save", "Open, close, delete", "Write, read, forget"],
        ["What should stay with a person?", "Judgment that needs context", "Copying data", "Formatting rows", "Sending a standard receipt"],
        ["Why map before building?", "It exposes the real handoffs", "It is required by law", "It makes tools load faster", "It removes the need to test"],
        ["What is a single source of truth?", "One canonical record others derive from", "Several copies in sync", "A printout", "An email thread"],
        ["Which task is a good first automation?", "A repetitive copy/paste with clear steps", "A nuanced negotiation", "A creative strategy call", "A performance review"],
        ["What does writing the sentence do?", "Exposes design flaws early", "Replaces testing", "Removes the trigger", "Hides the conditions"],
      ],
      takeaway: "Write trigger-condition-action, map the manual steps, automate the copying, keep the judgment human.",
      assignment: {
        title: "Automation candidate brief",
        instructions: "Pick one repetitive task you or a colleague do weekly. Write it as a trigger-condition-action sentence, map the manual steps with the owner of each, mark which steps are copy/paste versus judgment, and name the single source of truth. End with one sentence on why this is a good first automation. Submit the brief.",
        maxPoints: 100,
      },
    },
    {
      title: "Triggers, Actions & Data Flow",
      concepts: [
        ["Event vs schedule triggers", "Some workflows start when something happens; others run on a clock. Choosing the wrong one causes missed or duplicate runs.", "A new submission is an event; a weekly digest is a schedule."],
        ["Payload and fields", "The data that comes in is the payload. Map each field to a destination before building, or you will discover missing values at runtime.", "name, email and budget map to deal fields."],
        ["Branching with conditions", "A condition splits the flow. Keep branches few and mutually exclusive so a record cannot take two paths.", "If budget over 10k go to sales, else go to nurture."],
        ["Idempotency and duplicates", "A retried trigger can run twice. Use a stable key to check whether the work was already done before performing it.", "Skip creation if a deal with this form id already exists."],
      ],
      workflow: [
        "State what starts the run and how often it can fire.",
        "List the incoming fields and where each one lands.",
        "Draw the branches and check they are mutually exclusive.",
        "Add a stable key so a retry cannot create a duplicate.",
      ],
      pitfalls: [
        "Using a schedule for something that should react instantly.",
        "Letting a retry create two records for one submission.",
      ],
      questions: [
        ["Which is an event trigger?", "A form submission", "Every Monday at 9", "Nightly cleanup", "Monthly report"],
        ["Which is a schedule trigger?", "A weekly digest", "A new signup", "An incoming message", "A button press"],
        ["What is the payload?", "The data that comes with the trigger", "The tool's logo", "The user's password", "The output only"],
        ["Why must branches be exclusive?", "So a record takes exactly one path", "It saves money", "It is required by law", "It removes the trigger"],
        ["Why use a stable key?", "To stop a retry creating duplicates", "To make fields prettier", "To speed up the tool", "To hide errors"],
        ["What happens when fields are unmapped?", "Values go missing at runtime", "Everything works", "The tool slows down", "The trigger changes"],
      ],
      takeaway: "Pick the right trigger, map every field, keep branches exclusive, and make retries safe.",
      assignment: {
        title: "Automation flow specification",
        instructions: "Take your candidate task and write a full flow specification: trigger type and frequency, a table of incoming fields mapped to destinations, every branch with its condition, and the stable key that prevents duplicates. Add one sentence on what happens if a required field is missing. Submit the specification.",
        maxPoints: 120,
      },
    },
    {
      title: "Forms & Spreadsheet Automations",
      concepts: [
        ["Validate at the boundary", "Check required fields and formats at the form, not downstream. Clean input removes a whole class of broken automations.", "Require a valid email and a numeric budget before submission."],
        ["One row per event", "Keep a tidy append-only log: each submission adds a row with a timestamp. Editing in place destroys history.", "A 'Submissions' sheet that is only appended to."],
        ["Derived columns, not typed values", "Let formulas or automation fill computed fields. A human retyping a derived value guarantees it will drift.", "Status and priority are generated, not typed."],
        ["Formula and trigger limits", "Large sheets slow down and triggers can hit quotas. Aggregate old rows and keep the live range small.", "Archive rows older than 90 days to another sheet."],
      ],
      workflow: [
        "Add validation to every field that feeds the automation.",
        "Design an append-only log with one row per submission and a timestamp.",
        "Generate derived columns automatically instead of typing them.",
        "Plan an archive rule to keep the live range small.",
      ],
      pitfalls: [
        "Letting free-text fields into a workflow that expects a fixed format.",
        "Editing source rows in place and losing the history.",
      ],
      questions: [
        ["Where should input be validated?", "At the form, before the workflow", "Only at the end", "Never", "In the email receipt"],
        ["What is an append-only log?", "Each event adds a new row with a timestamp", "Rows are overwritten daily", "A single cell", "A printed list"],
        ["Why generate derived columns?", "Typed values drift from the source", "It uses more storage", "It is required by law", "It removes the need for forms"],
        ["Why archive old rows?", "To keep the live range small and fast", "To delete data", "To change the schema", "To add colours"],
        ["What breaks a workflow expecting a number?", "Free text in that field", "A timestamp", "A valid email", "A required field"],
        ["What does a timestamp give you?", "Order and history of events", "A prettier sheet", "Fewer columns", "Nothing"],
      ],
      takeaway: "Validate at the form, append one row per event, generate derived fields, and archive the old.",
      assignment: {
        title: "Form and log design",
        instructions: "Design a form and its backing sheet for your automation. List each field with its validation rule, the derived columns the automation will fill, and the archive rule. Submit a short note on one bad input your validation prevents and how. No tool required — a written design is fine.",
        maxPoints: 110,
      },
    },
    {
      title: "Connecting Apps Without Glue Code",
      concepts: [
        ["Native first, integrator second", "If two apps connect natively, use that. Reach for an integration platform only for the gaps, because every extra hop is a failure point.", "Use the built-in form-to-sheet connection before a middleman."],
        ["Authentication and permissions", "A connection acts with the permissions of the account that authorised it. Use a dedicated service account, not a personal one that might leave.", "A shared 'automations' account with least privilege."],
        ["Field mapping is the real work", "Most integration bugs are a field mapped to the wrong place. Test with one real record before turning the flow on.", "Send a test submission and inspect every destination field."],
        ["Rate limits and batching", "APIs cap how many calls you can make. Batch where possible and back off on errors instead of retrying instantly.", "Collect rows and write in one batch every ten minutes."],
      ],
      workflow: [
        "Check for a native connection before adding an integrator.",
        "Authorise with a dedicated least-privilege account.",
        "Map fields with a single real test record and inspect the result.",
        "Plan for rate limits with batching or backoff.",
      ],
      pitfalls: [
        "Authorising with a personal account that later loses access.",
        "Turning a flow on before testing with real data.",
      ],
      questions: [
        ["What should you try first?", "A native connection", "A custom script", "A new tool", "Nothing"],
        ["Why a dedicated service account?", "Permissions survive staff changes", "It is faster", "It is required by law", "It has more features"],
        ["Where do most integration bugs come from?", "Wrong field mapping", "Bad logos", "Slow internet", "Old browsers"],
        ["How do you handle API rate limits?", "Batch and back off on errors", "Retry instantly forever", "Ignore them", "Delete the flow"],
        ["Why test with one real record?", "It reveals mapping mistakes safely", "It is required by law", "It removes the need for validation", "It changes the schema"],
        ["What is the cost of an extra integration hop?", "Another failure point", "Better data", "Lower cost", "Nothing"],
      ],
      takeaway: "Native first, least-privilege accounts, test with real data, and respect rate limits.",
      assignment: {
        title: "Integration plan with test cases",
        instructions: "For your flow, list each app pair and whether a native connection or an integrator will be used. Name the authorising account and its permissions, map every field in a table, and write three test cases: one normal, one missing-field and one duplicate-submission. Submit the plan and tests.",
        maxPoints: 130,
      },
    },
    {
      title: "A Simple Lead Pipeline",
      concepts: [
        ["Stages as explicit states", "A pipeline is a small set of named stages with clear entry and exit rules. Vague stages like 'in progress' cause reports nobody trusts.", "New, Qualified, Proposal, Won, Lost with defined triggers."],
        ["Automate the routing, not the relationship", "Let the system assign owners and send receipts; let people handle the conversation. A pipeline supports the work, it does not replace it.", "Auto-assign by region, then a human follows up."],
        ["SLAs and stale deals", "A deal left untouched for too long is a silent loss. Add a timer that flags or reassigns stale records.", "Flag any Qualified deal with no activity for seven days."],
        ["Reporting from the source", "Count deals by stage and age directly from the canonical records. A hand-maintained dashboard will disagree with the pipeline.", "A view that reads the live table, not a copied sheet."],
      ],
      workflow: [
        "Define stages with written entry and exit rules.",
        "Automate assignment and receipts, leave conversation to people.",
        "Add an SLA timer that flags stale records.",
        "Build reports directly from the live records, not a copy.",
      ],
      pitfalls: [
        "Stages without clear rules, so two people classify the same deal differently.",
        "A dashboard maintained by hand that drifts from the pipeline.",
      ],
      questions: [
        ["What makes a stage useful?", "Clear entry and exit rules", "A long name", "A colour", "A random order"],
        ["What should be automated in a pipeline?", "Routing and receipts", "The whole relationship", "The negotiation", "The trust"],
        ["What is a stale deal?", "One with no activity past its SLA", "One that closed", "One with a big value", "One with a name"],
        ["Where should reports read from?", "The live canonical records", "A hand-copied sheet", "Memory", "A screenshot"],
        ["Why avoid vague stages?", "People classify the same deal differently", "They use fewer characters", "They are required", "They load faster"],
        ["What does an SLA timer do?", "Flags records that need attention", "Deletes old deals", "Changes the price", "Hides the data"],
      ],
      takeaway: "Explicit stages, automated routing, human conversation, SLA flags and reports from live data.",
      assignment: {
        title: "Pipeline design with SLA rules",
        instructions: "Design a five-stage lead pipeline with written entry and exit rules for each stage. Specify what is automated at each transition, what stays human, and one SLA timer with its action. Describe one report that reads from the live records. Submit the design.",
        maxPoints: 130,
      },
    },
    {
      title: "Notifications & Guardrails",
      concepts: [
        ["Notify on exception, not everything", "A ping per event trains people to mute the channel. Send a single digest or alert only when a threshold is crossed.", "One daily summary, plus an instant alert for high-value leads."],
        ["Fail closed and visible", "When a step fails, the workflow should stop safely and say so, not silently continue with partial data.", "On failure, log the error and alert the owner."],
        ["Retry with limits", "Transient failures deserve a few retries; permanent ones need a human. Cap retries and escalate after the limit.", "Three retries with backoff, then a ticket."],
        ["Access and secrets", "API keys and tokens never go in a field a user can see. Store them in the tool's secret store and grant the minimum scope.", "A read-only token scoped to one resource."],
      ],
      workflow: [
        "Choose which events deserve an instant alert versus a digest.",
        "Define what 'stop safely' means at each critical step.",
        "Set a retry limit and an escalation path.",
        "Move all credentials into the secret store with least scope.",
      ],
      pitfalls: [
        "A notification for every step that everyone mutes.",
        "Keys pasted into a visible field or shared in chat.",
      ],
      questions: [
        ["When should you send an instant alert?", "On a meaningful exception", "On every step", "Never", "Only on success"],
        ["What does 'fail closed' mean?", "Stop safely and report the error", "Continue with partial data", "Delete the run", "Hide the failure"],
        ["What happens after the retry limit?", "Escalate to a human", "Retry forever", "Silently stop", "Restart the tool"],
        ["Where do API keys belong?", "A secret store with least scope", "A visible sheet cell", "A chat message", "The caption of a post"],
        ["Why avoid a ping per event?", "People mute the channel", "It is required by law", "It saves storage", "It improves mapping"],
        ["What is a digest?", "A grouped summary on a schedule", "A single instant alert", "A deleted log", "A secret store"],
      ],
      takeaway: "Alert on exceptions, fail closed, cap retries with escalation, and keep secrets in the vault.",
      assignment: {
        title: "Notification and failure plan",
        instructions: "For your pipeline, classify each event as instant alert, digest or no notification. Define one failure scenario, what 'stop safely' means there, and the retry-and-escalate rule. List every credential the flow uses and the least scope it needs. Submit the plan.",
        maxPoints: 120,
      },
    },
    {
      title: "AI Inside the Workflow",
      concepts: [
        ["AI for the fuzzy middle", "Use a model where input is unstructured — summarising a message, extracting fields, drafting a reply. Keep deterministic steps deterministic.", "Extract a company name from free text, but route by a fixed rule."],
        ["Constrain the output", "Ask for a strict format such as JSON with named fields, then validate it before the next step. Free-form output breaks downstream mapping.", "'Return only JSON with budget as a number.'"],
        ["Human review for consequences", "Anything sent externally or that affects a person should be reviewed. Draft with AI, send with a person.", "Auto-draft the reply, require a click to send."],
        ["Watch cost and data", "Each call costs time and money, and sensitive text may leave your boundary. Batch, cap length, and redact personal data before sending.", "Summarise the ticket body without the customer's full name."],
      ],
      workflow: [
        "Find one step with unstructured input and a clear desired output.",
        "Define a strict output format and validate it in the flow.",
        "Add a review step wherever output has external consequences.",
        "Cap input length and redact sensitive fields before the call.",
      ],
      pitfalls: [
        "Letting a model decide a deterministic routing rule.",
        "Trusting free-form output to map into fixed fields.",
      ],
      questions: [
        ["Where does AI fit best?", "Unstructured input with a clear output", "Fixed arithmetic", "Exact routing rules", "Password checks"],
        ["Why ask for strict output?", "It can be validated before the next step", "It costs more", "It is required by law", "It removes the need to test"],
        ["What needs human review?", "Anything sent externally or affecting a person", "Internal notes only", "Nothing", "Only long text"],
        ["Why cap and redact input?", "To control cost and protect data", "To make text longer", "It is decorative", "It changes the model"],
        ["Which step should stay deterministic?", "Routing by a fixed rule", "Summarising a message", "Extracting a company name", "Drafting a reply"],
        ["What is a safe AI pattern?", "Draft automatically, send after review", "Send automatically, review later", "Never review", "Never draft"],
      ],
      takeaway: "Use AI for the fuzzy middle, demand structured output, review consequential sends, cap cost and data.",
      assignment: {
        title: "AI step specification",
        instructions: "Identify one step in your flow where AI helps. Write the exact prompt, the strict output format and how you will validate it, the review step if output is consequential, and what you will redact or cap before the call. Add one sentence on why a deterministic rule would not work here. Submit the spec.",
        maxPoints: 130,
      },
    },
    {
      title: "Testing, Maintenance & Scale",
      concepts: [
        ["Test the unhappy path", "Happy-path tests miss the failures that page people. Test missing fields, duplicates, timeouts and out-of-order events.", "Submit the same form twice and confirm one record."],
        ["Watch the runs", "A flow that silently stops is worse than no flow. Log each run and check a simple success rate weekly.", "A dashboard of runs, failures and last success time."],
        ["Version before you edit", "Changing a live flow can break in-flight records. Duplicate it, test the copy, then switch over and keep the old one for rollback.", "Clone, test, swap, keep the previous version a week."],
        ["Know when to stop automating", "A rarely used flow costs more to maintain than the manual task. Retire flows that do not earn their keep.", "Delete a workflow used twice a quarter."],
      ],
      workflow: [
        "Build a test checklist covering happy path and four failure cases.",
        "Add run logging and check the success rate weekly.",
        "Duplicate before any edit and keep a rollback path.",
        "Review each flow quarterly and retire the ones not worth keeping.",
      ],
      pitfalls: [
        "Testing only the perfect input and discovering failures in production.",
        "Editing a live flow in place with no way back.",
      ],
      questions: [
        ["What should tests cover?", "Happy path and failure cases", "Only the happy path", "Only weekends", "Nothing"],
        ["Why log every run?", "To spot silent failures", "To use more storage", "It is required by law", "To change the schema"],
        ["Why duplicate a flow before editing?", "To keep a rollback path", "It is faster", "It removes the need to test", "It lowers quality"],
        ["What is a good weekly check?", "Success rate and last success time", "Only the tool's logo", "Nothing", "Post count"],
        ["When should a flow be retired?", "When maintenance costs more than the manual task", "Never", "Only on Fridays", "When it is popular"],
        ["Which is a failure-case test?", "A duplicate submission", "A perfect form", "A sunny day", "A valid email"],
      ],
      takeaway: "Test the unhappy path, watch run health, version before editing, and retire flows that do not pay.",
      assignment: {
        title: "Test plan and maintenance schedule",
        instructions: "Write a test checklist for your flow with the happy path plus four failure cases (missing field, duplicate, timeout, out-of-order). Define what you will log and the weekly health check, describe your rollback procedure, and set a quarterly review rule for retiring flows. Submit the plan.",
        maxPoints: 150,
      },
    },
  ],
  toolkit: {
    fileName: "Automation-Design-Checklist.md",
    body: `# Automation Design Checklist\n\n## Design\n- [ ] Written as: when ___ , if ___ , do ___\n- [ ] Manual steps mapped with owners\n- [ ] Only copy/paste steps automated; judgment stays human\n- [ ] One canonical source of truth named\n\n## Build\n- [ ] Trigger type chosen (event vs schedule)\n- [ ] Every field mapped and validated\n- [ ] Branches mutually exclusive\n- [ ] Stable key prevents duplicate runs\n\n## Safety\n- [ ] Alert on exception, digest otherwise\n- [ ] Fail closed and log the error\n- [ ] Retry cap + escalation path\n- [ ] Secrets in vault, least scope\n\n## Launch\n- [ ] Happy path + 4 failure cases tested\n- [ ] Run logging and weekly success check\n- [ ] Cloned before edits; rollback kept\n- [ ] Quarterly retire review scheduled\n`,
  },
  capstone: {
    title: "An End-to-End Automation System",
    description:
      "Build and document one real automation that runs from a form to a routed, tracked outcome: trigger and data map, validated inputs, app connections, a staged pipeline, exception alerts with guardrails, one bounded AI step and a test-and-maintenance plan. Submit the working flow plus a short video or written walkthrough.",
    techStack: ["Trigger design", "Field mapping", "App integration", "Pipeline stages", "Notifications", "Bounded AI", "Testing"],
    outcome: "A system a colleague can inspect, trust and maintain — with the tests and rollback to prove it.",
  },
  showcase: {
    title: "Before / After Process Map",
    description:
      "A single page showing the manual process, the automated one, the steps removed and the one place a person still decides — with the time saved stated honestly.",
    techStack: ["Process mapping", "System design", "Change documentation"],
    outcome: "A clear argument for the automation that any stakeholder can understand in a minute.",
  },
};

export const skillCoursesC = [compileCourse(socialMedia), compileCourse(noCodeAutomation)];
