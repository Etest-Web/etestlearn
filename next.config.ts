import type { NextConfig } from "next";

/**
 * Static security headers.
 *
 * The Content-Security-Policy is NOT here: `headers()` is evaluated once at
 * boot, which makes it useless for a per-request nonce. The nonce-based policy
 * is built in `lib/csp.ts` and applied on every request by `proxy.ts` — keep
 * the two in sync when adding an origin.
 *
 * Everything below is invariant across requests, so it can stay as static
 * config.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    // Camera/mic/geo are off: nothing in this app needs them. Clerk's account
    // management uses the clipboard for copy actions.
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    // Severs window.opener for any cross-origin page that ends up holding a
    // handle to ours (target=_blank links, an OAuth popup handing back): a
    // hostile opener can no longer script or navigate our window — the classic
    // reverse-tabnabbing / opener-redirect trick. Nothing legitimately needs
    // the reverse (a cross-origin window holding a live reference INTO this
    // app), so this costs nothing. COEP is its isolation sibling but is
    // deliberately deferred — see the note under this array.
    value: "same-origin",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    // Legacy plug-in policy channel (Flash/Silverlight crossdomain.xml and
    // clientaccesspolicy.xml, Office/PDF "allow-from"): this tells clients
    // fetching a file from this domain to consult no cross-domain policy file
    // at all. Nothing legitimate consumes it any more, so `none` closes the
    // channel outright rather than leaving the default "master-only" behaviour
    // to plugins we no longer control.
    value: "none",
  },
  // Cross-Origin-Embedder-Policy is intentionally absent — see the rationale
  // below. Do not "just add" `require-corp` or `credentialless` here without
  // reading it and verifying against a staging deploy.
];

/**
 * Why COEP is deliberately deferred (Cross-Origin-Embedder-Policy)
 *
 * COEP is the companion to COOP above: it locks this page's browsing context
 * so it can only load cross-origin resources that opt in via CORP. But
 * `require-corp` demands a Cross-Origin-Resource-Policy header on EVERY
 * cross-origin subresource, and none of ours send one — Clerk's widgets and
 * avatars (img.clerk.com, clerk.glypha.com.ng), Convex file storage URLs,
 * Unsplash artwork, Google Fonts. The pages would load with broken imagery and
 * a possibly-broken sign-in flow.
 *
 * `credentialless` sidesteps the CORP requirement (no-cors subresources are
 * re-fetched without credentials), and would likely be safe here — but
 * "likely" is not "verified": Clerk's popup/iframe behaviour, signed Convex
 * storage URLs, and Unsplash images all need checking against a staging
 * deploy with the header on before it ships. Until that audit happens, the
 * isolation COEP would add is largely covered by COOP + `frame-ancestors
 * 'none'` + X-Frame-Options + HSTS above, while the failure mode of getting
 * it wrong is a production outage of sign-in and artwork. Flip it on
 * deliberately, not casually.
 */

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "laudable-cuttlefish-591.eu-west-1.convex.cloud",
      },
      {
        protocol: "https",
        hostname: "laudable-cuttlefish-591.eu-west-1.convex.site",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default nextConfig;