#!/usr/bin/env node
/**
 * End-to-end verification of the Content-Security-Policy (H-1 / H-1b).
 *
 * Unit tests in `tests/csp.test.ts` assert the *strings* this produces; this
 * script asserts what a *browser* does with them, which is the only thing that
 * counts. Run it against a production server:
 *
 *   pnpm build && pnpm exec next start -p 3100
 *   node scripts/verify-csp.mjs                # defaults to :3100
 *   BASE_URL=https://learn.glypha.com.ng node scripts/verify-csp.mjs
 *
 * Per route it checks, in a real Chromium with `theme=dark` pre-set:
 *   1. no CSP violation in the console, and no page error;
 *   2. the theme script actually ran (`<html>` carries dark/light) — the H-1b
 *      regression, which no header check can see;
 *   3. the landing page hydrates (a client-side link navigation, no second
 *      document load).
 * It finishes with a negative test: an injected inline script must be
 * *refused* on both a hash-policy page and a nonce-policy page, otherwise the
 * "no violations" above would only prove nothing is being enforced.
 *
 * Requires `playwright` (already present in this workspace) and a Chromium;
 * set CHROME_PATH if the bundled browser revision does not match your install.
 *
 * Exit code 0 = every route clean and enforcement proven.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const ROUTES = [
  "/",
  "/courses",
  "/become-instructor",
  "/support",
  "/sign-in",
  "/sign-up",
  "/verify/abc",
  "/courses/unknown-slug",
  "/instructors/xyz",
  "/maintenance",
];

/** Header-level check: which policy, and does every inline script pass it? */
async function checkHeaders(route) {
  const res = await fetch(BASE + route, { redirect: "manual" });
  const problems = [];
  const csp = res.headers.get("content-security-policy") || "";
  const scriptSrc = (/script-src ([^;]*)/.exec(csp) || [])[1]?.split(/\s+/) || [];
  const hasNonce = scriptSrc.some((s) => s.startsWith("'nonce-"));
  const hasHash = scriptSrc.some((s) => s.startsWith("'sha256-"));
  const kind = !scriptSrc.length ? "none" : hasNonce ? "nonce" : hasHash ? "hash" : "degraded";
  const unsafeInline = scriptSrc.includes("'unsafe-inline'");
  const unsafeEval = scriptSrc.includes("'unsafe-eval'");

  if (kind === "none") {
    // Only acceptable for a bare redirect (no body to protect).
    if (res.status < 300 || res.status >= 400) problems.push("no Content-Security-Policy header");
  } else if (kind === "degraded") {
    if (!unsafeInline) problems.push("degraded policy lost its 'unsafe-inline' floor");
    if (unsafeEval) problems.push("degraded policy grants 'unsafe-eval'");
  } else {
    if (unsafeInline) problems.push(`${kind} policy grants 'unsafe-inline'`);
    if (unsafeEval) problems.push(`${kind} policy grants 'unsafe-eval'`);
    if (kind === "nonce" && !hasHash) {
      // Not fatal on its own (a deployment with no readable landing page),
      // but it is exactly the state that blocks next-themes' theme script.
      problems.push("nonce policy has no layout-script hashes (theme script will be blocked)");
    }
  }

  if (res.status >= 300 && res.status < 400) return { kind, status: res.status, problems };

  const html = await res.text();
  const nonce = (/'nonce-([^']+)'/.exec(csp) || [])[1] || null;
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const attrs = match[1];
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
    if (type && !["module", "text/javascript", "application/javascript"].includes(type.toLowerCase())) {
      continue; // data block (JSON-LD …) — never executed, never hashed
    }
    const nonced = nonce !== null && attrs.includes(`nonce="${nonce}"`);
    const digest = createHash("sha256").update(match[2], "utf8").digest("base64");
    if (!nonced && !scriptSrc.includes(`'sha256-${digest}'`)) {
      problems.push(`inline script not allowed: ${JSON.stringify(match[2].slice(0, 60))}`);
    }
  }
  return { kind, status: res.status, problems };
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);

let failures = 0;

// ── 1. every route: header policy + real browser behaviour ──────────────────
for (const route of ROUTES) {
  const header = await checkHeaders(route);
  const problems = [...header.problems];

  const context = await browser.newContext();
  await context.addInitScript(() => {
    try {
      localStorage.setItem("theme", "dark");
    } catch {}
  });
  const page = await context.newPage();
  const notes = [];
  page.on("console", (msg) => {
    const text = msg.text();
    // Only CSP failures count. Local `next start` has no
    // `/_vercel/insights/script.js` (Vercel injects it in production), which
    // Chromium reports as a MIME refusal unrelated to CSP.
    if (/Content Security Policy/i.test(text)) problems.push(`console: ${text.slice(0, 240)}`);
    else if (/Refused to/i.test(text)) notes.push(text.slice(0, 140));
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message.slice(0, 240)}`));

  try {
    const response = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });

    // H-1b: the pre-hydration theme script must have executed.
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    if (!/\b(dark|light)\b/.test(htmlClass)) {
      problems.push(`theme script did not run (html class="${htmlClass}")`);
    }

    // Hydration probe on the landing page.
    if (route === "/") {
      const before = await page.evaluate(() => performance.getEntriesByType("navigation").length);
      await page.click('header a[href="/courses"], nav a[href="/courses"]', { timeout: 5000 }).catch(() => {});
      await page.waitForURL("**/courses", { timeout: 10000 }).catch(() => {});
      const after = await page.evaluate(() => performance.getEntriesByType("navigation").length);
      if (!page.url().endsWith("/courses") || after !== before) {
        problems.push(`hydration probe failed (url=${page.url()}, navigations ${before}→${after})`);
      }
    }
    if (response) header.status = response.status();
  } catch (err) {
    problems.push(`navigation: ${err.message.slice(0, 200)}`);
  }

  if (problems.length) failures++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${String(header.status).padEnd(4)} ${header.kind.padEnd(8)} ${route}`);
  for (const p of problems) console.log(`      - ${p}`);
  if (notes.length) console.log(`      (non-CSP, ignored: ${notes[0]})`);
  await context.close();
}

// ── 2. negative test: enforcement must actually refuse an injected script ──
console.log("\nnegative test (an injected inline script must NOT run):");
for (const route of ["/", "/sign-in"]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const violations = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  const ran = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.__cspInjected = false;
        const s = document.createElement("script");
        s.textContent = "window.__cspInjected = true;";
        document.head.appendChild(s);
        setTimeout(() => resolve(window.__cspInjected), 150);
      }),
  );
  const enforced = ran === false && violations.length > 0;
  if (!enforced) failures++;
  console.log(`${enforced ? "ok  " : "FAIL"} ${route}: executed=${ran} violations=${violations.length}`);
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall CSP checks passed");
process.exit(failures ? 1 : 0);
