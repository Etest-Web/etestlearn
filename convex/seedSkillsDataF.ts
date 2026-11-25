/**
 * Paid blueprints 5-6: Notion Systems for Work + AI Video Content.
 * Consumed by seedPaidSkills.ts through compileCourse() in seedSkillsKit.ts.
 */

import {
  blank,
  compileCourse,
  multi,
  tf,
  type SkillCourseBlueprint,
} from "./seedSkillsKit";

const notionSystems: SkillCourseBlueprint = {
  title: "Notion Systems for Work",
  slug: "notion-systems",
  category: "Productivity",
  level: "Beginner to Intermediate",
  description:
    "Eight modules for turning Notion from a folder of notes into a system your team can run. Model databases and properties correctly, build a task tracker, connect records with relations and rollups, reuse structure through templates, write documentation people actually read, automate the boring transitions, assemble a dashboard, and hand the whole thing over safely. Every module has two articles, an interactive walkthrough, two mixed-type knowledge checks and a graded assignment.",
  interactiveSlides: true,
  modules: [
    {
      title: "Databases, Properties and Views",
      concepts: [
        ["A database is a table of records", "A Notion database is a collection of rows that all share the same properties. A view is a saved lens over those same rows, so an edit made in one view is visible in every other view. Duplicating a database to get a second layout creates two sources of truth.", "One Tasks database shown as a board by status and as a calendar by due date."],
        ["Properties are the schema", "Each property holds one typed value: text, select, multi-select, date, number, person or relation. Typed properties can be filtered, sorted and rolled up; a free-text 'status' field cannot produce real board columns.", "Use a Status select with fixed options, not a text field people type into."],
        ["Views answer recurring questions", "A table view is for editing, a board for workflow, a calendar for time, a gallery for browsing. Add one view per question you ask weekly instead of copying records into different pages.", "Create a 'Due this week' calendar with a date filter; no rows are duplicated."],
      ],
      workflow: ["Name the question the workspace must answer.", "Define the database and its minimum properties.", "Add one view per real question, with filters saved.", "Review the property list after two weeks and delete anything unused."],
      pitfalls: ["Cloning a database to get a different layout, then maintaining both.", "Using text where a select, date or relation property would give you real filtering."],
      questions: [
        ["What is a Notion view?", "A saved lens over the same records", "A copy of the database", "A new property type", "A separate workspace"],
        tf("Editing a row in one view changes it in every view of that database.", true),
        ["Which property type gives you real board columns?", "Select", "Text", "Formula only", "Rich text"],
        multi("Which are typed properties?", ["Date", "Select", "Relation"], "Paragraph", "Page cover", "Comment"),
        ["Why avoid duplicating a database for a second layout?", "It creates two sources of truth", "It is slower to open", "Notion forbids it", "It removes filters"],
        blank("A view is a saved ______ over the same records.", "lens", "filter"),
      ],
      takeaway: "One database, typed properties, one view per question. Duplication is the enemy of a trustworthy workspace.",
      assignment: {
        title: "Design a database schema",
        instructions: "Pick one recurring work process and design a single database for it. List every property with its type and the reason it exists. Define three views, each with its filter and the question it answers. Submit the schema as a table with a 150-word note on what you deliberately left out.",
        maxPoints: 100,
      },
    },
    {
      title: "Building a Task and Project Tracker",
      concepts: [
        ["Tasks and projects are two databases", "Tasks hold the work; projects hold the context. Linking them with a relation lets a project show its tasks without copying titles into both places. One task belongs to one project; a project has many tasks.", "A Tasks row 'Draft launch email' relates to the 'September launch' project."],
        ["Status is a state machine", "Define a small, ordered set of statuses and the transition rule for each. 'Not started → In progress → Review → Done' is enough for most work. Ambiguous labels like 'Soon' make filtering meaningless.", "Move a card to Review only when a colleague can actually read the work."],
        ["Owners, dates and capacity", "A person property and a date range turn a list into a plan. Add an estimate in hours only if you will use it; an unused estimate is noise that discourages updates.", "Set a due date and one owner per task, never a committee."],
      ],
      workflow: ["Create Projects and Tasks databases.", "Relate each task to one project.", "Define a short ordered status set.", "Add one owner and one due date per active task."],
      pitfalls: ["Putting due dates only on the project, so individual tasks have no deadline.", "Letting status accumulate twenty custom values over a quarter."],
      questions: [
        ["Why separate Tasks from Projects?", "They are different records with different properties", "Notion requires it", "It removes the need for dates", "It makes views faster"],
        tf("A task should have several owners so everyone is responsible.", false),
        ["What does a status transition rule define?", "When a card may move to the next state", "The colour of the board", "The page icon", "The number of views"],
        multi("Which belong on an actionable task?", ["One owner", "A due date", "A defined status"], "Vague label", "Five owners", "No destination"),
        ["What is the risk of many custom statuses?", "Filtering becomes meaningless", "The board gets faster", "Notion blocks it", "Dates disappear"],
        blank("A task should have exactly one ______, not a committee.", "owner"),
      ],
      takeaway: "Two linked databases, a short ordered status set, one owner and one date per task.",
      assignment: {
        title: "Build a two-database tracker",
        instructions: "Create a Projects database and a Tasks database in a test page. Relate tasks to projects, define four ordered statuses, and add one owner and due date to five sample tasks. Build a board grouped by status and a calendar by due date. Submit screenshots and a 150-word note on one decision you simplified.",
        maxPoints: 110,
      },
    },
    {
      title: "Relations, Rollups and Linked Records",
      concepts: [
        ["A relation is a live link", "A relation property points to rows in another database. The linked page stays current because you are referencing the record, not retyping its title. Set the relation to allow one or many rows depending on the real cardinality.", "One Client relates to many Projects; each Project relates back to one Client."],
        ["Rollups aggregate the linked rows", "A rollup reads a property from related records and computes something: sum, count, earliest date or latest date. It is the bridge from task-level detail to project-level status.", "Roll up task due dates to show the latest date on the project."],
        ["Two-way links keep context", "Enable the inverse relation so a project also shows its client. Without it you must open the client to discover the relationship, which is how link diagrams become unreadable.", "Turn on 'Show on the related page' when creating the relation."],
      ],
      workflow: ["Identify the parent and child databases.", "Create the relation with correct cardinality.", "Add the inverse relation on the parent.", "Add one rollup that answers a real question."],
      pitfalls: ["Choosing 'allow many' in both directions when the real relationship is one-to-many.", "Rolling up a text property, which cannot be aggregated."],
      questions: [
        ["What does a relation property store?", "A live link to another record", "A copy of the title", "A formula", "A comment"],
        tf("A rollup can sum a number property from linked records.", true),
        ["Which property multiplies task estimates into a project total?", "Rollup with Sum", "Text", "Select", "Checkbox"],
        multi("Which are valid rollup operations?", ["Sum", "Count", "Earliest date"], "Paragraph", "Page icon", "Cover image"),
        ["Why enable the inverse relation?", "Both records show the link in context", "It is required by Notion", "It speeds up loading", "It removes duplicates"],
        blank("A relation points to another ______, not a copied title.", "record", "row"),
      ],
      takeaway: "Relation for the link, rollup for the aggregate, inverse relation for context. Choose real cardinality.",
      assignment: {
        title: "Client-to-project rollup",
        instructions: "Build a Clients database and a Projects database. Relate each project to one client with a visible inverse relation, then roll up project budgets to a client total and the latest due date to a client deadline. Submit screenshots and a 150-word note on how you set the cardinality.",
        maxPoints: 120,
      },
    },
    {
      title: "Templates, Duplication and Reusable Structure",
      concepts: [
        ["A database template is a starting state", "Templates pre-fill properties and page body for a new row. Use them to enforce the first five minutes of a process, not to freeze every detail: people must still be able to adapt the work.", "A 'New client' template sets status, owner and a four-section meeting page."],
        ["Structure beats decoration", "A reusable page has headings in a fixed order and empty slots for the fields that change. Decide the skeleton before choosing icons, colours or covers.", "Brief, Decisions, Open questions, Next steps — same order every time."],
        ["Duplicate carefully", "Duplicating a page copies its children; duplicating a database copies its rows. Know which you are doing, and never duplicate a live database as a 'backup' — use version history instead.", "Duplicate the template, not last week's filled-in page."],
      ],
      workflow: ["Find a page you recreate at least weekly.", "Strip it to a fixed skeleton.", "Save it as a database template.", "Use it three times and remove anything never filled in."],
      pitfalls: ["Templates copied from a finished page, carrying old dates and names.", "Building ten near-identical templates instead of one with clear placeholders."],
      questions: [
        ["What should a database template do?", "Pre-fill the starting state", "Lock every field forever", "Replace all documentation", "Delete old rows"],
        tf("Duplicating a database copies its rows as well as its structure.", true),
        ["What comes first when designing a reusable page?", "The fixed heading skeleton", "The cover image", "The icon set", "The colour palette"],
        multi("Which make a good template?", ["Fixed heading order", "Empty slots for changing fields", "Prefilled status and owner"], "Last week's dates", "Ten variants", "No placeholders"),
        ["Why use version history instead of a duplicate database as backup?", "It restores without creating a second source of truth", "It is faster", "Notion forbids duplicates", "It removes the need for templates"],
        blank("Design the ______ before choosing icons and colours.", "skeleton", "structure"),
      ],
      takeaway: "One template per repeated process, fixed skeleton, placeholders for change. Duplicate pages, not live databases.",
      assignment: {
        title: "Template audit and rebuild",
        instructions: "Find three pages you recreate regularly. Choose one and strip it to a fixed skeleton with placeholders. Save it as a database template and use it twice. Submit the template, one filled example and a 150-word note on what you removed.",
        maxPoints: 110,
      },
    },
    {
      title: "Pages, Blocks and Documentation Habits",
      concepts: [
        ["Everything is a block", "Text, headings, lists, callouts and databases are blocks that can be moved independently. Understanding blocks explains why indentation and drag handles behave as they do, and why a stray indent can nest a heading under the wrong parent.", "Press space on an empty line to open the block menu instead of reaching for the toolbar."],
        ["Write for the next reader", "Documentation succeeds when someone can answer a question without asking you. Lead with the decision, then the context, then the exception. A page that begins with its history buries the answer.", "Start a runbook with 'When to use this', not 'How we got here'."],
        ["Link, do not copy", "When the same fact is needed in two places, write it once and link to it. Copied facts drift; a linked page has one owner and one update path.", "Link to the single source instead of pasting the policy into three pages."],
      ],
      workflow: ["Write the answer in the first line.", "Add context only where it changes the decision.", "Link to sources instead of copying them.", "Add an owner and a review date to durable pages."],
      pitfalls: ["Pages that open with several paragraphs of background.", "Copying a policy into three spaces and updating only one."],
      questions: [
        ["What is the smallest editable unit in Notion?", "A block", "A workspace", "A database row only", "A comment"],
        tf("Copied facts stay consistent as long as you remember to update them.", false),
        ["What should a runbook start with?", "When to use it", "A long history", "The author's name", "A decorative cover"],
        multi("Which are good documentation habits?", ["Answer first", "Link rather than copy", "Name an owner"], "Copy facts everywhere", "Bury the decision", "Skip review dates"),
        ["Why link to a source instead of pasting it?", "There is one place to update it", "It is faster to type", "Notion forbids pasting", "It removes the need for headings"],
        blank("A durable page should name an owner and a review ______.", "date"),
      ],
      takeaway: "Answer first, context second, link instead of copy. Blocks make structure explicit.",
      assignment: {
        title: "Rewrite a doc for the next reader",
        instructions: "Take one documentation page you own. Rewrite it so the answer appears in the first line, replace one copied fact with a link, and add an owner and review date. Submit before and after plus 150 words on what a first-time reader would now find faster.",
        maxPoints: 110,
      },
    },
    {
      title: "Automations and Buttons",
      concepts: [
        ["Automations are triggers and actions", "A database automation fires on a trigger such as a status change or a date arriving, then performs an action such as setting a property or sending a notification. Automate transitions that already have a clear rule, not ambiguous judgement calls.", "When Status becomes Done, set Completed date to today."],
        ["Buttons package repeated actions", "A button can insert a template, set properties and add pages in one click. Use it for the sequence every teammate would otherwise perform in the same order.", "A 'Start new client' button creates a project page and sets owner and status."],
        ["Guard against loops and noise", "Every automation should have an exit condition and a visible result. Before enabling one, ask what happens if it runs twice — idempotence matters as much here as in any system.", "Only notify on the transition into Review, not on every edit."],
      ],
      workflow: ["Find a transition with a written rule.", "Define trigger, action and stop condition.", "Test on a sample row twice.", "Record who owns the automation."],
      pitfalls: ["Automating a judgement call that still needs a human.", "Two automations that trigger each other in a loop."],
      questions: [
        ["What does a Notion automation need?", "A trigger and an action", "A password", "A separate database", "A button template only"],
        tf("A good automation should be safe if it runs twice.", true),
        ["What should a button do?", "Package a repeated sequence of actions", "Replace all documentation", "Lock the database", "Delete old rows"],
        multi("Which are safe automation habits?", ["A stop condition", "A visible result", "A named owner"], "Trigger on every edit", "Two rules that trigger each other", "No test run"),
        ["Why avoid automating a judgement call?", "It still needs human discretion", "Notion forbids it", "It is slower", "It removes the need for statuses"],
        blank("Before enabling an automation, ask what happens if it runs ______.", "twice"),
      ],
      takeaway: "Automate written rules with stop conditions; use buttons for repeated sequences. Test for double runs.",
      assignment: {
        title: "Automation with a stop condition",
        instructions: "Build one database automation for a real transition and one button that packages a repeated three-step action. State the trigger, action and stop condition, then run each twice on a sample row and record what happened. Submit screenshots and a 150-word note.",
        maxPoints: 120,
      },
    },
    {
      title: "Dashboards and Homepages",
      concepts: [
        ["A dashboard answers, it does not decorate", "Start with the three questions a reader asks on opening the workspace. Every block on the homepage must help answer one of them; anything else belongs on a linked detail page.", "What is due this week, what is blocked, what changed since yesterday."],
        ["Filter views before adding widgets", "A linked database view with a saved filter is usually more useful than a chart. Add a count or rollup only where a number changes a decision.", "A 'My open tasks' view beats a chart of all tasks by author."],
        ["Hierarchy is a reading order", "Place the decision metric top-left, supporting lists below, links at the bottom. Keep the page short enough to read in one screen on a laptop.", "One summary line, two filtered views, one link row."],
      ],
      workflow: ["Write the three opening questions.", "Choose one view per question.", "Arrange top-left to bottom by priority.", "Remove any block that answers none of them."],
      pitfalls: ["Homepages that are a wall of linked databases with no saved filters.", "Charts that display numbers nobody acts on."],
      questions: [
        ["What should a dashboard start with?", "The questions readers ask", "A colour scheme", "Every database", "A long introduction"],
        tf("A filtered linked view is often more useful than a chart.", true),
        ["Where should the decision metric sit?", "Top-left", "Bottom-right", "In a footnote", "Nowhere"],
        multi("Which belong on a useful homepage?", ["Saved-filter views", "One decision metric", "A few key links"], "Unfiltered database dumps", "Ten charts", "Decorative blocks"),
        ["Why remove blocks that answer no question?", "They dilute the reading order", "They slow loading", "Notion limits block count", "They break relations"],
        blank("Arrange a dashboard by ______ order, top-left to bottom.", "reading", "priority"),
      ],
      takeaway: "Three questions, one view each, decision metric top-left. Remove everything that does not answer.",
      assignment: {
        title: "Design a team homepage",
        instructions: "Write the three questions a teammate asks on opening your workspace. Build a homepage with one saved-filter view per question and one decision metric. Remove every other block. Submit a screenshot and a 150-word note on one block you deleted and why.",
        maxPoints: 120,
      },
    },
    {
      title: "Sharing, Permissions and Handover",
      concepts: [
        ["Choose the smallest audience", "Share with the fewest people who need access, and prefer group or team spaces over individual guest invites. A link that anyone with the URL can edit is a risk that grows quietly over time.", "Publish read-only to the web; keep editing inside the team."],
        ["Permissions are inherited", "Child pages inherit access from their parent unless changed. Moving a page can move its audience with it, so check permissions after any reorganisation.", "Verify a confidential page is not under a broadly shared parent."],
        ["Handover needs an owner and a runbook", "A workspace someone else must run needs a named owner, a short guide to weekly operations, and a record of automations and templates. Without all three it decays within a month.", "List who owns each database and what to do when a status changes."],
      ],
      workflow: ["Audit who has edit access.", "Replace public edit links with read-only publish.", "Check permissions after moving pages.", "Write a handover guide naming owners and automations."],
      pitfalls: ["Leaving an old guest invite active after someone changes role.", "Moving a private page under a public parent without rechecking access."],
      questions: [
        ["What is the safest default for a shared link?", "Read-only to the web", "Anyone can edit", "No link at all", "Guest-only edit"],
        tf("Child pages inherit access from their parent page.", true),
        ["What must a handover guide include?", "Owners, weekly operations and automations", "Only the workspace URL", "A list of colours", "Nothing; the workspace is self-evident"],
        multi("Which are permission hygiene steps?", ["Audit edit access", "Remove stale guests", "Recheck after moving pages"], "Broad public edit links", "Ignore inheritance", "Skip ownership"),
        ["Why recheck permissions after a move?", "The page may inherit a wider audience", "It is required by Notion", "It speeds up loading", "It removes templates"],
        blank("A workspace someone else must run needs a named ______.", "owner"),
      ],
      takeaway: "Smallest audience, inherited access checked after moves, handover guide with owners and automations.",
      assignment: {
        title: "Permission audit and handover guide",
        instructions: "Audit one space: list everyone with edit access, remove at least one stale invite, and convert any public edit link to read-only. Write a one-page handover guide naming an owner for each database and every automation. Submit the before/after list and guide.",
        maxPoints: 130,
      },
    },
  ],
  toolkit: {
    fileName: "notion-systems-toolkit.md",
    body: `# Notion Systems for Work — Toolkit

## Schema
- [ ] One database per kind of record
- [ ] Typed properties (select, date, relation, number)
- [ ] No unused properties after two weeks
- [ ] One view per weekly question, with saved filters

## Tracker
- [ ] Tasks and Projects in separate databases
- [ ] Relation with correct cardinality + inverse
- [ ] Short ordered status set
- [ ] One owner and one due date per active task

## Rollups
- [ ] Aggregating a numeric or date property
- [ ] Rollup answers a real project-level question
- [ ] Linked records stay current, no copied titles

## Reuse
- [ ] One template per repeated process
- [ ] Fixed skeleton with empty placeholders
- [ ] Duplicate pages, never live databases
- [ ] Version history used instead of backup copies

## Documentation
- [ ] Answer in the first line
- [ ] Facts linked, not copied
- [ ] Owner and review date on durable pages

## Automation
- [ ] Written rule behind every trigger
- [ ] Stop condition and visible result
- [ ] Tested twice on a sample row
- [ ] Buttons package repeated sequences

## Handover
- [ ] Smallest audience, no public edit links
- [ ] Permissions checked after page moves
- [ ] Named owner per database
- [ ] Guide lists automations and templates
`,
  },
  capstone: {
    title: "A Team Operating Workspace",
    description:
      "Build and hand over a Notion workspace that runs one real team process end to end: a Projects and Tasks tracker linked by relations, rollups that answer project-level questions, one template per repeated page, one automation with a tested stop condition, and a homepage organised around three questions. Include a permission audit and a one-page handover guide naming owners and automations.",
    techStack: ["Databases and views", "Relations and rollups", "Templates", "Automations and buttons", "Dashboards", "Permissions"],
    outcome: "A workspace a colleague can run on Monday without asking you how it works.",
  },
  showcase: {
    title: "Workspace Before and After",
    description:
      "Show a cluttered workspace and the system that replaced it. Annotate three decisions that became faster because records were linked, filtered and owned rather than copied into a dozen pages.",
    techStack: ["Information hierarchy", "Schema design", "Technical writing"],
    outcome: "A case study showing the operational value of a well-built workspace.",
  },
};

const aiVideoContent: SkillCourseBlueprint = {
  title: "AI Video Content: Idea to Published Short",
  slug: "ai-video-content",
  category: "AI & Creative",
  level: "Beginner to Intermediate",
  description:
    "Eight modules for producing publishable short-form video with AI in the loop. Plan a repeatable pipeline, write scripts and storyboards, generate scene assets, record synthetic voiceover, assemble a paced edit with captions, add motion, package hooks for each platform, and keep quality and ethics intact while scaling output. Every module has two articles, an interactive walkthrough, two mixed-type knowledge checks and a graded assignment.",
  interactiveSlides: true,
  modules: [
    {
      title: "The AI Video Pipeline",
      concepts: [
        ["One pipeline, five stages", "Every short moves through idea, script, assets, edit and publish. AI can assist at each stage, but a weak script cannot be rescued by better images. Identify the weakest stage first and fix that.", "A 45-second explainer: brief, script, six images, voiceover, captioned edit."],
        ["Decide what AI should and should not do", "Generative tools are strong at drafting, variation and bulk assets; they are weak at factual precision, continuity and final judgement. Keep the last decision with a person.", "Let AI produce ten hook variants; choose one yourself after reading them aloud."],
        ["Define the deliverable before starting", "Platform, length, aspect ratio and caption style determine every downstream choice. Decide 9:16 and 45 seconds before generating a single image.", "A vertical short needs centre-safe composition, not a wide cinematic frame."],
      ],
      workflow: ["Write the brief: audience, platform, length, one job.", "Draft the script and lock it.", "Generate only the assets the script calls for.", "Edit, caption, review on a phone, publish."],
      pitfalls: ["Generating beautiful assets before the script exists.", "Editing in 16:9 and cropping to vertical at the end."],
      questions: [
        ["What are the five pipeline stages?", "Idea, script, assets, edit, publish", "Write, render, upload", "Plan, buy, sell", "Draw, animate, export"],
        tf("Better AI images can rescue a weak script.", false),
        ["What should be decided before generating assets?", "Platform, length and aspect ratio", "Font choice only", "Music genre", "Thumbnail colour"],
        multi("Which tasks suit AI assistance?", ["Drafting many hook variants", "Generating scene assets", "Bulk caption drafts"], "Final factual sign-off", "Legal review", "Choosing the last cut"),
        ["Where should final judgement stay?", "With a person", "With the model", "With the renderer", "With the platform"],
        blank("Decide the ______ ratio before generating any scene asset.", "aspect"),
      ],
      takeaway: "Script first, assets second, edit third. Lock platform and length, keep final judgement human.",
      assignment: {
        title: "Pipeline brief for one short",
        instructions: "Write a one-page brief for a 45-second vertical short: audience, platform, the single job of the video, aspect ratio, caption style and the AI role at each of the five stages. Name the stage most likely to fail and how you would test it first. Submit the brief with a 150-word rationale.",
        maxPoints: 100,
      },
    },
    {
      title: "Scripts and Storyboards for Short Form",
      concepts: [
        ["Hook, tension, payoff", "A short earns attention in the first two seconds, creates a small open loop, then closes it. Write the payoff before the hook so the promise is one you can keep.", "Hook: 'Three settings fix most bad prompts.' Payoff: show all three with examples."],
        ["Write for the ear", "Short-form copy is heard, not read. Use short sentences, concrete nouns and active verbs; cut any clause that needs a second listen.", "Replace 'utilise appropriate configuration' with 'set this to on'."],
        ["Storyboard as a shot list", "A storyboard is a table of time, visual, narration and on-screen text. It is the contract between script and assets; generate images only for rows in the table.", " shot 3: 8-12s, close-up of a keyboard, VO: 'Set temperature low', text: 'Low = stable'."],
      ],
      workflow: ["Write the payoff in one sentence.", "Draft a two-second hook that promises it.", "Build a shot list with time ranges.", "Read the narration aloud and cut anything you stumble over."],
      pitfalls: ["Opening with a logo or a long introduction.", "A storyboard with more shots than the runtime can hold."],
      questions: [
        ["What must come first when scripting a short?", "The payoff", "The logo animation", "The music choice", "The thumbnail"],
        tf("Short-form copy should be optimised for being heard.", true),
        ["What does a storyboard row contain?", "Time, visual, narration and on-screen text", "Only a colour", "Only a camera angle", "A file name"],
        multi("Which make a strong hook?", ["A two-second promise", "A concrete outcome", "A specific number"], "A long greeting", "A logo reveal", "An abstract quote"),
        ["Why read narration aloud?", "To cut lines that are hard to hear", "To test the renderer", "To count pixels", "To choose a font"],
        blank("Write the ______ before the hook so the promise is keepable.", "payoff"),
      ],
      takeaway: "Payoff first, two-second hook, shot list as contract, narration tested by ear.",
      assignment: {
        title: "Script and shot list",
        instructions: "Write a 45-second script with a two-second hook, one open loop and a clear payoff. Convert it into a shot list with time ranges, visual, narration and on-screen text for at least six shots. Read the narration aloud and note three cuts you made. Submit both artefacts.",
        maxPoints: 120,
      },
    },
    {
      title: "Generating Images and Scene Assets",
      concepts: [
        ["Prompt for the frame, not the mood", "An image prompt should specify subject, composition, lighting, style and aspect ratio. 'Cinematic' alone gives inconsistent results; concrete constraints make a usable asset.", "Flat-lay desk, overhead, soft daylight, muted palette, 9:16, no text."],
        ["Continuity is a property you must manage", "AI will change faces, colours and objects between shots. Reuse a reference image, keep a written style sheet and generate scenes in one batch so consistency is deliberate.", "Record the seed, prompt and palette for every kept image."],
        ["Never rely on generated text", "Image models still garble letters. Render titles and captions in the editor with real typography; treat any text in a generated image as accidental.", "Ask for clean space where you will add the label later."],
      ],
      workflow: ["Write a style sheet once.", "Prompt each shot with subject, composition and lighting.", "Generate three variants and keep one with its seed.", "Add all real text in the edit."],
      pitfalls: ["Using generated lettering as on-screen text.", "Generating each shot in a different style session."],
      questions: [
        ["What should an image prompt specify?", "Subject, composition, lighting and aspect", "Only a mood word", "The file name", "The music tempo"],
        tf("Generated text in an image is reliable for on-screen labels.", false),
        ["How do you keep continuity across shots?", "Reuse references and a written style sheet", "Generate in separate random sessions", "Change the style every shot", "Crop randomly"],
        multi("Which belong in a style sheet?", ["Palette", "Lighting", "Subject details"], "Random seeds only", "Font choice in the editor", "Publish times"),
        ["Why render titles in the editor?", "Real typography stays legible", "It is faster to generate", "Models prefer it", "It removes the need for captions"],
        blank("Treat any text inside a generated image as ______.", "accidental"),
      ],
      takeaway: "Concrete frame prompts, one style sheet, logged seeds. Put real text in the editor.",
      assignment: {
        title: "Six-shot asset pack",
        instructions: "Using a written style sheet, generate or select three variants for each of six shots from your storyboard. Keep one per shot and log its prompt and seed. Add on-screen text in an editor, not in the image. Submit the style sheet, the six frames with logs and a 150-word note on the worst continuity break.",
        maxPoints: 130,
      },
    },
    {
      title: "Voiceover and Audio",
      concepts: [
        ["Delivery beats realism", "A synthetic voice is acceptable when the pacing and emphasis are right. Choose a voice that fits the subject, then adjust pauses so each idea lands; a perfect timbre with flat delivery still loses viewers.", "Insert a half-second pause after the hook before the first point."],
        ["Script for the voice engine", "Write words as they are spoken: spell out numbers and abbreviations, avoid punctuation the engine will misread, and keep sentences short.", "Write 'twenty twenty-six', not '2026', if the engine mishandles digits."],
        ["Mix for a phone speaker", "Most viewers watch muted first and listen on a small speaker later. Keep narration forward, duck music under voice, and check the mix at low volume.", "Aim for clear voice with music barely present beneath it."],
      ],
      workflow: ["Prepare a voice-ready script.", "Generate a rough take and listen for pacing.", "Adjust pauses and re-generate only the failing lines.", "Mix voice forward, music low, then test on a phone."],
      pitfalls: ["Generating the whole narration again to fix one sentence.", "Music loud enough to fight the voice."],
      questions: [
        ["What matters more than perfect timbre in synthetic voice?", "Pacing and emphasis", "File format", "Sample rate only", "Voice accent"],
        tf("You should write numbers exactly as they appear on the page for a voice engine.", false),
        ["Where should music sit in the mix?", "Barely audible under the voice", "Louder than the voice", "Only at the end", "Nowhere"],
        multi("Which are voice-ready script habits?", ["Spell out awkward numbers", "Short sentences", "Marked pauses"], "Long clauses", "Unpronounceable abbreviations", "No punctuation at all"),
        ["Why test the mix on a phone speaker?", "That is how most viewers hear it", "It is required by law", "It reduces file size", "It removes the need for captions"],
        blank("Keep narration ______ and music low.", "forward", "clear"),
      ],
      takeaway: "Pace for the ear, script for the engine, mix for a phone. Fix only the failing lines.",
      assignment: {
        title: "Voiceover pass",
        instructions: "Take your script and prepare a voice-ready version with spelled-out numbers and marked pauses. Generate a rough narration, identify three lines with bad pacing, and regenerate only those lines. Mix voice forward with low music and test at low volume on a phone. Submit the script, the three fixes and a 150-word note on the result.",
        maxPoints: 120,
      },
    },
    {
      title: "Assembling the Edit",
      concepts: [
        ["Cut for pace, not for footage", "The shot list sets the rhythm; extra footage that does not advance the point is cut even if it looks good. Aim for a change of frame every two to four seconds in a short explainer.", "Remove a beautiful shot that repeats what the previous one already showed."],
        ["Captions are part of the design", "Most viewers watch muted, so captions carry the script. Keep them short, place them centre-safe, and style them for contrast against changing backgrounds.", "Two lines maximum, high-contrast fill, no text near the bottom UI bar."],
        ["Sync is the credibility test", "On-screen text, visuals and narration must agree. A mismatched label erodes trust faster than a rough transition, so check each shot against the storyboard before export.", "If the voice says 'three settings', show exactly three."],
      ],
      workflow: ["Assemble to the shot list first.", "Add narration, then captions.", "Trim any shot that repeats the point.", "Watch muted, then watch at low volume, then export."],
      pitfalls: ["Captions so dense they cover the visual.", "Keeping footage because it was expensive to generate."],
      questions: [
        ["What sets the rhythm of the edit?", "The shot list", "The music length", "The file size", "The thumbnail"],
        tf("Most viewers watch short videos with sound fully on.", false),
        ["Where should captions sit in a vertical short?", "Centre-safe, away from UI bars", "At the very bottom", "Behind the subject", "In the corner"],
        multi("Which are caption hygiene rules?", ["Two lines maximum", "High contrast", "Synced to narration"], "Dense paragraphs", "Low-contrast grey", "Off-screen placement"),
        ["Why check every shot against the storyboard?", "To catch mismatched labels and visuals", "To increase file size", "It is required by law", "It removes the need for captions"],
        blank("Cut for ______, not for footage.", "pace", "rhythm"),
      ],
      takeaway: "Edit to the shot list, caption for muted viewing, check sync before export.",
      assignment: {
        title: "Assemble and review a short",
        instructions: "Assemble your six generated shots to the shot list, add narration and styled captions, and cut anything that repeats the point. Watch the result twice: once muted, once at low volume. Submit the exported short plus a 200-word note listing three cuts and one sync error you found.",
        maxPoints: 140,
      },
    },
    {
      title: "Image-to-Video and Motion",
      concepts: [
        ["Motion needs a reason", "Animate to direct attention or show change, not because a tool offers the effect. A slow push on the key object beats a collage of zooms and spins.", "Pan gently toward the item the narration names."],
        ["Short clips, controlled drift", "Image-to-video works best in two to four second segments with small camera movement. Long generations drift in anatomy and background; break the shot into short, stable pieces.", "Generate three two-second moves rather than one eight-second scene."],
        ["Keep a clean plate", "Generate a still with empty space where text will go, then animate it. Moving backgrounds under dense captions make text unreadable.", "A calm area of the frame reserved for the on-screen label."],
      ],
      workflow: ["Mark the focal point in each still.", "Generate a short, gentle move.", "Reserve quiet space for captions.", "Review frame by frame for drift before keeping it."],
      pitfalls: ["Applying the same dramatic zoom to every shot.", "Long generations that deform faces or objects."],
      questions: [
        ["Why animate a shot?", "To direct attention or show change", "Because the tool offers it", "To fill time", "To increase file size"],
        tf("Short two-second generations drift less than long ones.", true),
        ["What is a clean plate?", "A still with empty space for later text", "A blank export", "A deleted shot", "A colour grade"],
        multi("Which are safe motion habits?", ["Gentle camera moves", "Short segments", "Frame-by-frame drift check"], "Dramatic zoom on every shot", "Long eight-second scenes", "Text over busy motion"),
        ["Why reserve quiet space in the frame?", "Captions stay readable", "It speeds rendering", "It is required by law", "It removes the need for captions"],
        blank("Animate to direct ______, not because an effect exists.", "attention"),
      ],
      takeaway: "Motion with a purpose, short controlled clips, a clean plate for captions. Check for drift.",
      assignment: {
        title: "Motion pass on three shots",
        instructions: "Choose three stills from your pack. For each, mark the focal point and generate a short gentle move. Reserve a quiet area for captions and review frame by frame for drift. Submit before/after stills and a 150-word note on which shot you rejected and why.",
        maxPoints: 130,
      },
    },
    {
      title: "Hooks, Formats and Distribution",
      concepts: [
        ["One idea, native packages", "The same core script can be cut for TikTok, Reels and Shorts, but each needs its own opening and pacing. Export per platform instead of uploading one file everywhere.", "A sharper first line and tighter cuts for Shorts; a slower reveal for Reels."],
        ["The hook is tested, not guessed", "Write five hook variants for the same payoff and test them as separate uploads. Judge on two-second retention and completion, not on likes.", "Change only the first line; keep the rest identical."],
        ["Metadata completes the work", "Title, cover frame and first comment frame the promise. A clear cover with three words and a first comment that adds context beat clever captions.", "Cover: 'Three prompt settings'. First comment: the full tool list."],
      ],
      workflow: ["Write five hooks for one payoff.", "Cut a native version per platform.", "Set a readable cover and a useful first comment.", "Judge on retention and completion, then iterate."],
      pitfalls: ["Uploading one 16:9 file to every vertical platform.", "Changing hook, edit and title together, then guessing what worked."],
      questions: [
        ["How should you treat one idea across platforms?", "Cut a native version per platform", "Upload the same file everywhere", "Change the topic each time", "Skip metadata"],
        tf("Hook tests should change only the opening line.", true),
        ["Which metric best judges a hook?", "Two-second retention", "Like count", "Upload time", "File size"],
        multi("Which are good distribution habits?", ["Readable cover text", "Useful first comment", "Platform-native cuts"], "One file everywhere", "Multiple simultaneous changes", "No cover"),
        ["Why change one variable in a hook test?", "So the effect is attributable", "It is faster", "Platforms require it", "It removes the need for retention data"],
        blank("Judge hooks on retention and ______, not likes.", "completion"),
      ],
      takeaway: "Native cuts, five tested hooks, readable cover. Judge retention and completion.",
      assignment: {
        title: "Five-hook test plan",
        instructions: "Write five opening lines for one payoff and a test plan that changes only the first line. Prepare a cover with three readable words and a first comment that adds context. Explain which retention number would make you keep each hook. Submit the plan and all five openings.",
        maxPoints: 120,
      },
    },
    {
      title: "Quality, Ethics and Scaling",
      concepts: [
        ["Disclose synthetic media", "Audiences and platforms increasingly expect a label when voice or visuals are generated. Disclose plainly in the description or on screen; a quiet undisclosed synthetic voice costs more trust than a label ever does.", "Add 'Voice and scenes generated with AI' to the description."],
        ["Verify before you publish", "AI narration and images can invent names, figures and quotes. Keep a fact checklist for any factual claim and link the source in the description.", "Check every number against a primary source before recording it."],
        ["Scale with a checklist, not heroics", "A repeatable pipeline has a brief template, a style sheet, a voice-ready script format and a final review checklist. Volume grows by repeating the process, not by skipping the review.", "Refuse to publish any short whose sync check is unfinished."],
      ],
      workflow: ["Label synthetic voice and scenes.", "Verify every factual claim against a source.", "Run the sync and caption review.", "Publish only when the checklist is complete."],
      pitfalls: ["Publishing a plausible statistic you never checked.", "Scaling output by removing the final review."],
      questions: [
        ["How should synthetic voice be handled?", "Disclose it plainly", "Hide it", "Remove all captions", "Change the topic"],
        tf("A fluent AI narration is safe to publish without fact-checking.", false),
        ["What belongs on the final review checklist?", "Sync, captions and fact checks", "File name only", "Music genre", "Upload timestamp"],
        multi("Which support responsible scaling?", ["Brief template", "Style sheet", "Final review checklist"], "Skip all review", "Publish unverified claims", "Hide synthetic media"),
        ["Why verify numbers before recording?", "AI can invent plausible figures", "It shortens the video", "Platforms require longer scripts", "It removes the need for captions"],
        blank("Scale volume by repeating the process, not by skipping the ______.", "review"),
      ],
      takeaway: "Disclose synthetic media, verify claims, keep the final check. Volume comes from a repeatable process.",
      assignment: {
        title: "Quality and disclosure checklist",
        instructions: "Write a one-page pre-publish checklist covering synthetic-media disclosure, fact verification, sync and caption review. Apply it to your exported short, list three issues it caught, and state one check you refused to skip. Submit the checklist and a 150-word note.",
        maxPoints: 140,
      },
    },
  ],
  toolkit: {
    fileName: "ai-video-content-toolkit.md",
    body: `# AI Video Content — Toolkit

## Brief
- [ ] Audience, platform, length and one job written
- [ ] Aspect ratio and caption style locked
- [ ] AI role defined at each of the five stages
- [ ] Weakest stage identified and tested first

## Script
- [ ] Payoff written before the hook
- [ ] Two-second hook with a keepable promise
- [ ] Shot list: time, visual, narration, on-screen text
- [ ] Narration read aloud and tightened

## Assets
- [ ] Written style sheet (palette, lighting, subject)
- [ ] Prompts specify subject, composition and lighting
- [ ] Kept frames logged with prompt and seed
- [ ] All real text added in the editor

## Audio
- [ ] Voice-ready script, numbers spelled out
- [ ] Pauses marked; only failing lines regenerated
- [ ] Voice forward, music low
- [ ] Mixed tested on a phone at low volume

## Edit
- [ ] Cut to the shot list
- [ ] Captions short, high-contrast, centre-safe
- [ ] Narration, visuals and text in sync
- [ ] Reviewed muted and at low volume

## Motion
- [ ] A reason for every animation
- [ ] Short two-to-four-second generations
- [ ] Clean plate reserved for captions
- [ ] Frame-by-frame drift check

## Distribution
- [ ] Native cut per platform
- [ ] Five hooks tested, one variable changed
- [ ] Readable cover and useful first comment
- [ ] Judged on retention and completion

## Ethics
- [ ] Synthetic voice and scenes disclosed
- [ ] Every factual claim verified and sourced
- [ ] Final review complete before publishing
`,
  },
  capstone: {
    title: "A Published Three-Short Campaign",
    description:
      "Produce and publish a three-short series from one idea: a written brief, voice-ready scripts and shot lists, a consistent generated asset pack with a style sheet and logged prompts, synthetic voiceover with a tested mix, a captioned and synced edit, gentle motion where it earns attention, a native cut per platform with five tested hooks, and a completed disclosure and fact-check checklist. Include the retention readout and what you changed for the second and third shorts.",
    techStack: ["Scripting and storyboards", "Image generation", "Synthetic voiceover", "Editing and captions", "Motion", "Distribution and analytics", "Ethics"],
    outcome: "A real published series plus the process artefacts needed to repeat it at volume.",
  },
  showcase: {
    title: "One Short, Deconstructed",
    description:
      "Take a finished short and annotate it frame by frame: hook, open loop, payoff, caption design, motion choices and the disclosure line. Written for a non-technical reader so the craft is visible without the tools.",
    techStack: ["Visual analysis", "Hook construction", "Technical writing"],
    outcome: "A portfolio piece that shows both the craft and the judgment behind an AI-assisted short.",
  },
};

export const paidCoursesF = [compileCourse(notionSystems), compileCourse(aiVideoContent)];
