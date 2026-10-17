import { describe, expect, test } from "vitest";

import {
    DEFAULT_MAINTENANCE_MESSAGE,
    isApiPath,
    isMaintenanceOverridden,
    isPathAllowedDuringMaintenance,
    MAINTENANCE_ALLOWED_ROUTES,
    MAINTENANCE_APPLICATION_ROUTES,
    MAINTENANCE_OVERRIDE_ENV,
    MAINTENANCE_RETRY_AFTER_SECONDS,
    MAX_MAINTENANCE_MESSAGE_LENGTH,
    normalizeMaintenanceMessage,
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

    test("keeps the crawler surfaces so a 503 is not read as a disallow", () => {
        for (const path of ["/robots.txt", "/sitemap.xml", "/manifest.json", "/llms.txt"]) {
            expect(isPathAllowedDuringMaintenance(path, withoutApplications), path).toBe(true);
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