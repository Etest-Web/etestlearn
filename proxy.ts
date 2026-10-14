import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { buildContentSecurityPolicy, generateNonce } from '@/lib/csp';
import {
  isApiPath,
  isPathAllowedDuringMaintenance,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  type MaintenanceAllowlistOptions,
} from '@/lib/maintenance';

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
 *
 * `rewriteTo` exists because maintenance mode answers with a rewrite rather
 * than a short-circuit response: the outage page is a real React route, so it
 * gets the same treatment as the page it replaced — including the *request*
 * half of the policy, without which the rendered `/maintenance` markup would
 * carry no nonce and hydrate as a dead page.
 *
 * `extraHeaders` rides along because the rewrite branch sets `Retry-After` and
 * it has to be in the `ResponseInit`: the status is passed here rather than
 * assigned afterwards, since `Response.status` is read-only.
 */
function withContentSecurityPolicy(
  request: NextRequest,
  rewriteTo?: string,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('X-Nonce', nonce);

  const init = {
    request: { headers: requestHeaders },
    status,
    ...(extraHeaders ? { headers: extraHeaders } : {}),
  };

  const response = rewriteTo
    ? NextResponse.rewrite(new URL(rewriteTo, request.url), init)
    : NextResponse.next(init);

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
 *   /become-instructor   an applicant with no account can still apply
 *   /maintenance         the outage notice, which is aimed at signed-out people
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
  '/sso-callback(.*)',
  '/',
  '/courses(.*)',
  '/verify(.*)',
  '/become-instructor',
  // The maintenance page must load signed out, for the same reason the gate has
  // to allow it at all: it is shown to people who by definition have no session
  // (and to staff, who do). Without this entry `auth.protect()` redirects the
  // outage page to sign-in, so a visitor who bookmarks it gets a login form
  // during the outage — the one moment the notice matters most.
  '/maintenance',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
  '/llms.txt',
  // Public form endpoint — see the route-map above. Without this entry
  // auth.protect() would 401 it for signed-out applicants.
  '/api/instructor-applications/notify',
])

/**
 * Maintenance mode
 * =================
 * A platform-wide switch (`convex/maintenance.ts`, policy in
 * `lib/maintenance.ts`) that answers `503` to everything except an explicit
 * allow-list — of which applying to become an instructor is the point.
 *
 * **Why the gate lives here and not in a page or the root layout.** This is the
 * only place that runs before `auth.protect()`, so it is the only place that can
 * answer a signed-out visitor with the outage page instead of a redirect to
 * sign-in. It is also the only place that runs before prerendered HTML is
 * served, which is what makes the block real rather than cosmetic: a statically
 * generated `/courses` page is intercepted before a byte of it reaches the
 * browser. A layout gate would still let every cached static asset through.
 *
 * **Fail-open, deliberately.** The status read is one Convex query per request,
 * and if it throws — deployment unreachable, function not yet deployed after a
 * push, the URL unset in a preview build — the site renders normally. A
 * maintenance gate that manufactures an outage because its own dependency
 * blipped would be strictly worse than no gate at all. The opposite rule
 * applies to the *staff* check below, where failing open would hand anonymous
 * callers the whole site.
 */
const MAINTENANCE_CACHE_TTL_MS = 5_000;

type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  allowInstructorApplications: boolean;
  updatedAt: number | null;
};

/**
 * Referenced by wire name rather than `api.maintenance.*`.
 *
 * Two reasons, both about not pulling the generated api object into an Edge
 * bundle: `convex/_generated/api` type-checks only after codegen has run (see
 * `lib/durable-rate-limit.ts` for the same workaround), and importing it here
 * would drag every module in `convex/` into the middleware's graph. The strings
 * are the ones codegen emits.
 */
const getMaintenanceStatus = makeFunctionReference<
  'query',
  Record<string, never>,
  MaintenanceStatus
>('maintenance:getStatus');

const isMaintenanceStaff = makeFunctionReference<
  'query',
  Record<string, never>,
  boolean
>('maintenance:isStaffCaller');

// Module scope, so the read is once per Edge isolate per TTL rather than once
// per request. 5s is the price of the toggle: flipping it takes effect within
// five seconds anywhere, which is invisible during an outage and bounded during
// an incident. Storing only "the site is down or it is not" keeps this free of
// per-user state — nothing cached here is ever decision-relevant to a caller.
let maintenanceCache: { status: MaintenanceStatus; expiresAt: number } | null = null;

const MAINTENANCE_OFF: MaintenanceStatus = {
  enabled: false,
  message: '',
  allowInstructorApplications: true,
  updatedAt: null,
};

async function readMaintenanceStatus(): Promise<MaintenanceStatus> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) {
    return maintenanceCache.status;
  }

  let status = MAINTENANCE_OFF;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (url) {
    try {
      status = await new ConvexHttpClient(url).query(getMaintenanceStatus, {});
    } catch {
      // Fail open — see the note above. A stale "off" is the safe direction:
      // the alternative is a Convex hiccup taking the storefront down.
    }
  }

  maintenanceCache = { status, expiresAt: now + MAINTENANCE_CACHE_TTL_MS };
  return status;
}

/**
 * Whether this caller is staff, resolved against Convex.
 *
 * The escape hatch that keeps the gate from locking the platform's own
 * operators out of the console that switches it off — without which turning
 * maintenance on would be a one-way door.
 *
 * The identity is proved, not asserted: the caller has to present a Clerk
 * session token and Convex resolves the `users` row, so this cannot be spoofed
 * by a query parameter or a header. It fails **closed** (any error, no token,
 * no session ⇒ not staff), which is the opposite of the status read above and
 * for the opposite reason: here, failing open would give every anonymous
 * visitor the full site.
 *
 * Only consulted while maintenance is actually on and the path is actually
 * blocked, so its cost — a token mint plus an authenticated query — is paid
 * only during an outage.
 */
/**
 * The one capability this needs. Narrowed structurally rather than to Clerk's
 * session-auth type: the handler's `auth` is typed as `AuthFn` (the
 * server-component shape), which does not declare `getToken`, so naming it
 * would force a cast at the call site. Declaring the surface actually used means
 * the compiler checks the call rather than the assertion.
 */
type TokenBearer = {
  getToken(): Promise<string | null>;
};

async function isStaffRequest(auth: TokenBearer): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return false;

  try {
    const token = await auth.getToken();
    if (!token) return false;

    const client = new ConvexHttpClient(url);
    client.setAuth(token);
    return await client.query(isMaintenanceStaff, {});
  } catch {
    return false;
  }
}

/**
 * The outage response.
 *
 * Two shapes, because one shape cannot serve both callers: an HTML rewrite for
 * pages (the visitor gets a page with the admin's note on it) and a JSON 503
 * for `/api` — handing a `fetch()` the outage page's HTML where it expected
 * JSON turns a clean outage into an unhandled parse error in client code.
 *
 * `Retry-After` is the honest part of the 503: this is a state the operator
 * resolves deliberately, not a rate limit, and a crawler or client that backs
 * off will come back on its own.
 */
function maintenanceResponse(request: NextRequest) {
  const retryAfter = String(MAINTENANCE_RETRY_AFTER_SECONDS);

  if (isApiPath(request.nextUrl.pathname)) {
    const response = NextResponse.json(
      {
        error: 'maintenance',
        message: 'Glypha Learn is temporarily unavailable.',
        retryAfterSeconds: MAINTENANCE_RETRY_AFTER_SECONDS,
      },
      { status: 503, headers: { 'Retry-After': retryAfter } },
    );
    response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(generateNonce()));
    return response;
  }

  // Rewrite, not redirect: the visitor keeps the URL they asked for (so a
  // bookmark or a shared link still resolves once the site returns) and the
  // address bar does not fill with a page they never navigated to.
  return withContentSecurityPolicy(request, '/maintenance', 503, { 'Retry-After': retryAfter });
}

export default clerkMiddleware(async (auth, req) => {
  const status = await readMaintenanceStatus();

  if (
    status.enabled &&
    !isPathAllowedDuringMaintenance(req.nextUrl.pathname, {
      allowInstructorApplications: status.allowInstructorApplications,
    } satisfies MaintenanceAllowlistOptions)
  ) {
    // Staff fall through rather than returning early — they must still meet
    // `auth.protect()` on protected routes below, exactly as they would with
    // the switch off.
    //
    // The cast is because Clerk types the middleware handler's `auth` as the
    // *server-component* `auth()` shape (`AuthFn`, a callable with `protect`),
    // while the value actually handed to a middleware handler is the resolved
    // session object, which does carry `getToken` — `clerkMiddleware.js` passes
    // `requestState.toAuth()` straight through. Narrowing to the one method used
    // here keeps the assumption in one place instead of spreading `any`.
    if (!(await isStaffRequest(auth as unknown as TokenBearer))) {
      return maintenanceResponse(req);
    }
  }

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
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml|json)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};