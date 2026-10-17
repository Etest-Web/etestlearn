import { afterEach, describe, expect, test, vi } from "vitest";
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
    overrideActive: boolean;
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

/**
 * The operator-facing diagnosis. `role` mirrors `users.role` exactly so it
 * cannot drift from the platform's own vocabulary; `null` means "no row was
 * reached", never "unknown role".
 */
type MaintenancePreflight = {
    identity: "resolved" | "none";
    user: "not_checked" | "found" | "missing" | "duplicate" | "suspended";
    role: "student" | "instructor" | "admin" | null;
    bypassWorks: boolean;
};

const preflight = makeFunctionReference<"query", Record<string, never>, MaintenancePreflight>(
    "maintenance:preflight",
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
        expect(status.overrideActive).toBe(false);
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

describe("maintenance.preflight", () => {
    // This query exists because of a specific failure: an admin turned the
    // switch on, then could not get back in, and nothing recorded why. The gate
    // reduces every reason to `false`, so the operator needs a read that
    // separates the causes — token not resolved, users row missing, row
    // suspended, duplicate rows — before they take the site down again.
    //
    // Deliberately NOT behind `requireAdmin`. If the identity or the row is
    // broken, an admin-gated query would throw the very diagnosis the operator
    // came for. It therefore reports only the caller's own state: no ids, no
    // email, no cross-user reads.

    test("answers an anonymous caller with the reason they cannot get back in", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const result = await t.query(preflight, {});
        expect(result.identity).toBe("none");
        expect(result.user).toBe("not_checked");
        expect(result.role).toBeNull();
        expect(result.bypassWorks).toBe(false);
    });

    test("confirms the bypass works for an admin", async () => {
        // The state to reach *before* flipping the switch. If this is not true
        // while the site is still up, enabling maintenance is a one-way door.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const result = await as(t, "clerk_admin").query(preflight, {});
        expect(result.identity).toBe("resolved");
        expect(result.user).toBe("found");
        expect(result.role).toBe("admin");
        expect(result.bypassWorks).toBe(true);
    });

    test("confirms the bypass works for an instructor too", async () => {
        // `isStaff` is the single definition, so the two must agree rather than
        // the preflight growing its own idea of who counts as staff.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const result = await as(t, "clerk_instructor").query(preflight, {});
        expect(result.role).toBe("instructor");
        expect(result.bypassWorks).toBe(true);
    });

    test("reports a student without pretending the bypass will work", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const result = await as(t, "clerk_student").query(preflight, {});
        expect(result.identity).toBe("resolved");
        expect(result.user).toBe("found");
        expect(result.role).toBe("student");
        expect(result.bypassWorks).toBe(false);
    });

    test("separates 'the row does not exist' from 'the identity did not resolve'", async () => {
        // The webhook diagnosis. A valid session that finds no `users` row means
        // `users.upsertFromClerk` never ran for this account — an entirely
        // different fix from a token the deployment rejects, and the two are
        // indistinguishable through `isStaffCaller`, which returns false for both.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const result = await as(t, "clerk_nobody").query(preflight, {});
        expect(result.identity).toBe("resolved");
        expect(result.user).toBe("missing");
        expect(result.role).toBeNull();
        expect(result.bypassWorks).toBe(false);
    });

    test("reports a suspended account as suspended, not as missing", async () => {
        // Otherwise an operator would chase the webhook for a row that is
        // sitting there perfectly well.
        const t = convexTest(testSchema, modules);
        const { adminId } = await seedWorld(t);
        await t.run(async (ctx: TestCtx) => {
            await ctx.db.patch(adminId, { suspendedAt: Date.now() });
        });

        const result = await as(t, "clerk_admin").query(preflight, {});
        expect(result.identity).toBe("resolved");
        expect(result.user).toBe("suspended");
        expect(result.role).toBe("admin");
        expect(result.bypassWorks).toBe(false);
    });

    test("reports duplicate rows rather than throwing the diagnosis away", async () => {
        // `getCurrentUser` reads with `.unique()`, so a duplicate makes every
        // identity-resolving call throw — which the gate catches and flattens to
        // `false`. Silently un-bypassable, and invisible without this.
        const t = convexTest(testSchema, modules);
        const now = Date.now();
        await t.run(async (ctx: TestCtx) => {
            const insert = () =>
                ctx.db.insert("users", {
                    clerkId: "clerk_admin",
                    email: "admin@test.com",
                    name: "Admin",
                    role: "admin",
                    createdAt: now,
                });
            await insert();
            await insert();
        });

        const result = await as(t, "clerk_admin").query(preflight, {});
        expect(result.user).toBe("duplicate");
        expect(result.bypassWorks).toBe(false);
    });

    test("returns nothing about the caller beyond their own role", async () => {
        // The query is reachable by anyone, including signed-out visitors, so it
        // must carry no identifier, no email and no user id — nothing that turns
        // it into a way to probe for other accounts.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const result = await as(t, "clerk_admin").query(preflight, {});
        expect(Object.keys(result).sort()).toEqual(["bypassWorks", "identity", "role", "user"]);
        expect(result).not.toHaveProperty("clerkId");
        expect(result).not.toHaveProperty("email");
        expect(result).not.toHaveProperty("_id");
    });
});

describe("the env kill-switch", () => {
    // The dead-man's lever. The whole gate fails OPEN on a Convex blip, but the
    // one case it cannot self-heal from is an operator who is locked out while
    // the flag itself is readable — the site is down, the console is reachable
    // only to staff, and the staff exemption is exactly what has stopped
    // working. An env var on the deployment is the one lever that survives that,
    // because setting it needs no session, no app and no rebuild.
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    async function enableMaintenance(t: TestWorld) {
        await as(t, "clerk_admin").mutation(setMode, { enabled: true });
    }

    test("forces the site up even when the stored switch says down", async () => {
        const t = convexTest(testSchema, modules);
        await seedWorld(t);
        await enableMaintenance(t);

        vi.stubEnv("MAINTENANCE_OVERRIDE", "off");

        const status = await t.query(getStatus, {});
        expect(status.enabled).toBe(false);
    });

    test("reports that the override is the reason, not the switch", async () => {
        // Without this the console renders "Maintenance mode is off" next to a
        // stored switch that says otherwise, and the operator is left guessing
        // which of the two is lying.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);
        await enableMaintenance(t);

        vi.stubEnv("MAINTENANCE_OVERRIDE", "off");

        expect((await t.query(getStatus, {})).overrideActive).toBe(true);
    });

    test("leaves the note and the applications setting alone", async () => {
        // Releasing the site is not a reason to forget what it was going to say.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);
        await as(t, "clerk_admin").mutation(setMode, {
            enabled: true,
            message: "Back by six.",
            allowInstructorApplications: false,
        });

        vi.stubEnv("MAINTENANCE_OVERRIDE", "off");

        const status = await t.query(getStatus, {});
        expect(status.message).toBe("Back by six.");
        expect(status.allowInstructorApplications).toBe(false);
    });

    test("does not write to the switch it is overriding", async () => {
        // The lever is a read-time override, so clearing the env var puts the
        // site straight back down. Anything that patched the row would make the
        // override indistinguishable from an admin turning it off, and would
        // make it impossible to re-close after the lever is pulled.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);
        await enableMaintenance(t);

        vi.stubEnv("MAINTENANCE_OVERRIDE", "off");
        expect((await t.query(getStatus, {})).enabled).toBe(false);

        vi.unstubAllEnvs();
        expect((await t.query(getStatus, {})).enabled).toBe(true);

        const rows = await t.run((ctx: TestCtx) => ctx.db.query("maintenanceMode").collect());
        expect(rows).toHaveLength(1);
        expect(rows[0].enabled).toBe(true);
    });

    test("is inert for any value other than the documented one", async () => {
        // A typo in the deployment env must not silently open the site, and
        // must not silently be mistaken for a working lever either.
        const t = convexTest(testSchema, modules);
        await seedWorld(t);
        await enableMaintenance(t);

        vi.stubEnv("MAINTENANCE_OVERRIDE", "Off");
        expect((await t.query(getStatus, {})).enabled).toBe(true);
        expect((await t.query(getStatus, {})).overrideActive).toBe(false);
    });

    test("does not leave the site up on its own", async () => {
        // The override must never be the thing that takes the site down, and
        // with no stored switch it must not manufacture one.
        vi.stubEnv("MAINTENANCE_OVERRIDE", "off");
        const t = convexTest(testSchema, modules);
        await seedWorld(t);

        const status = await t.query(getStatus, {});
        expect(status.enabled).toBe(false);
        expect(status.overrideActive).toBe(true);
    });
});