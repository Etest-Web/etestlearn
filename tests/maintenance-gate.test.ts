import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { isPathAllowedDuringMaintenance, MAINTENANCE_OVERRIDE_ENV } from "@/lib/maintenance";

/**
 * The gate lives in `proxy.ts`, which the suite cannot execute — it is an Edge
 * middleware wrapped in `clerkMiddleware`, and the project is node-only with no
 * DOM. So the two things that can be asserted about it structurally are asserted
 * here as source shape, which is the same technique
 * `tests/route-guards.test.ts` and `tests/csp.test.ts` already use.
 *
 * The behavioural half — *which* routes survive — is not asserted here. It is
 * covered exhaustively in `lib/maintenance.test.ts`, against the same
 * `isPathAllowedDuringMaintenance` this middleware imports. These tests exist to
 * catch the failure mode unit tests cannot: the gate being described correctly
 * and wired up wrongly.
 */

const REPO_ROOT = process.cwd();
const proxy = readFileSync(join(REPO_ROOT, "proxy.ts"), "utf8");

describe("the maintenance gate is wired into proxy.ts", () => {
  test("reads the status from the deployment on every request", () => {
    expect(proxy).toContain("maintenance:getStatus");
  });

  test("checks the flag *before* auth.protect()", () => {
    // The ordering is the feature. After `auth.protect()`, a signed-out visitor
    // hitting `/dashboard` is already redirected to sign-in and never reaches
    // the gate — so the maintenance page would only ever be seen by people who
    // have an account, which is exactly the opposite of the intent.
    //
    // Scoped to the handler body: `auth.protect()` is named in the route-map
    // comment above the export too, so searching the whole file would find that
    // occurrence first and assert nothing.
    const handlerStart = proxy.indexOf("export default clerkMiddleware(");
    expect(handlerStart).toBeGreaterThan(-1);
    const handler = proxy.slice(handlerStart);

    const gateIndex = handler.indexOf("readMaintenanceStatus()");
    const protectIndex = handler.indexOf("auth.protect()");

    expect(gateIndex).toBeGreaterThan(-1);
    expect(protectIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(protectIndex);
  });

  test("fails open when the status read throws, and fails closed on the staff check", () => {
    // The asymmetry is deliberate and load-bearing: a Convex blip must not take
    // the storefront offline, but an unidentifiable caller must not be handed the
    // whole site. Asserted by shape — the read catches, the staff check returns
    // false — because the alternative is an outage nobody notices until traffic.
    const readBody = proxy.slice(
      proxy.indexOf("async function readMaintenanceStatus"),
      proxy.indexOf("async function isStaffRequest"),
    );
    expect(readBody).toContain("catch");
    expect(readBody).not.toMatch(/catch\s*\{\s*return null/);

    const staffBody = proxy.slice(
      proxy.indexOf("async function isStaffRequest"),
      proxy.indexOf("function maintenanceResponse"),
    );
    expect(staffBody).toContain("catch");
    // Still fails closed. The assertion is looser than a bare `catch { return
    // false` because the catch now binds the error and records it before it
    // gives up — see the test below — and the property being guarded is the
    // *return*, not the absence of a log line. The binding is optional in the
    // pattern for the same reason.
    expect(staffBody).toMatch(/catch\s*(?:\([^)]*\)\s*)?\{[\s\S]*?return false/);
  });

  test("records why the staff check failed, so a lockout is diagnosable afterwards", () => {
    // The gap this closes: every failure collapsed into a bare `return false`,
    // so an admin who could not get back in had nothing to read. The two
    // branches are different fixes — no token means the session or the issuer
    // is wrong; a throwing query means the `users` lookup or the deployment is
    // wrong — and they are indistinguishable from the outside.
    const staffBody = proxy.slice(
      proxy.indexOf("async function isStaffRequest"),
      proxy.indexOf("function maintenanceResponse"),
    );
    expect(staffBody).toContain("console.error");
    expect(staffBody).toMatch(/no session token/i);
    expect(staffBody).toMatch(/staff check threw/i);
  });

  test("proves staff identity through a session token, not a client-supplied argument", () => {
    // The exemption is the one hole in the gate, so it has to be a real identity
    // check. A `userId` argument or a header would let anyone in.
    expect(proxy).toContain("auth.getToken()");
    expect(proxy).toContain("client.setAuth(token)");
    expect(proxy).toContain("maintenance:isStaffCaller");
  });

  test("answers 503 with Retry-After rather than a bare rewrite", () => {
    expect(proxy).toContain("Retry-After");
    expect(proxy).toContain("503");
  });

  test("Retry-After is set on the page rewrite, not only on the JSON branch", () => {
    // It is passed through the `ResponseInit` on both paths, because
    // `Response.status`/`headers` cannot be assigned after construction. Asserted
    // because a `Retry-After` that only reaches `/api` callers leaves crawlers
    // hitting a page with no back-off signal.
    expect(proxy).toMatch(
      /withContentSecurityPolicy\(request, '\/maintenance', 503, \{ 'Retry-After': retryAfter \}\)/,
    );
  });

  test("gives API callers JSON, not the HTML page", () => {
    // A `fetch()` handed the outage page's HTML where it expected JSON turns a
    // clean outage into an unhandled parse error in client code.
    expect(proxy).toContain("isApiPath");
    expect(proxy).toContain("NextResponse.json");
  });

  test("keeps the content-security-policy on the rewritten page", () => {
    // Without the request half of the CSP the rewritten markup would render with
    // no nonce: the outage page would be the only page on the site with no CSP,
    // and would not hydrate.
    expect(proxy).toContain("NextResponse.rewrite");
    expect(proxy).toMatch(
      /withContentSecurityPolicy\(request, '\/maintenance', 503, \{ 'Retry-After': retryAfter \}\)/,
    );
  });

  test("does not exempt a class of users the module does not define", () => {
    // A path-level bypass for `/dashboard` would let any signed-in student in.
    // The gate must consult the shared predicate, never match a path inline.
    expect(proxy).toContain("isPathAllowedDuringMaintenance");
    expect(proxy).not.toMatch(/startsWith\('\/dashboard'\)/);
  });
});

describe("the maintenance page is reachable and the gate's destination is allowlisted", () => {
  test("/maintenance is in the allow-list, so the rewrite cannot loop", () => {
    // The one entry that is a consequence of the gate existing rather than of
    // the product: without it, every blocked request rewrites to a route that
    // rewrites to itself.
    expect(
      isPathAllowedDuringMaintenance("/maintenance", {
        allowInstructorApplications: false,
      }),
    ).toBe(true);
  });

  test("/maintenance is public to auth, not just to the maintenance gate", () => {
    // Two separate maps, and it has to be in both. Allowing it in
    // `MAINTENANCE_ALLOWED_ROUTES` stops the gate from rewriting it to itself;
    // allowing it in `isPublicRoute` stops `auth.protect()` from redirecting the
    // outage page to sign-in. Missing the second one means the notice is
    // unreachable for exactly the signed-out visitors it exists for.
    const publicBlock = proxy.slice(
      proxy.indexOf("const isPublicRoute"),
      proxy.indexOf("export default clerkMiddleware("),
    );
    expect(publicBlock).toMatch(/'\/maintenance'/);
  });

  test("the page exists, and reads the note without a client round-trip", () => {
    const page = readFileSync(
      join(REPO_ROOT, "app/maintenance/page.tsx"),
      "utf8",
    );
    expect(page).toContain("maintenance:getStatus");
    expect(page).toContain("DEFAULT_MAINTENANCE_MESSAGE");
    // A page whose whole job is to be legible during an outage should not depend
    // on a second client fetch to render its text.
    expect(page).not.toContain('"use client"');
  });

  test("the page offers the application form only while applications are allowed", () => {
    const page = readFileSync(
      join(REPO_ROOT, "app/maintenance/page.tsx"),
      "utf8",
    );
    expect(page).toContain("allowInstructorApplications");
    expect(page).toContain("/become-instructor");
  });

  test("the page tells crawlers not to index it", () => {
    const page = readFileSync(
      join(REPO_ROOT, "app/maintenance/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/robots:\s*\{[^}]*index:\s*false/);
  });

  test("the page does not claim the outage was scheduled", () => {
    // The badge was hardcoded, so an emergency outage announced itself as
    // planned work — the one thing the reader most needs to know accurately is
    // whether this was expected. Neutral copy is true in both cases.
    const page = readFileSync(
      join(REPO_ROOT, "app/maintenance/page.tsx"),
      "utf8",
    );
    expect(page).not.toContain("Scheduled maintenance");
  });
});

describe("the admin console can always get back in", () => {
  test("the toggle route is behind the admin segment guard, not merely in the nav", () => {
    // Navigation is not protection. The page must resolve to the shared
    // AdminGuard in the segment layout, which server-side role checks back up.
    const layout = readFileSync(
      join(REPO_ROOT, "app/dashboard/admin/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("<AdminGuard>");
  });

  test("the toggle mutation is admin-gated server-side", () => {
    const mod = readFileSync(join(REPO_ROOT, "convex/maintenance.ts"), "utf8");
    expect(mod).toMatch(/setMode[\s\S]*?requireAdmin\(ctx\)/);
  });

  test("the console preflights the bypass before the switch will arm", () => {
    // The lockout this guards against: the switch turns on, and the only
    // account that can turn it off can no longer reach the page that does. The
    // console must ask the deployment whether *this* caller would get back in,
    // and refuse to arm while the answer is no — before, not after, the site is
    // down.
    const page = readFileSync(
      join(REPO_ROOT, "app/dashboard/admin/maintenance/page.tsx"),
      "utf8",
    );
    expect(page).toContain("api.maintenance.preflight");
    expect(page).toContain("bypassWorks");
  });

  test("the console explains an active kill-switch rather than showing a switch that disagrees", () => {
    // With `MAINTENANCE_OVERRIDE=off` set, the stored switch still reads on while
    // the site serves normally. Printing the variable name is what makes the
    // lever findable again — "the site is up but the console says down" is
    // otherwise an unexplained contradiction, and the fix is to remove the env
    // var rather than to toggle anything.
    const page = readFileSync(
      join(REPO_ROOT, "app/dashboard/admin/maintenance/page.tsx"),
      "utf8",
    );
    expect(page).toContain("overrideActive");
    expect(page).toContain(MAINTENANCE_OVERRIDE_ENV);
  });

  test("the console says when the site went down, not merely that it is down", () => {
    // `setMode` has stamped `enabledAt` on the rising edge since the switch was
    // written, and nothing read it. The line it replaced — "live since this
    // switch was last turned on" — could not answer the question the field was
    // added for, so an outage had no start time in the one place an operator
    // would look.
    const page = readFileSync(
      join(REPO_ROOT, "app/dashboard/admin/maintenance/page.tsx"),
      "utf8",
    );
    expect(page).toContain("enabledAt");
    expect(page).not.toContain("Live since this switch was last turned on.");
  });
});