import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import {
  buildContentSecurityPolicy,
  buildDegradedStaticContentSecurityPolicy,
  buildStaticContentSecurityPolicy,
  generateNonce,
} from '@/lib/csp';
import {
  isPrerenderedRoute,
  readLayoutScriptHashes,
  readPrerenderedScriptHashes,
  shouldWarnAboutFallback,
} from '@/lib/prerendered-csp';
import {
  isApiPath,
  isPathAllowedDuringMaintenance,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  type MaintenanceAllowlistOptions,
} from '@/lib/maintenance';

/**
 * Content-Security-Policy — one policy per response, chosen from what that
 * response will actually contain.
 * ============================================================
 * Built here rather than in `next.config.ts#headers()`, which is evaluated once
 * at boot and would hand every visitor the same static value. See `lib/csp.ts`
 * for the directives and for why the policy is written to BOTH the response and
 * the request headers: the browser enforces the response copy, while Next.js
 * and Clerk read the request copy to stamp `nonce="…"` onto the tags they
 * render.
 *
 * Three shapes, decided in `resolveContentSecurityPolicy`:
 *
 *   1. **Prerendered route → hashes.** The HTML was written at build time, so
 *      it carries no nonce and none can be minted for it — but its inline
 *      scripts are fixed, so their SHA-256 digests allow exactly those and
 *      nothing else. No `'unsafe-inline'`, which is the whole point: this is
 *      the storefront (`/`, `/courses`, …) where third-party content renders.
 *   2. **Request-rendered route → nonce.** Next reads the nonce off the request
 *      header and stamps it on every inline tag it emits, RSC payload
 *      included. This covers `/dashboard/**` *and* the public dynamic routes
 *      (`/sign-in`, `/verify/…`, `/courses/[slug]`, 404s) — which previously
 *      took the permissive static policy despite being rendered per request.
 *      The nonce alone is not quite enough: a `<script>` rendered by a React
 *      *component* (next-themes' theme script) carries no nonce, because the
 *      root layout cannot read `headers()` without de-prerendering the
 *      storefront. Those layout scripts are therefore added to the same
 *      directive by hash, read from the prerendered landing page so the value
 *      can never drift from what the bundler emitted (H-1b).
 *   3. **Build artifacts unreadable → degraded static.** Availability floor,
 *      identical to what this app shipped before the hash policy existed. See
 *      `buildDegradedStaticContentSecurityPolicy` for why "safe" rather than
 *      "strict" is the right direction to fail in: a hash or nonce policy
 *      aimed at a page that was rendered some other way blocks that page's own
 *      hydration and takes the site down.
 *   4. **`next dev` → the pre-H-1 split.** There is nothing to hash in
 *      development (no prerendered artifact, and any stale one carries text
 *      from a different minification), so public routes keep the permissive
 *      static policy and everything else a plain nonce. The strict policies
 *      are a production property, asserted by `tests/csp.test.ts` and by the
 *      build-time verification in `docs/SECURITY_AUDIT.md`.
 *
 * The other security headers (HSTS, X-Frame-Options, …) are static and stay in
 * `next.config.ts`; they do not vary per response.
 *
 * `rewriteTo` exists because maintenance mode answers with a rewrite rather
 * than a short-circuit response: the outage page is a real React route, so the
 * policy is resolved for *that* path — the body being served is its body — and
 * the request half rides along so the rendered `/maintenance` markup is nonced
 * and hydrates.
 *
 * `extraHeaders` rides along because the rewrite branch sets `Retry-After` and
 * it has to be in the `ResponseInit`: the status is passed here rather than
 * assigned afterwards, since `Response.status` is read-only.
 */
async function resolveContentSecurityPolicy(
  pathname: string,
  isPublic: boolean,
): Promise<string> {
  // Development has no artifact to hash: pages are compiled and rendered per
  // request, so `.next/server/app/*.html` is either missing or a stale copy of
  // a previous production build — whose (re-minified) script text would never
  // match what the dev server emits, and would break the page if served as a
  // hash policy. So dev keeps the split this app shipped before H-1 — public
  // routes get the permissive static policy, everything else a nonce — and the
  // strict policies are a production property, verified below by `pnpm build`
  // + the curl/Playwright checks rather than exercised in `next dev`.
  if (process.env.NODE_ENV === "development") {
    if (isPublic) return buildDegradedStaticContentSecurityPolicy();
    return buildContentSecurityPolicy(generateNonce());
  }

  const prerendered = isPrerenderedRoute(pathname);

  if (prerendered === true) {
    const hashes = await readPrerenderedScriptHashes(pathname);
    if (hashes) return buildStaticContentSecurityPolicy(hashes);

    // The manifest says there is a file here and there is not: the build
    // output is not fully visible to this process. Degrade, and say so once.
    if (shouldWarnAboutFallback(pathname)) {
      console.warn(
        `[csp] ${pathname} is prerendered but its HTML is not readable — ` +
          `serving the degraded static policy ('unsafe-inline')`,
      );
    }
    return buildDegradedStaticContentSecurityPolicy();
  }

  // Manifest unavailable: nothing distinguishes a static file from a render
  // here, so keep the split this app used before hashes existed — public
  // routes get the degraded static policy, everything else a fresh nonce.
  if (prerendered === null && isPublic) {
    if (shouldWarnAboutFallback(pathname)) {
      console.warn(
        `[csp] prerender-manifest.json is unreadable — public route ${pathname} ` +
          `is served with the degraded static policy ('unsafe-inline')`,
      );
    }
    return buildDegradedStaticContentSecurityPolicy();
  }

  // Rendered for this request: a nonce, plus the layout's own inline scripts
  // by hash (next-themes' theme script is rendered by React and carries no
  // nonce — without this it is blocked and dark-mode users get a flash of the
  // wrong theme; see H-1b and `readLayoutScriptHashes`).
  const nonce = generateNonce();
  const layoutHashes = await readLayoutScriptHashes();
  if (layoutHashes.length === 0 && shouldWarnAboutFallback("(layout-hashes)")) {
    console.warn(
      `[csp] no readable landing-page HTML — nonce policy for ${pathname} omits ` +
        `the layout's inline-script hashes, so next-themes' theme script is blocked`,
    );
  }
  return buildContentSecurityPolicy(nonce, layoutHashes);
}

async function withContentSecurityPolicy(
  request: NextRequest,
  rewriteTo?: string,
  status = 200,
  extraHeaders?: Record<string, string>,
  isPublic = false,
) {
  // For a rewrite the served body is the *target's* render, so that is the
  // path whose policy applies — hashing the requested path here would allow
  // hashes that appear nowhere in the HTML actually sent.
  const targetPath = rewriteTo ?? request.nextUrl.pathname;
  const csp = await resolveContentSecurityPolicy(targetPath, isPublic);

  // Next derives the nonce for every tag it renders by parsing this *request*
  // copy of the policy (`getScriptNonceFromHeader`), so the header has to be
  // written on both halves: the request copy is what makes the tags carry a
  // nonce, the response copy is what makes the browser accept them.
  //
  // There used to be a second request header, `X-Nonce`, carrying the bare
  // value. Nothing has read it since `app/layout.tsx` stopped passing a nonce
  // to next-themes, and its presence masked the fact that the theme script was
  // going unblessed (L-10 hid H-1b). Do not re-add it without a reader.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);

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
 *   /instructors(.*)     a public instructor profile is a shareable page, and
 *                        the point of sharing it is that the recipient does not
 *                        need an account to read it. The data behind it is
 *                        already public: `instructors.getPublicProfile` returns
 *                        only instructors/admins and only their published
 *                        courses.
 *   /verify(.*)          certificate verification is meant for outsiders
 *   /become-instructor   an applicant with no account can still apply
 *   /maintenance         the outage notice, which is aimed at signed-out people
 *   /opengraph-image,    the file-based metadata image routes. These have NO
 *   /twitter-image       file extension, so the matcher below does not skip
 *                        them, and they are what a crawler fetches when a link
 *                        is shared. They must load signed out: an anonymous
 *                        `auth.protect()` here is a 307 to Clerk, and the
 *                        link preview renders as a login page. The nested ones
 *                        (`/courses/<slug>/opengraph-image`) are already covered
 *                        by the `/courses(.*)` and `/instructors(.*)` entries.
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
  // See the route-map above: a shared profile page has to open for the person
  // it was shared with, who by definition may have no account.
  '/instructors(.*)',
  '/verify(.*)',
  '/become-instructor',
  '/support(.*)',
  // The maintenance page must load signed out, for the same reason the gate has
  // to allow it at all: it is shown to people who by definition have no session
  // (and to staff, who do). Without this entry `auth.protect()` redirects the
  // outage page to sign-in, so a visitor who bookmarks it gets a login form
  // during the outage — the one moment the notice matters most.
  '/maintenance',
  // File-based metadata images — see the route-map above. Extensionless, so
  // the matcher does not skip them, and anonymous by definition: the crawler
  // fetching a share card has no session.
  '/opengraph-image',
  '/twitter-image',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
  '/manifest.webmanifest',
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
const MAINTENANCE_CACHE_TTL_MS = 30_000;

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
// per request. 30s is the price of the toggle: flipping it takes effect within
// thirty seconds anywhere, which is acceptable during an outage and bounded
// during an incident. Storing only "the site is down or it is not" keeps this
// free of per-user state — nothing cached here is ever decision-relevant to a
// caller.
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
 * Every exit records why. It used to be a single `catch { return false }`,
 * which meant an operator who had just taken the site down and could not get
 * back in had nothing to read — the two realistic causes (no session token,
 * versus a Convex query that threw) looked identical from the outside and had
 * entirely different fixes. `maintenance.preflight` is the other half of that
 * diagnosis: this function says *that* the bypass failed, the query says why.
 *
 * Only consulted while maintenance is actually on and the path is actually
 * blocked, so its cost — a token mint plus an authenticated query — is paid
 * only during an outage. Note that the no-token line is the high-volume one:
 * every signed-out visitor blocked during an outage writes one, which is
 * acceptable precisely because that path does no network work.
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
  if (!url) {
    console.error('[maintenance] staff check could not run: NEXT_PUBLIC_CONVEX_URL is not set');
    return false;
  }

  let token: string | null = null;
  try {
    token = await auth.getToken();
  } catch (error) {
    console.error(
      '[maintenance] staff check could not read a session token — the session or its issuer is wrong',
      error,
    );
    return false;
  }

  if (!token) {
    // The common case during an outage is a signed-out visitor, so this is not
    // an error — but for an operator who believed they were signed in it is the
    // entire answer, and it costs no network round-trip to record.
    console.error('[maintenance] staff check found no session token for this request');
    return false;
  }

  try {
    const client = new ConvexHttpClient(url);
    client.setAuth(token);
    return await client.query(isMaintenanceStaff, {});
  } catch (error) {
    // Fails closed, and now visibly: a throwing query means the `users` lookup
    // or the deployment itself is the problem, not the visitor's session.
    console.error(
      '[maintenance] staff check threw while resolving the caller against Convex',
      error,
    );
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
async function maintenanceResponse(request: NextRequest) {
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

  const isPublic = isPublicRoute(req);
  if (!isPublic) {
    await auth.protect()
  }

  // Reached only for requests allowed through the map above (a failed
  // `auth.protect()` redirects instead), so every response that actually
  // renders carries a policy — chosen there from what will be served (hashes
  // for prerendered HTML, a nonce for anything rendered for this request, the
  // degraded static policy only if the build artifacts are unreadable).
  return withContentSecurityPolicy(req, undefined, 200, undefined, isPublic)
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml|json)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};