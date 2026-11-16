#!/usr/bin/env node
/**
 * Submit the live sitemap's URLs to IndexNow (Bing, Yandex, and the other
 * engines that honour the protocol — Google does not).
 *
 *   node scripts/indexnow-submit.mjs              # fetch /sitemap.xml, submit all URLs
 *   node scripts/indexnow-submit.mjs --url <u>    # submit a single URL
 *   node scripts/indexnow-submit.mjs --dry-run    # print what would be submitted
 *
 * Why the key is inline: the IndexNow key is not a secret — it is published
 * at `https://<host>/<key>.txt` by definition, and anyone can read it. The
 * file `public/75772bf07949f71b9a57b8398bf053a2.txt` must be deployed and
 * reachable before any submission will be accepted, or Bing answers 403.
 *
 * Why the sitemap rather than a URL list: the sitemap is generated from the
 * same source (Convex, at request time), so it can never drift from what the
 * site actually publishes. Run this after a deploy, or on a schedule.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = "75772bf07949f71b9a57b8398bf053a2";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10_000;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSiteUrl() {
  // Mirror lib/site.ts's resolution order: env file wins, hardcoded fallback is
  // the production domain. Kept in sync by hand — lib/site.ts is TS and this
  // script is plain node.
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = line.match(/^\s*NEXT_PUBLIC_SITE_URL\s*=\s*(.*)\s*$/);
      if (match) {
        let value = match[1];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return value.replace(/\/$/, "");
      }
    }
  }
  return "https://learn.glypha.com.ng";
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const urlFlag = args.indexOf("--url");
const singleUrl = urlFlag !== -1 ? args[urlFlag + 1] : undefined;

if (urlFlag !== -1 && !singleUrl) {
  console.error("Missing value for --url");
  process.exit(2);
}

const siteUrl = loadSiteUrl();
const host = new URL(siteUrl).host;
const keyLocation = `${siteUrl}/${KEY}.txt`;

async function fetchSitemapUrls() {
  const res = await fetch(`${siteUrl}/sitemap.xml`, {
    headers: { "accept": "application/xml,text/xml,*/*" },
  });
  if (!res.ok) {
    throw new Error(`sitemap.xml returned HTTP ${res.status}`);
  }
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) =>
    m[1].trim(),
  );
  // Only submit URLs on this host — a stray absolute URL elsewhere in the
  // document would be rejected by IndexNow anyway (422) and would fail the
  // whole batch.
  return [...new Set(urls)].filter((u) => u.startsWith(siteUrl));
}

async function submit(urls) {
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    const batch = urls.slice(i, i + MAX_URLS_PER_REQUEST);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: KEY, keyLocation, urlList: batch }),
    });
    const body = await res.text();
    if (res.status !== 200 && res.status !== 202) {
      throw new Error(
        `IndexNow rejected batch (HTTP ${res.status}): ${body.slice(0, 300)}`,
      );
    }
    console.log(`Submitted batch of ${batch.length} URL(s) — HTTP ${res.status}`);
  }
}

const urls = singleUrl ? [singleUrl] : await fetchSitemapUrls();

if (urls.length === 0) {
  console.error("No URLs to submit.");
  process.exit(1);
}

console.log(`Host:        ${host}`);
console.log(`Key location: ${keyLocation}`);
console.log(`URLs:        ${urls.length}`);

if (dryRun) {
  for (const url of urls) console.log(url);
  process.exit(0);
}

// The key file has to be reachable or the submission is pointless — check it
// first and fail with an actionable message instead of a bare 403.
const keyRes = await fetch(keyLocation);
if (!keyRes.ok) {
  console.error(
    `Key file not reachable at ${keyLocation} (HTTP ${keyRes.status}). ` +
      `Deploy the app with public/${KEY}.txt first, then re-run.`,
  );
  process.exit(1);
}

await submit(urls);
console.log("Done.");
