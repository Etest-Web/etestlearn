/**
 * Content-Security-Policy — assembled once per request.
 *
 * Why this is not in `next.config.ts`
 * ===================================
 * `next.config.ts#headers()` is evaluated a single time when the server boots,
 * so anything it emits is identical for every visitor for the lifetime of the
 * process. A nonce only has meaning if it is unique to *this* response (it is
 * the proof that this response — not an attacker's injection — rendered the
 * script), so the policy has to be built per request. `proxy.ts` does that and
 * forwards the result in two places:
 *
 *   1. **Response header** — what the browser enforces.
 *   2. **Request headers** — what the server-side renderers read back so they
 *      can stamp `nonce="…"` onto the tags they emit:
 *        · Next.js: `app-render` parses `content-security-policy` off the
 *          request (`getScriptNonceFromHeader`) and applies the nonce to every
 *          script/style tag it generates, including the inline RSC payload
 *          (`self.__next_f.push(...)`) that hydration depends on.
 *        · Clerk does NOT read a nonce: `ClerkScripts` is rendered without
 *          one, which is why `https://clerk.glypha.com.ng` has to stay in the
 *          `script-src` host allow-list (see the "Why NOT strict-dynamic"
 *          note below). There is no `X-Nonce` header — nothing reads it.
 *        · Component-rendered scripts (next-themes' theme script) get neither,
 *          so those are admitted by SHA-256 hash instead; see
 *          `buildStaticContentSecurityPolicy` and `readLayoutScriptHashes`.
 *
 * Both hops matter: a nonce that is enforced but never applied to a tag is just
 * a policy that blocks your own page. This module exports the builder so the
 * rules can be asserted in `tests/csp.test.ts` instead of being reviewed by
 * eye every time a directive changes.
 */

/**
 * 16 random bytes, base64. Web Crypto only — no `Buffer`, so it works in the
 * edge and node middleware runtimes alike.
 *
 * The output can only contain `A–Z a–z 0–9 + / =`, which also satisfies
 * Next's own sanity check (it refuses nonces containing `<`, `>` or `&`).
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Origins the browser may load scripts from in addition to same-origin. */
const SCRIPT_HOSTS = [
  // Clerk's frontend API — the clerk-js bundle is loaded from here, without a
  // nonce (see the "Why NOT strict-dynamic" note below), so this entry is
  // load-bearing rather than a fallback.
  "https://clerk.glypha.com.ng",
  // Clerk's staging/dev host, for local work against a dev instance.
  "https://*.clerk.accounts.dev",
  // Cloudflare Turnstile — Clerk's bot sign-up protection renders a CAPTCHA
  // widget from this origin.
  "https://challenges.cloudflare.com",
  // Clerk bot protection and fraud prevention
  "https://*.protect.clerk.com",
];

/**
 * The policy itself.
 *
 * `script-src` is the directive this whole file exists for:
 *   · `'nonce-…'`   — the per-request token; every inline tag *Next* renders
 *                     (RSC payload, hydration bootstrap) carries it, so those
 *                     run again. Component-rendered scripts do not — hence:
 *   · `sha256-…`    — build-time hashes for the layout's own inline scripts,
 *                     which React renders *without* the nonce; they are added
 *                     by the caller (`proxy.ts` reads them from the prerendered
 *                     landing page — see `readLayoutScriptHashes`).
 *   · `'unsafe-eval'` and `'unsafe-inline'` are deliberately ABSENT — a nonce
 *                     in the same directive disables 'unsafe-inline' anyway,
 *                     and an XSS payload that reaches the DOM would otherwise
 *                     just run.
 *
 * Why no `'unsafe-eval'` either
 * =============================
 * It used to be here "because GSAP evaluates strings". It does not, and GSAP
 * is not even imported anywhere in this repo — the note outlived the code.
 * What matters is what actually ships to the browser, and that was measured
 * rather than assumed before the source was dropped:
 *   · all 90 built client chunks in `.next/static/chunks/` — 0 hits for
 *     `eval(`, `new Function`, `(0,eval)`, `window.eval`;
 *   · clerk-js@6.40.1 (`clerk.browser.js`, 324 KB) — 0 hits;
 *   · Cloudflare's `challenges.cloudflare.com/turnstile/v0/api.js` — 0 hits.
 * `'unsafe-eval'` is the source of the classic JSON-prototype-pollution →
 * RCE chain, so its absence is worth more than the insurance policy it used
 * to provide. If a future dependency genuinely needs it, this comment is the
 * place to record *which* and *why* — not a silent re-add.
 *
 * Why NOT `'strict-dynamic'`
 * ==========================
 * It looks like the modern formulation — nonce + `'strict-dynamic'` and drop
 * the host list — but under CSP3 it makes `'self'` and every host source
 * below *ignored*, leaving only nonce'd tags and trust propagated from them.
 * Two tags in this app's HTML are parser-inserted and have no nonce:
 *
 *   1. `https://clerk.glypha.com.ng/.../clerk.browser.js` — rendered by
 *      Clerk's *client* `ClerkScripts`, which reads `nonce` from the
 *      `ClerkProvider` props. That prop is not part of Clerk's public
 *      `NextClerkProviderProps`, and we do not pass it, so it ships without
 *      one (the server-side `DynamicClerkScripts` that does fetch the nonce
 *      from headers only mounts when `ClerkProvider dynamic` is set).
 *      `strict-dynamic` would block it and take sign-in down with it.
 *   2. next-themes' inline theme script — fixed by passing `nonce` to
 *      `<ThemeProvider>` in app/layout.tsx, but see (1): relying on every
 *      third-party tag being nonced is a load-bearing assumption nobody can
 *      re-verify from this repo alone.
 *
 * The host allow-list (`'self'` + SCRIPT_HOSTS) already restricts external
 * scripts to our own origin and Clerk's, which is where the practical risk
 * sits. Keep it effective; do not add `'strict-dynamic'` without first
 * checking the rendered HTML for un-nonced `<script>` tags.
 */
export function buildContentSecurityPolicy(nonce: string, extraScriptHashes: string[] = []): string {
  if (!nonce) {
    throw new Error("buildContentSecurityPolicy requires a nonce");
  }

  return buildPolicy(
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      // Layout-level inline scripts (next-themes' theme script and friends),
      // which React renders without the nonce. See `readLayoutScriptHashes`.
      ...extraScriptHashes,
      "blob:",
      ...SCRIPT_HOSTS,
    ].join(" "),
  );
}

/**
 * Every directive the policies have in common.
 *
 * `script-src` is the only thing that differs between them (nonce vs hashes
 * vs the degraded fallback), so it is the only argument. This used to be two
 * near-identical forty-line literals — and they had already drifted apart once
 * (only one of them was updated when `'unsafe-eval'` was reconsidered), which
 * is exactly the failure this shape prevents.
 */
function buildPolicy(scriptSrc: string): string {
  return [
    "default-src 'self'",
    scriptSrc,
    // 'unsafe-inline' for styles is a scoped concession: next/font and the
    // styled-jsx runtime inject <style> tags, and App Router has no nonce
    // plumbing for them without per-request nonces on the render itself.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    // Safari plays AES-128 HLS natively through <video src>, which is a
    // media-src fetch (hls.js/MSE path uses connect-src instead).
    "media-src 'self' https://*.convex.site https://*.publit.io https://media.publit.io",
    // External APIs speak over connect-src.
    [
      "connect-src",
      "'self'",
      "https://*.convex.cloud",
      "https://*.convex.site",
      "wss://*.convex.cloud",
      "wss://*.convex.site",
      "https://clerk.glypha.com.ng",
      "https://*.clerk.accounts.dev",
      "https://api.paystack.co",
      // Localization provider (ipapi.co geo-IP lookup for currency detection).
      "https://ipapi.co",
      "https://*.uploadthing.com",
      "https://uploadthing.com",
      "https://unpkg.com",
      "https://api.publit.io",
      "https://*.publit.io",
      "https://media.publit.io",
      "https://va.vercel-scripts.com",
      // Cloudflare Turnstile verification API calls.
      "https://challenges.cloudflare.com",
      // Clerk bot / abuse protection API calls (requires wildcard port per Clerk docs)
      "https://*.protect.clerk.com:*",
    ].join(" "),
    [
      "frame-src",
      "'self'",
      ...SCRIPT_HOSTS,
      "https://hooks.stripe.com",
      "https://checkout.paystack.com",
      "https://*.publit.io",
      "https://media.publit.io",
      "https://publit.io",
    ].join(" "),
    // Clerk's own reference policy allows blob: workers; same-origin blob
    // workers are not an escalation (they inherit this origin, and reaching
    // them already requires script execution this policy denies).
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * The SHA-256 CSP sources for every *executable* inline `<script>` in a
 * prerendered page.
 *
 * This is what lets a build-time page carry a strict `script-src`: a static
 * response has no request, so it can never have a nonce — but its inline
 * scripts are byte-identical on every request, which is exactly what a hash
 * matches. An injected `<script>` whose text is not in this list still cannot
 * run, so the protection against XSS that `'unsafe-inline'` gave away is back.
 *
 * Two deliberate exclusions:
 *
 *   · `src=` tags are external — they are governed by the host allow-list,
 *     never by a hash.
 *   · A non-JavaScript `type` is a **data block**, not code: JSON-LD
 *     (`application/ld+json`) and `importmap`-style payloads are not executed.
 *     Hashing them anyway would be worse than pointless — `{"@context":"…"}`
 *     parses as a labelled block in JavaScript, so putting its hash in
 *     `script-src` would license an attacker to serve that exact text as an
 *     executable script.
 *
 * The digest is over the element's exact source text (UTF-8), which is what
 * the browser compares against.
 */
export async function extractInlineScriptHashes(html: string): Promise<string[]> {
  const hashes = new Set<string>();
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const attributes = match[1];
    const body = match[2];

    if (/\ssrc\s*=/i.test(attributes)) continue;

    const typeMatch = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
    if (typeMatch) {
      const type = (typeMatch[1] ?? typeMatch[2] ?? typeMatch[3] ?? "").trim().toLowerCase();
      if (type && !JS_MIME_TYPES.has(type)) continue;
    }

    hashes.add(await sha256CspSource(body));
  }

  // Sorted so the header is stable for a given page — otherwise two renders of
  // identical content would still produce a different policy string.
  return [...hashes].sort();
}

/** MIME types (plus `type="module"`) whose content the browser will execute. */
const JS_MIME_TYPES = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript",
  "text/babel",
]);

async function sha256CspSource(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // Base64 by hand rather than `Buffer`: this module is imported by the
  // proxy, and keeping it free of Node-only globals means it can never quietly
  // stop working there. `btoa` is what `generateNonce` above already relies on.
  return `'sha256-${btoa(binary)}'`;
}

/**
 * Hash-based variant for prerendered routes — the strict static policy.
 *
 * `scriptHashes` comes from {@link extractInlineScriptHashes} reading the very
 * HTML file Next will serve for this path, so the list matches the response by
 * construction. No `'unsafe-inline'`, no `'unsafe-eval'`, no nonce: a nonce
 * here would be worse than useless, because CSP3 makes a nonce in the
 * directive disable `'unsafe-inline'`, and the tags Next baked in at build
 * time carry none.
 *
 * An empty array is a valid, maximally strict answer (a page with no inline
 * scripts at all), not an error.
 */
export function buildStaticContentSecurityPolicy(scriptHashes: string[]): string {
  return buildPolicy(
    ["script-src", "'self'", ...scriptHashes, "blob:", ...SCRIPT_HOSTS].join(" "),
  );
}

/**
 * Degraded variant — used **only** when the build artifacts that make the hash
 * policy possible are not readable at runtime (see `lib/prerendered-csp.ts`).
 *
 * It is the policy this app shipped before H-1 was fixed, kept as a floor so
 * that a missing file degrades to today's behaviour instead of to a blank
 * page: a `script-src` that refuses a prerendered page's own hydration scripts
 * takes the storefront down, and availability is not a trade the fallback gets
 * to make. `'unsafe-inline'` has to stay for exactly that reason — it is what
 * those unhashed inline scripts need.
 *
 * `'unsafe-eval'` is NOT restored here: nothing that ships to the browser
 * needs it (see the evidence in the note at the top of this file), so the
 * fallback gives up only the one concession it cannot avoid.
 *
 * It should never appear in a response from a healthy deployment: `proxy.ts`
 * warns once per path when this one is used.
 */
export function buildDegradedStaticContentSecurityPolicy(): string {
  return buildPolicy(
    ["script-src", "'self'", "'unsafe-inline'", "blob:", ...SCRIPT_HOSTS].join(" "),
  );
}
