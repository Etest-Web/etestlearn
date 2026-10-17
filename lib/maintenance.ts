/**
 * Maintenance mode — the policy, in one place.
 * ===========================================
 * Everything about "what does the site serve while it is down?" is decided here
 * and nowhere else: the copy, its length ceiling, and the set of routes that
 * survive. This is the same single-source shape `lib/publishing.ts` (the
 * unpublish rule) and `lib/certificates.ts` (the completion rule) already have,
 * and for the same reason — the rule is consulted from three runtimes that
 * cannot see each other (`proxy.ts` in the Edge runtime, `convex/maintenance.ts`
 * on the deployment, and the maintenance page itself). A copy of the allow-list
 * living in each would drift the first time somebody added a route to one of
 * them, and the failure is a site that is either unreachable or half-open during
 * an outage.
 *
 * It is imported by `convex/`, so nothing here may reach for a Next-only API.
 */

/** What a visitor is told when an admin has not written their own note. */
export const DEFAULT_MAINTENANCE_MESSAGE =
  "We’re carrying out scheduled maintenance and will be back shortly.";

/**
 * Ceiling on the admin-authored note.
 *
 * Long enough for "we're migrating the database and expect to be back by 6pm,
 * your enrollment and progress are safe", short enough that the maintenance
 * page cannot be used as a landing page for arbitrary content. Collapses
 * internal whitespace first so a pasted paragraph cannot pad its way past the
 * limit with invisible characters.
 */
export const MAX_MAINTENANCE_MESSAGE_LENGTH = 280;

/**
 * Trims, collapses runs of whitespace, and hard-caps the admin's note.
 *
 * Called from the mutation rather than only at render time so the stored string
 * is already in its final form — a note that renders as 280 characters should
 * not be sitting in the database as 4,000.
 */
export function normalizeMaintenanceMessage(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MAINTENANCE_MESSAGE_LENGTH);
}

/**
 * Routes that stay reachable while maintenance mode is on, whatever the
 * instructor-application setting.
 *
 * Grouped by *why*, because "add one more" is only safe while the reason is
 * still true:
 *
 *   · `/sign-in`, `/sign-up`, `/sso-callback` — the only way to reach the
 *     application form at all, since submitting one requires an account. An
 *     outage that blocks sign-in silently swallows every application too.
 *   · `/become-instructor` — the one thing the outage is *for* (see
 *     `MAINTENANCE_APPLICATION_ROUTES`).
 *   · `/maintenance` — where the gate itself rewrites to. Omitting this is an
 *     infinite rewrite loop.
 *   · `/api/instructor-applications/notify` — where that form posts. Allowing
 *     the page without the endpoint would give applicants a form that appears
 *     to succeed and notifies nobody.
 *   · `/courses/paid` — where Paystack redirects a learner *after* the money has
 *     moved. See the note beside the entry: blocking it strands a paid, enrolled
 *     learner on the outage notice.
 *   · `robots.txt`, `sitemap.xml`, `manifest.json`, `llms.txt` — crawler
 *     surfaces. A 503 on robots.txt is read as "disallow everything"; serving
 *     the sitemap while the pages themselves answer 503 is the correct signal
 *     for a temporary outage (revisit later, do not deindex).
 *
 * A `(.*)` suffix means "this path and everything under it".
 */
export const MAINTENANCE_ALLOWED_ROUTES: readonly string[] = [
  "/maintenance",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
  "/api/instructor-applications/notify",
  // The payment callback, not the catalogue. `convex/paystack.ts` sets this as
  // Paystack's `callback_url`, and the page verifies the reference and renders
  // the receipt. The failure it prevents is specific and expensive: the webhook
  // settles on the Convex origin, which this gate never sees, so the enrollment
  // is granted either way — blocking the landing page just means a learner is
  // charged and enrolled while being shown a page saying the site is down. That
  // reads as "my payment failed" and ends in a chargeback.
  //
  // It is not a hole in the catalogue: the page only resolves one reference, and
  // `matchesRoute` keeps this to `/courses/paid` and below rather than
  // reopening `/courses` itself.
  "/courses/paid(.*)",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
  "/llms.txt",
];

/**
 * Reachable only while `allowInstructorApplications` is on.
 *
 * Kept separate from the list above so the setting can be turned off during a
 * genuine emergency (the reason the field exists) without anyone having to edit
 * a route array in the middleware at 3am. When it is off, `/become-instructor`
 * is served the maintenance page like every other page — which is honest: the
 * form still works, so leaving it open would promise a queue nobody is reading.
 */
export const MAINTENANCE_APPLICATION_ROUTES: readonly string[] = [
  "/become-instructor",
];

/**
 * Matches one allow-list entry against a pathname.
 *
 * Segment-aware on purpose: `pathname.startsWith(prefix)` would let
 * `/become-instructor-report` slip through an entry for `/become-instructor`,
 * and `startsWith("/sign-in")` would match `/sign-in-help`. A suffix must be a
 * real path boundary (`/` or end of string), which is the same rule
 * `isCurrentPath` applies to the dashboard nav.
 */
function matchesRoute(route: string, pathname: string): boolean {
  if (!route.endsWith("(.*)")) return pathname === route;
  const prefix = route.slice(0, -"(.*)".length);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The input to {@link isPathAllowedDuringMaintenance}. */
export type MaintenanceAllowlistOptions = {
  allowInstructorApplications: boolean;
};

/**
 * Whether this request may be served normally while maintenance mode is on.
 *
 * The single predicate `proxy.ts` asks. It takes the setting rather than
 * reading it so the decision stays pure and testable — `lib/maintenance.test.ts`
 * is one of the two globs the suite actually runs, and a route list that cannot
 * be unit-tested is a route list that will grow a typo nobody notices until an
 * outage.
 */
export function isPathAllowedDuringMaintenance(
  pathname: string,
  options: MaintenanceAllowlistOptions,
): boolean {
  const routes = options.allowInstructorApplications
    ? [...MAINTENANCE_ALLOWED_ROUTES, ...MAINTENANCE_APPLICATION_ROUTES]
    : MAINTENANCE_ALLOWED_ROUTES;
  return routes.some((route) => matchesRoute(route, pathname));
}

/**
 * True for Next.js API routes.
 *
 * They are blocked like everything else during maintenance, but they must be
 * answered with a JSON 503 rather than the rewritten HTML page — handing a
 * `fetch()` an HTML body where it expected JSON turns a clean outage into a
 * parse error in somebody's client code.
 */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Seconds advertised in `Retry-After` on the 503. */
export const MAINTENANCE_RETRY_AFTER_SECONDS = 3600;

/**
 * The kill-switch: an env var on the Convex deployment that forces the site
 * back up regardless of the stored switch.
 *
 * This exists for one scenario and it is the reason it is not redundant with the
 * admin console: **an operator who is locked out.** The gate fails open on a
 * Convex blip, but a readable flag combined with a broken staff exemption is
 * the case it cannot heal from — the site is down, and the console that turns it
 * off resolves its own permission through the very lookup that has stopped
 * working. Setting an env var on the deployment needs no session, no app and no
 * rebuild (`npx convex env set` propagates in seconds), which is exactly what
 * that situation allows.
 *
 * Deliberately one-directional. It can only *release* the site: forcing
 * maintenance on through an env var would be a footgun with no audit trail and
 * no console involved, and nobody has ever needed it.
 */
export const MAINTENANCE_OVERRIDE_ENV = "MAINTENANCE_OVERRIDE";

/** The one value that means anything. See {@link isMaintenanceOverridden}. */
export const MAINTENANCE_OVERRIDE_OFF = "off";

/**
 * Whether the deployment is forcing the site back up.
 *
 * Exact match, deliberately. The reader runs in a dashboard at 3am, so the
 * tempting near-misses (`"Off"`, `" off"`, `"true"`, `"1"`) are all mistakes a
 * person actually makes — and every one of them must leave the stored switch in
 * charge. Silently opening the site because of a typo would be worse than
 * having no lever at all, and treating a typo as "the lever is armed" would
 * send whoever set it chasing a override that never existed.
 */
export function isMaintenanceOverridden(raw: string | undefined): boolean {
  return raw === MAINTENANCE_OVERRIDE_OFF;
}