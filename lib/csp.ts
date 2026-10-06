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
 *        · Next.js: `app-render` reads `content-security-policy` off the
 *          request (`getScriptNonceFromHeader`) and applies the nonce to every
 *          script/style tag it generates, including the inline RSC payload
 *          (`self.__next_f.push(...)`) that hydration depends on.
 *        · Clerk: `DynamicClerkScripts` reads `x-nonce` (falling back to the
 *          CSP header) and puts it on the clerk-js `<script>` and its preload —
 *          but only on the paths where Clerk actually mounts that component
 *          (see the "Why NOT strict-dynamic" note below for what we do today).
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
];

/**
 * The policy itself.
 *
 * `script-src` is the directive this whole file exists for:
 *   · `'nonce-…'`   — the per-request token; every inline tag Next renders
 *                     (RSC payload, hydration bootstrap, next-themes' theme
 *                     script) carries it, so those run again.
 *   · `'unsafe-eval'` — GSAP (components/TextLoop) evaluates strings.
 *   · `'unsafe-inline'` is deliberately ABSENT — a nonce in the same directive
 *                     disables it anyway, and an XSS payload that reaches the
 *                     DOM would otherwise just run.
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
export function buildContentSecurityPolicy(nonce: string): string {
  if (!nonce) {
    throw new Error("buildContentSecurityPolicy requires a nonce");
  }

  return [
    "default-src 'self'",
    ["script-src", "'self'", `'nonce-${nonce}'`, "'unsafe-eval'", "blob:", ...SCRIPT_HOSTS].join(" "),
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
      "https://*.uploadthing.com",
      "https://uploadthing.com",
      "https://unpkg.com",
      "https://api.publit.io",
      "https://*.publit.io",
      "https://media.publit.io",
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
