/**
 * Paid blueprints 3-4: Personal Cybersecurity + Email Marketing That Converts.
 * Consumed by seedPaidSkills.ts through compileCourse() in seedSkillsKit.ts.
 */

import {
  blank,
  compileCourse,
  tf,
  type SkillCourseBlueprint,
} from "./seedSkillsKit";

const cybersecurity: SkillCourseBlueprint = {
  title: "Personal Cybersecurity",
  slug: "cybersecurity-basics",
  category: "Security",
  level: "Beginner",
  description:
    "Eight practical modules for protecting yourself and the people you work with. Build a personal threat model, move off reused passwords, turn on strong multi-factor authentication, recognise social engineering, keep devices and backups current, reduce data exposure, browse safely on hostile networks, and know exactly what to do when something goes wrong. Every module has two articles, an interactive walkthrough, two mixed-type knowledge checks and a graded assignment.",
  interactiveSlides: true,
  modules: [
    {
      title: "A Threat Model for a Normal Person",
      concepts: [
        ["Assets, adversaries, access", "List what you must protect, who might want it, and how they could reach it. A model turns vague worry into a short list of controls.", "Assets: email, bank, client files. Adversaries: opportunistic criminals."],
        ["Likelihood beats novelty", "Credential stuffing and phishing cause far more loss than exotic zero-days. Spend effort on the boring, common paths first.", "Reused password plus a breached site is a realistic attack chain."],
        ["Your threat model is not everyone's", "A journalist and an accountant face different adversaries. Copying a checklist without understanding it leaves gaps.", "Add 'targeted harassment' only if it genuinely applies to you."],
      ],
      workflow: ["Write down your top five assets.", "Name the realistic adversaries for each.", "Note the plausible entry paths.", "Pick the two controls that close the most paths."],
      pitfalls: ["Buying a tool before identifying a threat it addresses.", "Assuming 'I am not important' means 'I am not a target' — automation does not care."],
      questions: [
        ["Which threat causes more real-world loss than exotic exploits?", "Credential reuse and phishing", "Zero-day attacks", "Physical vault breaches", "Satellite interception"],
        tf("A threat model is only useful for large companies.", false),
        ["What is the first step in a personal threat model?", "List the assets you must protect", "Buy antivirus", "Change every password daily", "Disable the internet"],
        ["Which belong in a basic threat model?", ["Assets", "Adversaries", "Entry paths"], "Software brands", "Favourite colours", "Office furniture"],
        ["Why prioritise common attacks?", "They account for most actual harm", "They are more interesting", "They are cheaper to ignore", "They never change"],
        blank("Automated attacks do not care whether you are ______.", "important", "famous"),
      ],
      takeaway: "List assets, adversaries and entry paths. Defend the common routes before the exotic ones.",
      assignment: {
        title: "Write your personal threat model",
        instructions: "List five assets, three realistic adversaries and the entry paths that connect them. Rank the top two controls by how many paths they close. Submit the one-page model in 300 words or less.",
        maxPoints: 100,
      },
    },
    {
      title: "Passwords and Password Managers",
      concepts: [
        ["Reuse is the real vulnerability", "One breached site hands criminals credentials for every other site using that password. Length alone does not help if it is shared.", "A 20-character password reused on ten sites is weaker than a unique 12-character one."],
        ["Managers generate and fill", "A manager creates unique random passwords and fills only on the matching domain, which also defeats many phishing pages.", "Let the manager generate; never type a master password into a site."],
        ["Recovery is part of security", "A manager is only useful if you can recover it. Store the recovery phrase offline and set a trusted emergency contact where supported.", "Print the recovery kit and keep it where you keep important documents."],
      ],
      workflow: ["Choose a reputable manager.", "Move your email account first, then financial accounts.", "Enable auto-generated passwords.", "Store the recovery kit offline."],
      pitfalls: ["Keeping a plaintext spreadsheet of passwords 'just while migrating'.", "Using the manager's master password on a website by mistake."],
      questions: [
        ["Why is password reuse dangerous?", "One breach unlocks every site using it", "It is slower to type", "Sites forbid long passwords", "It uses more memory"],
        tf("A very long password is safe to reuse across sites.", false),
        ["What does domain-matched autofill help prevent?", "Phishing pages on lookalike domains", "Slow typing", "Forgotten usernames", "Browser crashes"],
        ["Which are manager hygiene steps?", ["Unique generated passwords", "Offline recovery kit", "Domain-matched autofill"], "Plaintext spreadsheet", "One master password per site", "Sharing the vault"],
        ["Which account should you migrate first?", "Your primary email", "A forum you rarely use", "A game account", "Any random site"],
        blank("A manager's recovery phrase should be stored ______.", "offline"),
      ],
      takeaway: "Unique passwords, generated and filled by a manager, with a recovery plan you have tested.",
      assignment: {
        title: "Password migration plan",
        instructions: "Choose a manager and write a migration order for ten of your accounts, with primary email first. Document where you will keep the recovery kit and how you will test recovery. Submit the plan without listing any real passwords.",
        maxPoints: 110,
      },
    },
    {
      title: "Multi-Factor Authentication Done Right",
      concepts: [
        ["Something you have beats SMS", "Authenticator apps and security keys resist SIM swapping and interception. SMS is better than nothing but is the weakest common factor.", "Move critical accounts from SMS to an app or hardware key."],
        ["Phishing-resistant factors", "Passkeys and hardware keys bind the login to the real domain, so a lookalike page cannot harvest them.", "A passkey simply will not offer itself on the wrong domain."],
        ["Backup codes", "MFA lockouts are common. Store backup codes offline and record which account each set belongs to.", "Print codes and label them; do not keep them only in the same manager."],
      ],
      workflow: ["Enable MFA on email and financial accounts first.", "Prefer passkeys or an authenticator app over SMS.", "Save backup codes offline.", "Test recovery once and record the steps."],
      pitfalls: ["Approving a push notification you did not trigger — deny it.", "Keeping backup codes only inside the account they protect."],
      questions: [
        ["Which factor is strongest against SIM swapping?", "A hardware security key", "SMS code", "Security question", "Email link"],
        tf("Approving an unexpected MFA push is harmless if you are busy.", false),
        ["Why are passkeys phishing-resistant?", "They are bound to the real domain", "They are longer", "They expire every minute", "They need no device"],
        ["Which are good MFA habits?", ["Backup codes offline", "Authenticator over SMS", "Test recovery once"], "SMS everywhere", "Approve all prompts", "No backup"],
        ["What should you do with an unexpected MFA prompt?", "Deny it and change the password", "Approve it quickly", "Ignore it forever", "Delete the app"],
        blank("Backup codes should be kept ______, not only inside the protected account.", "offline"),
      ],
      takeaway: "Prefer passkeys or keys, keep backup codes offline, and deny prompts you did not start.",
      assignment: {
        title: "MFA upgrade log",
        instructions: "List eight accounts and their current second factor. Choose three to upgrade and record the new method, where backup codes live, and the result of one recovery test. Submit the log with no real codes included.",
        maxPoints: 110,
      },
    },
    {
      title: "Phishing and Social Engineering",
      concepts: [
        ["Urgency is the tell", "Phishing compresses your decision time: 'act now', 'account locked', 'verify immediately'. Real institutions rarely demand instant action by message.", "Pause and open the site yourself instead of clicking the link."],
        ["Check the destination", "Hover links and read the actual domain, not the display text. Lookalike domains swap characters or add a hyphen.", "paypa1.com is not paypal.com."],
        ["Out-of-band verification", "Confirm unusual requests through a channel you already trust: a saved phone number, a known address, an in-app message.", "Call the colleague on their saved number before paying a changed invoice."],
      ],
      workflow: ["Notice the urgency.", "Inspect the real destination.", "Open the service directly.", "Verify money or data requests out of band."],
      pitfalls: ["Trusting a display name instead of the sender address.", "Letting a plausible conversation override a verification step."],
      questions: [
        ["What is the most common phishing pressure tactic?", "Manufactured urgency", "Polite greetings", "Long explanations", "Formal formatting"],
        tf("A sender's display name is sufficient proof of who wrote the email.", false),
        ["What does out-of-band verification mean?", "Confirming through a separate trusted channel", "Replying to the same email", "Clicking the link twice", "Waiting one hour"],
        ["Which are phishing warning signs?", ["Unexpected urgency", "Lookalike domain", "Request to bypass normal process"], "Correct domain", "Saved contact", "Known writing style"],
        ["What should you do with a suspicious invoice change?", "Call a saved number to verify", "Pay quickly to be safe", "Reply asking for bank details", "Forward it to colleagues"],
        blank("Read the actual link ______, not the display text.", "destination", "domain", "URL"),
      ],
      takeaway: "Slow down, read the real domain, and verify money or data requests through a channel you already trust.",
      assignment: {
        title: "Phishing teardown",
        instructions: "Collect or write three phishing examples. For each, mark the urgency cue, the real destination, and the out-of-band check that would defeat it. Write 150 words on which you found most convincing and why.",
        maxPoints: 120,
      },
    },
    {
      title: "Devices, Updates and Backups",
      concepts: [
        ["Patch promptly", "Most successful malware exploits known, unpatched vulnerabilities. Automatic updates close the window.", "Enable automatic OS and browser updates and reboot when asked."],
        ["Full-disk encryption", "Encryption protects data if a laptop is lost. It only helps when the machine is off, so lock the screen when you step away.", "Verify encryption is on; store the recovery key separately."],
        ["3-2-1 backups", "Three copies, two media, one off-site. Test a restore — an untested backup is a hope, not a backup.", "Keep one copy offline or on a separate account to survive ransomware."],
      ],
      workflow: ["Turn on automatic updates.", "Verify disk encryption and recovery key.", "Set an automatic backup with version history.", "Perform one test restore."],
      pitfalls: ["Backing up to the same account ransomware can reach.", "Postponing reboots for weeks."],
      questions: [
        ["Why do patches matter so much?", "They close known exploited vulnerabilities", "They change the wallpaper", "They reduce battery size", "They remove the need for passwords"],
        tf("A backup you have never restored is definitely reliable.", false),
        ["What does the '1' in 3-2-1 mean?", "One copy off-site", "One device", "One file", "One password"],
        ["Which are backup hygiene steps?", ["Version history", "Off-site copy", "Test restore"], "Single copy on the same disk", "No schedule", "Same credentials everywhere"],
        ["Why keep a backup copy offline?", "Ransomware cannot encrypt it too", "It is faster", "It uses less space", "It is required by law"],
        blank("Encryption mainly protects a lost device when it is ______.", "off", "locked"),
      ],
      takeaway: "Patch automatically, encrypt the disk, and keep a tested off-site backup with version history.",
      assignment: {
        title: "Backup and restore drill",
        instructions: "Configure automatic updates and a backup with version history on one device. Perform a real restore of one file to a different location. Submit a screenshot of the settings, the restore steps and a note on what would happen if ransomware hit the device now.",
        maxPoints: 120,
      },
    },
    {
      title: "Privacy and Data Exposure",
      concepts: [
        ["Data minimisation", "The least data you give, the less can leak. Decline optional fields and review app permissions periodically.", "A weather app does not need your contacts."],
        ["Public records and oversharing", "Birthdays, pet names and travel photos feed password guesses and social engineering.", "Delay posting photos until after you return."],
        ["Permission audits", "Review connected apps and revoke ones you no longer use. Old integrations keep tokens long after you forgot them.", "Remove third-party apps from email and cloud accounts quarterly."],
      ],
      workflow: ["Audit app permissions.", "Revoke unused integrations.", "Reduce optional profile data.", "Delay posting location and travel details."],
      pitfalls: ["Signing in with a social account on every site, creating a chain of shared risk.", "Assuming 'private' settings never change after an update."],
      questions: [
        ["What is data minimisation?", "Giving only the data a task truly needs", "Deleting all accounts", "Using one password everywhere", "Posting less often"],
        tf("Old third-party app integrations stop working on their own after a year.", false),
        ["Why delay travel photos?", "They reveal when your home is empty", "They use more data", "They are lower quality", "They cost money"],
        ["Which are privacy hygiene steps?", ["Revoke unused app access", "Decline optional fields", "Review settings after updates"], "Share every sign-in", "Post live location", "Keep all old tokens"],
        ["What does a social login chain create?", "Shared risk across many services", "Better passwords", "Free storage", "Automatic backups"],
        blank("The less data you give, the less can ______.", "leak"),
      ],
      takeaway: "Give less, revoke stale access, and think about what a stranger could infer from your posts.",
      assignment: {
        title: "Privacy audit",
        instructions: "Audit one email or cloud account. List every connected app, revoke at least three you no longer use, and reduce two optional profile fields. Submit a before/after list and a 150-word note on what you would check quarterly.",
        maxPoints: 120,
      },
    },
    {
      title: "Safe Browsing and Networks",
      concepts: [
        ["HTTPS and its limits", "The padlock means the connection is encrypted, not that the site is honest. Phishing sites use HTTPS too.", "Check the domain, not just the padlock."],
        ["Public Wi-Fi", "On open networks, assume others can observe traffic. Use HTTPS, avoid sensitive transactions, or use a trusted VPN you understand.", "Do not do banking on a café network you cannot verify."],
        ["Downloads and extensions", "Browser extensions run with broad privileges. Install few, from known publishers, and remove ones you stopped using.", "Review extension permissions before installing."],
      ],
      workflow: ["Verify the domain before entering credentials.", "Prefer mobile data or a trusted VPN on public networks.", "Limit and review extensions.", "Keep the browser updated."],
      pitfalls: ["Trusting a padlock as a trust signal.", "Installing a free extension that reads every page you visit."],
      questions: [
        ["What does the HTTPS padlock guarantee?", "The connection is encrypted", "The site is legitimate", "The site is fast", "The site is free"],
        tf("A phishing site can have a valid HTTPS certificate.", true),
        ["What is the safest choice on an unknown public network?", "Use mobile data or a trusted VPN", "Do sensitive banking anyway", "Disable the browser", "Share the network password"],
        ["Which are safe browsing habits?", ["Check the real domain", "Few reviewed extensions", "Updated browser"], "Trust the padlock", "Install every free extension", "Ignore certificate warnings"],
        ["Why review extension permissions?", "They can read pages and data", "It speeds up the browser", "It is required for updates", "It removes ads automatically"],
        blank("Encryption protects the connection, not the site's ______.", "honesty", "identity", "legitimacy"),
      ],
      takeaway: "Read the domain, not the padlock. Limit extensions and treat open networks as observable.",
      assignment: {
        title: "Browser hardening pass",
        instructions: "Audit your main browser: list installed extensions and remove at least two you do not need, enable automatic updates, and review one security setting. Submit the before/after list and a 150-word note on one risk you reduced.",
        maxPoints: 110,
      },
    },
    {
      title: "Incident Response and Recovery",
      concepts: [
        ["First actions", "If an account is compromised: change its password from a clean device, end active sessions, then check recovery email and forwarding rules.", "Attackers often add a forwarding rule to keep receiving mail after you change the password."],
        ["Containment before cleanliness", "Disconnect an infected device from the network before wiping it, so it cannot spread or keep exfiltrating.", "Wi-Fi off first, investigation second."],
        ["Tell the right people", "Report financial fraud quickly; many jurisdictions have time limits. Tell your workplace if work data may be involved.", "Speed of reporting often determines recovery."],
      ],
      workflow: ["Disconnect and contain.", "Change credentials from a clean device.", "Revoke sessions and check forwarding rules.", "Report and document the timeline."],
      pitfalls: ["Formatting a device before preserving evidence.", "Changing the password but leaving active sessions running."],
      questions: [
        ["What should you do first with a suspected infected laptop?", "Disconnect it from the network", "Format it immediately", "Keep using it", "Post about it online"],
        tf("Changing a password always ends all attacker sessions.", false),
        ["Why check mail forwarding rules after a compromise?", "Attackers use them to keep reading your mail", "They improve deliverability", "They are required by law", "They reduce spam"],
        ["Which are correct response steps?", ["Revoke active sessions", "Change password from a clean device", "Report quickly"], "Keep the device online", "Delete all logs", "Wait a week"],
        ["Why report financial fraud fast?", "Time limits often apply", "It is polite", "It lowers fees", "It removes the need for records"],
        blank("Contain the incident before attempting to ______ it.", "clean", "wipe"),
      ],
      takeaway: "Contain first, revoke sessions, check persistence tricks, and report quickly with a timeline.",
      assignment: {
        title: "Personal incident runbook",
        instructions: "Write a one-page runbook for two scenarios: a compromised email account and a lost laptop. List the first three actions, who to contact, and what to record. Ask a colleague to read it and note any step they would not know how to do.",
        maxPoints: 130,
      },
    },
  ],
  toolkit: {
    fileName: "personal-cybersecurity-toolkit.md",
    body: `# Personal Cybersecurity Toolkit

## Threat model
- [ ] Five assets written down
- [ ] Realistic adversaries named
- [ ] Top two controls chosen

## Credentials
- [ ] Unique passwords for every site
- [ ] Manager with domain-matched autofill
- [ ] Primary email migrated first
- [ ] Recovery kit stored offline

## MFA
- [ ] Email and financial accounts protected
- [ ] Passkeys or authenticator, not SMS
- [ ] Backup codes offline and labelled
- [ ] Recovery tested once

## Devices
- [ ] Automatic updates on
- [ ] Full-disk encryption verified
- [ ] Backups with version history and off-site copy
- [ ] One restore tested

## Daily habits
- [ ] Urgency treated as a warning sign
- [ ] Real domain checked before credentials
- [ ] Money requests verified out of band
- [ ] Extensions reviewed and kept few

## If something happens
- [ ] Disconnect and contain
- [ ] Change credentials from a clean device
- [ ] Revoke sessions and check forwarding rules
- [ ] Report quickly, keep a timeline
`,
  },
  capstone: {
    title: "Personal Security Operating Kit",
    description:
      "Produce a complete kit: a one-page threat model, a password migration log, an MFA upgrade log with a tested recovery, a backup restore screenshot, and two incident runbooks. Every claim must be backed by something you actually did and can show.",
    techStack: ["Threat modelling", "Credential hygiene", "MFA", "Backups", "Incident response"],
    outcome: "A kit you can hand to a family member and a record of what is already in place.",
  },
  showcase: {
    title: "Phishing Teardown Portfolio",
    description:
      "Three annotated phishing examples showing the urgency cue, the real destination and the verification step that defeats each. Written for a non-technical reader.",
    techStack: ["Social engineering analysis", "Technical writing"],
    outcome: "A public-facing piece that demonstrates practical security judgment.",
  },
};

const emailMarketing: SkillCourseBlueprint = {
  title: "Email Marketing That Converts",
  slug: "email-marketing",
  category: "Marketing",
  level: "Beginner to Intermediate",
  description:
    "Eight modules on building an email channel people actually want to read. Cover consent and deliverability, list building and segmentation, subject lines, copy and calls to action, accessible design, lifecycle automation, measurement, and compliance at scale. Every module has two articles, an interactive walkthrough, two mixed-type knowledge checks and a graded assignment.",
  interactiveSlides: true,
  modules: [
    {
      title: "Consent, Deliverability and the Inbox",
      concepts: [
        ["Permission is the asset", "A list of people who asked to hear from you beats a larger purchased list. Consent protects deliverability and reputation.", "Double opt-in adds one step and removes most bad addresses."],
        ["Reputation is cumulative", "Complaints, hard bounces and spam traps lower sender reputation for everyone on the domain, not just one campaign.", "Clean the list rather than mailing through the problem."],
        ["Authentication basics", "SPF, DKIM and DMARC prove you are allowed to send for the domain. Without them, even wanted mail can be filtered.", "Publish DMARC in monitoring mode before enforcing it."],
      ],
      workflow: ["Confirm consent for every address.", "Set SPF, DKIM and DMARC.", "Sunset unengaged subscribers.", "Watch complaints and bounces, not just opens."],
      pitfalls: ["Buying a list to 'move quickly'.", "Treating a spam complaint as the recipient's problem."],
      questions: [
        ["Why is a permission-based list better?", "It protects reputation and engagement", "It is quicker to buy", "It needs no authentication", "It is larger by definition"],
        tf("Hard bounces have no effect on sender reputation.", false),
        ["What do SPF, DKIM and DMARC do?", "Prove sending authorisation for the domain", "Write the subject line", "Increase image size", "Remove unsubscribes"],
        ["Which are deliverability hygiene steps?", ["Double opt-in", "Sunset unengaged users", "Monitor complaints"], "Buy a list", "Ignore bounces", "Skip authentication"],
        ["What is the right response to a spam complaint?", "Suppress the address and review why it happened", "Send more often", "Blame the recipient", "Ignore it"],
        blank("Sender reputation is ______: one bad campaign affects the next.", "cumulative"),
      ],
      takeaway: "Protect reputation with real consent, authentication and list hygiene. The inbox is earned.",
      assignment: {
        title: "Deliverability audit",
        instructions: "Audit one sending domain: document consent capture, authentication records, complaint and bounce handling, and one hygiene rule. Submit the audit with a 150-word note on the highest-risk gap.",
        maxPoints: 110,
      },
    },
    {
      title: "List Building and Segmentation",
      concepts: [
        ["Value exchange", "People subscribe for a specific promise. State what they get and how often; vague 'newsletter' boxes convert poorly.", "'One practical email a week on X' beats 'Stay in the loop'."],
        ["First-party data", "Collect the few fields that change what you send. Every optional field you do not use adds friction.", "Ask for role, not favourite colour."],
        ["Segmentation by behaviour", "What someone clicked or bought is more useful than their job title. Start with three segments you can act on.", "Engaged / lapsed / never-engaged."],
      ],
      workflow: ["Define the subscription promise.", "Ask only for fields you will use.", "Tag by source and behaviour.", "Send differently to at least three segments."],
      pitfalls: ["Collecting data you never act on.", "Mailing the whole list the same thing and calling it personalisation."],
      questions: [
        ["What should a signup box promise?", "A specific benefit and frequency", "A vague invitation", "The whole catalogue", "Nothing"],
        tf("Collecting more fields always improves email performance.", false),
        ["Which data is most actionable?", "Behaviour such as clicks and purchases", "Favourite colour", "Star sign", "Screen size"],
        ["Which are good segmentation axes?", ["Engagement", "Purchase history", "Signup source"], "Random numbers", "Font preference", "Time zone guess"],
        ["Why ask only usable fields?", "It reduces friction without losing value", "It is required by law", "It improves deliverability directly", "It removes the need for consent"],
        blank("A behavioural segment groups people by what they ______.", "did", "clicked"),
      ],
      takeaway: "Promise something specific, collect only what you will use, and segment by behaviour.",
      assignment: {
        title: "List-building plan",
        instructions: "Design one signup flow with a clear promise, two fields maximum and three behavioural segments. Explain what you would send differently to each. Submit the copy and a short rationale.",
        maxPoints: 110,
      },
    },
    {
      title: "Subject Lines and Preheaders",
      concepts: [
        ["Specificity beats cleverness", "A subject that states the value or the news outperforms a puzzle. Curiosity without payoff costs trust.", "'Your invoice is ready' beats 'You will not believe this'."],
        ["The preheader is a second line", "The snippet after the subject is prime space. Write it deliberately and do not let it repeat the subject.", "Subject: 'March report'. Preheader: 'Three changes and what they mean for your team.'"],
        ["Test honestly", "Subject tests need enough volume and one changed variable. A winner on twenty sends is noise.", "Split on one element and wait for significance."],
      ],
      workflow: ["Write the value in one line.", "Add a complementary preheader.", "Remove filler and clickbait.", "Test one variable with adequate volume."],
      pitfalls: ["All-caps and exclamation marks as a strategy.", "A preheader that reads 'View this email in your browser'."],
      questions: [
        ["What makes a subject line effective?", "It states specific value", "It hides the content", "It is as long as possible", "It uses many capitals"],
        tf("The preheader should repeat the subject line exactly.", false),
        ["What does a good preheader do?", "Adds new information after the subject", "Repeats the subject", "Contains only the logo", "Is always left blank"],
        ["Which are weak subject habits?", ["Clickbait", "All capitals", "No clear value"], "Specific benefit", "Complementary preheader", "Plain language"],
        ["Why need adequate test volume?", "Small samples produce noise", "It is required by law", "It improves design", "It removes the need to write well"],
        blank("The text after the subject line is called the ______.", "preheader"),
      ],
      takeaway: "Be specific, write the preheader, and test one variable with enough volume to mean something.",
      assignment: {
        title: "Subject line set",
        instructions: "Write five subject lines and preheaders for one email, each using a different angle. Explain which you would test head-to-head and what result would make you choose one.",
        maxPoints: 100,
      },
    },
    {
      title: "Copy Structure and Calls to Action",
      concepts: [
        ["One job per email", "A message that asks for three things gets none. Decide the single action before writing the first line.", "One primary CTA; anything else is secondary text."],
        ["Scanner structure", "Most readers scan. Lead with the point, use short paragraphs, and make links descriptive.", "'Read the three changes' beats 'click here'."],
        ["Benefit then proof", "State what the reader gets, then why they should believe it. Reversing the order buries the value.", "Outcome, then a customer result or concrete detail."],
      ],
      workflow: ["Name the single action.", "Write the value in the first line.", "Add one proof point.", "Place one clear CTA and remove competing asks."],
      pitfalls: ["Burying the ask below three paragraphs of context.", "Five buttons, all styled the same."],
      questions: [
        ["How many primary actions should one email have?", "One", "Five", "None", "As many as fit"],
        tf("Readers usually read every word top to bottom.", false),
        ["What comes first in scanner-friendly copy?", "The main point", "A long story", "The footer", "The legal text"],
        ["Which are good CTA habits?", ["Descriptive link text", "One primary action", "Benefit before proof"], "Click here everywhere", "Five equal buttons", "No visible ask"],
        ["Why put benefit before proof?", "The value is seen even by scanners", "It is shorter", "It is required by law", "It removes the need for proof"],
        blank("A scanner-friendly email leads with the ______.", "point", "value"),
      ],
      takeaway: "One email, one action, value first, one proof point, descriptive CTA.",
      assignment: {
        title: "Rewrite an email",
        instructions: "Take a real promotional email with multiple asks. Rewrite it with one primary action, a first-line value statement and one proof point. Submit before and after plus 150 words on what you removed.",
        maxPoints: 120,
      },
    },
    {
      title: "Accessible, Responsive Design",
      concepts: [
        ["Structure before styling", "Use real headings, semantic lists and meaningful link text. Screen readers and scanners both rely on structure.", "A bold paragraph is not a heading."],
        ["Contrast and size", "Body text needs sufficient contrast and a readable size on a phone. Decorative pale grey on white fails in real inboxes.", "Test at 16px on a small screen."],
        ["Dark mode and images", "Design so the message survives blocked images and inverted colours. Alt text carries meaning when images do not load.", "Never put essential copy inside a flat image."],
      ],
      workflow: ["Build a single-column layout.", "Use real headings and lists.", "Check contrast and 16px body text.", "Preview with images blocked and dark mode on."],
      pitfalls: ["Image-only emails that vanish when images are blocked.", "Colour used as the only way to convey meaning."],
      questions: [
        ["Why use real headings in email?", "Structure helps screen readers and scanners", "They are bigger by default", "They are required by HTML", "They load faster"],
        tf("An image-only email is safe because everyone sees images.", false),
        ["What should alt text do?", "Carry the meaning when images are blocked", "Repeat the filename", "Describe the brand", "Stay empty always"],
        ["Which are accessible design checks?", ["Contrast", "16px body text", "Single-column layout"], "Image-only copy", "Colour-only meaning", "Tiny grey text"],
        ["Why preview with images blocked?", "Many clients block images", "It is faster to send", "It removes the need for alt text", "It is required by law"],
        blank("Never put essential copy inside a flat ______.", "image"),
      ],
      takeaway: "Semantic structure, readable contrast, and a message that survives blocked images and dark mode.",
      assignment: {
        title: "Accessibility pass on a template",
        instructions: "Take one email template and fix three accessibility issues: heading structure, link text and contrast. Preview it with images blocked and in dark mode. Submit screenshots and a short list of what you changed.",
        maxPoints: 120,
      },
    },
    {
      title: "Lifecycle Automation and Flows",
      concepts: [
        ["Flows are triggered by behaviour", "A lifecycle email responds to what someone did or did not do, so it arrives when it is relevant.", "Welcome on signup; nudge when a course stalls."],
        ["Exit conditions matter", "Every flow needs a stop rule. Without one, a subscriber gets a reminder after they already completed the action.", "Exit the stall flow on completion."],
        ["Frequency caps", "Multiple flows can overlap and bury a subscriber in mail. Cap total sends per week.", "One promotional email and one flow email per week maximum."],
      ],
      workflow: ["Map the trigger and the desired action.", "Write the exit condition first.", "Add a delay that matches real behaviour.", "Apply a global frequency cap."],
      pitfalls: ["A welcome flow that keeps sending after the first purchase.", "Three flows firing in the same hour."],
      questions: [
        ["What triggers a lifecycle email?", "A behaviour or lack of one", "The calendar only", "A random draw", "The sender's mood"],
        tf("A flow with no exit condition is fine for short lists.", false),
        ["Why define the exit condition first?", "It prevents reminders after the action happened", "It is required by HTML", "It speeds up sending", "It removes the need for a trigger"],
        ["Which are flow hygiene steps?", ["Exit conditions", "Sensible delays", "Frequency caps"], "No stop rule", "Immediate sends only", "Overlapping flows"],
        ["Why cap total sends per week?", "Over-mailing drives unsubscribes", "It is required by law", "It reduces image size", "It removes the need for segmentation"],
        blank("A flow must exit when the subscriber has taken the desired ______.", "action"),
      ],
      takeaway: "Behaviour triggers, exit conditions written first, realistic delays and a global frequency cap.",
      assignment: {
        title: "Design a three-email flow",
        instructions: "Design a three-message lifecycle flow for one behaviour. Write the trigger, each message's job, the delay, and the exit condition. Include one frequency-cap rule. Submit the flow map and copy for the first message.",
        maxPoints: 130,
      },
    },
    {
      title: "Measurement and Testing",
      concepts: [
        ["Metrics match questions", "Opens are unreliable after privacy features; clicks and conversions answer more useful questions. Choose the metric before the campaign.", "Did the email cause the action, not was it opened."],
        ["Test one variable", "Changing subject, copy and CTA together tells you nothing about which mattered.", "Hold everything else constant."],
        ["Cohorts over time", "Compare like with like: same segment, similar period. A holiday week distorts everything.", "Track a four-week trend, not a single spike."],
      ],
      workflow: ["Write the question and metric.", "Hold all but one variable constant.", "Run to adequate volume.", "Record the result and the decision."],
      pitfalls: ["Declaring a winner on tiny samples.", "Celebrating opens while conversions fall."],
      questions: [
        ["Which metric is most affected by privacy features?", "Opens", "Clicks", "Conversions", "Bounces"],
        tf("Changing three variables at once identifies the best one.", false),
        ["Why compare similar cohorts?", "It avoids confusing seasonality with effect", "It is required by law", "It makes reports shorter", "It removes the need for testing"],
        ["Which are sound testing habits?", ["One variable", "Adequate volume", "Recorded decision"], "Tiny samples", "Multiple changes", "Opinion only"],
        ["What do you do with an inconclusive test?", "Record it and keep the current version", "Declare a winner anyway", "Change everything", "Delete the data"],
        blank("Choose the ______ before you send, not after you see numbers.", "metric"),
      ],
      takeaway: "Pick the metric for the question, change one variable, run to volume, record the decision.",
      assignment: {
        title: "Test plan and readout",
        instructions: "Write a test plan for one campaign: the question, metric, one changed variable and the volume needed. Then write a readout for an inconclusive result and explain what you would do next.",
        maxPoints: 130,
      },
    },
    {
      title: "Compliance and Scaling Responsibly",
      concepts: [
        ["Consent records", "Keep when and how each person opted in. Compliance is a documented process, not a good intention.", "Timestamp, source and wording of consent."],
        ["Unsubscribe must work", "A clear one-click unsubscribe in every message is both a legal requirement and a reputation control.", "Honour it immediately across all segments."],
        ["Scale without drift", "As volume grows, review authentication, suppression lists and sender reputation on a schedule.", "Assign an owner for list health, not just campaigns."],
      ],
      workflow: ["Store consent records.", "Test unsubscribe on every send.", "Maintain a global suppression list.", "Schedule quarterly reputation reviews."],
      pitfalls: ["Treating suppression as per-campaign instead of global.", "Growing volume while ignoring rising complaints."],
      questions: [
        ["What should a consent record contain?", "Timestamp, source and exact wording", "Only the email address", "A guess", "Nothing; consent is assumed"],
        tf("Unsubscribe can take a few weeks to take effect.", false),
        ["Why is suppression global?", "So an unsubscribe applies everywhere", "It is faster to send", "It is required for images", "It removes the need for consent"],
        ["Which are scaling checks?", ["Authentication", "Reputation reviews", "Suppression hygiene"], "Ignore complaints", "Skip consent records", "No unsubscribe"],
        ["Who should own list health?", "A named person with a schedule", "Nobody in particular", "Only the sender", "The recipient"],
        blank("Consent must be ______, not assumed.", "recorded", "documented"),
      ],
      takeaway: "Document consent, honour unsubscribes globally, and review reputation as volume grows.",
      assignment: {
        title: "Compliance checklist",
        instructions: "Write a compliance checklist for a growing list covering consent records, unsubscribe handling, suppression and scheduled reviews. Apply it to one real or sample workflow and note any gap you found.",
        maxPoints: 140,
      },
    },
  ],
  toolkit: {
    fileName: "email-marketing-toolkit.md",
    body: `# Email Marketing That Converts — Toolkit

## List
- [ ] Specific promise and frequency stated
- [ ] Double opt-in where appropriate
- [ ] SPF, DKIM and DMARC configured
- [ ] Complaints and bounces monitored
- [ ] Unengaged subscribers sunset

## Segmentation
- [ ] Only usable fields collected
- [ ] Tagged by source and behaviour
- [ ] At least three actionable segments

## Writing
- [ ] One job per email
- [ ] Value in the first line
- [ ] Subject and preheader complementary
- [ ] One descriptive primary CTA
- [ ] Benefit before proof

## Design
- [ ] Single column, real headings
- [ ] 16px body text, checked contrast
- [ ] Previewed with images blocked and in dark mode
- [ ] Alt text carries meaning

## Automation
- [ ] Trigger and exit condition defined
- [ ] Delays match real behaviour
- [ ] Global frequency cap applied

## Measurement
- [ ] Metric chosen before the send
- [ ] One variable changed per test
- [ ] Adequate volume, decision recorded

## Compliance
- [ ] Consent timestamp, source and wording stored
- [ ] One-click unsubscribe in every message
- [ ] Global suppression list maintained
- [ ] Quarterly reputation review with an owner
`,
  },
  capstone: {
    title: "A Complete Email Growth System",
    description:
      "Build a working system for one audience: a consent-based signup flow with a clear promise, three behavioural segments, one campaign with a written subject test plan, and a three-message lifecycle flow with exit conditions and frequency caps. Include a measurement dashboard, a deliverability audit and a compliance checklist with consent records.",
    techStack: ["Deliverability", "Segmentation", "Copywriting", "Automation", "Analytics", "Compliance"],
    outcome: "A system you can hand to a team with the decisions and records intact.",
  },
  showcase: {
    title: "Email teardown case study",
    description:
      "Take one real email and show the rewrite: subject and preheader, first-line value, CTA and accessible layout. Include the reasoning for each change and the metric you would use to judge it.",
    techStack: ["Copy editing", "Accessible design", "Measurement"],
    outcome: "A portfolio piece showing both craft and judgment.",
  },
};

export const paidCoursesE = [compileCourse(cybersecurity), compileCourse(emailMarketing)];
