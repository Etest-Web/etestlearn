/**
 * Paid blueprints 1-2: Prompt Engineering Mastery + Spreadsheets That Run Your Work.
 * Consumed by seedPaidSkills.ts through compileCourse() in seedSkillsKit.ts.
 */

import {
  blank,
  compileCourse,
  tf,
  type SkillCourseBlueprint,
} from "./seedSkillsKit";

const promptEngineering: SkillCourseBlueprint = {
  title: "Prompt Engineering Mastery",
  slug: "prompt-engineering",
  category: "AI & Productivity",
  level: "Beginner to Intermediate",
  description:
    "Eight modules that turn prompting from trial and error into a repeatable engineering practice. You will model how language models behave, write prompts with explicit role, task, context and format, use examples and reasoning passes, build reusable prompt systems, and evaluate outputs before they reach a real workflow. Every module has two articles, an interactive walkthrough, two knowledge checks with mixed question types, and a graded assignment.",
  interactiveSlides: true,
  modules: [
    {
      title: "How Language Models Actually Work",
      concepts: [
        ["Next-token prediction", "A model scores likely continuations from the context you give it. It has no live lookup and no sense of truth, so fluency and accuracy are different things.", "Complete 'The capital of France is' and watch how confidently it continues; then ask for a source."],
        ["Context is the whole instruction", "Everything in the conversation is input. Earlier text competes with later text, so a long thread dilutes the rules you set at the top.", "Restate your key constraint immediately before the task once a thread passes ten messages."],
        ["Temperature", "Higher temperature widens the sampling pool. Extraction and classification want low temperature; brainstorming wants higher.", "Ask for fixed-format JSON at temperature 0, then at 1, and compare stability."],
      ],
      workflow: ["State the goal in one sentence.", "Add source material before asking for output.", "Specify format, length and audience.", "Check the result against the original goal."],
      pitfalls: ["Asking 'what do you think?' with no source — the model invents a position to be helpful.", "Reusing a forty-message thread for an unrelated topic."],
      questions: [
        ["What does a language model primarily produce?", "Likely next tokens from context", "Verified database records", "A summary of its training logs", "Random sentences"],
        tf("A fluent answer is guaranteed to be factually accurate.", false),
        ["What does temperature control?", "Randomness of token selection", "How fast the model replies", "The number of words it may use", "Whether it can refuse"],
        ["Which settings suit fixed-format extraction?", ["Low temperature", "An explicit output format"], "High temperature", "No format at all", "A vague one-line prompt"],
        ["What should you do when a long thread stops following your rules?", "Restate the constraint near the task", "Increase the temperature", "Delete the sources", "Ask it to be more honest"],
        blank("A model has no live access to external ______, so unverified facts may be fabricated.", "databases", "data sources", "sources"),
      ],
      takeaway: "Treat the model as a pattern completer, not an oracle: control the context and you control the output.",
      assignment: {
        title: "Model behaviour lab",
        instructions: "Run one short prompt three ways: default settings, low temperature, high temperature. Paste all three outputs and write 150 words on which setting fits an extraction task and which fits brainstorming. Include one example of confident-but-wrong text you observed.",
        maxPoints: 100,
      },
    },
    {
      title: "Prompt Anatomy: Role, Task, Context, Format",
      concepts: [
        ["Role", "A role sets the standpoint and vocabulary. It narrows the space of acceptable answers before the task is read.", "\"You are a grants reviewer assessing eligibility, not a marketing writer.\""],
        ["Task and context", "The task is the single action; context is the material it acts on. Mixing them produces prompts that read like paragraphs of wishes.", "Task: classify. Context: the five tickets pasted below."],
        ["Format", "Format is a contract: bullets, table, JSON, word count. Without it you get a plausible essay instead of a usable artefact.", "Return a JSON object with keys verdict, reason and evidence."],
      ],
      workflow: ["Write the role as one sentence.", "Write the task as one verb phrase.", "Paste the context, labelled.", "Add format and one hard constraint."],
      pitfalls: ["Four roles in one prompt — the model averages them.", "Asking for 'a detailed but brief summary' with no numbers."],
      questions: [
        ["Which part sets the standpoint of the answer?", "Role", "Format", "Temperature", "Token budget"],
        tf("A longer prompt is always a better prompt.", false),
        ["What makes a format instruction usable?", "A named structure and a length limit", "The word 'nicely'", "Three adjectives", "No examples"],
        ["Which belong in a well-formed prompt?", ["A role", "A single clear task", "An explicit format"], "Four conflicting roles", "Vague adjectives only", "Nothing but a question mark"],
        ["Where should source material go?", "Before the task, clearly labelled", "After the answer", "In a separate conversation", "Nowhere; models know everything"],
        blank("The four parts of a prompt are role, task, context and ______.", "format", "output format"),
      ],
      takeaway: "A prompt is a spec. When output drifts, fix the spec before blaming the model.",
      assignment: {
        title: "Prompt teardown: three versions of one request",
        instructions: "Pick a real task from your week. Write three prompts: vague, role + task + context, and all four parts plus one explicit constraint. Run all three, paste the outputs, and in 150 words name which constraint changed the result most.",
        maxPoints: 100,
      },
    },
    {
      title: "Few-Shot Examples and Negative Constraints",
      concepts: [
        ["Few-shot examples", "Two or three finished input/output pairs teach format better than a paragraph describing it. Examples must resemble the real input.", "Paste two labelled support tickets with replies before asking for a third."],
        ["Reasoning before answer", "Ask for the checks you want performed first. You then audit the reasoning, not just the conclusion.", "List the three checks applied, then give the classification."],
        ["Negative constraints", "Telling the model what to avoid is a real constraint when tied to a failure you saw. Pair it with a positive target.", "Do not invent numbers; write 'not provided' when a figure is missing."],
      ],
      workflow: ["Draft a zero-shot baseline.", "Add two representative examples.", "Compare output against the baseline.", "Add one negative constraint for the failure you actually saw."],
      pitfalls: ["Pasting ten examples — the real task gets crowded out.", "Demanding 'think step by step' where there are no meaningful steps; you get theatre."],
      questions: [
        ["What does few-shot prompting add?", "Worked input/output examples", "More computing power", "A faster model", "A longer memory"],
        tf("Asking for reasoning steps makes every answer more accurate.", false),
        ["What pairs best with a negative constraint?", "A clear positive target", "A longer prompt", "A higher temperature", "No examples"],
        ["Which are signs of a good example set?", ["Two or three items", "Same shape as real input", "Consistent labels"], "Twenty near-identical items", "Idealised toy inputs", "No labels"],
        ["Why test a prompt on inputs you did not write?", "One success may be a fluke of phrasing", "Three is a legal minimum", "It uses fewer tokens", "Models require it"],
        blank("Asking for the checks before the answer makes failures ______.", "visible", "auditable"),
      ],
      takeaway: "Examples teach format, reasoning exposes failures, negatives prevent specific errors. Test on unseen inputs.",
      assignment: {
        title: "Build and test a reusable prompt template",
        instructions: "Create one template you would use weekly. Include a role, two worked examples, one negative constraint and a [INPUT] placeholder. Test it on three inputs you did not use while writing it. Submit the template and a table: input, output, what failed, what you changed.",
        maxPoints: 120,
      },
    },
    {
      title: "Verification and Anti-Hallucination Habits",
      concepts: [
        ["Source-first prompting", "Give the model material and restrict it to that material. A closed corpus turns research into extraction you can check.", "Use only these three articles; quote the line you relied on."],
        ["Extract before summarising", "Ask for a table of claims with quotes first. Summarisation after extraction preserves provenance; summarising first destroys it.", "Claim | Source | Exact quote | Confidence."],
        ["Counterargument pass", "A second prompt asking what a critic would say surfaces weak claims cheaply.", "Give the strongest objection to each of your three findings."],
      ],
      workflow: ["Collect primary sources yourself.", "Extract claims with quotes into a table.", "Synthesise from the table only.", "Run a counterargument pass and verify survivors."],
      pitfalls: ["Accepting a perfectly formatted citation you have not opened.", "Asking for recent statistics with no dates or sources attached."],
      questions: [
        ["What makes a research prompt verifiable?", "The model is limited to sources you supplied", "The answer is long", "The answer uses bullets", "The model is asked to be honest"],
        tf("A citation you have not opened is safe to reuse if it looks formal.", false),
        ["Why extract claims before summarising?", "Provenance survives into the summary", "It is faster", "Summaries cannot include quotes", "Models prefer tables"],
        ["Which requests invite fabrication?", ["Give me recent statistics with no sources", "Write a biography from memory", "Invent a citation"], "Use only the text below", "Quote the supporting line", "State what the source does not say"],
        ["What belongs in an extraction table?", "Claim, source and exact quote", "Only the conclusion", "The model's opinion", "The prompt itself"],
        blank("A citation you have not opened is a guess with ______.", "formatting", "format"),
      ],
      takeaway: "Restrict the corpus, extract with quotes, then synthesise. Verification is a workflow, not a hope.",
      assignment: {
        title: "Source-bounded research brief",
        instructions: "Choose three sources on a work question. Extract at least six claims into a table with source and exact quote. Write a 300-word brief using only those claims, then a 100-word counterargument. Submit the table, brief and a note naming any claim you could not verify.",
        maxPoints: 150,
      },
    },
    {
      title: "Structuring Outputs: Tables, JSON and Checklists",
      concepts: [
        ["Schema-first output", "Define the keys and types before you ask for data. A named schema turns prose into something code can consume.", "Return {verdict, confidence, evidence} with confidence as a number 0-1."],
        ["One format per request", "Asking for a table and a summary in the same prompt produces a compromise that is neither.", "Get the table first; summarise it in a second call."],
        ["Validation beats trust", "Check required keys and types programmatically. A model can follow the shape and still fill it with nonsense.", "Reject the response if confidence is missing or not numeric."],
      ],
      workflow: ["Write the output schema.", "Ask for the schema, nothing else.", "Validate the response.", "Only then transform or summarise it."],
      pitfalls: ["Allowing extra prose around JSON and then wondering why the parser fails.", "Trusting a confidence number as if it were calibrated probability."],
      questions: [
        ["Why define a schema first?", "Code can consume a predictable response", "It makes the model smarter", "It reduces token cost to zero", "It removes the need to validate"],
        tf("Requesting a table and a summary together usually gives the best of both.", false),
        ["What should a validator check?", "Required keys and value types", "How polished the prose is", "The model's mood", "The length of the prompt"],
        ["Which are valid schema fields?", ["verdict: string", "confidence: number", "evidence: string[]"], "anything goes", "vibes: maybe", "confidence: sort-of"],
        ["What to do with prose wrapped around JSON?", "Ask for JSON only and strip fences deliberately", "Parse it anyway and hope", "Delete the schema", "Increase temperature"],
        blank("Validation beats ______: a response can have the right shape and wrong content.", "trust"),
      ],
      takeaway: "Specify shape, validate programmatically, then transform. Never parse prose as data by accident.",
      assignment: {
        title: "Structured extraction pipeline",
        instructions: "Pick five short texts and extract three fields from each as JSON. Write the schema, the prompt, and a validator that rejects malformed responses. Submit the schema, validator output and one failure you caught.",
        maxPoints: 130,
      },
    },
    {
      title: "Prompt Systems: Variables, Templates and Roles",
      concepts: [
        ["Template with placeholders", "A reusable prompt has stable instructions and marked variable slots. Keep the slots few and named consistently.", "Classify {{text}} as one of {{labels}}. Return only the label."],
        ["System vs user messages", "System messages hold durable rules; user messages hold the current input. Putting a rule in the user turn makes it easier to override.", "Keep tone and output rules in the system message."],
        ["Versioning", "Change one variable at a time and record the change. A prompt that cannot be compared is a prompt that cannot be improved.", "Store v1 and v2 with the exact diff and the test results."],
      ],
      workflow: ["Extract the stable parts into a template.", "Name every placeholder.", "Move durable rules into the system message.", "Keep a change log with test outputs."],
      pitfalls: ["Embedding today's data into the system message.", "Changing three things at once and guessing which helped."],
      questions: [
        ["Where do durable rules belong?", "System message", "User message only", "In the output", "Nowhere"],
        tf("Placeholders should be renamed freely between versions for clarity.", false),
        ["What does versioning a prompt give you?", "Comparable test results", "A longer prompt", "A faster model", "Automatic accuracy"],
        ["Which are good placeholder names?", ["{{text}}", "{{labels}}", "{{audience}}"], "TEXT1", "xxx", "the thing", "a b c"],
        ["Why change one variable at a time?", "So the effect is attributable", "It is required by the API", "It uses fewer tokens", "Models refuse otherwise"],
        blank("A reusable prompt keeps stable instructions and marked ______ slots.", "variable", "placeholder"),
      ],
      takeaway: "Templates turn a lucky prompt into a system. Version them so improvements are evidence, not folklore.",
      assignment: {
        title: "Prompt template with change log",
        instructions: "Build one templated prompt with at least three named placeholders and a system message. Define a five-case test set. Submit v1 and v2 with the exact diff, outputs for all five cases, and a 150-word note on what changed.",
        maxPoints: 140,
      },
    },
    {
      title: "Evaluating Prompts and Setting Guardrails",
      concepts: [
        ["Test sets before tweaks", "A fixed set of representative cases turns prompt work into measurement. Without it you are judging by vibes.", "Twenty labelled cases with expected outputs."],
        ["Failure taxonomy", "Group failures by cause: wrong format, missing fact, fabrication, tone. Fix the biggest group first.", "Count errors by category before editing anything."],
        ["Guardrails", "Constrain the output surface: allowed labels, maximum length, refusal text. A smaller output space is easier to verify.", "Accept only one of three labels; otherwise return 'unknown'."],
      ],
      workflow: ["Freeze a labelled test set.", "Score the current prompt.", "Group failures by cause.", "Change one thing and rescore.", "Ship only when the regression set stays green."],
      pitfalls: ["Editing the test set to make a bad prompt look good.", "Reporting a single impressive example as evidence."],
      questions: [
        ["What is the first step in prompt evaluation?", "Freeze a labelled test set", "Change the wording", "Raise temperature", "Ask the model to grade itself"],
        tf("A single impressive example is enough evidence to ship a prompt.", false),
        ["Why group failures by cause?", "So the biggest category can be fixed first", "It makes the report longer", "Models prefer categories", "It removes the need for tests"],
        ["Which are real guardrails?", ["Allowed label set", "Maximum response length", "Explicit refusal text"], "Higher temperature", "Longer prompt", "More adjectives"],
        ["What does a regression set protect against?", "A fix that breaks previously good cases", "Token price changes", "Model release dates", "Nothing"],
        blank("A prompt without a fixed test set is judged by ______.", "vibes", "feelings", "guesses"),
      ],
      takeaway: "Freeze cases, count failures, change one thing, rescore. Guardrails shrink what can go wrong.",
      assignment: {
        title: "Prompt evaluation report",
        instructions: "Create a labelled test set of at least twelve cases for one prompt. Score v1, make one targeted change, score v2, and group every failure by cause. Submit the set, both score tables and a 200-word recommendation on whether to ship.",
        maxPoints: 150,
      },
    },
    {
      title: "Prompt Injection and Safe Automation",
      concepts: [
        ["Indirect injection", "Text inside a retrieved document can carry instructions that compete with yours. Treat fetched content as data, never as commands.", "Paste a page that says 'ignore previous instructions' and record what changes."],
        ["Least privilege", "Give a prompt only the data and tools the task needs. A prompt that can do everything can leak everything.", "Let a summariser read one folder, not the whole drive."],
        ["Human checkpoint", "An automated output that triggers a real action needs a review step. Confidence in formatting is not confidence in correctness.", "Require approval before an AI-drafted reply is sent."],
      ],
      workflow: ["Separate trusted instructions from untrusted content.", "Quote or strip control-like text in inputs.", "Grant the minimum data and tools.", "Put a human check before any irreversible action."],
      pitfalls: ["Following instructions found in a document you asked the model to summarise.", "Letting one prompt read private data and send it externally in a single step."],
      questions: [
        ["Why is text inside a retrieved document untrusted?", "It may contain instructions that override yours", "It is always shorter", "Models ignore documents", "It is formatted differently"],
        tf("A prompt that follows instructions found in a document is demonstrating a useful feature.", false),
        ["What does least privilege mean for a prompt?", "Only the data and tools the task needs", "The longest possible system message", "Full access for convenience", "No output format"],
        ["Which are safe automation habits?", ["Separate instructions from data", "Approve before sending", "Limit tool access"], "Trust any confident output", "Let the model email without review", "Give it every file"],
        ["Where should a human checkpoint sit?", "Before an irreversible action", "After every token", "Only in documentation", "Never"],
        blank("Text fetched from a document should be treated as ______, never as instructions.", "data", "content"),
      ],
      takeaway: "Treat retrieved text as data, grant minimum access, and keep a human before any irreversible step.",
      assignment: {
        title: "Injection resilience test",
        instructions: "Design a document-summary prompt that must ignore instructions embedded in the document. Build five test documents, two containing hostile instructions, and record how the prompt behaves before and after your fix. Submit the prompt, the test set, and a 150-word note on the safeguard that worked and the one that did not.",
        maxPoints: 140,
      },
    },
  ],
  toolkit: {
    fileName: "prompt-engineering-toolkit.md",
    body: `# Prompt Engineering Toolkit

## The four-part spec
- [ ] Role: one sentence, one standpoint
- [ ] Task: one verb phrase
- [ ] Context: labelled source material
- [ ] Format: structure, length, audience

## Before you send
- [ ] Low temperature for extraction and classification
- [ ] Two or three real examples, not toy ones
- [ ] One negative constraint tied to a failure you saw
- [ ] No rule buried at the end of a long thread

## Verification
- [ ] Sources supplied by me, not recalled by the model
- [ ] Claims extracted with quotes before summarising
- [ ] Counterargument pass run
- [ ] Every surviving citation opened

## Systems
- [ ] Stable instructions templated with named placeholders
- [ ] Durable rules in the system message
- [ ] One change per version, with a change log
- [ ] Labelled test set frozen before edits

## Ship gate
- [ ] Test set scored before and after
- [ ] Failures grouped by cause
- [ ] Regression set still green
- [ ] Output validated programmatically
`,
  },
  capstone: {
    title: "A Production Prompt Pack",
    description:
      "Ship a documented pack of three reusable prompts for one real workflow. Each prompt has a system message, named placeholders, a versioned change log, a labelled test set with before/after scores, and a guardrail section. Include a one-page operator guide explaining when to use each prompt and how to tell when it is drifting.",
    techStack: ["Prompt templates", "Labelled test sets", "Output schemas", "Version control", "Guardrails"],
    outcome: "A pack a colleague can run and evaluate without asking you how it works.",
  },
  showcase: {
    title: "Before/After Prompt Gallery",
    description:
      "Three side-by-side comparisons of a vague prompt and its engineered version, each with the real outputs and a short note on which constraint mattered. Written for a non-technical reader.",
    techStack: ["Prompt anatomy", "Output comparison", "Technical writing"],
    outcome: "A portfolio piece that demonstrates the difference engineering makes.",
  },
};

const spreadsheets: SkillCourseBlueprint = {
  title: "Spreadsheets That Run Your Work",
  slug: "spreadsheets-for-work",
  category: "Productivity",
  level: "Beginner to Intermediate",
  description:
    "Eight modules that move spreadsheets from a place you store numbers to a system that runs a process. Build clean inputs, write dependable formulas, use lookups and conditional logic, summarise with pivot tables, and present a dashboard people actually read. Every module has two articles, an interactive walkthrough, two mixed-type knowledge checks and a graded assignment.",
  interactiveSlides: true,
  modules: [
    {
      title: "The Spreadsheet Mental Model",
      concepts: [
        ["Cells, ranges and references", "A reference points to a location, not a value. Relative references move when copied; absolute references stay put. Most formula bugs are reference bugs.", "Copy =A1 down one row and watch it become =A2; copy =$A$1 and it stays."],
        ["One fact per cell", "A cell should hold one value. Mixing a number and a note in the same cell makes every downstream calculation harder.", "Put the note in its own column instead of '42 approx'."],
        ["Input, calculation, output", "A trustworthy sheet separates raw inputs from formulas from the final report. Mixing them means a typo can hide in the middle.", "Colour inputs blue, formulas black, outputs green."],
      ],
      workflow: ["Sketch the outputs you need first.", "List the raw inputs that produce them.", "Place inputs in one block.", "Put calculations between inputs and outputs."],
      pitfalls: ["Typing a number straight into a formula instead of referencing a cell.", "Merging cells inside a data range — sort and filters break."],
      questions: [
        ["What does a relative reference do when copied down?", "Adjusts to the new row", "Stays fixed", "Deletes the value", "Converts to text"],
        tf("Merged cells inside a data range are harmless for sorting.", false),
        ["Which layout is most trustworthy?", "Inputs, calculations, outputs in separate blocks", "One giant mixed grid", "Numbers typed into formulas", "Notes inside every value"],
        ["Which are good reference habits?", ["Use $ for a fixed lookup cell", "Reference inputs instead of retyping", "Keep one fact per cell"], "Type constants everywhere", "Merge cells in data", "Mix notes into numbers"],
        ["Why keep inputs in one block?", "Changes flow through predictably", "It looks nicer", "It uses less memory", "Sheets require it"],
        blank("A reference that stays fixed when copied uses the ______ sign.", "$", "dollar"),
      ],
      takeaway: "Separate inputs, calculations and outputs. Most formula failures are reference or layout failures.",
      assignment: {
        title: "Audit a messy sheet",
        instructions: "Find or build a small messy sheet with at least five problems. Rewrite it with a clear input block, a calculation area and an output summary. Submit before and after screenshots plus a 200-word list of what you fixed and why.",
        maxPoints: 100,
      },
    },
    {
      title: "Clean Data and Safe Imports",
      concepts: [
        ["Text to columns and types", "Imported numbers often arrive as text. Convert explicitly and check alignment: numbers right, text left.", "Use VALUE or 'Text to Columns' before summing."],
        ["Trim and normalise", "Trailing spaces and mixed case break lookups. Normalise keys on import, not at every lookup.", "TRIM(UPPER(A2)) as a helper column."],
        ["One header row", "A single, unique header row enables filters, tables and pivots. Blank or repeated headers silently break tools.", "Rename 'Date ' to 'Date' before building a table."],
      ],
      workflow: ["Import into a raw sheet and never edit it.", "Normalise keys in a helper column.", "Convert types explicitly.", "Build the working sheet from cleaned data."],
      pitfalls: ["Editing the raw export in place, so re-importing loses your fixes.", "Using a lookup key with invisible trailing spaces."],
      questions: [
        ["Why keep a raw import sheet?", "Re-importing will not destroy your fixes", "It is required by the file format", "It makes files larger", "It replaces validation"],
        tf("Numbers imported as text will still sum correctly.", false),
        ["What does TRIM do?", "Removes leading and trailing spaces", "Changes case", "Deletes rows", "Converts to number"],
        ["Which are cleaning steps?", ["Normalise case", "Remove trailing spaces", "Convert text-numbers"], "Merge cells", "Delete headers", "Type values manually"],
        ["Why normalise keys on import?", "Lookups then work everywhere", "It is faster to type", "Sheets forbid helper columns", "It removes duplicates automatically"],
        blank("By default numbers align ______ and text aligns left.", "right"),
      ],
      takeaway: "Never edit raw imports. Clean once in a helper layer so every downstream formula sees the same data.",
      assignment: {
        title: "Clean an export",
        instructions: "Take a CSV export with at least four deliberate problems (text numbers, trailing spaces, mixed case, blank header). Produce a raw sheet, a cleaning layer and a clean sheet. Submit a short note naming each problem and the formula or step that fixed it.",
        maxPoints: 110,
      },
    },
    {
      title: "Core Functions You Will Actually Use",
      concepts: [
        ["SUM, AVERAGE, COUNT", "Aggregations over ranges. COUNT ignores blanks and text; COUNTA counts non-empty cells. Pick deliberately.", "COUNT for numeric scores, COUNTA for responses received."],
        ["IF and nesting", "IF branches on a condition. Deep nesting becomes unreadable fast, so stop at three levels.", "IF(C2>=70,\"Pass\",\"Review\")."],
        ["Text functions", "LEFT, RIGHT, MID, LEN and CONCAT handle codes and labels. Combine them with TRIM for messy IDs.", "Extract the first three characters as a category code."],
      ],
      workflow: ["Write the aggregation needed for the output.", "Add one condition at a time.", "Test with blanks and zeros.", "Replace repeated logic with a helper column."],
      pitfalls: ["Dividing by an empty cell without guarding it.", "Nesting five IFs where a lookup table would be clearer."],
      questions: [
        ["Which function counts non-empty cells including text?", "COUNTA", "COUNT", "SUM", "AVERAGE"],
        tf("COUNT and COUNTA always return the same result.", false),
        ["What does IF return when its condition is false?", "Its third argument", "An error", "The condition itself", "Nothing"],
        ["Which are text functions?", ["LEFT", "LEN", "TRIM"], "SUM", "AVERAGE", "COUNTIF"],
        ["Why guard a division?", "An empty denominator causes an error", "It is faster", "It changes the answer type", "Sheets forbid division"],
        blank("Nesting more than about three ______ makes a formula hard to read.", "IFs", "ifs"),
      ],
      takeaway: "Use aggregation, one branch at a time, and helper columns for repeated logic. Test with blanks.",
      assignment: {
        title: "Function workbook",
        instructions: "Build a sheet with ten rows of sample data. Use SUM, AVERAGE, COUNT, COUNTA, IF, LEFT, LEN and TRIM at least once each. Include one guarded division. Submit the sheet and a short note on two edge cases you tested.",
        maxPoints: 120,
      },
    },
    {
      title: "Lookups and References That Do Not Break",
      concepts: [
        ["Exact vs approximate match", "Most lookups want exact match. Approximate match needs a sorted key and surprises people when it is not.", "Set the last argument to FALSE or 0 for exact matching."],
        ["Absolute ranges", "Lock the lookup table with $ so copying the formula down does not slide the range.", "$B$2:$D$50 stays put when copied."],
        ["Error handling", "Wrap lookups so a missing key gives a clear message rather than a wall of #N/A.", "IFERROR(VLOOKUP(...),\"Not found\")."],
      ],
      workflow: ["Confirm the key is unique and cleaned.", "Lock the table range.", "Choose exact match.", "Wrap the result with a friendly error."],
      pitfalls: ["Looking up an untrimmed key and assuming the value is missing.", "Sorting the table after a formula assumed a fixed order."],
      questions: [
        ["Which match mode do most lookups need?", "Exact", "Approximate", "Reverse", "Random"],
        tf("An unlocked lookup table stays fixed when copied down.", false),
        ["What does IFERROR let you do?", "Return a friendly value instead of an error", "Fix the source data", "Speed up the sheet", "Remove the lookup"],
        ["Which steps prevent lookup failures?", ["Trim the key", "Lock the range", "Use exact match"], "Use approximate match", "Leave the range unlocked", "Skip error handling"],
        ["Why require a unique key?", "Otherwise the first match wins silently", "It is a file requirement", "It reduces file size", "It removes the need for cleaning"],
        blank("Lock a lookup range using the ______ sign.", "$", "dollar"),
      ],
      takeaway: "Clean key, locked range, exact match, friendly error. Lookups fail for predictable reasons.",
      assignment: {
        title: "Build a lookup sheet",
        instructions: "Create a product table and an order table. Populate prices and categories with lookups, using locked ranges and exact match. Wrap errors with a clear message. Submit the sheet plus a note on one missing key and what your formula returned.",
        maxPoints: 130,
      },
    },
    {
      title: "Conditional Logic and Data Validation",
      concepts: [
        ["SUMIF / COUNTIF", "Conditional aggregation sums or counts rows meeting one criterion. Criteria ranges and sum ranges must align.", "SUMIF(regionRange,\"West\",amountRange)."],
        ["Data validation", "Restrict input to a list, number range or date range. Prevention beats cleaning later.", "A dropdown of allowed statuses avoids 'done', 'Done', 'DONE'."],
        ["Conditional formatting", "Highlight outliers and thresholds so exceptions are visible without reading every row.", "Red when days late exceeds 7."],
      ],
      workflow: ["Define allowed values first.", "Apply validation to the input cells.", "Add conditional aggregation for reporting.", "Format the exceptions, not everything."],
      pitfalls: ["Typing status freehand and then trying to count variants.", "Applying conditional formatting to an entire column unnecessarily."],
      questions: [
        ["What does COUNTIF do?", "Counts rows meeting a criterion", "Sums all rows", "Deletes duplicates", "Sorts the range"],
        tf("Data validation can limit a cell to a dropdown list.", true),
        ["Why must ranges align in SUMIF?", "Row i in criteria must match row i in the sum range", "It is faster", "Sheets require equal column widths", "It removes errors automatically"],
        ["Which are validation rules?", ["Dropdown list", "Number range", "Date range"], "Conditional formatting", "Pivot table", "Chart"],
        ["What should conditional formatting highlight?", "Exceptions past a threshold", "Every cell equally", "Only the header", "Nothing"],
        blank("A dropdown list is created with data ______.", "validation"),
      ],
      takeaway: "Constrain inputs at the boundary, aggregate by condition, and let formatting surface exceptions.",
      assignment: {
        title: "Validated tracker",
        instructions: "Build a task tracker with a validated status dropdown, a date range, COUNTIF counts per status, and conditional formatting for tasks more than seven days late. Submit the sheet and a short note on an invalid entry the validation rejected.",
        maxPoints: 130,
      },
    },
    {
      title: "Pivot Tables and Summaries",
      concepts: [
        ["Rows, columns, values", "A pivot answers 'totals by category'. Rows are the groups, columns the breakdown, values the aggregation.", "Rows: region. Columns: quarter. Values: sum of revenue."],
        ["Source range hygiene", "A pivot needs one header row and no merged cells. Convert the source to a table so new rows are included.", "Use a Table, not a fixed A1:D100 range."],
        ["Refresh discipline", "A pivot is a snapshot. Stale pivots are a common source of wrong numbers in meetings.", "Refresh before every review and note the timestamp."],
      ],
      workflow: ["Turn the source into a table.", "Choose rows, columns and one aggregation.", "Check grand totals against the raw sum.", "Refresh and record the date."],
      pitfalls: ["Building a pivot over a range that stops at last month's last row.", "Using COUNT instead of SUM for money and never noticing."],
      questions: [
        ["What does the Values area usually contain?", "An aggregation like SUM", "A chart title", "The header row", "Nothing"],
        tf("A pivot table updates automatically the instant source data changes.", false),
        ["Why convert a source range to a table?", "New rows are included automatically", "It looks better", "It disables errors", "It is required for charts"],
        ["Which checks catch a wrong pivot?", ["Grand total vs raw sum", "Correct aggregation chosen", "Refreshed date"], "Colour scheme", "Font size", "Row height"],
        ["Why avoid merged cells in source data?", "Pivot tools cannot interpret them reliably", "They use more memory", "They print badly", "They change types"],
        blank("A pivot is a ______; refresh it before reuse.", "snapshot"),
      ],
      takeaway: "Clean table in, explicit rows and values, refresh before every decision. Verify against the raw total.",
      assignment: {
        title: "Pivot summary with checks",
        instructions: "Using a clean dataset, build a pivot with rows and columns of your choice and one aggregation. Verify the grand total against a plain SUM of the source. Submit the pivot, the verification figure and a 150-word note on what the summary revealed.",
        maxPoints: 140,
      },
    },
    {
      title: "Dashboards and Charts People Read",
      concepts: [
        ["One question per chart", "A chart should answer a stated question. If you cannot write the question in one line, you do not need the chart yet.", "'Which region is behind target this quarter?'"],
        ["Honest axes", "Start bar charts at zero. Truncated axes exaggerate small differences and destroy trust.", "Compare the same chart with and without a zero baseline."],
        ["Layout and hierarchy", "Put the decision metric top-left, supporting detail below. Remove gridlines and legends that do not carry information.", "One headline number, two supporting charts."],
      ],
      workflow: ["Write the decision the dashboard supports.", "Pick one metric per chart.", "Set honest axes.", "Remove anything that does not inform the decision."],
      pitfalls: ["Five charts competing for attention with no headline.", "A pie chart with nine slices."],
      questions: [
        ["What should a chart start with?", "The question it answers", "A colour palette", "A legend", "A title of at least ten words"],
        tf("Starting a bar chart above zero makes differences easier to trust.", false),
        ["Where should the headline metric go?", "Top-left", "Bottom-right", "In a footnote", "Nowhere"],
        ["Which are honest chart habits?", ["Zero baseline for bars", "One question per chart", "Minimal gridlines"], "Nine-slice pies", "Truncated axes", "Decorative legends"],
        ["Why remove unused legend entries?", "They add noise without information", "They slow printing", "Sheets forbid them", "They change the data"],
        blank("A chart should answer one stated ______.", "question"),
      ],
      takeaway: "Design for the decision. One question per chart, honest axes, one clear headline.",
      assignment: {
        title: "One-page dashboard",
        instructions: "Build a one-screen dashboard with a headline metric and at most three charts. Open each chart with a one-line question. Include a short note explaining one chart you removed and why. Submit a screenshot and the sheet.",
        maxPoints: 140,
      },
    },
    {
      title: "Templates, Automation and Handover",
      concepts: [
        ["Template vs copy", "A template keeps inputs blank and formulas locked. Copying last month's file carries last month's numbers into new decisions.", "Save a blank master and create each period from it."],
        ["Named ranges", "Names like 'threshold' make formulas readable and updates local.", "SUMIF(region,\"West\",amount) beats SUMIF(B:B,\"West\",D:D)."],
        ["Handover notes", "A sheet someone else must run needs an input guide, a refresh checklist and an owner.", "List which cells are safe to edit and which are formula-only."],
      ],
      workflow: ["Build the blank master.", "Name key ranges.", "Protect formula cells.", "Write the handover note and test with a colleague."],
      pitfalls: ["Leaving last period's values in the template.", "No note on what to refresh before a meeting."],
      questions: [
        ["Why keep a blank master?", "New periods do not inherit old numbers", "It is faster to open", "It is a legal requirement", "It removes the need for formulas"],
        tf("Named ranges make formulas harder to read for the next person.", false),
        ["What belongs in a handover note?", "Editable cells, refresh steps and an owner", "Only the file name", "A list of colours", "Nothing; the sheet is self-evident"],
        ["Which are template hygiene steps?", ["Blank inputs", "Protected formula cells", "Named ranges"], "Carry over old values", "Unlock everything", "Skip documentation"],
        ["Why protect formula cells?", "So edits cannot silently break calculations", "It speeds up the sheet", "It is required for charts", "It removes errors"],
        blank("Create each new period from the blank ______.", "master", "template"),
      ],
      takeaway: "Ship a blank master, readable names, protected formulas and a handover note. Reuse safely.",
      assignment: {
        title: "Template with handover guide",
        instructions: "Build a reusable blank template for a recurring task. Use named ranges, protect formula cells and write a one-page handover guide. Ask one colleague to complete a period from the template and record where they hesitated. Submit the template, guide and their feedback.",
        maxPoints: 150,
      },
    },
  ],
  toolkit: {
    fileName: "spreadsheets-toolkit.md",
    body: `# Spreadsheets That Run Your Work — Toolkit

## Layout
- [ ] Outputs sketched first
- [ ] Raw import sheet, never edited
- [ ] Cleaning in a helper layer
- [ ] Inputs / calculations / outputs separated

## Formulas
- [ ] Reference cells, do not retype values
- [ ] Lock lookup ranges with $
- [ ] Exact match unless sorted deliberately
- [ ] Guard divisions and wrap lookups in IFERROR
- [ ] Test with blanks and zeros

## Data
- [ ] One header row, no merges in data
- [ ] Text numbers converted
- [ ] Keys trimmed and case-normalised
- [ ] Validation on input cells

## Reporting
- [ ] Source is a Table, not a fixed range
- [ ] Grand total checked against raw SUM
- [ ] Pivot refreshed and timestamped
- [ ] Charts start at zero, one question each

## Handover
- [ ] Blank master, no leftover values
- [ ] Named ranges for key cells
- [ ] Formula cells protected
- [ ] Guide names editable cells, refresh steps, owner
`,
  },
  capstone: {
    title: "An Operating Spreadsheet for a Recurring Process",
    description:
      "Build and hand over a spreadsheet that runs one recurring process end to end: clean raw imports, validated inputs, dependable formulas and lookups, a pivot summary with a verification check, and a one-screen dashboard. Include a blank master, a handover guide and a recorded test run by someone else.",
    techStack: ["Data cleaning", "Lookups", "Pivot tables", "Dashboards", "Documentation"],
    outcome: "A working system a colleague can run on Monday without calling you.",
  },
  showcase: {
    title: "Dashboard Before and After",
    description:
      "Show a cluttered spreadsheet and the redesigned one-page dashboard that replaced it. Annotate three decisions that changed because the numbers became readable.",
    techStack: ["Information hierarchy", "Chart honesty", "Visual cleanup"],
    outcome: "A case study that shows the business value of a well-built sheet.",
  },
};

export const paidCoursesD = [compileCourse(promptEngineering), compileCourse(spreadsheets)];
