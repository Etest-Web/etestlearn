/**
 * Blueprints: Data Literacy + SEO Fundamentals.
 * Consumed by seedSkills.ts through compileCourse() in seedSkillsKit.ts.
 */

import { compileCourse, type SkillCourseBlueprint } from "./seedSkillsKit";

const dataLiteracy: SkillCourseBlueprint = {
  title: "Data Literacy: Spreadsheets, Charts & Decisions",
  slug: "data-literacy",
  category: "Data",
  level: "Beginner to Intermediate",
  description:
    "Eight modules that make you dangerous with a spreadsheet in the good way. Ask a answerable question, clean messy inputs, write formulas you can audit, summarise with pivots, choose charts that tell the truth, use statistics without theatre, build a dashboard people actually read, and defend a decision with data. Every module has two articles, two knowledge checks and a real graded assignment.",
  modules: [
    {
      title: "Asking Answerable Questions",
      concepts: [
        ["Question before tool", "A spreadsheet cannot rescue a vague question. Write the decision you need to make and the number that would change your mind before you open a file.", "Instead of 'how are sales?', ask 'did weekday conversion fall after the checkout change?'."],
        ["Metric definition", "Every metric needs a numerator, a denominator, a window and an owner. Undefined metrics produce confident disagreement.", "Conversion rate = completed checkouts / sessions, last 30 days, counted by analytics owner."],
        ["Population and grain", "Say what one row represents. Mixed grain — one row per order in one tab and per customer in another — makes totals meaningless.", "One row per order, with customer id repeated."],
      ],
      workflow: [
        "Write the decision and the threshold that would flip it.",
        "Define each metric with numerator, denominator and time window.",
        "State the grain: what exactly is one row?",
        "List the fields you need and the ones you can safely ignore.",
      ],
      pitfalls: [
        "Starting with a chart and finding a story in it afterwards.",
        "Comparing two periods with different definitions of the same metric.",
      ],
      questions: [
        ["What should come before opening a spreadsheet?", "The decision and the number that changes it", "A chart template", "A pivot table", "A colour palette"],
        ["What does a complete metric definition include?", "Numerator, denominator, window and owner", "Only the name", "Only the target", "Only the tool"],
        ["What is the grain of a table?", "What one row represents", "How many columns exist", "The file format", "The sort order"],
        ["Why are mixed grains dangerous?", "Totals become meaningless", "Files get larger", "Charts look worse", "Formulas run slower"],
        ["Which question is answerable?", "Did conversion fall after the checkout change?", "Is the business doing well?", "Are people happy?", "What should we do?"],
        ["Why write a threshold in advance?", "It prevents moving the goalposts after seeing data", "It makes charts prettier", "It is a legal requirement", "It removes the need for data"],
      ],
      takeaway: "Write the decision, define the metric, state the grain. Analysis without those three is decoration.",
      assignment: {
        title: "Question brief with metric definitions",
        instructions: "Pick one real decision from work or a public dataset. Write the decision, the threshold that would change it, three metric definitions (numerator, denominator, window, owner) and the grain of the data you would need. Submit as a one-page brief with no charts.",
        maxPoints: 100,
      },
    },
    {
      title: "Cleaning & Structuring Data",
      concepts: [
        ["Tidy shape", "Columns are variables, rows are observations, and one table holds one kind of observation. Most painful analysis is untidy data in disguise.", "Split 'Jan sales; Feb sales' columns into a Month column and a Sales column."],
        ["Missing vs zero", "A blank means unknown; a zero means measured nothing. Converting blanks to zero changes averages and hides gaps.", "Record blanks as blanks and count them in a QA column."],
        ["Types and formats", "Dates stored as text sort lexically, so '10/1' can land before '2/1'. Normalise types at the boundary, not after the pivot.", "Store ISO dates: 2026-01-10."],
        ["Provenance", "Keep a raw tab untouched and do cleaning in a copy or a documented step list. Otherwise you cannot reconstruct a number.", "Raw, Clean and Notes tabs with a dated change log."],
      ],
      workflow: [
        "Keep an untouched copy of the source file or tab.",
        "Profile columns: type, blanks, duplicates, outliers.",
        "Apply rules consistently and log each one.",
        "Validate with row counts and spot checks before analysis.",
      ],
      pitfalls: [
        "Overwriting the source while cleaning.",
        "Hand-fixing three rows and forgetting the other ninety.",
      ],
      questions: [
        ["What does tidy data mean?", "Columns are variables, rows are observations", "Data is sorted by date", "No numbers are missing", "The file is small"],
        ["How should a blank differ from a zero?", "Blank is unknown, zero is measured", "They are interchangeable", "Blank is always zero", "Zero is always unknown"],
        ["Why store dates as ISO text or a date type?", "So sorting is chronological", "It uses fewer characters", "It looks neater", "Spreadsheets require it"],
        ["Why keep a raw tab?", "You can reconstruct any number", "It is required by Excel", "It makes files bigger", "It avoids formulas"],
        ["What belongs in a cleaning log?", "Rules applied and when", "Only the final total", "Your password", "The chart colours"],
        ["What validates a cleanup?", "Row counts and spot checks", "A green cell", "The file opens", "Someone liked it"],
      ],
      takeaway: "Never clean in place. Keep raw, log every rule, and treat blanks as unknown.",
      assignment: {
        title: "Cleaning log on a messy table",
        instructions: "Create or find a table with at least 20 rows containing blanks, inconsistent dates and one duplicate. Produce a clean version and a log listing each rule you applied, how many rows it touched, and a before/after row count. Submit both tables and the log.",
        maxPoints: 130,
      },
    },
    {
      title: "Spreadsheet Formulas You Can Audit",
      concepts: [
        ["Absolute and relative references", "A relative reference moves when copied; an absolute one stays. Confusing them is the classic source of a formula that works in row 2 and breaks in row 9.", "$B$1 stays put; B1 follows the copy."],
        ["Named ranges", "Naming a range gives a formula a readable noun. A reader sees TaxRate instead of Sheet2!$D$4.", "Name the input cell once, reference it everywhere."],
        ["IF, SUMIFS, COUNTIFS", "Conditional aggregation answers most 'how many / how much under these conditions' questions without helper columns.", "SUMIFS(sales, region, 'West', month, 'Jan')."],
        ["Error values", "#N/A means a lookup failed, #DIV/0! means an empty denominator, #VALUE! means a type mismatch. Read the error before wrapping it in IFERROR.", "Fix the lookup key, then decide whether to hide remaining errors."],
      ],
      workflow: [
        "Write the output you want in plain English first.",
        "Build the formula in one cell and test it on edge rows.",
        "Name constants instead of hardcoding them in every formula.",
        "Format inputs and outputs differently so mistakes are visible.",
      ],
      pitfalls: [
        "Wrapping everything in IFERROR and hiding broken data.",
        "Copying a formula down without checking the first and last row.",
      ],
      questions: [
        ["What does an absolute reference do?", "Stays fixed when copied", "Moves with the copy", "Deletes the cell", "Converts text to number"],
        ["What does SUMIFS answer?", "A sum filtered by conditions", "A count of blanks", "The average of a column", "The maximum row"],
        ["What usually causes #DIV/0!?", "An empty or zero denominator", "A missing lookup key", "A text cell in a sum", "A locked sheet"],
        ["Why name a constant cell?", "Formulas become readable and single-sourced", "It is faster to type", "It prevents all errors", "It is required by functions"],
        ["When should IFERROR be used?", "After the underlying error is understood", "Immediately, always", "Only on Mondays", "Never"],
        ["What is the cheapest formula test?", "Check the first and last row by hand", "Rebuild the workbook", "Ask a colleague", "Sort the data"],
      ],
      takeaway: "Build one formula, test the edges, name constants, and read errors before hiding them.",
      assignment: {
        title: "Auditable formula sheet",
        instructions: "Build a 15-row sample dataset with region, month, sales and cost. Use named ranges for a tax rate and a target, then write one SUMIFS, one COUNTIFS and one nested IF that all survive copying. Add a short legend explaining each formula in plain English. Submit the sheet and legend.",
        maxPoints: 120,
      },
    },
    {
      title: "Pivots & Lookups",
      concepts: [
        ["Pivot as grouped aggregation", "A pivot table answers 'group by X and Y, then aggregate Z'. It is a query interface, not a chart tool.", "Rows: month. Columns: region. Values: sum of sales."],
        ["Lookups need unique keys", "A lookup returns the first match. Duplicate keys silently pick a row, so check uniqueness before trusting the result.", "Count of customer id per row should be one."],
        ["Exact vs approximate match", "Set exact match for identifiers. Approximate match on unsorted data returns confident nonsense.", "Use the exact-match flag unless sorting a numeric band deliberately."],
        ["Refresh discipline", "A pivot is a snapshot of its source range. Extended source data needs the range updated and the pivot refreshed.", "Convert the source to a table so it grows automatically."],
      ],
      workflow: [
        "Confirm the grain and key uniqueness.",
        "Build the pivot with rows, columns and one aggregate each.",
        "Add a second measure only after the first is verified.",
        "Refresh and re-check totals against the source.",
      ],
      pitfalls: [
        "Using a pivot whose source range stopped at row 100.",
        "Looking up a name instead of a stable id.",
      ],
      questions: [
        ["What is a pivot table at heart?", "A grouped aggregation with a drag-and-drop query", "A chart", "A formula wizard", "A filter only"],
        ["Why must lookup keys be unique?", "Otherwise the first match is arbitrary", "Because lookups are slow", "Because sheets are locked", "Because pivots need it"],
        ["Which match mode suits an id?", "Exact", "Approximate", "Wildcard only", "None"],
        ["Why convert a source range to a table?", "The pivot source grows with new rows", "It colours cells", "It removes duplicates", "It saves the file"],
        ["What verifies a pivot?", "Totals match the source", "It has many colours", "It opens quickly", "It has a title"],
        ["What does adding a second measure risk?", "Confusing two different grains", "Making the file smaller", "Removing the first measure", "Nothing"],
      ],
      takeaway: "Pivots are queries; lookups need unique keys. Verify totals against the source every time.",
      assignment: {
        title: "Pivot and lookup reconciliation",
        instructions: "Using a 50-row sales dataset with duplicate-looking customer names, build a pivot of sales by month and region and a lookup that fetches the region from a customer id table. Add a reconciliation section: does the pivot total equal the raw sum, and how did you check key uniqueness? Submit sheet and a 150-word note.",
        maxPoints: 140,
      },
    },
    {
      title: "Charts That Tell The Truth",
      concepts: [
        ["Chart by question", "Comparison uses bars, change over time uses lines, distribution uses histograms, relationship uses scatter. Pick after writing the question, not from a gallery.", "Share by region is a bar chart; conversion over eight weeks is a line."],
        ["Honest axes", "A truncated y-axis on a bar chart exaggerates small differences. Start bars at zero; use a labelled break only where the audience expects it.", "Line charts may zoom if the axis is labelled clearly."],
        ["Annotation over decoration", "A chart should carry the takeaway in a title: 'Conversion fell 12% after checkout change'. Legends and gridlines are secondary.", "Put the number in the title, not in the reader's head."],
        ["Colour with purpose", "Use one accent for the series that matters and grey for context. Redundant colour coding forces the reader to decode a legend.", "Highlight the one bar that changed."],
      ],
      workflow: [
        "Write the question and the single takeaway.",
        "Choose the chart type that answers it.",
        "Set an honest axis and label the units.",
        "Annotate the point that matters and remove chart junk.",
      ],
      pitfalls: [
        "Pie charts with nine slices.",
        "Dual axes used to imply a correlation that is not there.",
      ],
      questions: [
        ["Which chart suits change over time?", "Line chart", "Pie chart", "Scatter with no axis", "Stacked bars of totals"],
        ["Why start bar charts at zero?", "Bar length encodes magnitude", "It is a browser default", "It saves ink", "It allows more categories"],
        ["What should a chart title do?", "State the takeaway", "Name the file", "List every column", "Repeat the legend"],
        ["How many accent colours is usually best?", "One for the series that matters", "One per row", "As many as possible", "None"],
        ["What is chart junk?", "Decoration that carries no information", "The data labels", "The axis", "The title"],
        ["When is a dual axis risky?", "It can imply a relationship that is not there", "When both series are lines", "When labels are short", "Never"],
      ],
      takeaway: "Question first, chart type second. Honest axis, annotated takeaway, one accent colour.",
      assignment: {
        title: "Three charts, one honest story",
        instructions: "Take one dataset and produce three charts: a comparison, a time series and a distribution. Write a one-sentence takeaway title for each. Then state one misleading choice you rejected and why. Submit the charts and the notes.",
        maxPoints: 130,
      },
    },
    {
      title: "Statistics Without Panic",
      concepts: [
        ["Mean vs median", "The mean is pulled by outliers; the median is not. For incomes or session lengths, report both and say which one you are using.", "Five long sessions can double a mean while the median stays flat."],
        ["Spread matters", "Two groups can share an average and differ completely in consistency. Report a range or standard deviation beside the centre.", "Average delivery time hides a long tail."],
        ["Correlation is not cause", "A relationship does not tell you direction. Randomised comparison or a plausible mechanism is needed for a causal claim.", "Ice cream and drowning both rise in summer."],
        ["Sample size and confidence", "Small samples wobble. State the denominator and avoid precision beyond what the sample supports.", "'53%' of 40 people is 21 people."],
      ],
      workflow: [
        "Report centre and spread together.",
        "State the denominator and time window beside every percentage.",
        "Ask what else could explain the relationship before claiming cause.",
        "Round to the precision the sample deserves.",
      ],
      pitfalls: [
        "Averaging percentages of different-sized groups.",
        "Claiming causation from a single before/after chart.",
      ],
      questions: [
        ["Which measure resists outliers?", "Median", "Mean", "Sum", "Maximum"],
        ["Why report spread beside centre?", "Two groups can share a mean but differ in consistency", "It is required by Excel", "It makes tables wider", "It replaces the denominator"],
        ["What does correlation establish?", "A relationship, not direction or cause", "Cause", "Time order", "Nothing"],
        ["What should accompany a percentage?", "Its denominator and window", "A pie chart", "A colour", "A logo"],
        ["Why round small samples?", "Precision exceeds what the sample supports", "It is faster", "It is required by law", "It changes the mean"],
        ["What is a confounder?", "Another variable that could explain the relationship", "A missing formula", "An outlier", "A chart title"],
      ],
      takeaway: "Centre plus spread, denominator plus window, relationship plus alternative explanation.",
      assignment: {
        title: "Statistics critique",
        instructions: "Find a public claim using a percentage or average. Identify the centre measure, the missing spread, the denominator and one plausible confounder. Rewrite the claim honestly in 100 words. Submit original, critique and rewrite.",
        maxPoints: 120,
      },
    },
    {
      title: "Dashboards People Actually Read",
      concepts: [
        ["One screen, one question", "A dashboard is a decision instrument. If a viewer cannot name the question in five seconds, it is a data wall.", "A weekly ops dashboard answers 'what needs attention today?'."],
        ["Hierarchy and order", "Put the headline number top-left, the trend next, the breakdown below. Reading order follows importance.", "KPI, then trend, then table."],
        ["Exceptions over completeness", "Surface rows that breach a threshold. A full table of 400 rows sends the reader hunting.", "Show only orders past due, with a count of the rest."],
        ["Refresh and freshness", "Label 'as of' time. Stale data presented as live is worse than no dashboard.", "Updated 08:00 daily, source: finance export."],
      ],
      workflow: [
        "Name the decision and the one viewer who makes it.",
        "Pick three metrics max for the top row.",
        "Add one exception list with a threshold.",
        "Label freshness and source, then test with that viewer.",
      ],
      pitfalls: [
        "Adding every available metric because stakeholders asked.",
        "No 'as of' label, so nobody trusts the numbers.",
      ],
      questions: [
        ["What should a dashboard answer?", "One decision question", "Every possible question", "Nothing in particular", "Only a date"],
        ["Where does the headline number go?", "Top-left", "Bottom row", "In a tooltip", "In the footer"],
        ["Why show exceptions?", "Distraction drops and action becomes obvious", "It uses fewer colours", "It is required by pivots", "It removes averages"],
        ["What does an 'as of' label provide?", "Freshness and trust", "A title", "A filter", "A legend"],
        ["How many top-row metrics is sensible?", "About three", "About thirty", "Exactly one hundred", "None"],
        ["How do you test a dashboard?", "Ask the real viewer to name the action", "Count the colours", "Check the file size", "Read the source code"],
      ],
      takeaway: "One decision, three metrics, one exception list, a visible freshness stamp.",
      assignment: {
        title: "Dashboard one-page specification",
        instructions: "Specify a dashboard for one real role. Write the decision question, three top metrics with definitions, one exception rule, the 'as of' line and a sketch in text or image. Include one metric you deliberately left out and why. Submit the specification.",
        maxPoints: 140,
      },
    },
    {
      title: "Ethics, Verification & Decisions",
      concepts: [
        ["Privacy by default", "Aggregate before sharing. A dataset that identifies one customer is personal data even if the file is called 'summary'.", "Report counts by region, not names and account numbers."],
        ["Reproducibility", "A number you cannot rebuild is an opinion. Keep source, rules and a dated snapshot together.", "Source file, cleaning log and formula sheet in one folder."],
        ["Adversarial check", "Ask what would have to be true for your conclusion to be wrong, then look for that evidence.", "If the trend is real, should the control group also have moved?"],
        ["Decision memo", "End with what you recommend, what evidence supports it and what would change your mind. Data without a decision is unfinished work.", "Recommendation, evidence, uncertainty, next check."],
      ],
      workflow: [
        "Redact identifiers before sharing any extract.",
        "Rebuild the headline number from raw data once.",
        "Run one adversarial check against your conclusion.",
        "Write a decision memo with a stated reversal condition.",
      ],
      pitfalls: [
        "Sharing a 'small' extract that still contains names.",
        "Presenting a finding with no statement of uncertainty.",
      ],
      questions: [
        ["When is data personal?", "When an individual can be identified", "Only when it has a name column", "Only in a database", "Never in a spreadsheet"],
        ["What makes a number reproducible?", "Source, rules and a dated snapshot", "A screenshot", "A verbal explanation", "A coloured cell"],
        ["What is an adversarial check?", "Looking for evidence your conclusion is wrong", "Adding more charts", "Changing the colours", "Deleting outliers"],
        ["What belongs in a decision memo?", "Recommendation, evidence, uncertainty, reversal condition", "Only the chart", "Only the total", "Only the source"],
        ["Why state a reversal condition?", "It says what new evidence would change the decision", "It is decorative", "It is legally required everywhere", "It removes uncertainty"],
        ["What should you do before sharing an extract?", "Aggregate and redact identifiers", "Rename the file", "Add a cover sheet", "Compress it"],
      ],
      takeaway: "Redact, rebuild, challenge, decide. A finding is not done until it is attached to a decision.",
      assignment: {
        title: "Decision memo from a dataset",
        instructions: "Using a dataset from earlier assignments, write a one-page decision memo: recommendation, three pieces of evidence, one uncertainty, one adversarial check and a reversal condition. Add a short note on what you redacted before sharing. Submit as a single document.",
        maxPoints: 150,
      },
    },
  ],
  toolkit: {
    fileName: "Data-Literacy-Checklist.md",
    body: `# Data Literacy Checklist\n\n## Before analysis\n- [ ] Decision written, with a threshold that flips it\n- [ ] Metric: numerator, denominator, window, owner\n- [ ] Grain: one row = ______\n\n## Cleaning\n- [ ] Raw copy untouched\n- [ ] Blanks kept as unknown, never silently zeroed\n- [ ] Types normalised (ISO dates)\n- [ ] Every rule logged with rows touched\n\n## Analysis\n- [ ] Pivot totals equal source totals\n- [ ] Lookup keys verified unique\n- [ ] Centre reported with spread\n- [ ] Denominator beside every percentage\n\n## Communication\n- [ ] Chart type matches the question\n- [ ] Bars start at zero; axes labelled\n- [ ] Title states the takeaway\n- [ ] Dashboard has an 'as of' stamp\n\n## Decision\n- [ ] Recommendation, evidence, uncertainty, reversal condition\n- [ ] Identifiers redacted before sharing\n`,
  },
  capstone: {
    title: "A Decision-Ready Data Pack",
    description:
      "Choose one real decision, define its metrics, clean a messy source with a logged rule set, build an auditable formula sheet, a reconciled pivot, three honest charts and a one-page decision memo. The pack shows the whole path from raw rows to a recommendation you can defend.",
    techStack: ["Metric definitions", "Cleaning log", "SUMIFS/COUNTIFS", "Pivot reconciliation", "Chart selection", "Decision memo"],
    outcome: "A folder a colleague can open and rebuild, plus a one-page memo that ends with a decision.",
  },
  showcase: {
    title: "Dashboard One-Pager",
    description:
      "A single-screen dashboard specification for one role: three defined metrics, one exception rule, a freshness stamp and a note on the metric you left out.",
    techStack: ["Information hierarchy", "Exception design", "Metric definition"],
    outcome: "A page you can hand to a designer or build directly in a spreadsheet.",
  },
};

const seoFundamentals: SkillCourseBlueprint = {
  title: "SEO Fundamentals: From Search Intent to Rankings",
  slug: "seo-fundamentals",
  category: "Marketing",
  level: "Beginner to Intermediate",
  description:
    "Eight modules that build a working SEO practice: how search engines crawl, index and rank; keyword research and intent; SERP features; on-page structure; technical foundations; internal links and architecture; trust and local signals; measurement and AI-search readiness. Two articles, two knowledge checks and a graded assignment in every module.",
  modules: [
    {
      title: "How Search Actually Works",
      concepts: [
        ["Crawl, index, rank", "Crawlers discover URLs, indexers store and understand content, and ranking systems match queries to the best stored result. A problem at any stage blocks traffic for a different reason.", "A noindexed page is in the crawl but not the index; a crawl-blocked page is invisible entirely."],
        ["Relevance and usefulness", "Systems estimate whether a result matches the query and whether people find it useful. Content that matches words but fails the intent gets skipped.", "A page titled 'best running shoes' that only lists shoe history fails the intent."],
        ["Signals are comparative", "Ranking is relative to other results, not an absolute score. Improving a page helps only if it becomes better than the current top results.", "A thin page can rank for a low-competition query and fail on a crowded one."],
        ["Time lag", "Crawl, indexing and ranking changes are not instant. Judge an SEO change over weeks, not hours.", "Recrawl and re-evaluation take days to weeks."],
      ],
      workflow: [
        "Check whether the page is crawled and indexed before arguing about content.",
        "Compare the current top results and name what they satisfy.",
        "Identify which stage — crawl, index or rank — is actually failing.",
        "Set a realistic review window of weeks.",
      ],
      pitfalls: [
        "Assuming 'not ranking' always means 'bad content'.",
        "Checking rankings the day after publishing and declaring failure.",
      ],
      questions: [
        ["What are the three broad stages of search?", "Crawl, index, rank", "Write, edit, publish", "Buy, sell, ship", "Click, scroll, exit"],
        ["What does a noindex tag do?", "Keeps a crawled page out of the index", "Blocks crawling", "Deletes the page", "Improves ranking"],
        ["Why can word matching fail?", "Intent may still be unmet", "Keywords are ignored entirely", "Search is random", "Titles do not matter"],
        ["Ranking is determined relative to what?", "Other results for that query", "A fixed global score", "The site's age only", "The number of pages"],
        ["Why wait weeks to judge a change?", "Recrawl and re-evaluation take time", "Search engines are slow by law", "Content needs aging", "Rankings are random daily"],
        ["What is the first check when a page gets no traffic?", "Whether it is crawled and indexed", "Whether the font is large", "Whether the logo is new", "Whether the site is popular"],
      ],
      takeaway: "Diagnose by stage: crawl, index, rank. Ranking is comparative, and results take weeks.",
      assignment: {
        title: "Search failure diagnosis",
        instructions: "Pick a page that gets little search traffic. State whether the likely failure is crawl, index, rank or intent, and give two pieces of evidence for your diagnosis. Write the checks you would run in order. Submit as a one-page diagnosis with no keyword tools required.",
        maxPoints: 100,
      },
    },
    {
      title: "Keyword Research & Search Intent",
      concepts: [
        ["Intent over volume", "A keyword is a clue to a task. Classify the intent — informational, navigational, commercial, transactional — before chasing the number.", "'best project management tool' is commercial; 'how to create a task' is informational."],
        ["Long tail and specificity", "Phrases with lower volume often convert better because the searcher has a concrete problem. A portfolio of specific pages beats one broad page.", "'how to chunk a 30-minute meeting' beats 'meeting tips'."],
        ["SERP as teacher", "The results page tells you what Google thinks the intent is: product pages, listicles, forums, videos. Match the dominant format or offer a genuinely better angle.", "If six of ten results are forums, a product page will struggle."],
        ["Topic clusters", "One hub page plus specific child pages, linked together, builds topical coverage and gives each page a clear job.", "A guide to email marketing with children on subject lines, deliverability and flows."],
      ],
      workflow: [
        "Start with five seed phrases from how customers actually talk.",
        "Group them by intent, not by string similarity.",
        "Inspect the SERP for each group and note the dominant format.",
        "Map each group to one page with one job; merge overlapping pages.",
      ],
      pitfalls: [
        "Building ten pages that answer the same question.",
        "Choosing a high-volume keyword whose intent you cannot serve.",
      ],
      questions: [
        ["What should come before search volume?", "Intent classification", "Meta description", "A sitemap", "A backlink"],
        ["Which phrase is transactional?", "Buy running shoes online", "What are running shoes", "Running shoe history", "How to tie laces"],
        ["What does the SERP reveal?", "What format Google associates with the query", "Only the price", "Only the date", "Nothing useful"],
        ["Why are long-tail phrases valuable?", "They reflect a concrete problem and often convert better", "They have the highest volume", "They are easier to spell", "They need no content"],
        ["What is a topic cluster?", "A hub page plus specific linked children", "A list of unrelated posts", "A single very long page", "A directory of links"],
        ["When should two keyword ideas be merged?", "When one page would serve both intents equally", "Never", "When they share a letter", "When volume is low"],
      ],
      takeaway: "Intent first, volume second. Let the SERP choose the format; give every page one job.",
      assignment: {
        title: "Keyword map for one topic",
        instructions: "Choose a topic in your niche. List ten seed phrases, group them by intent, inspect the SERP for each group and note the dominant result type. Produce a table mapping each group to one planned page, with two groups you merged and why. Submit the table and notes.",
        maxPoints: 120,
      },
    },
    {
      title: "Search Experience & SERP Features",
      concepts: [
        ["Featured snippets", "A concise answer extracted from a page, often a definition, list or table. Structure the answer directly under a question-style heading to be eligible.", "An H2 'How to X' followed by a 40-word answer and a numbered list."],
        ["People also ask", "Related questions surfaced in the results. They are a free source of follow-up headings and reveal what searchers ask next.", "Turn three PAA questions into H2s with direct answers."],
        ["Knowledge panels and entities", "Search engines build confidence in who or what a thing is. Consistent names, descriptions and structured data help that entity understanding.", "Same organisation name and logo across site and profiles."],
        ["Zero-click reality", "Some queries are answered on the results page. Winning the snippet may earn brand visibility, not a click, so measure both.", "A definition query may never send traffic."],
      ],
      workflow: [
        "Search your target query and record every SERP feature present.",
        "Answer the top question in the first 50 words under its heading.",
        "Add a short list or table where the SERP shows one.",
        "Write the answer for the searcher, not for the feature.",
      ],
      pitfalls: [
        "Stuffing a question heading with no real answer beneath it.",
        "Treating a zero-click query as a traffic win.",
      ],
      questions: [
        ["What is a featured snippet?", "A concise answer extracted into the results page", "A paid ad", "A social post", "A browser extension"],
        ["How do you make content snippet-eligible?", "Question heading then a short direct answer", "Write a very long intro", "Hide the answer", "Use only images"],
        ["What are PAA questions useful for?", "Finding follow-up questions to answer", "Counting backlinks", "Choosing a domain", "Setting prices"],
        ["What is an entity in search?", "A thing search engines can identify consistently", "A type of ad", "A file format", "A ranking factor guess"],
        ["What is a zero-click query?", "The answer appears without a visit", "A query with no results", "A query that costs money", "A query only on mobile"],
        ["What should you measure for a snippet win?", "Visibility as well as clicks", "Only clicks", "Only impressions", "Nothing"],
      ],
      takeaway: "Answer the question early, structure for extraction, and measure visibility as well as clicks.",
      assignment: {
        title: "SERP feature audit",
        instructions: "Pick one query you care about. Record the SERP features present, the top three result formats, and the exact question the snippet answers. Rewrite one section of your page to answer that question in under 50 words with a list or table. Submit before/after text and the feature notes.",
        maxPoints: 110,
      },
    },
    {
      title: "On-Page & Content Structure",
      concepts: [
        ["Title and description", "The title is a ranking signal and an ad in the results. Include the main phrase naturally and a reason to click. The description is copy, not a ranking lever.", "Title: 'How to X: 7 Steps (2026 Guide)'."],
        ["Heading hierarchy", "One H1, then H2s that answer distinct questions, then H3s for steps. Skipping levels for visual size breaks the outline.", "Choose level by structure, style it with CSS."],
        ["Answer-first writing", "Put the conclusion at the top, then the evidence and detail. It serves readers and gives extraction systems a clean passage.", "Start with the answer, then 'why' and 'how'."],
        ["Internal anchors and media", "Descriptive anchor text tells both readers and crawlers what the target is about. Add alt text that describes informative images.", "'See the subject-line checklist', not 'click here'."],
      ],
      workflow: [
        "Write one H1 and an answer-first opening paragraph.",
        "Turn the top questions into H2s with direct answers.",
        "Add a list or table where the answer is naturally structured.",
        "Check title, description, anchors and alt text before publishing.",
      ],
      pitfalls: [
        "Repeating the keyword in every heading.",
        "Burying the answer under three paragraphs of context.",
      ],
      questions: [
        ["What is the meta description mainly for?", "Click-through copy, not direct ranking", "Ranking only", "Indexing only", "Page speed"],
        ["How should heading levels be chosen?", "By document structure", "By desired font size", "By keyword count", "Randomly"],
        ["What does answer-first writing do?", "Puts the conclusion before the evidence", "Removes all headings", "Hides the answer", "Adds more keywords"],
        ["What makes good anchor text?", "It describes the target", "It says 'click here'", "It is always the full URL", "It is invisible"],
        ["What alt text fits an informative chart?", "A description of what the chart shows", "The file name", "An empty string", "A keyword stuffing sentence"],
        ["Why avoid keyword repetition in headings?", "It reads badly and adds nothing", "It is illegal", "It breaks HTML", "It slows the page"],
      ],
      takeaway: "One clear H1, question-shaped H2s, answer first, descriptive anchors.",
      assignment: {
        title: "On-page rewrite",
        instructions: "Take one of your existing pages. Rewrite the title, description, H1 and first 100 words using answer-first structure, and add two H2s from real questions. Submit before/after and a 100-word note on which change helps a reader most.",
        maxPoints: 110,
      },
    },
    {
      title: "Technical SEO Foundations",
      concepts: [
        ["Robots and directives", "robots.txt controls crawling; noindex controls indexing; canonical chooses the preferred URL when duplicates exist. They are different tools and often confused.", "A noindex page must be crawlable, or Google cannot see the directive."],
        ["Canonical discipline", "Duplicate URLs split signals. Point them to one preferred version and keep internal links consistent with it.", "Trailing slash, www and http variants should all resolve to one canonical."],
        ["Rendering and speed", "Content that needs heavy JavaScript may be seen late or incompletely. Server-rendered HTML plus reasonable Core Web Vitals removes a whole class of problems.", "A page where the main text appears only after hydration is a risk."],
        ["Sitemaps and status codes", "An XML sitemap is a discovery hint, not a ranking boost. Return 200 for real pages, 404 for missing ones, and avoid soft-200 error pages.", "A 404 page that returns 200 wastes crawl budget."],
      ],
      workflow: [
        "Check indexability: status code, robots, noindex, canonical.",
        "Confirm important content is in the initial HTML.",
        "Validate the sitemap against the live URLs.",
        "Measure Core Web Vitals with field data where available.",
      ],
      pitfalls: [
        "Blocking a page in robots.txt and expecting a noindex to be read.",
        "Canonicalising every page to the homepage.",
      ],
      questions: [
        ["What does robots.txt control?", "Crawling", "Indexing directly", "Ranking", "Conversions"],
        ["Why must a noindexed page be crawlable?", "The directive must be discovered", "It ranks better", "It loads faster", "It is a legal rule"],
        ["What does a canonical tag do?", "Chooses the preferred URL among duplicates", "Blocks crawling", "Deletes duplicates", "Adds keywords"],
        ["What is a soft 404?", "An error page returning 200", "A page that loads slowly", "A blocked page", "A redirect loop"],
        ["What is an XML sitemap?", "A discovery hint of important URLs", "A ranking boost", "A backup file", "A style sheet"],
        ["Why does server-rendered HTML help?", "Content is available without heavy JavaScript", "It removes the need for titles", "It guarantees rank one", "It reduces hosting cost"],
      ],
      takeaway: "Crawlability, indexability, canonical, rendering, status. Check them in that order.",
      assignment: {
        title: "Technical indexability audit",
        instructions: "Pick five URLs on a site you can access. For each, record status code, robots rule, noindex presence, canonical target and whether the main content is in the initial HTML. Flag the two highest-risk findings and the fix for each. Submit the table.",
        maxPoints: 130,
      },
    },
    {
      title: "Internal Links & Site Architecture",
      concepts: [
        ["Link equity and discovery", "Internal links help crawlers find pages and signal which pages matter. A page with no inbound internal links is close to invisible.", "Add a link to the new guide from the relevant hub page."],
        ["Anchor diversity with meaning", "Vary anchors, but keep each one descriptive. Exact-match anchors everywhere look automated; 'click here' tells nothing.", "Use 'email subject line checklist' and 'see the deliverability guide'."],
        ["Flat enough, not flat", "Important pages should be a few clicks from the homepage. Deep pages in a click-through pyramid get less attention.", "Three clicks or fewer for priority pages."],
        ["Orphans and pagination", "Orphan pages have no internal links. Paginated archives need crawlable links and unique, self-referencing canonicals.", "A tag page linked from nothing will not be discovered."],
      ],
      workflow: [
        "List your priority pages and count clicks from the homepage.",
        "Find pages with zero internal inbound links.",
        "Add contextual links from relevant, already-indexed pages.",
        "Re-crawl and confirm discovery.",
      ],
      pitfalls: [
        "Adding a footer block of identical links to every page.",
        "Canonicalising page two of an archive to page one.",
      ],
      questions: [
        ["What is an orphan page?", "A page with no internal inbound links", "A deleted page", "A page with no title", "A page with no image"],
        ["What does descriptive anchor text do?", "Tells readers and crawlers the target", "Increases file size", "Hides the link", "Replaces the title"],
        ["How many clicks from home should priority pages be?", "Ideally three or fewer", "Exactly ten", "As many as possible", "None"],
        ["What is wrong with identical footer links everywhere?", "Low signal and possible manipulation", "It is too slow", "It breaks HTML", "It is required"],
        ["How should paginated archives canonicalise?", "Each page to itself", "All to page one", "To the homepage", "No canonical at all"],
        ["Where should a new page be linked from first?", "A relevant, indexed hub page", "A random footer", "A noindexed page", "Nowhere"],
      ],
      takeaway: "Priority pages close to home, descriptive anchors, no orphans, sane pagination.",
      assignment: {
        title: "Internal link plan",
        instructions: "List six pages on a site you know. Mark clicks-from-home, inbound internal link count and orphan status. Write five specific new links with anchor text and source page, and explain why each helps discovery or context. Submit the plan.",
        maxPoints: 120,
      },
    },
    {
      title: "Trust, E-E-A-T & Local Signals",
      concepts: [
        ["Experience and expertise", "First-hand experience and subject knowledge are demonstrated, not claimed. Author bios, methods and specific detail are signals a reader can check.", "'We tested 12 tools for 30 days' beats 'we know tools'."],
        ["Authoritativeness and trust", "Consistent authorship, citations, clear ownership and honest correction policies build confidence in both people and machines.", "A named author with a bio and source links."],
        ["Structured data", "Schema markup gives machines an explicit description of an organisation, article, FAQ or product. It supports understanding but does not guarantee a rich result.", "Organization and Article JSON-LD on the relevant pages."],
        ["Local basics", "For a local business, the name-address-phone trio must match everywhere, and the business profile must be complete and active.", "Same phone format on site, directory and profile."],
      ],
      workflow: [
        "Add a real author with a bio and relevant credentials.",
        "Cite primary sources and show your method.",
        "Add valid structured data for the page type.",
        "For local, align NAP across the site and profiles.",
      ],
      pitfalls: [
        "Fake author bios and invented credentials.",
        "Schema markup that contradicts visible page content.",
      ],
      questions: [
        ["What is E-E-A-T?", "Experience, expertise, authoritativeness, trust", "A ranking score you can buy", "A type of schema", "A hosting setting"],
        ["How do you demonstrate experience?", "Show first-hand method and specific detail", "Claim to be an expert", "Add more keywords", "Hide the author"],
        ["What does structured data do?", "Describes page meaning explicitly to machines", "Guarantees a rich result", "Replaces content", "Blocks crawlers"],
        ["What should schema agree with?", "The visible page content", "The competitor's page", "Nothing in particular", "The sitemap only"],
        ["What is NAP consistency?", "Same name, address and phone across sources", "Same navigation everywhere", "Same page count", "Same colour scheme"],
        ["Why avoid fake author bios?", "They are deceptive and undermine trust", "They load slowly", "They are illegal everywhere", "They use more storage"],
      ],
      takeaway: "Show real experience, cite sources, keep schema honest, align local details.",
      assignment: {
        title: "Trust signals upgrade",
        instructions: "Take one page you own or admire. List the trust signals present, then write three concrete upgrades: an author bio, a method or citation block, and one schema type with the fields you would fill. Explain what each proves to a reader. Submit the list and upgrades.",
        maxPoints: 120,
      },
    },
    {
      title: "Measurement, Iteration & AI Search",
      concepts: [
        ["Measure by intent", "Group queries by the intent you mapped earlier. A drop in informational queries with stable transactional ones is a different story from an across-the-board fall.", "Track branded and non-branded separately."],
        ["Leading indicators", "Impressions and average position move before clicks. Watch the whole path instead of waiting for revenue to react.", "Rising impressions with flat clicks may mean a snippet win."],
        ["Answer-engine readiness", "AI systems favour clear, self-contained passages with sources and consistent entity information. The basics — structure, citations, crawlability — overlap with good SEO.", "A definition plus a sourced table is reusable by both search and assistants."],
        ["Change one thing", "Ship one measurable change per cycle. Log the date and the metric so you can attribute movement instead of guessing.", "Update one title, wait two weeks, compare CTR."],
      ],
      workflow: [
        "Build a query set grouped by intent and page.",
        "Track impressions, position, clicks and CTR weekly.",
        "Ship one change per cycle with a dated log entry.",
        "Review AI visibility in addition to classic rankings.",
      ],
      pitfalls: [
        "Changing five things at once and crediting the wrong one.",
        "Reporting traffic without segmenting branded queries.",
      ],
      questions: [
        ["Why group queries by intent?", "Different intents move for different reasons", "It is a browser setting", "It makes tables prettier", "It is required by schema"],
        ["Which is a leading indicator?", "Impressions", "Revenue six months later", "Profit", "Refund rate"],
        ["What helps answer-engine visibility?", "Clear sourced passages and consistent entity data", "Hidden text", "Keyword stuffing", "No headings"],
        ["Why change one thing per cycle?", "You can attribute the metric movement", "It is faster", "It is required by Google", "It avoids all errors"],
        ["Why separate branded queries?", "Brand demand can mask content performance", "They are always profitable", "They are always lower volume", "They do not exist"],
        ["What belongs in an SEO change log?", "Date, change, metric watched", "Only the final result", "Nothing", "Only the author"],
      ],
      takeaway: "Segment by intent, watch leading indicators, log one change per cycle, and stay answer-ready.",
      assignment: {
        title: "SEO iteration plan and baseline",
        instructions: "Define a 20-query tracking set grouped by intent for a site you know. Record a baseline for impressions, clicks and CTR (estimated or from a tool). Pick one change for the next cycle, state the metric that would prove it worked and the date you will review. Submit the tracking table and plan.",
        maxPoints: 150,
      },
    },
  ],
  toolkit: {
    fileName: "SEO-Audit-Worksheet.md",
    body: `# SEO Audit Worksheet\n\n## Diagnose by stage\n- [ ] Crawled? (status, robots.txt)\n- [ ] Indexed? (noindex, sitemap)\n- [ ] Ranking? (comparative to SERP)\n- [ ] Intent matched by page format?\n\n## Keyword map\n| Seed phrase | Intent | Dominant SERP type | Target page |\n| --- | --- | --- | --- |\n|  |  |  |  |\n\n## On-page\n- [ ] One H1, question-shaped H2s\n- [ ] Answer in first 50 words\n- [ ] Title includes main phrase + click reason\n- [ ] Descriptive anchors and image alt text\n\n## Technical\n- [ ] Canonical points to one preferred URL\n- [ ] Main content in initial HTML\n- [ ] Sitemap matches live 200 URLs\n- [ ] CWV field data recorded\n\n## Iteration log\n| Date | Change | Metric | Before | After |\n| --- | --- | --- | --- | --- |\n|  |  |  |  |  |\n`,
  },
  capstone: {
    title: "A 90-Day SEO Growth Plan",
    description:
      "Build a complete plan for one site: a stage diagnosis, an intent-grouped keyword map, an on-page rewrite, a technical audit, an internal-link plan, a trust upgrade and a 20-query baseline with one logged change. The result is a plan you can execute and attribute.",
    techStack: ["Intent mapping", "SERP analysis", "On-page structure", "Technical audit", "Internal links", "Change log"],
    outcome: "A single document that turns 'we need SEO' into dated, measurable work.",
  },
  showcase: {
    title: "On-Page Rewrite Before & After",
    description:
      "One page rewritten with a clear H1, answer-first opening, question-shaped H2s, a snippet-ready answer and descriptive anchors — shown side by side with the original.",
    techStack: ["Answer-first writing", "Heading hierarchy", "Featured-snippet structure"],
    outcome: "A reusable template for every future page you publish.",
  },
};

export const skillCoursesB = [compileCourse(dataLiteracy), compileCourse(seoFundamentals)];
