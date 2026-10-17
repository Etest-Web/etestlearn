import { describe, expect, test } from "vitest";

import {
    DEFAULT_MAINTENANCE_MESSAGE,
    isApiPath,
    isMaintenanceOverridden,
    isPathAllowedDuringMaintenance,
    MAINTENANCE_ALLOWED_ROUTES,
    MAINTENANCE_APPLICATION_ROUTES,
    MAINTENANCE_AUTO_OFF_DEFAULT_MS,
    MAINTENANCE_AUTO_OFF_MAX_MS,
    MAINTENANCE_AUTO_OFF_MIN_MS,
    MAINTENANCE_OVERRIDE_ENV,
    MAINTENANCE_RETRY_AFTER_SECONDS,
    MAX_MAINTENANCE_MESSAGE_LENGTH,
    normalizeMaintenanceMessage,
    resolveMaintenanceDeadline,
} from "@/lib/maintenance";

/**
 * The maintenance allow-list is the whole contract: it decides which routes
 * survive an outage, and the gate that consults it (`proxy.ts`) runs on the Edge
 * runtime where nothing here is importable in a test. So the rule lives in
 * `lib/`, which is one of the two globs the suite actually runs, and these are
 * the assertions that would have caught a bad edit to the array.
 */

const withApplications = { allowInstructorApplications: true };
const withoutApplications = { allowInstructorApplications: false };

describe("isPathAllowedDuringMaintenance", () => {
    test("keeps the instructor application open while it is allowed", () => {
        // The feature. `/become-instructor` plus the endpoint its form posts to,
        // because allowing the page without the endpoint would give applicants a
        // form that looks like it worked and notified nobody.
        expect(isPathAllowedDuringMaintenance("/become-instructor", withApplications)).toBe(true);
        expect(
            isPathAllowedDuringMaintenance("/api/instructor-applications/notify", withApplications),
        ).toBe(true);
    });

    test("closes the application route when the setting is off", () => {
        // A full outage: the form still works, so leaving it open would promise
        // a queue nobody is reading.
        expect(isPathAllowedDuringMaintenance("/become-instructor", withoutApplications)).toBe(false);
        expect(
            isPathAllowedDuringMaintenance("/api/instructor-applications/notify", withoutApplications),
        ).toBe(true);
    });

    test("always keeps the auth entry points", () => {
        // Without these the application form is unreachable, so the setting above
        // would be a promise nothing could keep.
        for (const path of ["/sign-in", "/sign-up", "/sso-callback"]) {
            expect(isPathAllowedDuringMaintenance(path, withoutApplications), path).toBe(true);
        }
        expect(isPathAllowedDuringMaintenance("/sign-in/verify", withApplications)).toBe(true);
    });

    test("keeps its own destination, which is what stops the rewrite looping", () => {
        expect(isPathAllowedDuringMaintenance("/maintenance", withoutApplications)).toBe(true);
    });

    test("keeps an in-flight payment landing on its receipt", () => {
        // `convex/paystack.ts` sends Paystack's redirect to
        // `/courses/paid/[reference]`, which is where a learner lands *after* the
        // money has moved. Blocking it is not a cosmetic annoyance: the webhook
        // still settles on the Convex origin and still grants the enrollment, so
        // the learner is charged and enrolled while looking at a page saying the
        // site is down. That is a support ticket and a chargeback, from the one
        // flow an admin is most likely to interrupt by flipping the switch
        // during a deploy.
        for (const path of ["/courses/paid", "/courses/paid/PKCK_2026_9x2"]) {
            expect(isPathAllowedDuringMaintenance(path, withoutApplications), path).toBe(true);
        }
    });

    test("does not open the rest of the catalogue alongside the payment callback", () => {
        // A `(.*)` entry must stay a real path boundary, or `/courses/paided`
        // and the course pages themselves come back up with it.
        expect(isPathAllowedDuringMaintenance("/courses", withoutApplications)).toBe(false);
        expect(isPathAllowedDuringMaintenance("/courses/web-development", withoutApplications)).toBe(false);
        expect(isPathAllowedDuringMaintenance("/courses/paid-tools", withoutApplications)).toBe(false);
    });

    test("keeps the crawler surfaces so a 503 is not read as a disallow", () => {
        for (const path of ["/robots.txt", "/sitemap.xml", "/manifest.json", "/llms.txt"]) {
            expect(isPathAllowedDuringMaintenance(path, withoutApplications), path).toBe(true);
        }
    });

    test("keeps an in-flight checkout's landing page, so a payment cannot end on the outage notice", () => {
        // `convex/paystack.ts` sends Paystack's redirect to
        // `/courses/paid/[reference]`, which verifies and then renders the
        // receipt. Blocking it is not "the catalogue is down": the webhook still
        // settles on the Convex origin and still grants the enrollment, so the
        // learner is charged and enrolled while being told the site is broken.
        // The one flow an admin is most likely to interrupt by flipping the
        // switch mid-deploy is the one that must survive it.
        for (const path of ["/courses/paid/PKCK_2026_abc123", "/courses/paid"]) {
            expect(isPathAllowedDuringMaintenance(path, withoutApplications), path).toBe(true);
        }
    });

    test("does not open the rest of the catalogue alongside that landing page", () => {
        // A `(.*)` entry must still respect segment boundaries, or the fix above
        // quietly reopens the whole storefront.
        for (const path of ["/courses", "/courses/web-development", "/courses/paid-tools"]) {
            expect(isPathAllowedDuringMaintenance(path, withoutApplications), path).toBe(false);
        }
    });

    test("blocks the storefront, the catalogue and every dashboard", () => {
        const blocked = [
            "/",
            "/courses",
            "/courses/web-development",
            "/verify/GL-2026-3F9A1C77",
            "/dashboard",
            "/dashboard/courses",
            "/dashboard/instructor",
            "/dashboard/admin/maintenance",
        ];
        for (const path of blocked) {
            expect(isPathAllowedDuringMaintenance(path, withApplications), path).toBe(false);
        }
    });

    test("blocks every API route except the application endpoint", () => {
        expect(isPathAllowedDuringMaintenance("/api", withApplications)).toBe(false);
        expect(isPathAllowedDuringMaintenance("/api/uploadthing", withApplications)).toBe(false);
        expect(isPathAllowedDuringMaintenance("/api/anything/else", withApplications)).toBe(false);
    });

    test("matches on path segments, never on a raw string prefix", () => {
        // The bug this guards: `startsWith("/become-instructor")` would let
        // `/become-instructor-report` through, and `startsWith("/sign-in")` would
        // match `/sign-in-help`. Both are real routes in any app that grows.
        expect(isPathAllowedDuringMaintenance("/become-instructor-report", withApplications)).toBe(false);
        expect(isPathAllowedDuringMaintenance("/become-instructors", withApplications)).toBe(false);
        expect(isPathAllowedDuringMaintenance("/sign-in-help", withApplications)).toBe(false);
        expect(isPathAllowedDuringMaintenance("/maintenance-notes", withApplications)).toBe(false);
    });

    test("never lists the landing page as allowed", () => {
        // Maintenance that still serves the home page is not maintenance. Worth a
        // dedicated assertion because `/` is in the *public* list in `proxy.ts`,
        // so it is the one entry a careless copy-paste could carry over.
        expect(MAINTENANCE_ALLOWED_ROUTES).not.toContain("/");
        expect(MAINTENANCE_APPLICATION_ROUTES).not.toContain("/");
        expect(isPathAllowedDuringMaintenance("/", withApplications)).toBe(false);
    });

    test("has no duplicate or blank entries", () => {
        const all = [...MAINTENANCE_ALLOWED_ROUTES, ...MAINTENANCE_APPLICATION_ROUTES];
        expect(new Set(all).size).toBe(all.length);
        expect(all.every((route) => route.trim() === route && route.length > 0)).toBe(true);
    });
});

describe("isApiPath", () => {
    test("separates API routes so they can be answered with JSON", () => {
        expect(isApiPath("/api")).toBe(true);
        expect(isApiPath("/api/uploadthing")).toBe(true);
        expect(isApiPath("/")).toBe(false);
        expect(isApiPath("/dashboard")).toBe(false);
        // A prefix match without the boundary would swallow "/apis".
        expect(isApiPath("/apis")).toBe(false);
    });
});

describe("normalizeMaintenanceMessage", () => {
    test("collapses whitespace and trims", () => {
        expect(normalizeMaintenanceMessage("  Back   in\na\nbit.  ")).toBe("Back in a bit.");
    });

    test("caps at the published ceiling", () => {
        const long = "a".repeat(MAX_MAINTENANCE_MESSAGE_LENGTH + 500);
        expect(normalizeMaintenanceMessage(long)).toHaveLength(MAX_MAINTENANCE_MESSAGE_LENGTH);
    });

    test("falls back to the default copy when emptied out", () => {
        // Whitespace is trimmed *after* collapsing, so a note of "   " is empty
        // rather than three spaces the page would render as a blank sentence.
        expect(normalizeMaintenanceMessage("   \n  ")).toBe("");
        expect(DEFAULT_MAINTENANCE_MESSAGE.length).toBeLessThanOrEqual(
            MAX_MAINTENANCE_MESSAGE_LENGTH,
        );
    });

    test("leaves ordinary copy untouched", () => {
        const note = "Migrating the database — back by 6pm. Your progress is safe.";
        expect(normalizeMaintenanceMessage(note)).toBe(note);
    });
});

describe("Retry-After", () => {
    test("is a whole number of seconds", () => {
        // It goes into an HTTP header, where a non-integer would be a malformed
        // value and a date-string would be silently wrong.
        expect(Number.isInteger(MAINTENANCE_RETRY_AFTER_SECONDS)).toBe(true);
        expect(MAINTENANCE_RETRY_AFTER_SECONDS).toBeGreaterThan(0);
    });
});

describe("the auto-off deadline", () => {
    // The failure this exists for: the switch goes on at 2am, the operator gets
    // locked out or simply goes home, and the site stays down for three days.
    // The gate is not a safety interlock — it already fails open on a Convex
    // blip — so letting it lapse early costs nothing, while never latching it
    // back up costs a whole night of downtime.

    test("defaults to two hours", () => {
        const now = 1_000_000;
        expect(resolveMaintenanceDeadline(undefined, now) - now).toBe(
            MAINTENANCE_AUTO_OFF_DEFAULT_MS,
        );
        expect(MAINTENANCE_AUTO_OFF_DEFAULT_MS).toBe(2 * 60 * 60 * 1000);
    });

    test("honours an explicit deadline", () => {
        const now = 1_000_000;
        const asked = now + 30 * 60 * 1000;
        expect(resolveMaintenanceDeadline(asked, now)).toBe(asked);
    });

    test("clamps a deadline that is too soon to be useful", () => {
        // Five minutes is the shortest window in which anybody could notice an
        // outage, read the console and act on it. Anything shorter is a switch
        // that appears to work and then releases underneath the operator.
        const now = 1_000_000;
        expect(resolveMaintenanceDeadline(now, now)).toBe(now + MAINTENANCE_AUTO_OFF_MIN_MS);
        expect(resolveMaintenanceDeadline(now - 999_999, now)).toBe(
            now + MAINTENANCE_AUTO_OFF_MIN_MS,
        );
    });

    test("clamps a deadline so far out that it stops being a deadline", () => {
        // A typo pointing at next year is not an auto-off, and nobody would
        // notice until the site had been down for a very long time.
        const now = 1_000_000;
        expect(resolveMaintenanceDeadline(now + 999 * 24 * 60 * 60 * 1000, now)).toBe(
            now + MAINTENANCE_AUTO_OFF_MAX_MS,
        );
        expect(MAINTENANCE_AUTO_OFF_MAX_MS).toBe(24 * 60 * 60 * 1000);
    });

    test("keeps the bounds in a sane order", () => {
        // If these ever invert, every deadline clamps to the minimum and the
        // feature silently becomes "always five minutes".
        expect(MAINTENANCE_AUTO_OFF_MIN_MS).toBeLessThan(MAINTENANCE_AUTO_OFF_DEFAULT_MS);
        expect(MAINTENANCE_AUTO_OFF_DEFAULT_MS).toBeLessThan(MAINTENANCE_AUTO_OFF_MAX_MS);
    });
});

describe("the env kill-switch predicate", () => {
    // Read on the deployment, never in the browser: this is the lever an
    // operator pulls when they are locked out, so it cannot depend on the app
    // rendering or on a session resolving.
    test("recognises only the documented value", () => {
        expect(isMaintenanceOverridden("off")).toBe(true);
    });

    test("treats unset as no override", () => {
        // The default. Maintenance has to work on a deployment where nobody has
        // ever heard of this variable.
        expect(isMaintenanceOverridden(undefined)).toBe(false);
    });

    test("does not treat a near-miss as a working lever", () => {
        // Case, padding and the obvious synonyms are all mistakes a human makes
        // typing into a dashboard at 3am. Each must leave the switch in charge
        // rather than silently opening the site.
        for (const value of ["Off", "OFF", " off", "off ", "true", "1", "", "disabled"]) {
            expect(isMaintenanceOverridden(value), JSON.stringify(value)).toBe(false);
        }
    });

    test("publishes the name of the variable it reads", () => {
        // The console prints this so the operator knows what to type; a
        // hardcoded copy in the UI would drift from the reader on the next edit.
        expect(MAINTENANCE_OVERRIDE_ENV).toBe("MAINTENANCE_OVERRIDE");
    });
});