import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, generateNonce } from '@/lib/csp';

/**
 * Content-Security-Policy (nonce-based)
 * ======================================
 * Built per request here rather than in `next.config.ts#headers()`, which is
 * evaluated once at boot and would hand every visitor the same static value —
 * useless for a nonce. See `lib/csp.ts` for the directives and for why the
 * policy is written to BOTH the response and the request headers: the browser
 * enforces the response copy, while Next.js and Clerk read the request copy to
 * stamp `nonce="…"` onto the tags they render.
 *
 * This is what repairs the landing page: without a nonce, `script-src` had no
 * `'unsafe-inline'`, so all ~58 inline scripts (the RSC payload included) were
 * blocked, React never hydrated, and every `.reveal` block stayed at
 * `opacity: 0`.
 *
 * The other security headers (HSTS, X-Frame-Options, …) are static and stay in
 * `next.config.ts`; they do not vary per response.
 */
function withContentSecurityPolicy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('X-Nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * Route-map policy
 * =================
 * Everything that is not listed below requires a Clerk session: the matcher
 * runs for pages AND for '/(api|trpc)(.*)', so `auth.protect()` would 401
 * unlisted API routes too. Public entries are therefore an explicit, rare
 * exemption — each one below is public because it *cannot* have a session,
 * and each defends itself (see the comments on the entries).
 *
 * Pages (public):
 *   /                    landing page
 *   /sign-in, /sign-up   auth entry points — must load signed out
 *   /courses(.*)         catalog is browsable without an account
 *   /verify(.*)          certificate verification is meant for outsiders
 *
 * API routes (public):
 *   /api/instructor-applications/notify
 *                        the instructor application form posts here from
 *                        signed-out visitors; the route is designed to be
 *                        unauthenticated and defends itself with a
 *                        same-origin check (Sec-Fetch-Site/Origin), an
 *                        IP rate limit, and field caps/URL validation —
 *                        public ≠ undefended. Everything else under /api
 *                        stays behind auth.protect().
 *
 * Not proxied here:
 *   Convex endpoints (queries/mutations/webhooks) live on the deployment's
 *   *.convex.site / *.convex.cloud origin and never pass through this
 *   middleware. Clerk's svix webhook handler is mounted in convex/http.ts
 *   and authenticates on the svix signature; token-gated Convex mutations
 *   (e.g. users.syncFromClerk) authenticate on their own secret. Those
 *   surfaces must never rely on this file for protection.
 */
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/',
  '/courses(.*)',
  '/verify(.*)',
  // Public form endpoint — see the route-map above. Without this entry
  // auth.protect() would 401 it for signed-out applicants.
  '/api/instructor-applications/notify',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }

  // Reached only for requests allowed through the map above (a failed
  // `auth.protect()` redirects instead), so every HTML response that actually
  // renders carries the policy.
  return withContentSecurityPolicy(req)
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
