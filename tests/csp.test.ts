import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "../lib/csp";

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
    // GSAP (components/TextLoop) evaluates strings.
    expect(scriptSrc).toContain("'unsafe-eval'");
    // clerk.browser.js is rendered by Clerk's client component without a
    // nonce, so this host is load-bearing — dropping it takes sign-in down.
    expect(scriptSrc).toContain("https://clerk.glypha.com.ng");
  });

  it("keeps script-src free of the escape hatches", () => {
    const scriptSrc = sources(csp, "script-src");

    // The whole point of the nonce: without it the landing page does not
    // hydrate, with it an injected <script> still cannot run.
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Would ignore 'self' and the Clerk host above, which is exactly what
    // blocks clerk.browser.js. See the note in lib/csp.ts.
    expect(scriptSrc).not.toContain("'strict-dynamic'");
  });

  it("still allows the inline styles next/font and styled-jsx emit", () => {
    expect(sources(csp, "style-src")).toContain("'unsafe-inline'");
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
