import { normalizeSearchTerm } from "./friends";

/**
 * Digital skills as searchable keywords.
 *
 * The homepage concept answers "what should I learn?" with a text field, and a
 * text field is only useful if it knows the vocabulary of the thing it
 * searches. This module is that vocabulary: every digital skill the platform
 * treats as a first-class topic, the aliases and abbreviations people
 * actually type, and a matcher that decides whether a draft is a digital
 * skill — and which one.
 *
 * Each entry has three parts:
 *
 *  · `id`       — a stable slug, for anything that ever wants to reference a
 *                 skill without depending on its display name.
 *  · `label`    — the canonical name. This is what a search is *run with*:
 *                 sending "powerbi" to the full-text index matches nothing
 *                 useful, sending "Power BI" matches the catalog's own
 *                 vocabulary. The aliases exist to get from what the learner
 *                 typed to what the catalog was indexed with.
 *  · `keywords` — lowercase aliases: abbreviations ("k8s", "ga4", "nlp"),
 *                 synonyms ("penetration testing" for Ethical Hacking),
 *                 alternate spellings and hyphenation ("power-bi", "powerbi")
 *                 and platform names ("excel" for spreadsheet skills). The
 *                 label itself is matched implicitly, so it does not need to
 *                 be repeated here.
 *
 * Everything here is pure and synchronous. The file is meant to be imported
 * from client bundles (the composer hints at matches as the learner types),
 * so it must never grow a fetch, a timer or a Convex reference.
 */

export interface DigitalSkill {
  /** Stable slug, kebab-case. */
  id: string;
  /** Canonical display name — also the search term sent to the catalog. */
  label: string;
  /** The domain the skill belongs to; used for grouping, not for ranking. */
  category: string;
  /** Lowercase aliases matched in addition to the label. */
  keywords: readonly string[];
}

const ds = (
  category: string,
  skills: Array<[string, string, readonly string[]]>,
): DigitalSkill[] =>
  skills.map(([label, id, keywords]) => ({ label, id, category, keywords }));

export const DIGITAL_SKILLS: readonly DigitalSkill[] = [
  // ── Data & Artificial Intelligence ──────────────────────────────────────
  ...ds("Data & AI", [
    ["Data Analysis", "data-analysis", ["data analyst", "data analytics", "analytics", "analyzing data", "data insights"]],
    ["Data Science", "data-science", ["data scientist", "applied data science"]],
    ["Business Intelligence", "business-intelligence", ["bi", "bi analyst", "business intelligence analyst", "bi dashboards"]],
    ["Data Engineering", "data-engineering", ["data engineer", "etl", "data pipelines", "data warehouse", "data pipeline"]],
    ["Machine Learning", "machine-learning", ["ml", "ml engineering", "machine learning engineer", "ml models", "applied ml"]],
    ["Artificial Intelligence", "artificial-intelligence", ["ai", "ai engineering", "applied ai", "ai fundamentals"]],
    ["Deep Learning", "deep-learning", ["neural networks", "neural network", "deep neural networks"]],
    ["Generative AI", "generative-ai", ["genai", "gen ai", "llms", "large language models", "llm", "generative artificial intelligence", "foundation models"]],
    ["Prompt Engineering", "prompt-engineering", ["prompting", "ai prompting", "llm prompting", "prompt design", "prompt crafting"]],
    ["Natural Language Processing", "natural-language-processing", ["nlp", "text analytics", "language models", "nlp fundamentals"]],
    ["Computer Vision", "computer-vision", ["cv", "image recognition", "vision ai", "computer vision engineer"]],
    ["Data Visualization", "data-visualization", ["data viz", "visual analytics", "dashboarding", "data storytelling", "charts and graphs"]],
    ["Statistics", "statistics", ["statistical analysis", "stats", "applied statistics", "a/b test statistics"]],
    ["SQL", "sql", ["postgres", "postgresql", "mysql", "sql queries", "sql server", "structured query language", "sqlite"]],
    ["Python", "python", ["python programming", "python developer", "python for data science", "py"]],
    ["R", "r", ["r programming", "r language", "r studio", "rstudio", "r statistics"]],
    ["Excel", "excel", ["advanced excel", "excel spreadsheets", "microsoft excel", "spreadsheet analysis", "excel modeling"]],
    ["Google Sheets", "google-sheets", ["sheets", "google spreadsheet", "spreadsheets"]],
    ["Tableau", "tableau", ["tableau desktop", "tableau server", "tableau analytics"]],
    ["Power BI", "power-bi", ["powerbi", "power-bi", "power bi desktop", "microsoft power bi"]],
    ["Looker", "looker", ["looker studio", "google data studio", "data studio"]],
    ["BigQuery", "bigquery", ["google bigquery", "gcp data warehouse"]],
    ["Apache Spark", "apache-spark", ["spark", "pyspark", "spark streaming", "spark sql"]],
    ["dbt", "dbt", ["data build tool", "dbt core", "analytics engineering"]],
    ["Snowflake", "snowflake", ["snowflake data warehouse", "snowflake sql"]],
    ["Experimentation", "experimentation", ["a/b testing", "ab testing", "split testing", "online experiments", "product experiments"]],
  ]),

  // ── Web Development ─────────────────────────────────────────────────────
  ...ds("Web Development", [
    ["HTML & CSS", "html-css", ["html", "css", "html5", "css3", "html and css", "semantic html", "css grid", "flexbox"]],
    ["JavaScript", "javascript", ["js", "es6", "es2015", "javascript developer", "vanilla js", "modern javascript"]],
    ["TypeScript", "typescript", ["ts", "typescript developer", "typescript fundamentals", "typed javascript"]],
    ["React", "react", ["react.js", "reactjs", "react js", "react developer", "react hooks", "react ecosystem", "jsx"]],
    ["Next.js", "nextjs", ["next js", "nextjs developer", "next app router", "next.js developer"]],
    ["Vue", "vue", ["vue.js", "vuejs", "vue js", "vue 3", "nuxt", "nuxt.js"]],
    ["Angular", "angular", ["angular.js", "angularjs", "angular 2+", "angular developer"]],
    ["Svelte", "svelte", ["sveltekit", "svelte.js", "svelte developer"]],
    ["Node.js", "nodejs", ["node js", "nodejs developer", "node developer", "node backend"]],
    ["Express", "express", ["express.js", "expressjs", "express framework"]],
    ["NestJS", "nestjs", ["nest.js", "nest js", "nestjs framework"]],
    ["Django", "django", ["django rest framework", "drf", "django python"]],
    ["Ruby on Rails", "ruby-on-rails", ["rails", "ror", "ruby rails", "rails developer"]],
    ["PHP", "php", ["php developer", "php 8", "php backend"]],
    ["Laravel", "laravel", ["laravel php", "laravel developer", "laravel framework"]],
    ["WordPress", "wordpress", ["wp", "wordpress developer", "wordpress sites", "wordpress theme", "wordpress plugin"]],
    ["REST APIs", "rest-apis", ["rest api", "restful api", "restful apis", "api development", "api design", "http apis"]],
    ["GraphQL", "graphql", ["graphql api", "apollo", "apollo server", "graphql federation"]],
    ["Frontend Development", "frontend-development", ["front-end", "front end", "front end developer", "frontend developer", "client side development"]],
    ["Backend Development", "backend-development", ["back-end", "back end", "back end developer", "backend developer", "server side development"]],
    ["Full-Stack Development", "full-stack-development", ["fullstack", "full stack", "full stack developer", "full-stack developer", "end to end development"]],
    ["Web Accessibility", "web-accessibility", ["accessibility", "a11y", "wcag", "accessible web", "aria"]],
    ["Web Performance", "web-performance", ["performance", "page speed", "core web vitals", "web vitals", "lighthouse", "rendering performance"]],
  ]),

  // ── Mobile Development ──────────────────────────────────────────────────
  ...ds("Mobile Development", [
    ["iOS Development", "ios-development", ["ios developer", "ios app development", "iphone apps", "apple ecosystem"]],
    ["Swift", "swift", ["swift programming", "swift developer", "swift ui", "swiftui"]],
    ["Kotlin", "kotlin", ["kotlin developer", "kotlin programming", "kotlin android"]],
    ["Android Development", "android-development", ["android developer", "android app development", "android apps"]],
    ["React Native", "react-native", ["react native", "react native developer", "rn mobile"]],
    ["Flutter", "flutter", ["dart", "flutter developer", "flutter framework", "flutter apps"]],
  ]),

  // ── Design ──────────────────────────────────────────────────────────────
  ...ds("Design", [
    ["UI Design", "ui-design", ["user interface design", "ui", "interface design", "ui designer", "ui ux design"]],
    ["UX Design", "ux-design", ["user experience design", "ux", "ux designer", "ux research", "ux strategy", "usability"]],
    ["Product Design", "product-design", ["product designer", "product ui", "product ux", "digital product design"]],
    ["Graphic Design", "graphic-design", ["graphic designer", "visual design", "print design", "digital graphics"]],
    ["Web Design", "web-design", ["website design", "web designer", "website ui"]],
    ["Design Systems", "design-systems", ["design system", "component library", "design tokens", "ui kit"]],
    ["Figma", "figma", ["figma design", "figma prototyping", "figma to code", "figjam"]],
    ["Motion Graphics", "motion-graphics", ["motion design", "motion designer", "animation design", "after effects", "2d motion"]],
    ["Brand Identity", "brand-identity", ["branding", "brand design", "visual identity", "brand guidelines", "identity design"]],
    ["Illustration", "illustration", ["digital illustration", "illustrator", "editorial illustration"]],
    ["Typography", "typography", ["type design", "typeface", "font pairing", "typographic design"]],
    ["Logo Design", "logo-design", ["logo designer", "logo maker", "logotype", "brand logo"]],
    ["Prototyping", "prototyping", ["wireframing", "wireframes", "interactive prototypes", "clickable prototypes", "low fidelity", "high fidelity"]],
  ]),

  // ── Digital Marketing ───────────────────────────────────────────────────
  ...ds("Digital Marketing", [
    ["SEO", "seo", ["search engine optimization", "search engine optimisation", "seo specialist", "seo strategy", "on-page seo", "off-page seo", "technical seo", "organic traffic"]],
    ["SEM", "sem", ["search engine marketing", "search marketing", "paid search", "ppc search"]],
    ["Content Marketing", "content-marketing", ["content strategy", "content marketer", "content creation", "content distribution", "editorial marketing"]],
    ["Social Media Marketing", "social-media-marketing", ["smm", "social media manager", "social media strategy", "social marketing", "instagram marketing", "linkedin marketing", "twitter marketing", "tiktok marketing"]],
    ["Email Marketing", "email-marketing", ["email campaigns", "email marketer", "newsletter marketing", "email automation", "lifecycle email", "email deliverability"]],
    ["Marketing Analytics", "marketing-analytics", ["marketing data analysis", "marketing measurement", "marketing roi", "attribution", "marketing attribution"]],
    ["Performance Marketing", "performance-marketing", ["ppc", "paid media", "paid advertising", "performance advertising", "facebook ads", "google ads", "meta ads", "ad buying"]],
    ["Growth Marketing", "growth-marketing", ["growth hacking", "growth hacker", "growth marketer", "user acquisition"]],
    ["Copywriting", "copywriting", ["copy writer", "sales copy", "direct response copywriting", "ads copywriting", "conversion copywriting"]],
    ["Influencer Marketing", "influencer-marketing", ["influencer outreach", "creator marketing", "creator partnerships", "kol marketing"]],
    ["Affiliate Marketing", "affiliate-marketing", ["affiliate programs", "partner marketing", "affiliate manager"]],
    ["Marketing Automation", "marketing-automation", ["lifecycle automation", "marketing ops", "drip campaigns", "marketing operations", "martech"]],
    ["Conversion Rate Optimization", "cro", ["cro", "conversion optimization", "conversion optimisation", "landing page optimization", "funnel optimization"]],
    ["Google Analytics", "google-analytics", ["ga4", "google analytics 4", "universal analytics", "web analytics"]],
    ["Tag Management", "tag-management", ["google tag manager", "gtm", "tracking implementation", "pixel setup"]],
    ["Marketplace Marketing", "marketplace-marketing", ["amazon marketing", "etsy marketing", "marketplace seo", "app store optimization", "aso"]],
  ]),

  // ── Sales & Customer Growth ─────────────────────────────────────────────
  ...ds("Sales & Customer Growth", [
    ["Sales", "sales", ["b2b sales", "sales outreach", "inside sales", "field sales", "sales closing", "sales pipeline"]],
    ["CRM", "crm", ["customer relationship management", "salesforce", "hubspot", "salesforce crm", "crm management", "salesforce admin"]],
    ["Lead Generation", "lead-generation", ["lead gen", "lead generation strategy", "b2b lead generation", "prospecting", "outbound sales"]],
    ["Sales Development", "sales-development", ["sdr", "bdr", "sales development representative", "business development representative", "cold outreach", "cold email"]],
    ["Customer Success", "customer-success", ["customer success manager", "csm", "client success", "customer retention", "onboarding"]],
    ["Account Management", "account-management", ["key accounts", "account executive", "ae", "enterprise sales", "account planning"]],
  ]),

  // ── Product & Project Management ────────────────────────────────────────
  ...ds("Product & Project Management", [
    ["Product Management", "product-management", ["product manager", "pm", "product owner", "product strategy", "product roadmap"]],
    ["Product Strategy", "product-strategy", ["go to market", "gtm strategy", "product positioning", "product discovery"]],
    ["Project Management", "project-management", ["project manager", "pmp", "prince2", "project planning", "project delivery"]],
    ["Agile & Scrum", "agile-scrum", ["agile", "scrum", "scrum master", "agile coach", "kanban", "sprint planning", "agile ceremonies"]],
    ["Business Analysis", "business-analysis", ["business analyst", "ba", "requirements gathering", "functional specification", "stakeholder analysis"]],
    ["Program Management", "program-management", ["program manager", "technical program manager", "tpm", "portfolio management"]],
    ["Stakeholder Management", "stakeholder-management", ["stakeholder engagement", "executive communication", "cross functional leadership"]],
    ["Technical Writing", "technical-writing", ["technical writer", "documentation", "technical documentation", "docs", "knowledge base writing"]],
  ]),

  // ── Cloud & Infrastructure ──────────────────────────────────────────────
  ...ds("Cloud & Infrastructure", [
    ["AWS", "aws", ["amazon web services", "aws certified", "aws solutions architect", "aws cloud"]],
    ["Microsoft Azure", "azure", ["azure cloud", "azure devops", "azure solutions architect", "ms azure"]],
    ["Google Cloud Platform", "gcp", ["gcp", "google cloud", "google cloud platform", "gcp certification", "cloud run"]],
    ["Cloud Computing", "cloud-computing", ["cloud", "cloud architecture", "cloud strategy", "cloud migration", "multicloud"]],
    ["DevOps", "devops", ["devops engineer", "devops practices", "devops pipeline", "platform engineering", "cicd devops"]],
    ["Docker", "docker", ["containerization", "containers", "docker containers", "container orchestration"]],
    ["Kubernetes", "kubernetes", ["k8s", "kubernetes administrator", "k8s clusters", "orchestration"]],
    ["CI/CD", "ci-cd", ["continuous integration", "continuous deployment", "ci cd", "continuous delivery", "jenkins", "github actions", "gitlab ci"]],
    ["Terraform", "terraform", ["infrastructure as code", "iac", "terraform cloud", "opentofu"]],
    ["Linux", "linux", ["linux administration", "linux server", "bash", "shell scripting", "linux fundamentals", "ubuntu"]],
    ["Site Reliability Engineering", "sre", ["sre", "site reliability", "reliability engineering", "incident response", "on call"]],
  ]),

  // ── Cybersecurity ───────────────────────────────────────────────────────
  ...ds("Cybersecurity", [
    ["Cybersecurity", "cybersecurity", ["information security", "infosec", "cyber security", "security fundamentals", "it security"]],
    ["Ethical Hacking", "ethical-hacking", ["penetration testing", "penetration test", "penetration tester", "pen testing", "pen-testing", "pentest", "pentests", "pentesting", "red team", "offensive security", "ceh"]],
    ["Network Security", "network-security", ["network defense", "firewall", "ids ips", "network monitoring", "wireshark"]],
    ["Cloud Security", "cloud-security", ["aws security", "azure security", "cloud iam", "cloud compliance"]],
    ["Security Operations", "security-operations", ["soc", "soc analyst", "security operations center", "siem", "splunk", "threat detection", "blue team"]],
    ["Application Security", "application-security", ["appsec", "secure coding", "owasp", "web security", "penetration testing web"]],
    ["Digital Forensics", "digital-forensics", ["dfir", "forensics", "incident forensics", "malware analysis"]],
    ["Identity & Access Management", "iam", ["iam", "identity management", "access management", "single sign on", "sso", "zero trust"]],
  ]),

  // ── Quality Assurance & Testing ─────────────────────────────────────────
  ...ds("Quality Assurance & Testing", [
    ["QA Testing", "qa-testing", ["quality assurance", "qa", "qa analyst", "qa engineer", "software testing", "testing fundamentals"]],
    ["Test Automation", "test-automation", ["automation testing", "selenium", "cypress", "playwright", "test automation engineer", "e2e testing"]],
    ["Manual Testing", "manual-testing", ["manual qa", "exploratory testing", "test cases", "regression testing"]],
    ["Performance Testing", "performance-testing", ["load testing", "stress testing", "jmeter", "k6", "performance qa"]],
  ]),

  // ── Creative & Media ────────────────────────────────────────────────────
  ...ds("Creative & Media", [
    ["Video Editing", "video-editing", ["video editor", "premiere pro", "final cut pro", "premiere", "davinci resolve", "video production"]],
    ["Content Creation", "content-creation", ["content creator", "youtube", "youtube growth", "creator economy", "tiktok creation"]],
    ["Photography", "photography", ["adobe lightroom", "lightroom", "photo editing", "photo retouching", "portrait photography"]],
    ["Podcasting", "podcasting", ["podcast", "podcast host", "podcast production", "podcast editing"]],
    ["Audio Production", "audio-production", ["audio editing", "audio engineer", "sound design", "music production", "mixing and mastering"]],
    ["Animation", "animation", ["2d animation", "3d animation", "motion animation", "after effects animation", "animated video"]],
    ["3D Modeling", "3d-modeling", ["blender", "3d design", "3d artist", "cinema 4d", "3d rendering"]],
    ["Scriptwriting", "scriptwriting", ["script writing", "video script", "youtube script", "screenplay", "storyboard writing"]],
  ]),

  // ── No-Code & Automation ───────────────────────────────────────────────
  ...ds("No-Code & Automation", [
    ["No-Code Development", "no-code-development", ["no-code", "low-code", "no code", "citizen developer", "no code tools"]],
    ["Workflow Automation", "workflow-automation", ["zapier", "make.com", "n8n", "automation workflows", "process automation", "workflow tools", "ifttt"]],
    ["Notion", "notion", ["notion workflows", "notion databases", "notion systems", "notion for teams"]],
    ["Airtable", "airtable", ["airtable base", "airtable automation", "airtable database"]],
    ["Bubble", "bubble", ["bubble.io", "bubble no code", "bubble app"]],
    ["Webflow", "webflow", ["webflow design", "webflow developer", "webflow sites"]],
  ]),

  // ── E-commerce & Business ───────────────────────────────────────────────
  ...ds("E-commerce & Business", [
    ["E-commerce Management", "ecommerce-management", ["ecommerce", "e-commerce", "online store", "ecommerce manager", "online business"]],
    ["Shopify", "shopify", ["shopify store", "shopify expert", "shopify setup", "shopify apps"]],
    ["Dropshipping", "dropshipping", ["dropshipping business", "dropship", "dropshipping store"]],
    ["Amazon FBA", "amazon-fba", ["fba", "fulfillment by amazon", "amazon seller", "amazon fba business"]],
    ["Business Strategy", "business-strategy", ["business development", "corporate strategy", "strategy consulting", "market strategy"]],
    ["Digital Transformation", "digital-transformation", ["digital innovation", "digital strategy", "business digitization", "digital adoption"]],
    ["Entrepreneurship", "entrepreneurship", ["startup", "founder", "startup growth", "bootstrapping", "building a business"]],
    ["Operations Management", "operations-management", ["operations", "ops", "process improvement", "operational excellence", "supply chain"]],
  ]),

  // ── Office & Digital Productivity ───────────────────────────────────────
  ...ds("Office & Digital Productivity", [
    ["Microsoft Office", "microsoft-office", ["ms office", "office suite", "word", "powerpoint", "excel powerpoint", "office 365"]],
    ["Google Workspace", "google-workspace", ["google apps", "g suite", "google docs", "google slides", "workspace admin"]],
    ["Computer Fundamentals", "computer-fundamentals", ["computer literacy", "digital literacy", "basic computer skills", "ict fundamentals", "digital skills basics"]],
    ["Data Entry", "data-entry", ["typing", "data capture", "spreadsheet data entry", "virtual data entry"]],
    ["Virtual Assistance", "virtual-assistance", ["virtual assistant", "remote assistant", "va", "online assistant"]],
    ["Content Writing", "content-writing", ["content writer", "blogging", "blog writing", "blog posts", "seo writing", "article writing"]],
  ]),

  // ── Emerging Technology ─────────────────────────────────────────────────
  ...ds("Emerging Technology", [
    ["Blockchain", "blockchain", ["crypto", "cryptocurrency", "web3", "smart contracts", "solidity", "distributed ledger"]],
    ["Internet of Things", "iot", ["iot", "embedded systems", "firmware", "connected devices", "sensors"]],
    ["Robotics", "robotics", ["robot programming", "ros", "robotics engineering", "autonomous systems"]],
    ["AR & VR", "ar-vr", ["augmented reality", "virtual reality", "extended reality", "xr", "mixed reality", "immersive experiences"]],
  ]),
];

/**
 * The categories in outline order — useful when rendering the skill set as
 * groups (e.g. an admin taxonomy view) without re-deriving the ordering.
 */
export const DIGITAL_SKILL_CATEGORIES: readonly string[] = [
  ...new Set(DIGITAL_SKILLS.map((skill) => skill.category)),
];

// ── Matching ─────────────────────────────────────────────────────────────

interface PreparedSkill {
  skill: DigitalSkill;
  /** The label plus all aliases, lowercased — the needles for substring tests. */
  needles: readonly string[];
  /** The label, lowercased, for prefix/exact ranking. */
  labelNeedle: string;
}

const PREPARED: readonly PreparedSkill[] = DIGITAL_SKILLS.map((skill) => {
  const labelNeedle = normalizeSearchTerm(skill.label);
  return {
    skill,
    labelNeedle,
    needles: [labelNeedle, ...skill.keywords.map((k) => k.toLowerCase())],
  };
});

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A needle with non-word punctuation still matches inside prose: "c++" in
 *  "i want to learn c++" would fail a bare word boundary on the "+", so the
 *  edges are checked against non-alphanumeric characters rather than \b. */
const edgeRegex = (needle: string): RegExp =>
  new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`, "i");

export interface SkillMatch {
  skill: DigitalSkill;
  /** Lower is better: 0 exact label · 1 label prefix · 2 exact alias · 3 alias prefix · 4 label contains · 5 alias contains */
  rank: number;
  /** The needle that matched — for highlighting, not for search. */
  matched: string;
}

function rankSkill(
  term: string,
  prepared: PreparedSkill,
): SkillMatch | null {
  const { labelNeedle, needles, skill } = prepared;

  if (labelNeedle === term) return { skill, rank: 0, matched: labelNeedle };
  if (labelNeedle.startsWith(term)) return { skill, rank: 1, matched: term };

  const exactAlias = needles.find((n) => n !== labelNeedle && n === term);
  if (exactAlias) return { skill, rank: 2, matched: exactAlias };

  const prefixAlias = needles.find((n) => n !== labelNeedle && n.startsWith(term));
  if (prefixAlias) return { skill, rank: 3, matched: term };

  if (labelNeedle.includes(term)) return { skill, rank: 4, matched: term };

  const containsAlias = needles.find((n) => n !== labelNeedle && n.includes(term));
  if (containsAlias) return { skill, rank: 5, matched: term };

  return null;
}

/**
 * Skills whose name or aliases match `raw`, best first.
 *
 * Used for the as-you-type hints under the composer: the result powers the
 * "digital skill detected" affordance, so it is ranked for *guessing what the
 * learner means*, not for generosity — a two-letter draft returns a handful of
 * prefix hits and nothing else.
 */
export function matchDigitalSkills(
  raw: string,
  limit = 5,
): SkillMatch[] {
  const term = normalizeSearchTerm(raw);
  if (term.length === 0) return [];

  const hits: SkillMatch[] = [];
  for (const prepared of PREPARED) {
    const match = rankSkill(term, prepared);
    if (match) hits.push(match);
  }
  hits.sort(
    (a, b) => a.rank - b.rank || a.skill.label.localeCompare(b.skill.label),
  );
  return hits.slice(0, Math.max(1, limit));
}

/**
 * The single most likely skill in a free-text message, or `null`.
 *
 * A learner typing "show me data analysis courses" should trigger the same
 * course search as someone typing "Data Analysis", so this scans the whole
 * message for alias occurrences with alphanumeric edges on both sides. The
 * longest alias wins: "data analysis" beats "analysis" if both appear, and
 * "power bi" beats "bi" — the more specific reading is almost always the
 * intended one.
 */
export function findDigitalSkillInText(raw: string): DigitalSkill | null {
  const text = normalizeSearchTerm(raw);
  if (text.length === 0) return null;

  let best: { skill: DigitalSkill; matchedLength: number } | null = null;
  for (const { skill, needles } of PREPARED) {
    for (const needle of needles) {
      if (needle.length < 2) continue;
      if (!text.includes(needle)) continue;
      if (!edgeRegex(needle).test(text)) continue;
      if (!best || needle.length > best.matchedLength) {
        best = { skill, matchedLength: needle.length };
      }
      // A skill's own label matched completely — no alias of it can beat that.
      if (needle === normalizeSearchTerm(skill.label)) break;
    }
  }
  return best?.skill ?? null;
}
