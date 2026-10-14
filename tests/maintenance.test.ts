import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { makeFunctionReference } from "convex/server";

import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import {
    DEFAULT_MAINTENANCE_MESSAGE,
    MAX_MAINTENANCE_MESSAGE_LENGTH,
} from "@/lib/maintenance";
import type {
    DataModelFromSchemaDefinition,
    GenericMutationCtx,
    GenericSchema,
    SchemaDefinition,
} from "convex/server";

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestCtx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
type TestWorld = TestConvex<typeof testSchema>;

type MaintenanceStatus = {
    enabled: boolean;
    message: string;
    allowInstructorApplications: boolean;
    updatedAt: number | null;
};

/**
 * `convex/_generated/api.d.ts` is refreshed by `npx convex dev`; until that has
 * run against a deployment these are referenced by wire name, the same
 * workaround `lib/durable-rate-limit.ts` and `tests/audit.test.ts` use. The
 * strings match the ones codegen emits.
 */
const getStatus = makeFunctionReference<"query", Record<string, never>, MaintenanceStatus>(
    "maintenance:getStatus",
);
const isStaffCaller = makeFunctionReference<"query", Record<string, never>, boolean>(
    "maintenance:isStaffCaller",
);
const setMode = makeFunctionReference<
    "mutation",
    {
        enabled: boolean;
        message?: string;
        allowInstructorApplications?: boolean;
    },
    { enabled: boolean; message: string; allowInstructorApplications: boolean }
>("maintenance:setMode");

const as = (t: TestWorld, subject: string) =>
    t.withIdentity({ subject, tokenIdentifier: subject });

type Seeded = { adminId: Id<"users">; instructorId: Id<"users">; studentId: Id<"users"> };

async function seedWorld(t: TestWorld): Promise<Seeded> {
    const now = Date.now();

    const adminId = await t.run((ctx: TestCtx) =>
        ctx.db.insert("users", {
            clerkId: "clerk_admin",
            email: "admin@test.com",
            name: "Admin",
            role: "admin",
            createdAt: now,
        }),
    );
    const instructorId = await t.run((ctx: TestCtx) =>
        ctx.db.insert("users", {
            clerkId: "clerk_instructor",
            email: "instructor@test.com",
            name: "Instructor",
            role: "instructor",
            createdAt: now,
        }),
    );
    const studentId = await t.run((ctx: TestCtx) =>
        ctx.db.insert("users", {
            clerkId: "clerk_student",
            email: "student@test.com",
            name: "Student",
            role: "student",
            createdAt: now,
        }),
    );

    return { adminId, instructorId, studentId };
}

describe("maintenance.getStatus", () => {
    test("reads off with the default copy on a fresh deployment", async () => {
        // The gate's safe default. A deployment nobody has saved to must serve
        // the site, not 503 it.
        const t = convexTest(testSchema, modules);

        const status = await t.query(getStatus, {});
        expect(status.enabled).toBe(false);
        expect(status.message).toBe(DEFAULT_MAINTENANCE_MESSAGE);
        expect(status.allowInstructorApplications).toBe(true);
        expect(status.updatedAt).toBeNull();
    });

    test("is readable with no identity at all", async () => {
        // `proxy.ts` consults this before anything else on every request, often
        // with no Clerk session. If it required auth, the gate would only work
        // for signed-in visitors — the opposite of what a maintenance block is for.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const status = await t.query(getStatus, {});
        expect(status.enabled).toBe(false);
    });

    test("returns what the admin saved", async () => {
        const t = convexTest(testSchema, modules);
        const { adminId } = await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            message: "Migrating the database — back by 6pm.",
        });

        const status = await t.query(getStatus, {});
        expect(status.enabled).toBe(true);
        expect(status.message).toBe("Migrating the database — back by 6pm.");
        expect(status.updatedAt).not.toBeNull();
        expect(adminId).toBeDefined();
    });

    test("prefers the newest row if a duplicate ever exists", async () => {
        // Same reasoning as `referrals.loadSettings`: a stray row must not
        // shadow what an admin just saved.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await t.run(async (ctx: TestCtx) => {
            await ctx.db.insert("maintenanceMode", {
                enabled: false,
                message: "stale",
                allowInstructorApplications: true,
                updatedAt: 1_000,
            });
            await ctx.db.insert("maintenanceMode", {
                enabled: true,
                message: "current",
                allowInstructorApplications: false,
                updatedAt: 2_000,
            });
        });

        const status = await t.query(getStatus, {});
        expect(status.enabled).toBe(true);
        expect(status.message).toBe("current");
    });
});

describe("maintenance.isStaffCaller", () => {
    test("is false for an anonymous caller", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        expect(await t.query(isStaffCaller, {})).toBe(false);
    });

    test("is true for an admin and for an instructor", async () => {
        // The exemption that stops the gate locking out whoever turned it on.
        // Both roles are "staff" — `convex/helpers/auth.isStaff` is the single
        // definition of that, so this cannot drift from the rest of the platform.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        expect(await as(t, "clerk_admin").query(isStaffCaller, {})).toBe(true);
        expect(await as(t, "clerk_instructor").query(isStaffCaller, {})).toBe(true);
    });

    test("is false for a student", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        expect(await as(t, "clerk_student").query(isStaffCaller, {})).toBe(false);
    });

    test("is false for a suspended admin", async () => {
        // Suspension reads as signed-out everywhere else; it must not become a
        // way to keep the bypass after being suspended.
        const t = convexTest(testSchema, modules);
        const { adminId } = await seedWorld(t);
        await t.run(async (ctx: TestCtx) => {
            await ctx.db.patch(adminId, { suspendedAt: Date.now() });
        });

        expect(await as(t, "clerk_admin").query(isStaffCaller, {})).toBe(false);
    });
});

describe("maintenance.setMode", () => {
    test("refuses a non-admin", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await expect(
            as(t, "clerk_student").mutation(setMode, { enabled: true }),
        ).rejects.toThrow(/admin/i);

        // And it must not have taken effect.
        expect((await t.query(getStatus, {})).enabled).toBe(false);
    });

    test("refuses an instructor", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await expect(
            as(t, "clerk_instructor").mutation(setMode, { enabled: true }),
        ).rejects.toThrow(/admin/i);
    });

    test("refuses an anonymous caller", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await expect(t.mutation(setMode, { enabled: true })).rejects.toThrow(/authenticated/i);
    });

    test("creates the row on first save", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            message: "Back in an hour.",
            allowInstructorApplications: false,
        });

        const rows = await t.run((ctx: TestCtx) => ctx.db.query("maintenanceMode").collect());
        expect(rows).toHaveLength(1);
        expect(rows[0].enabled).toBe(true);
        expect(rows[0].updatedBy).not.toBeUndefined();
    });

    test("patches the existing row instead of appending a second one", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, { enabled: true });
        await as(t, "clerk_admin").mutation(setMode, { enabled: false });
        await as(t, "clerk_admin").mutation(setMode, { enabled: true });

        const rows = await t.run((ctx: TestCtx) => ctx.db.query("maintenanceMode").collect());
        expect(rows).toHaveLength(1);
    });

    test("leaves the note alone when the switch is flipped without one", async () => {
        // The console's primary switch sends `{ enabled }` alone. Overwriting the
        // note with a stale copy from a form rendered before somebody else edited
        // it would be a silent data loss.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            message: "Database migration.",
        });
        await as(t, "clerk_admin").mutation(setMode, { enabled: false });
        await as(t, "clerk_admin").mutation(setMode, { enabled: true });

        expect((await t.query(getStatus, {})).message).toBe("Database migration.");
    });

    test("leaves the applications setting alone when only the switch is sent", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            allowInstructorApplications: false,
        });
        await as(t, "clerk_admin").mutation(setMode, { enabled: false });

        expect((await t.query(getStatus, {})).allowInstructorApplications).toBe(false);
    });

    test("normalizes and caps the note at write time", async () => {
        // Not just at render time: a note that displays as 280 characters should
        // not be sitting in the database as 4,000.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            message: `  Database\n\n  migration   in progress. ${"x".repeat(500)}  `,
        });

        const stored = (await t.query(getStatus, {})).message;
        expect(stored.startsWith("Database migration in progress.")).toBe(true);
        expect(stored).not.toContain("\n");
        expect(stored).toHaveLength(MAX_MAINTENANCE_MESSAGE_LENGTH);
    });

    test("stamps enabledAt on the rising edge and keeps it while still down", async () => {
        // Otherwise "how long has this been down?" is unanswerable after one edit
        // to the note. `enabled` is required rather than optional, so saving a
        // note while the site is down re-states `true` rather than guessing.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, { enabled: true });
        const afterFirstOn = await t.run((ctx: TestCtx) =>
            ctx.db.query("maintenanceMode").collect(),
        );
        const firstEnabledAt = afterFirstOn[0].enabledAt;
        expect(firstEnabledAt).toBeDefined();

        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            message: "Still down.",
        });
        const afterEdit = await t.run((ctx: TestCtx) =>
            ctx.db.query("maintenanceMode").collect(),
        );
        expect(afterEdit[0].enabledAt).toBe(firstEnabledAt);
    });

    test("clears enabledAt when the site comes back up", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, { enabled: true });
        await as(t, "clerk_admin").mutation(setMode, { enabled: false });

        const rows = await t.run((ctx: TestCtx) => ctx.db.query("maintenanceMode").collect());
        expect(rows[0].enabledAt).toBeUndefined();
    });

    test("records the admin who flipped it", async () => {
        const t = convexTest(testSchema, modules);
        const { adminId } = await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, { enabled: true });

        const rows = await t.run((ctx: TestCtx) => ctx.db.query("auditLogs").collect());
        expect(rows).toHaveLength(1);
        expect(rows[0].action).toBe("maintenance.set_mode");
        expect(rows[0].actorId).toBe(adminId);
        expect(rows[0].details).toContain("enabled");
    });

    test("writes an audit row per toggle, including turning it back off", async () => {
        // "The site went down at 14:03 and nobody knows why" has to be
        // answerable from the audit log alone.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, { enabled: true });
        await as(t, "clerk_admin").mutation(setMode, { enabled: false });

        const rows = await t.run((ctx: TestCtx) => ctx.db.query("auditLogs").collect());
        expect(rows).toHaveLength(2);
        expect(rows[0].details).toContain('"enabled":true');
        expect(rows[1].details).toContain('"enabled":false');
        // The second row records that it was already on, so a later reader can
        // reconstruct the window rather than just the two endpoints.
        expect(rows[1].details).toContain('"wasEnabled":true');
    });

    test("records that the note changed without storing the note itself", async () => {
        // `auditLogs.details` is greppable by design; a 280-character message
        // would make the row useless for scanning.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            message: "A very specific note about the thing.",
        });

        const rows = await t.run((ctx: TestCtx) => ctx.db.query("auditLogs").collect());
        expect(rows[0].details).toContain('"messageChanged":true');
        expect(rows[0].details).not.toContain("specific note");
    });
});