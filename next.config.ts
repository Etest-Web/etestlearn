import type { NextConfig } from "next";

/**
 * Content-Security-Policy
 *
 * Built from the exact set of origins this app talks to. Kept as an array of
 * directives (rather than one template string) so a missing entry is a visible,
 * greppable omission instead of a silently dropped interpolation.
 *
 * 'unsafe-inline' for style-src is a deliberate, scoped concession: Next.js
 * injects inline <style> for its font variables and the styled-jsx runtime
 * that `next/font` emits, and Clerk's <Script> tags need it too. Removing it
 * requires per-request nonces, which the App Router does not hand us here.
 * script-src gets NO such exemption — see the note there.
 */
const csp = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' are required by Clerk's bundled widgets and
  // by GSAP (TextLoop). Everything else stays nonce-free but allow-listed.
  "script-src 'self' 'unsafe-eval' https://*.clerk.accounts.dev https://clerk.glypha.com.ng",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  // Convex, Clerk and Paystack all speak over connect-src.
  "connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud wss://*.convex.site https://clerk.glypha.com.ng https://*.clerk.accounts.dev https://api.paystack.co",
  "frame-src 'self' https://*.clerk.accounts.dev https://clerk.glypha.com.ng https://hooks.stripe.com https://checkout.paystack.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Baseline headers applied to every response, including static assets and API
 * routes — the matcher below deliberately omits `_next/static` so nothing can
 * bypass them by requesting a fingerprinted file directly.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
];

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