import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildDegradedStaticContentSecurityPolicy,
  buildStaticContentSecurityPolicy,
  extractInlineScriptHashes,
  generateNonce,
} from "../lib/csp";

/**
 * Pins the policy that `proxy.ts` puts on every response.
 *
 * The landing page went dark because `script-src` had no nonce and no
 * `'unsafe-inline'`: the browser refused all ~58 inline scripts, React never
 * hydrated, and every `.reveal` block stayed at `opacity: 0`. These tests
 * exist so the next edit to a directive re-states that trade-off deliberately
 * instead of rediscovering it in production.
 */

function directives(csp: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    expect(parsed.has(name), `duplicate directive: ${name}`).toBe(false);
    parsed.set(name, values);
  }
  return parsed;
}

function sources(csp: string, name: string): string[] {
  const values = directives(csp).get(name);
  expect(values, `missing directive: ${name}`).toBeDefined();
  return values as string[];
}

/** Directives that carry no source list, per the CSP grammar. */
const VALUELESS_DIRECTIVES = new Set(["upgrade-insecure-requests"]);

describe("generateNonce", () => {
  it("emits base64 that Next.js will accept", () => {
    const nonce = generateNonce();

    // Next refuses nonces containing <, > or & — see getScriptNonceFromHeader.
    expect(nonce).not.toMatch(/[<>&]/);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(nonce.length).toBeGreaterThanOrEqual(16);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 100 }, generateNonce));
    expect(seen.size).toBe(100);
  });
});

describe("buildContentSecurityPolicy", () => {
  const nonce = "test_nonce+/==";
  const csp = buildContentSecurityPolicy(nonce);

  it("refuses to build without a nonce", () => {
    expect(() => buildContentSecurityPolicy("")).toThrow(/nonce/);
  });

  it("emits parseable directives", () => {
    expect(csp).not.toContain("\n");
    for (const [name, values] of directives(csp)) {
      expect(name, `${name} has no sources`).not.toBe("");
      // Valueless directives take no argument; everything else must say what
      // it allows, so a dropped interpolation cannot pass silently.
      if (VALUELESS_DIRECTIVES.has(name)) {
        expect(values, `${name} should be valueless`).toEqual([]);
      } else {
        expect(values.length, `${name} has no sources`).toBeGreaterThan(0);
      }
    }
  });

  it("requires the request's nonce on every script", () => {
    const scriptSrc = sources(csp, "script-src");

    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).toContain("'self'");
    // clerk.browser.js is rendered by Clerk's client component without a
    // nonce, so this host is load-bearing — dropping it takes sign-in down.
    expect(scriptSrc).toContain("https://clerk.glypha.com.ng");
  });

  it("keeps script-src free of the escape hatches", () => {
    const scriptSrc = sources(csp, "script-src");

    // The whole point of the nonce: without it the landing page does not
    // hydrate, with it an injected <script> still cannot run.
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Nothing that ships to the browser evaluates strings — measured, not
    // assumed: 0 hits for `eval(`/`new Function` across all 90 built client
    // chunks, clerk-js@6.40.1 and Cloudflare's turnstile. See lib/csp.ts.
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // Would ignore 'self' and the Clerk host above, which is exactly what
    // blocks clerk.browser.js. See the note in lib/csp.ts.
    expect(scriptSrc).not.toContain("'strict-dynamic'");
  });

  it("still allows the inline styles next/font and styled-jsx emit", () => {
    expect(sources(csp, "style-src")).toContain("'unsafe-inline'");
  });

  it("admits the layout's own inline scripts by hash alongside the nonce", () => {
    // H-1b: next-themes' theme script is rendered by React, so it carries no
    // nonce and would be blocked — a dark-mode flash on every nonce route.
    // The hashes come from the prerendered landing page (readLayoutScriptHashes).
    const withHashes = buildContentSecurityPolicy(nonce, ["'sha256-laidOut='"]);
    const scriptSrc = sources(withHashes, "script-src");

    expect(scriptSrc).toContain("'sha256-laidOut='");
    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    // Adding hashes must not drag the escape hatches back in — a hash list is
    // only meaningful when 'unsafe-inline' is absent.
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // Default call sites (e.g. the /api maintenance JSON response) get no hashes.
    expect(sources(csp, "script-src").some((s) => s.startsWith("'sha256-"))).toBe(false);
  });

  it("locks down the framing, object and base channels", () => {
    expect(directives(csp).get("default-src")).toEqual(["'self'"]);
    expect(directives(csp).get("object-src")).toEqual(["'none'"]);
    expect(directives(csp).get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives(csp).get("base-uri")).toEqual(["'self'"]);
    expect(directives(csp).get("form-action")).toEqual(["'self'"]);
  });

  it("lets the page reach Convex, Clerk and Paystack", () => {
    const connectSrc = sources(csp, "connect-src");

    for (const origin of [
      "https://*.convex.cloud",
      "https://*.convex.site",
      "wss://*.convex.cloud",
      "wss://*.convex.site",
      "https://clerk.glypha.com.ng",
      "https://api.paystack.co",
    ]) {
      expect(connectSrc).toContain(origin);
    }
  });
});

/**
 * H-1: the hash-based static policy and the extractor that feeds it.
 *
 * The extractor's digest is checked against `node:crypto` — computed the way a
 * browser computes it (UTF-8 bytes of the element's exact source text), not by
 * calling the same helper twice. If `lib/csp.ts` ever changed its input (say,
 * hashed the whole tag instead of its body), these vectors would move while
 * the real browser hashes stayed put, and the page would go dark again.
 */
describe("buildStaticContentSecurityPolicy (hash-based)", () => {
  const HASHES = ["'sha256-AAAA…'", "'sha256-BBBB…'"];
  const csp = buildStaticContentSecurityPolicy(HASHES);

  it("emits parseable directives", () => {
    expect(csp).not.toContain("\n");
    for (const [name, values] of directives(csp)) {
      expect(name, `${name} has no sources`).not.toBe("");
      if (VALUELESS_DIRECTIVES.has(name)) {
        expect(values, `${name} should be valueless`).toEqual([]);
      } else {
        expect(values.length, `${name} has no sources`).toBeGreaterThan(0);
      }
    }
  });

  it("allows exactly the page's own inline scripts — and nothing else", () => {
    const scriptSrc = sources(csp, "script-src");

    // Every hash the extractor produced is honoured...
    for (const hash of HASHES) expect(scriptSrc).toContain(hash);
    // ...and the escape hatches are gone. 'unsafe-inline' here would silently
    // defeat every hash (CSP ignores hashes once 'unsafe-inline' is present
    // without a nonce), which is the exact bug H-1 was.
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // A nonce is worse than useless on a build-time response: it disables
    // 'unsafe-inline' while the baked-in tags carry no nonce at all.
    expect(scriptSrc.some((s) => s.startsWith("'nonce-"))).toBe(false);
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("https://clerk.glypha.com.ng");
  });

  it("stays valid for a page with no inline scripts at all", () => {
    const empty = buildStaticContentSecurityPolicy([]);
    expect(sources(empty, "script-src")).toEqual(
      expect.arrayContaining(["'self'", "blob:", "https://clerk.glypha.com.ng"]),
    );
    expect(sources(empty, "script-src").some((s) => s.startsWith("'sha256-"))).toBe(false);
  });

  it("keeps the same host allow-list and lockdown as the nonce policy", () => {
    const staticConnect = sources(csp, "connect-src");
    for (const origin of [
      "https://*.convex.cloud",
      "https://*.convex.site",
      "wss://*.convex.cloud",
      "wss://*.convex.site",
      "https://clerk.glypha.com.ng",
      "https://api.paystack.co",
    ]) {
      expect(staticConnect).toContain(origin);
    }

    expect(directives(csp).get("default-src")).toEqual(["'self'"]);
    expect(directives(csp).get("object-src")).toEqual(["'none'"]);
    expect(directives(csp).get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives(csp).get("base-uri")).toEqual(["'self'"]);
    expect(directives(csp).get("form-action")).toEqual(["'self'"]);
    expect(sources(csp, "style-src")).toContain("'unsafe-inline'");
  });
});

describe("buildDegradedStaticContentSecurityPolicy", () => {
  const csp = buildDegradedStaticContentSecurityPolicy();

  it("keeps the availability floor but still drops 'unsafe-eval'", () => {
    const scriptSrc = sources(csp, "script-src");

    // 'unsafe-inline' is the whole point of this variant: it is what makes a
    // prerendered page with unreadable build artifacts hydrate instead of
    // going dark. Removing it here would turn a warning into an outage.
    expect(scriptSrc).toContain("'unsafe-inline'");
    // But eval is not an availability requirement — nothing ships that needs
    // it, so even the fallback must not grant it.
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc.some((s) => s.startsWith("'nonce-"))).toBe(false);
    expect(scriptSrc).not.toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("\n");
  });
});

describe("extractInlineScriptHashes", () => {
  /** The same digest the browser computes, via node:crypto — an independent path. */
  function browserHash(source: string): string {
    return `'sha256-${createHash("sha256").update(source, "utf8").digest("base64")}'`;
  }

  it("hashes each inline script's exact body, as the browser would", async () => {
    const a = `self.__next_f.push([1,"payload"])`;
    const b = `\n  console.log("hydrated");\n`;
    const html = `<html><head><script>${a}</script><script>${b}</script></head></html>`;

    const hashes = await extractInlineScriptHashes(html);

    expect(hashes).toEqual([browserHash(a), browserHash(b)].sort());
    // Sorted: two renders of the same page must produce the same header.
    expect([...hashes].sort()).toEqual(hashes);
  });

  it("ignores external scripts — they are governed by hosts, not hashes", async () => {
    const inline = `var keep = 1;`;
    const html =
      `<script src="https://clerk.glypha.com.ng/clerk.browser.js"></script>` +
      `<script>${inline}</script>`;

    expect(await extractInlineScriptHashes(html)).toEqual([browserHash(inline)]);
  });

  it("skips data blocks, whose text is not executable", async () => {
    const jsonLd = `{"@context":"https://schema.org","@type":"WebSite"}`;
    const js = `var real = 1;`;
    const html =
      `<script type="application/ld+json">${jsonLd}</script>` +
      `<script type="importmap">{"imports":{}}</script>` +
      `<script>${js}</script>`;

    const hashes = await extractInlineScriptHashes(html);

    // This is the load-bearing assertion for the exclusion: JSON parses as a
    // labelled block in JavaScript, so allowing its hash would license an
    // attacker to serve that exact text as an *executable* script.
    expect(hashes).toEqual([browserHash(js)]);
    expect(hashes).not.toContain(browserHash(jsonLd));
  });

  it("treats type=\"module\" and an explicit JS type as executable", async () => {
    const moduleBody = `export default 1;`;
    const classicBody = `var c = 2;`;
    const html =
      `<script type="module">${moduleBody}</script>` +
      `<script type="text/javascript">${classicBody}</script>`;

    expect(await extractInlineScriptHashes(html)).toEqual(
      [browserHash(moduleBody), browserHash(classicBody)].sort(),
    );
  });

  it("deduplicates identical bodies across the page", async () => {
    const body = `self.__next_f.push([1,"same"]);`;
    const html = `<script>${body}</script><script>${body}</script>`;

    expect(await extractInlineScriptHashes(html)).toEqual([browserHash(body)]);
  });

  it("returns an empty list for a page with no scripts", async () => {
    expect(await extractInlineScriptHashes("<html><body>hi</body></html>")).toEqual([]);
  });
});
