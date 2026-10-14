#!/usr/bin/env node
/**
 * Regenerate `lib/banks.ts` from Paystack's bank directory.
 *
 *   node scripts/generate-banks.mjs
 *
 * Why a generated file rather than a live fetch: the bank list changes a few
 * times a year at most, every instructor page load would otherwise wait on a
 * third-party round trip for data that is effectively static, and a Paystack
 * outage would take down a form that does not actually need Paystack until
 * the verify button is pressed. The file is committed; re-run this script to
 * refresh it.
 *
 * Reads PAYSTACK_SECRET_KEY from .env.local / .env (never printed).
 * Writes lib/banks.ts with a sorted list of { code, name }.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(file) {
  const path = join(root, file);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

const env = { ...loadEnvFile(".env.local"), ...loadEnvFile(".env"), ...process.env };
const secret = env.PAYSTACK_SECRET_KEY;
if (!secret) {
  console.error(
    "PAYSTACK_SECRET_KEY is not set. Add it to .env.local first — the key is read from there and never printed.",
  );
  process.exit(1);
}

// Paginate: Paystack returns 50 per page by default, and Nigeria has more than
// that once every fintech bank is counted.
const banks = [];
let page = 1;
for (;;) {
  const url = new URL("https://api.paystack.co/bank");
  url.searchParams.set("country", "nigeria");
  url.searchParams.set("perPage", "100");
  url.searchParams.set("page", String(page));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  if (!res.ok) {
    console.error(`Paystack responded ${res.status} for page ${page}.`);
    process.exit(1);
  }
  const json = await res.json();
  if (!json.status || !Array.isArray(json.data)) {
    console.error("Unexpected Paystack response:", json.message ?? "no message");
    process.exit(1);
  }

  for (const bank of json.data) {
    if (!bank?.code || !bank?.name) continue;
    banks.push({ code: String(bank.code), name: String(bank.name) });
  }

  const meta = json.meta ?? {};
  if (page >= (meta.totalPages ?? 1) || json.data.length === 0) break;
  page += 1;
}

if (banks.length === 0) {
  console.error("Paystack returned no banks — refusing to write an empty list.");
  process.exit(1);
}

// Dedupe on code (the API has returned duplicates across pages before) and
// sort case-insensitively so the dropdown is stable and human-scannable.
const byCode = new Map();
for (const bank of banks) byCode.set(bank.code, bank);
const sorted = [...byCode.values()].sort((a, b) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
);

const header = `/**
 * Nigerian banks accepted for instructor payouts, as code + name.
 *
 * GENERATED FILE — do not edit by hand. Refresh with:
 *
 *   node scripts/generate-banks.mjs
 *
 * Sourced from Paystack's \`/bank?country=nigeria\` endpoint, which is the
 * same directory the account-resolution call checks against, so a bank
 * missing here would fail verification anyway. Frozen into a static file on
 * purpose: see the script's header for why a live fetch would be worse.
 */

export interface Bank {
  /** Paystack bank code, e.g. "058" for GTBank. Sent to /bank/resolve. */
  code: string;
  /** Display name, exactly as Paystack spells it. */
  name: string;
}

export const BANKS: readonly Bank[] = ${JSON.stringify(sorted, null, 2)};
`;

writeFileSync(join(root, "lib", "banks.ts"), header);
console.log(`Wrote lib/banks.ts with ${sorted.length} banks.`);
