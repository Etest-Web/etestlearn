/**
 * Blueprints: AI Productivity + Web Design Fundamentals.
 * Consumed by seedSkills.ts through compileCourse() in seedSkillsKit.ts.
 */

import { compileCourse, type SkillCourseBlueprint } from "./seedSkillsKit";

const aiProductivity: SkillCourseBlueprint = {
  title: "AI Productivity: Prompting, Research & Workflows That Stick",
  slug: "ai-productivity",
  category: "Productivity",
  level: "Beginner to Intermediate",
  description:
    "Eight modules that turn AI from a novelty into a reliable workbench. Learn prompt anatomy, research and synthesis, writing and data workflows, custom tools and agents, plus the verification habits that keep errors out of your output. Every module has two articles, two knowledge checks and a real graded assignment.",
  modules: [
    {
      title: "AI Fundamentals & Prompt Anatomy",
      concepts: [
        ["What the model actually does", "A language model scores likely next tokens from the context you give it. It does not query a database of facts; it reconstructs patterns from training. Fluency is not accuracy.", "Ask it to complete a sentence, change one word, and watch how the completion shifts."],
        ["Prompt = role + task + context + format", "These four parts constrain the answer. Omitting one is the usual reason output feels generic and unusable.", "\"You are a grants reviewer. Summarise this proposal in five bullets, each under fifteen words, for a busy director.\""],
        ["Context window", "Every earlier message competes for attention. A long thread dilutes the instruction you gave at the top.", "Start a fresh chat when the topic changes instead of appending another question to an old one."],
      ],
      workflow: [
        "Open with a role and a one-sentence goal.",
        "Paste source material, then state format, length and audience.",
        "Ask one follow-up that tightens the weakest constraint rather than repeating the request.",
      ],
      pitfalls: [
        "Asking 'what do you think?' with no source — the model invents a position to be helpful.",
        "Keeping a forty-message thread and wondering why the early rules stopped applying.",
      ],
      questions: [
        ["Which part of a prompt tells the model who is answering?", "Role", "Format", "Temperature", "Token budget"],
        ["Why does a long thread make outputs weaker?", "Earlier instructions compete for attention", "The model forgets its training", "Long threads are billed differently", "Tokens expire after an hour"],
        ["What does a language model primarily produce?", "Likely next tokens from context", "Verified database records", "A summary of its training logs", "Random sentences"],
        ["Which is the clearest output instruction?", "Five bullets, under fifteen words each", "Make it good", "Something shortish", "A few points maybe"],
        ["When should you start a fresh chat?", "When the topic changes", "Every three messages", "Only after an error", "Never"],
        ["Why is fluency a poor proxy for accuracy?", "Confident text can still be fabricated", "Accurate text is always short", "Fluency is not measured", "Models refuse to be wrong"],
      ],
      takeaway: "Treat the prompt as a spec: role, task, context, format. When output drifts, fix the spec before blaming the model.",
      assignment: {
        title: "Prompt teardown: three versions of one request",
        instructions: "Pick a real task you did this week. Write three prompts for it: (1) vague, (2) role + task + context, (3) role + task + context + format + one explicit constraint. Run all three, paste the outputs, and in 150 words explain which constraint changed the result most. Submit as plain text with clear headings.",
        maxPoints: 100,
      },
    },
    {
      title: "Prompt Patterns That Work",
      concepts: [
        ["Few-shot examples", "Showing two or three finished input/output pairs teaches format better than describing it. Examples should resemble the real input, not an idealised version.", "Paste two example support tickets with your desired replies before asking for a third."],
        ["Reasoning before answer", "Asking for the checks or steps you want the model to perform makes failures visible. You audit the reasoning, not just the conclusion.", "\"List the three checks you applied, then give the classification.\""],
        ["Negative constraints", "Telling the model what to avoid is a real constraint, not politeness. Pair it with a positive instruction so there is still a clear target.", "\"Do not invent statistics. If a number is missing, write 'not provided'.\""],
      ],
      workflow: [
        "Draft the zero-shot version first so you have a baseline.",
        "Add two representative examples and compare the output.",
        "Add one negative constraint tied to the failure you actually saw.",
        "Test against three different inputs before you trust the prompt.",
      ],
      pitfalls: [
        "Pasting ten examples — the actual task gets crowded out.",
        "Demanding 'think step by step' on a task that has no meaningful steps; you get theatre, not reasoning.",
      ],
      questions: [
        ["What does few-shot prompting add?", "Worked input/output examples", "More computing power", "A faster model", "A longer memory"],
        ["Why ask for reasoning steps?", "Failures become visible and auditable", "It always improves accuracy", "It reduces token use", "It removes the need for sources"],
        ["What pairs best with a negative constraint?", "A clear positive target", "A longer prompt", "A higher temperature", "No examples"],
        ["How many examples is usually enough to teach a format?", "Two or three representative ones", "Exactly twenty", "None, ever", "As many as fit"],
        ["What is the risk of too many examples?", "They crowd out the actual task", "The model becomes slower but better", "Output becomes more creative", "Nothing; more is always better"],
        ["Why test a prompt on three inputs?", "One success may be a fluke of phrasing", "Three is the legal minimum", "It uses fewer tokens", "Models require it"],
      ],
      takeaway: "Examples teach format, reasoning exposes failures, and negative constraints prevent specific errors. Test on inputs you did not write.",
      assignment: {
        title: "Build and test a reusable prompt template",
        instructions: "Create one prompt template you would use weekly. Include a role, two worked examples, one negative constraint, and a placeholder marked [INPUT]. Test it on three inputs you did not use while writing it. Submit the template and a short table: input, output, what failed, what you changed.",
        maxPoints: 120,
      },
    },
    {
      title: "Research & Synthesis Without Fabrication",
      concepts: [
        ["Source-first prompting", "Give the model the material and restrict it to that material. A closed corpus turns a research task into an extraction task you can check.", "Paste three articles and say 'use only these sources; quote the line you relied on'."],
        ["Extract before summarising", "Ask for a table of claims with supporting quotes first. Summarisation after extraction preserves provenance; summarisation first destroys it.", "Claim | Source | Exact quote | Confidence."],
        ["Counterargument pass", "A second prompt asking 'what would a critic say?' surfaces weak claims cheaply.", "Ask for the strongest objection to each of your three findings."],
      ],
      workflow: [
        "Collect primary sources; never let the model supply them from memory.",
        "Extract claims with quotes into a table.",
        "Ask for synthesis from that table only.",
        "Run a counterargument pass and verify every surviving claim against its quote.",
      ],
      pitfalls: [
        "Accepting a perfectly formatted citation you have not opened.",
        "Asking for 'recent statistics' with no dates or sources attached.",
      ],
      questions: [
        ["What makes a research prompt verifiable?", "The model is limited to sources you supplied", "The answer is long", "The answer uses bullet points", "The model is asked to be honest"],
        ["Why extract claims before summarising?", "Provenance survives into the summary", "It is faster", "Summaries cannot include quotes", "Models prefer tables"],
        ["What does a counterargument pass do?", "Surfaces weak or unsupported findings", "Removes all disagreement", "Improves grammar", "Cites more sources"],
        ["What should you do with a citation you have not opened?", "Open it before using it", "Trust it if it looks formal", "Delete the whole document", "Ask the model to confirm it"],
        ["Which request invites fabrication?", "\"Give me recent statistics\" with no sources", "\"Use only the three articles below\"", "\"Quote the supporting line\"", "\"List what the sources do not say\""],
        ["What belongs in an extraction table?", "Claim, source and exact quote", "Only the conclusion", "The model's opinion", "The prompt itself"],
      ],
      takeaway: "Restrict the corpus, extract with quotes, then synthesise. A citation you have not opened is a guess with formatting.",
      assignment: {
        title: "Source-bounded research brief",
        instructions: "Choose three sources on a work question. Extract at least six claims into a table with source and exact quote. Write a 300-word brief using only those claims, then a 100-word counterargument section. Submit the table, brief and a note naming any claim you could not verify.",
        maxPoints: 150,
      },
    },
    {
      title: "Writing, Voice & Editing Passes",
      concepts: [
        ["Separate drafting from editing", "A single prompt that writes and polishes hides both decisions. Draft first, then give a second pass with one editing goal.", "Write the draft, then: 'cut 30% of the words without removing any fact'."],
        ["Voice anchoring", "Paste two samples of your own writing and ask the model to match their sentence length and tone.", "Two previous newsletters are a better style guide than 'write professionally'."],
        ["Audience calibration", "State what the reader already knows and what they need to do. That determines what you can omit.", "\"Audience: new managers. They know the tool; they do not know our approval process.\""],
      ],
      workflow: [
        "Draft for content only; ignore polish.",
        "Run one editing pass with a single measurable goal.",
        "Run a voice pass against your own samples.",
        "Read the final text aloud and fix anything you would not say.",
      ],
      pitfalls: [
        "Asking for 'professional but friendly' — unmeasurable, so the result is generic.",
        "Editing while drafting, which kills ideas before they are fully formed.",
      ],
      questions: [
        ["Why separate drafting from editing?", "Each pass has one checkable goal", "It costs fewer tokens", "Models cannot do both", "Editing must happen last always"],
        ["What is the best voice anchor?", "Two samples of your own writing", "The word 'professional'", "A thesaurus", "The model's default tone"],
        ["What does audience calibration tell the model?", "What the reader knows and must do", "Your preferred font", "The word count only", "The publication date"],
        ["Which editing instruction is measurable?", "Cut 30% without removing a fact", "Make it better", "Improve the flow", "Make it punchier"],
        ["What is the risk of editing while drafting?", "Ideas die before they form", "The draft gets too long", "Nothing", "The model refuses"],
        ["Why read the final text aloud?", "It exposes phrasing you would not say", "It counts words accurately", "It checks spelling", "It is required by most style guides"],
      ],
      takeaway: "One goal per pass. Voice comes from your own samples, not adjectives about tone.",
      assignment: {
        title: "Two-pass rewrite with a voice anchor",
        instructions: "Take a 600-word piece of your own writing. Paste two shorter samples as voice anchors. Produce a draft pass and then two distinct editing passes (one compression, one voice), each with a stated measurable goal. Submit all versions and a 100-word note on what the second pass changed.",
        maxPoints: 120,
      },
    },
    {
      title: "Spreadsheets & Data Work with AI",
      concepts: [
        ["Formula explanation", "Ask what a formula does in plain language before you edit it. Models are good at translating syntax into intent.", "Explain this nested XLOOKUP, then tell me what happens if the key is missing."],
        ["Text to table", "Unstructured notes can be converted to a typed table, but you must define the columns and the rules for missing values.", "Columns: date, client, amount, status. Missing amount → blank, not zero."],
        ["Anomaly spotting", "Ask for rows that break a stated rule rather than 'anything interesting'.", "List rows where the date is after today or the amount is negative."],
      ],
      workflow: [
        "Describe the schema before pasting data.",
        "State how blanks and duplicates should be treated.",
        "Ask for the transformation and a short explanation of the rule applied.",
        "Spot-check five rows by hand before using the result.",
      ],
      pitfalls: [
        "Letting blanks become zeros, which silently changes totals.",
        "Trusting a generated formula without testing an edge case.",
      ],
      questions: [
        ["What should you define before pasting data?", "Columns and missing-value rules", "Font and colour", "File name", "Row height"],
        ["Why are blanks dangerous when converted to zeros?", "They change totals and averages", "Zeros are invalid in spreadsheets", "They make files larger", "They are always correct"],
        ["What is a good anomaly request?", "List rows where the date is in the future", "Find something interesting", "Check the data", "Make it clean"],
        ["Why spot-check five rows?", "It catches rule misapplication cheaply", "Five is a legal requirement", "Models need five examples", "It removes all errors"],
        ["What does a formula explanation give you?", "Intent behind the syntax", "A faster calculation", "A new file", "A guaranteed correct formula"],
        ["How should duplicates be handled in a spec?", "State the rule explicitly", "Assume the model knows", "Delete everything", "Ignore them silently"],
      ],
      takeaway: "Define the schema and the edge cases first. AI output is a draft calculation until you spot-check it.",
      assignment: {
        title: "Data cleanup specification",
        instructions: "Take a messy table from your work (or invent one with at least 20 rows). Write the schema, the rule for blanks, duplicates and invalid dates, then produce a cleaned table with AI assistance. Spot-check five rows and document the checks in a short table. Submit spec, cleaned data and check log.",
        maxPoints: 130,
      },
    },
    {
      title: "Email, Meetings & Admin",
      concepts: [
        ["Notes to decisions", "Meeting transcripts are noise until converted into decisions, owners and dates. Ask for that structure explicitly.", "Decision | Owner | Due date | Open question."],
        ["Email triage", "Classify by required action, not by topic: reply, delegate, read later, archive.", "For each email: action, one-sentence reason, suggested reply."],
        ["Template reuse", "Once a reply works, turn it into a template with named placeholders instead of rewriting it.", "Hold the structure fixed; vary only [NAME] and [DATE]."],
      ],
      workflow: [
        "Paste the transcript or email thread.",
        "Ask for a structured table, not prose.",
        "Assign owners and dates yourself — the model cannot know them.",
        "Save the good output as a template with placeholders.",
      ],
      pitfalls: [
        "Letting the model invent an owner because the transcript did not name one.",
        "Sending generated replies without adding the one detail only you know.",
      ],
      questions: [
        ["What structure turns meeting notes into action?", "Decision, owner, due date, open question", "A long summary", "A transcript copy", "A word cloud"],
        ["How should email be triaged?", "By required action", "By sender's job title", "By length", "By date only"],
        ["Who should assign owners and dates?", "You", "The model", "The recipient", "Nobody"],
        ["What makes a reusable email template?", "Named placeholders in a fixed structure", "A very long draft", "No placeholders", "A different tone each time"],
        ["What is the risk in a generated reply?", "It omits a detail only you know", "It is too short", "It uses bullets", "It is grammatically correct"],
        ["Why ask for a table rather than prose?", "Owners and dates are easier to check", "Tables use fewer tokens", "Prose is always inaccurate", "Models prefer tables"],
      ],
      takeaway: "Convert noise into structure, then supply the human facts yourself. Save the good output as a template.",
      assignment: {
        title: "Meetings-to-decisions pack",
        instructions: "Use a real meeting transcript (or write a 500-word one). Produce a decision table with owner, due date and open question, then draft three replies you would send afterwards. Mark every field the model could not know as [NEEDS HUMAN]. Submit transcript, table and replies.",
        maxPoints: 120,
      },
    },
    {
      title: "Custom Instructions, Tools & Agents",
      concepts: [
        ["Custom instructions vs one-off prompts", "Custom instructions set defaults for every chat; one-off prompts override them for a task. Defaults should be about voice and constraints, not task content.", "Set 'never invent numbers' globally; give the actual task in the chat."],
        ["Tool use", "Tools let the model call a calculator, a search or your own API. The model still decides when to call one, so you inspect the call, not just the answer.", "Inspect which tool was called before trusting the result."],
        ["Agent loops and guardrails", "An agent chains steps toward a goal. Guardrails are the stopping rules: max steps, allowed tools, and a human checkpoint before irreversible actions.", "Require approval before anything is sent, paid or deleted."],
      ],
      workflow: [
        "Write defaults once: voice, format, and what must never be invented.",
        "Give the agent the minimum set of tools it needs.",
        "Set a step limit and a human checkpoint.",
        "Run it on a sandbox task and inspect the trace before real use.",
      ],
      pitfalls: [
        "Giving an agent write access to everything 'so it can be helpful'.",
        "Putting task-specific facts into global instructions where they go stale.",
      ],
      questions: [
        ["What belong in global custom instructions?", "Voice, format and standing constraints", "Today's task details", "Every fact you know", "Passwords"],
        ["What should you inspect after a tool call?", "Which tool was called and with what arguments", "Only the final answer", "The model's mood", "Nothing"],
        ["What is a guardrail for an agent?", "A stop rule or human checkpoint", "A longer system prompt", "A faster model", "A bigger context window"],
        ["When should a human checkpoint be required?", "Before sending, paying or deleting", "Never", "Only on Mondays", "After every token"],
        ["Why give an agent a minimal tool set?", "Fewer wrong actions are possible", "It makes answers longer", "Tools are expensive by default", "Agents cannot use tools"],
        ["Why run a sandbox task first?", "You can inspect the trace safely", "It is required by law", "It saves tokens", "It removes all risk"],
      ],
      takeaway: "Defaults for voice, tools for capability, guardrails for safety. Inspect the trace before the result.",
      assignment: {
        title: "Agent guardrail design",
        instructions: "Design an agent for one repetitive task in your work. List its goal, the three tools it may use, a maximum step count, and every point where a human must approve. Explain one failure mode and how your guardrails catch it. Submit as a one-page specification.",
        maxPoints: 140,
      },
    },
    {
      title: "Verification, Ethics & Your Playbook",
      concepts: [
        ["Verification ladder", "Check structure first, then facts against sources, then edge cases. Cheap checks catch most errors before expensive ones.", "Format → source match → one adversarial example."],
        ["Hallucination", "A confident fabricated answer. It is a normal failure mode, not a bug you can prompt away completely.", "Ask for the supporting quote; if none exists, do not use the claim."],
        ["Data handling", "Do not paste customer data, credentials or unpublished financials into a tool you have not cleared. Redaction is a habit, not a feature.", "Replace names and account numbers with placeholders before pasting."],
      ],
      workflow: [
        "Check format against the original request.",
        "Verify every factual claim against a source you control.",
        "Test one adversarial input deliberately.",
        "Log the prompt and what you changed so the next run starts ahead.",
      ],
      pitfalls: [
        "Treating a polished answer as a checked answer.",
        "Pasting sensitive data into a tool because 'it is only for a draft'.",
      ],
      questions: [
        ["What is the cheapest first verification check?", "Does the output match the requested format", "Cross-check every citation", "Run a full audit", "Ask another model"],
        ["What is a hallucination?", "A confident fabricated answer", "A slow response", "A refused request", "A correct citation"],
        ["How do you reduce fabrication risk?", "Require a supporting quote from a supplied source", "Write 'be accurate'", "Use shorter prompts", "Use longer prompts"],
        ["What should you do before pasting customer data?", "Redact identifiers and check the tool is approved", "Paste it; drafts do not count", "Ask the model to keep a secret", "Delete the source"],
        ["Why test an adversarial input?", "It exposes failure modes before real use", "It improves grammar", "It is faster than normal tests", "Models require it"],
        ["Why keep a prompt log?", "The next run starts from what already worked", "It fills storage", "It is legally required everywhere", "It replaces verification"],
      ],
      takeaway: "Verify structure, then facts, then edge cases. Redact before pasting. Log what changed.",
      assignment: {
        title: "Personal AI playbook",
        instructions: "Write a one-page playbook with: your three recurring AI tasks, the prompt template for each, a verification checklist, and a data-handling rule. Include one admission of a task you should not give to AI and why. Submit as a single document.",
        maxPoints: 150,
      },
    },
  ],
  toolkit: {
    fileName: "AI-Prompt-Workbench.md",
    body: `# AI Prompt Workbench

## Prompt template
ROLE: [who is answering]
TASK: [one sentence]
CONTEXT: [sources pasted below / link]
FORMAT: [bullets | table | prose], [length], [audience]
CONSTRAINT: [what must not be invented]

## Verification checklist
- [ ] Output matches requested format
- [ ] Every factual claim has a source I opened
- [ ] Edge case tested once
- [ ] Sensitive data redacted before pasting
- [ ] Prompt and changes logged

## Run log
| Date | Task | Prompt version | What failed | Fix |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Stop rules
Do not send, pay, publish or delete anything from a model output without a human check.
`,
  },
  capstone: {
    title: "Your Personal AI Operating Playbook",
    description:
      "Leave with a working system, not a list of prompts: three tested prompt templates for your real weekly tasks, a source-bounded research brief, a guardrailed agent design and a verification checklist you actually use. Each artefact shows the prompt, the output and the correction you made.",
    techStack: ["Prompt patterns", "Source-bounded research", "Verification ladder", "Agent guardrails", "Prompt log"],
    outcome:
      "A one-page playbook and three reusable templates you can hand to a colleague on day one.",
  },
  showcase: {
    title: "Meetings-to-Decisions Brief",
    description:
      "A real meeting transcript converted into a decision table with owners, dates and open questions, plus the three follow-up replies. Every field the model could not know is marked for a human.",
    techStack: ["Transcript synthesis", "Structured extraction", "Human-in-the-loop review"],
    outcome: "A reusable decision log template that removes the 'what did we agree?' follow-up email.",
  },
};

const webDesign: SkillCourseBlueprint = {
  title: "Web Design Fundamentals: HTML, CSS & Responsive Layouts",
  slug: "web-design-fundamentals",
  category: "Design",
  level: "Beginner",
  description:
    "Eight modules from document structure to a deployed, accessible page. Learn semantic HTML, the box model, typography and colour systems, responsive layout, design tokens, accessibility and performance, motion, and how to ship and iterate. Two articles, two knowledge checks and a graded assignment per module.",
  modules: [
    {
      title: "Semantics & HTML Structure",
      concepts: [
        ["Semantic elements", "Elements like header, nav, main and footer describe meaning, not appearance. Assistive technology and search engines use that meaning.", "Use <nav> for site navigation, not a <div> with a 'nav' class."],
        ["Document outline", "One h1 per page, then h2–h6 in order. Skipping levels to get a font size breaks the outline.", "A card heading under a Section h2 should be h3, even if it looks small."],
        ["Landmarks and labels", "Buttons need accessible names; forms need labels tied with for/id. Placeholder text is not a label.", "<label for=\"email\">Email</label><input id=\"email\">"],
      ],
      workflow: [
        "Sketch the content order before writing any markup.",
        "Wrap regions in semantic landmarks: header, nav, main, footer.",
        "Set the heading hierarchy from the content outline, not from visual size.",
        "Check the page with a screen reader outline or a semantics validator.",
      ],
      pitfalls: [
        "Using div for everything and adding ARIA roles afterwards.",
        "Choosing a heading level because of how it looks.",
      ],
      questions: [
        ["Which element marks the primary content of a page?", "main", "div", "span", "aside"],
        ["Why use semantic elements?", "They convey meaning to assistive tech", "They are shorter to type", "They load faster always", "They replace CSS"],
        ["How many h1 elements should a page usually have?", "One", "None", "One per section", "As many as needed"],
        ["What is wrong with a placeholder as a label?", "It disappears and may not be announced", "It is too short", "It cannot be styled", "It is deprecated"],
        ["What does the 'for' attribute on a label do?", "Ties the label to an input id", "Sets the font", "Adds a tooltip", "Disables the input"],
        ["How should heading levels be chosen?", "From the content outline", "From desired font size", "Randomly", "From the number of columns"],
      ],
      takeaway: "Mark up meaning first. Visual size is a CSS decision; heading level is a structure decision.",
      assignment: {
        title: "Semantic page audit",
        instructions: "Take a real page (yours or a public one) and rewrite its structure in semantic HTML: landmarks, ordered headings, labelled form controls. Submit the original outline, the new outline and a 100-word note on what a screen reader would now announce differently.",
        maxPoints: 100,
      },
    },
    {
      title: "The Box Model & Layout",
      concepts: [
        ["Every element is a box", "Content, padding, border and margin stack outward. With border-box sizing, width includes padding and border, which makes layout maths predictable.", "*, *::before, *::after { box-sizing: border-box; }"],
        ["Normal flow", "Block elements stack vertically; inline elements sit in line. Most layout bugs come from fighting normal flow instead of using it.", "A list of cards is blocks in flow until you deliberately change it."],
        ["Flexbox vs grid", "Flex handles one dimension — a row or a column. Grid handles two — rows and columns together. Pick by the number of dimensions you control.", "A nav bar is flex; a card gallery is grid."],
        ["Stacking context", "z-index only compares elements in the same stacking context. Transform and opacity create new contexts.", "A child with z-index cannot escape a parent that created a context."],
      ],
      workflow: [
        "Reset box-sizing at the top of your stylesheet.",
        "Build the page in normal flow first.",
        "Introduce flex for one-dimensional groups, grid for two-dimensional ones.",
        "Inspect computed box dimensions in devtools when something overflows.",
      ],
      pitfalls: [
        "Setting width: 100% plus padding without border-box, causing overflow.",
        "Using absolute positioning to fix spacing that should be gap or margin.",
      ],
      questions: [
        ["What does border-box sizing change?", "Width includes padding and border", "It removes margins", "It makes elements inline", "It hides overflow"],
        ["Which layout suits a one-dimensional row?", "Flexbox", "Grid", "Float", "Table layout"],
        ["Which layout suits rows and columns together?", "Grid", "Flexbox", "Inline-block", "Position absolute"],
        ["What creates a new stacking context?", "A transform on the parent", "A margin on the child", "A border on the body", "A text colour change"],
        ["What is the first step when a layout overflows?", "Inspect computed box dimensions", "Add overflow: hidden", "Add z-index", "Remove all padding"],
        ["What is normal flow?", "Blocks stack, inline items sit in lines", "A CSS framework", "A positioning mode for modals", "The default grid"],
      ],
      takeaway: "Reset box-sizing, work in normal flow, then choose flex or grid by the number of dimensions you control.",
      assignment: {
        title: "Layout reconstruction",
        instructions: "Recreate a simple two-column article layout using only semantic HTML and CSS: a header, a main with article and sidebar, and a footer. Use grid for the page and flex for the header controls. Submit the HTML/CSS and a screenshot note describing what happens below 600px.",
        maxPoints: 120,
      },
    },
    {
      title: "Typography & Colour Systems",
      concepts: [
        ["Type scale", "A small set of font sizes with a consistent ratio reads better than many ad-hoc sizes. Define them as tokens.", "text-sm, text-base, text-lg, text-2xl — not 13px, 15px, 17px, 21px."],
        ["Line length and rhythm", "Bodies of text read best around 60–75 characters per line. Line height should scale with measure.", "Cap a prose column with max-width and set line-height ~1.6."],
        ["Contrast", "Text needs a 4.5:1 contrast ratio against its background (3:1 for large text). Colour alone must not carry meaning.", "Pair an error icon with red, not just red text."],
        ["Colour tokens", "Name colours by role — surface, text, border, accent — not by appearance. Themes then swap values without touching components.", "--color-surface, --color-text, --color-accent"],
      ],
      workflow: [
        "Pick one font family and define a four-to-six step scale.",
        "Set a readable measure and line height for body text.",
        "Define semantic colour tokens and check contrast for each pair.",
        "Test the page in greyscale to confirm meaning survives.",
      ],
      pitfalls: [
        "Using grey text on a light background because it 'looks softer'.",
        "Encoding status only with colour.",
      ],
      questions: [
        ["What is a type scale?", "A small consistent set of sizes", "A list of fonts", "A browser setting", "A grid unit"],
        ["What is a good body measure?", "About 60–75 characters per line", "As wide as the screen", "Exactly 40px", "Whatever the design says"],
        ["What contrast ratio does normal text need?", "4.5:1", "1:1", "2:1", "10:1"],
        ["Why name colours by role?", "Themes can swap values without editing components", "It is shorter", "It is required by HTML", "It improves loading"],
        ["What does a greyscale test reveal?", "Whether meaning survives without colour", "Whether the font loads", "Whether images are sharp", "Whether the page is fast"],
        ["How should errors be shown?", "Icon plus colour plus text", "Colour only", "Text only in red", "A tooltip"],
      ],
      takeaway: "Define a scale and semantic colour roles, then verify contrast and greyscale readability.",
      assignment: {
        title: "Design token sheet",
        instructions: "Build a one-page token sheet for a simple app: five type sizes, three weights, four semantic colours, spacing scale and radius. State the contrast ratio for each text/background pair. Submit the token definitions and the sheet as HTML or a screenshot with the values listed.",
        maxPoints: 120,
      },
    },
    {
      title: "Responsive Design & Container Queries",
      concepts: [
        ["Fluid before breakpoints", "clamp() and relative units handle most scaling. Breakpoints should mark a layout change, not every pixel of growth.", "font-size: clamp(1rem, 2vw + 0.5rem, 1.5rem);"],
        ["Mobile-first min-width", "Write the narrow layout first and add min-width media queries upward. The base rule then works everywhere.", "A card is one column by default, two at 48rem."],
        ["Container queries", "When a component should respond to its own box rather than the viewport, declare the parent a container and query it.", "@container (min-width: 30rem) { .stats { grid-template-columns: repeat(4, 1fr); } }"],
        ["Declare base columns", "A grid with only a breakpoint variant has an implicit auto track that cannot shrink below content width. Always name the base count.", "grid-cols-1 md:grid-cols-3, not just md:grid-cols-3."],
      ],
      workflow: [
        "Build the narrowest layout first with fluid type and spacing.",
        "Add breakpoints only where the arrangement visibly changes.",
        "Switch to container queries for components reused in different widths.",
        "Test at 320, 768 and 1440px and watch for horizontal scroll.",
      ],
      pitfalls: [
        "A grid with only a breakpoint class causing sideways scroll on phones.",
        "Using truncate on a long string inside a narrow card, which widens its ancestors.",
      ],
      questions: [
        ["What does clamp() provide?", "A fluid value with a floor and ceiling", "A fixed pixel value", "A media query", "A colour token"],
        ["Which breakpoint direction is mobile-first?", "min-width", "max-width", "only screen", "print"],
        ["When is a container query better?", "When the component, not the window, changes size", "Always", "Never", "Only for fonts"],
        ["What happens with grid gap-6 md:grid-cols-2 on mobile?", "An implicit auto track that can overflow", "Two columns", "No layout", "A stack with fixed width"],
        ["What is a better alternative to truncate in a narrow card?", "Let text wrap and cap lines with line-clamp", "Make the font smaller", "Add overflow hidden to body", "Remove the text"],
        ["What widths should you test at minimum?", "320, 768 and 1440px", "Only 1440px", "Only 375px", "Only print"],
      ],
      takeaway: "Fluid first, breakpoints for real changes, container queries for reusable components. Name the base column count.",
      assignment: {
        title: "Responsive card grid",
        instructions: "Build a four-card grid that is one column on mobile, two in a narrow sidebar and four in a wide main area, using container queries. Include one long title that must wrap rather than widen the card. Submit code plus notes at 320px and 1440px.",
        maxPoints: 140,
      },
    },
    {
      title: "Components & Design Tokens",
      concepts: [
        ["Component API", "A component's props are its interface. Keep them about intent — variant, size, state — not about raw CSS values.", "<Button variant=\"primary\" size=\"sm\"> rather than <Button padding={4} color=\"#123\">."],
        ["Tokens over literals", "Spacing, colour and radius come from tokens so a change happens in one place and components stay consistent.", "gap-4 and rounded-lg, not gap-[17px] and rounded-[6px]."],
        ["Composition", "Small components that compose beat one component with twenty flags. Build Card, CardHeader and CardContent.", "Card > CardHeader > CardTitle, composed by the caller."],
      ],
      workflow: [
        "Name the component's variants and states before coding.",
        "Map each visual decision to an existing token.",
        "Compose from smaller primitives instead of adding boolean flags.",
        "Check that two callers can use it without changing the component.",
      ],
      pitfalls: [
        "Adding a prop for every one-off layout need.",
        "Hardcoding a hex value inside a component.",
      ],
      questions: [
        ["What should component props describe?", "Intent like variant and size", "Raw CSS values", "File names", "Database ids"],
        ["Why use tokens?", "One change updates every consumer", "They are shorter", "They are required by CSS", "They remove the need for classes"],
        ["What is composition?", "Building larger UI from small parts", "Inheriting styles", "Copying code", "Using !important"],
        ["What signals a component API is too wide?", "Many boolean flags for one-off cases", "It has a variant prop", "It uses tokens", "It is reusable"],
        ["Where should a new spacing value live?", "In the spacing token scale", "Inline in the component", "In a comment", "In the HTML"],
        ["Why check two callers?", "It reveals premature specialisation", "It is a lint rule", "It reduces file size", "It is required by React"],
      ],
      takeaway: "Props express intent, visuals come from tokens, and composition beats flag piles.",
      assignment: {
        title: "Component API refactor",
        instructions: "Take a component with more than six boolean props. Rewrite it as a small set of composable parts with variant/size props backed by tokens. Show the old API, the new API and two usage examples. Submit code and a 100-word rationale.",
        maxPoints: 120,
      },
    },
    {
      title: "Accessibility & Performance",
      concepts: [
        ["Keyboard first", "Every interactive element must be reachable and operable by keyboard. Focus styles are a requirement, not decoration.", "Use a real <button>, not a clickable div with no tabindex."],
        ["Images and alt text", "Decorative images get empty alt; informative images describe their content, not 'image of'.", "alt=\"Bar chart showing sales rising from January to June\"."],
        ["Core Web Vitals", "LCP measures loading, INP measures interaction, CLS measures visual stability. Reserve space for images and ads to avoid shifts.", "Set width and height on every image."],
        ["Render-blocking work", "Critical CSS early, non-critical JS deferred. Ship only what the page needs.", "Load a heavy chart library only when the chart section is visible."],
      ],
      workflow: [
        "Tab through the whole page and confirm a visible focus indicator.",
        "Check every image has appropriate alt text.",
        "Measure LCP, INP and CLS with a real device profile.",
        "Defer heavy work and re-measure.",
      ],
      pitfalls: [
        "Removing focus outlines because they 'look ugly'.",
        "Loading a full UI library for one button.",
      ],
      questions: [
        ["What does LCP measure?", "Loading of the largest content element", "Interaction delay", "Layout shift", "Network latency only"],
        ["What does INP measure?", "Interaction responsiveness", "Paint time", "Image size", "Font loading"],
        ["How do you reduce CLS from images?", "Reserve intrinsic width and height", "Hide images", "Use CSS backgrounds only", "Lazy-load everything"],
        ["What alt text fits a decorative image?", "An empty alt attribute", "A long description", "The file name", "No alt attribute"],
        ["Why keep focus outlines?", "Keyboard users need to see focus", "They improve contrast", "They are default browser style only", "They reduce CLS"],
        ["How should a heavy chart library load?", "Only when the chart is needed", "On every page always", "Inline in HTML", "Never"],
      ],
      takeaway: "Keyboard operable, correctly labelled, dimensionally stable. Measure before optimising.",
      assignment: {
        title: "Accessibility and vitals audit",
        instructions: "Audit a page you built: tab through it, list any missing focus states or labels, check every image's alt text, and record LCP/INP/CLS from a lab tool. Fix two issues and re-measure. Submit before/after notes and the numbers.",
        maxPoints: 140,
      },
    },
    {
      title: "Motion, Interaction & Polish",
      concepts: [
        ["Animate transform and opacity", "These properties are compositor-friendly. Animating width, height or top triggers layout on every frame.", "Use transform: translateY() rather than animating top."],
        ["Duration and easing", "Short movements (150–250ms) feel responsive. Ease out for entrances, ease in for exits.", "A tooltip appears in 150ms; a modal closes in 120ms."],
        ["Reduced motion", "Respect prefers-reduced-motion: reduce. Offer a static alternative for large movement.", "@media (prefers-reduced-motion: reduce) { * { animation: none; } }"],
        ["Feedback over decoration", "Motion should confirm state change: pressed, loading, success, error.", "A button depresses on :active; a saved form shows a check."],
      ],
      workflow: [
        "Decide what state change the motion communicates.",
        "Implement with transform/opacity and a short duration.",
        "Add a reduced-motion fallback.",
        "Record the interaction and check it at half speed for jank.",
      ],
      pitfalls: [
        "Animating layout properties on scroll.",
        "Adding entrance animations that delay content for every element.",
      ],
      questions: [
        ["Which properties are cheapest to animate?", "transform and opacity", "width and height", "top and left", "margin and padding"],
        ["What is a sensible duration for a tooltip?", "About 150ms", "About 2 seconds", "Exactly 1 second", "As long as possible"],
        ["Why respect prefers-reduced-motion?", "Some users get motion sickness", "It is a browser bug", "It saves bandwidth", "It is optional"],
        ["What should motion primarily do?", "Confirm a state change", "Fill empty space", "Hide slow loading", "Replace labels"],
        ["Which easing suits an exit?", "Ease in", "Ease out", "Linear always", "Bounce"],
        ["Why record at half speed?", "Jank becomes visible", "It makes files smaller", "It is required by CSS", "It tests colour"],
      ],
      takeaway: "Move transform and opacity, keep it short, respect reduced motion, and animate state changes only.",
      assignment: {
        title: "Motion audit with reduced-motion fallback",
        instructions: "Add three meaningful micro-interactions to a page: press feedback, a loading state and a success state. Implement with transform/opacity, add prefers-reduced-motion handling, and record a short clip. Submit code and a note on what each motion communicates.",
        maxPoints: 120,
      },
    },
    {
      title: "Shipping, Measuring & Iterating",
      concepts: [
        ["Preview before publish", "A shareable preview catches layout and content issues on real devices before anyone sees the final URL.", "Review the preview on a phone, not only a desktop emulator."],
        ["Performance budget", "Set a ceiling for page weight and third-party requests. New features must fit or justify an increase.", "Under 200KB of JS and fewer than five third-party requests."],
        ["Iteration loop", "Publish, observe real usage, find the worst friction, change one thing, measure again.", "One change per cycle so you know what moved the number."],
        ["Documentation", "Record why a non-obvious decision was made. Future you will not remember the constraint.", "A short note beside the container-query rule explaining which sidebar needed it."],
      ],
      workflow: [
        "Run a preview checklist: semantics, keyboard, contrast, widths, vitals.",
        "Ship behind a reviewable change with a rollback path.",
        "Watch one real user session or one analytics funnel.",
        "Change one thing and re-measure the same metric.",
      ],
      pitfalls: [
        "Shipping several changes at once and not knowing which helped.",
        "Letting a third-party script onto every page without a budget check.",
      ],
      questions: [
        ["Why use a preview URL?", "It catches issues on real devices before launch", "It is required by browsers", "It makes the site faster", "It replaces testing"],
        ["What is a performance budget?", "A ceiling for weight and requests", "A hosting plan", "A design rule", "A type scale"],
        ["Why change one thing per cycle?", "You can attribute the metric change", "It is faster", "It is required by CSS", "It avoids all bugs"],
        ["What should a code note explain?", "Why a non-obvious decision was made", "What the code does line by line", "The author's name", "The file size"],
        ["What belongs in a pre-publish checklist?", "Semantics, keyboard, contrast, widths, vitals", "Only colour choices", "Only font choice", "Only the hero image"],
        ["What is a rollback path?", "A way to restore the previous version", "A backup of images", "A legal document", "A new domain"],
      ],
      takeaway: "Preview on real devices, hold a budget, change one thing, measure, document why.",
      assignment: {
        title: "Launch checklist and iteration plan",
        instructions: "Take a page you designed in this course. Write a pre-publish checklist with at least eight concrete checks, set a performance budget, and describe your first iteration: the metric you will watch, the single change you will make, and how you will know it worked. Submit as one document.",
        maxPoints: 140,
      },
    },
  ],
  toolkit: {
    fileName: "Web-Design-Preflight.md",
    body: `# Web Design Preflight

## Structure
- [ ] One h1; headings in order, chosen by outline not size
- [ ] Landmarks: header, nav, main, footer
- [ ] Form controls have labels tied with for/id

## Layout
- [ ] box-sizing reset in place
- [ ] Every grid names its base column count
- [ ] No horizontal scroll at 320px

## Type and colour
- [ ] Type scale uses tokens, not ad-hoc pixels
- [ ] Body text contrast >= 4.5:1
- [ ] Page readable in greyscale

## Access and speed
- [ ] Keyboard reachable with visible focus
- [ ] Informative images have alt text; decorative ones have alt=""
- [ ] Images have width and height set
- [ ] LCP / INP / CLS recorded

## Motion
- [ ] transform/opacity only
- [ ] prefers-reduced-motion handled

## Ship
- [ ] Preview reviewed on a real phone
- [ ] Performance budget checked
- [ ] One change per iteration, with a rollback path
`,
  },
  capstone: {
    title: "A Responsive Portfolio Page, Deployed",
    description:
      "Build and ship a one-page portfolio with semantic structure, a token-based type and colour system, a container-query card grid, keyboard access, measured vitals and one meaningful micro-interaction. Include a short preflight report with screenshots at 320px and 1440px.",
    techStack: ["Semantic HTML", "CSS grid and container queries", "Design tokens", "Accessibility audit", "Core Web Vitals"],
    outcome:
      "A live URL you can send to an employer, plus the checklist that got it there.",
  },
  showcase: {
    title: "Component Library Starter",
    description:
      "A small set of composable components — Card, Button, Badge — with props expressed as intent and every visual value backed by a token. Includes two usage examples.",
    techStack: ["Component composition", "Design tokens", "Variant props"],
    outcome: "A reusable foundation you can paste into the next project instead of starting over.",
  },
};

export const skillCoursesA = [compileCourse(aiProductivity), compileCourse(webDesign)];
