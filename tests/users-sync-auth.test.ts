import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { GenericSchema, SchemaDefinition } from "convex/server";

/**
 * Regression tests for the `syncFromClerk` gate.
 *
 * That mutation is reachable from outside Convex (the backfill script runs
 * client-side), so it cannot be `internalMutation` — which means it is
 * publicly callable and MUST authenticate on its own. It previously had no
 * guard at all.
 */
const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;

const VALID_USER = {
  clerkId: "user_abc",
  email: "new@example.com",
  name: "New User",
};

const SAVED = { ...process.env };

async function setup(token?: string) {
  if (token === undefined) {
    delete process.env.CLERK_SYNC_TOKEN;
  } else {
    process.env.CLERK_SYNC_TOKEN = token;
  }
  return convexTest(testSchema, modules);
}

function restoreEnv() {
  process.env = { ...SAVED };
}

describe("syncFromClerk", () => {
  it("refuses when CLERK_SYNC_TOKEN is unset, even with an empty token", async () => {
    const t = await setup(undefined);
    try {
      await expect(
        t.mutation(api.users.syncFromClerk, { token: "", users: [VALID_USER] }),
      ).rejects.toThrow(/not configured/i);
    } finally {
      restoreEnv();
    }
  });

  it("refuses a wrong token", async () => {
    const t = await setup("correct-horse-battery-staple");
    try {
      await expect(
        t.mutation(api.users.syncFromClerk, {
          token: "wrong-token",
          users: [VALID_USER],
        }),
      ).rejects.toThrow(/Not authorized/i);

      // Nothing was written.
      const rows = (await t.run((ctx: any) => ctx.db.query("users").collect())) as any[];
      expect(rows).toHaveLength(0);
    } finally {
      restoreEnv();
    }
  });

  it("refuses a prefix of the correct token (length is checked, not just content)", async () => {
    const t = await setup("correct-horse-battery-staple");
    try {
      await expect(
        t.mutation(api.users.syncFromClerk, {
          token: "correct-horse",
          users: [VALID_USER],
        }),
      ).rejects.toThrow(/Not authorized/i);
    } finally {
      restoreEnv();
    }
  });

  it("accepts the correct token and creates a student", async () => {
    const t = await setup("correct-horse-battery-staple");
    try {
      const result = await t.mutation(api.users.syncFromClerk, {
        token: "correct-horse-battery-staple",
        users: [VALID_USER],
      });

      expect(result).toEqual({ created: 1, updated: 0, total: 1 });
      const rows = (await t.run((ctx: any) => ctx.db.query("users").collect())) as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe("student");
    } finally {
      restoreEnv();
    }
  });

  it("rejects a payload carrying a role field", async () => {
    const t = await setup("tok");
    try {
      await expect(
        t.mutation(api.users.syncFromClerk, {
          token: "tok",
          // The args validator declares no `role`, so the write is refused
          // before the handler runs.
          users: [{ clerkId: "user_x", role: "admin" }] as any,
        }),
      ).rejects.toThrow();

      const rows = (await t.run((ctx: any) => ctx.db.query("users").collect())) as any[];
      expect(rows).toHaveLength(0);
    } finally {
      restoreEnv();
    }
  });

  it("preserves an existing admin's role when syncing profile fields", async () => {
    const t = await setup("tok");
    try {
      await t.run(async (ctx: any) => {
        await ctx.db.insert("users", {
          clerkId: "user_admin",
          email: "old@example.com",
          role: "admin",
          createdAt: Date.now(),
        });
      });

      await t.mutation(api.users.syncFromClerk, {
        token: "tok",
        users: [{ clerkId: "user_admin", email: "new@example.com" }],
      });

      const rows = (await t.run((ctx: any) => ctx.db.query("users").collect())) as any[];
      expect(rows[0].role).toBe("admin");
      expect(rows[0].email).toBe("new@example.com");
    } finally {
      restoreEnv();
    }
  });

  it("rejects a batch beyond the server-side cap, before writing anything", async () => {
    const t = await setup("tok");
    try {
      const tooMany = Array.from({ length: 501 }, (_, i) => ({
        clerkId: `user_${i}`,
      }));

      await expect(
        t.mutation(api.users.syncFromClerk, { token: "tok", users: tooMany }),
      ).rejects.toThrow(/500/);

      // Oversized calls are rejected atomically — no partial sync.
      const rows = await t.run((ctx) => ctx.db.query("users").collect());
      expect(rows).toHaveLength(0);
    } finally {
      restoreEnv();
    }
  });

  it("accepts a batch exactly at the cap, so honest backfills can chunk", async () => {
    const t = await setup("tok");
    try {
      const atCap = Array.from({ length: 500 }, (_, i) => ({
        clerkId: `user_${i}`,
      }));

      const result = await t.mutation(api.users.syncFromClerk, {
        token: "tok",
        users: atCap,
      });
      expect(result).toEqual({ created: 500, updated: 0, total: 500 });

      // Deliberately not audited: auditLogs.actorId is required and this path
      // has no Convex identity — only a shared secret. See convex/users.ts.
      const auditRows = await t.run((ctx) =>
        ctx.db.query("auditLogs").collect(),
      );
      expect(auditRows).toHaveLength(0);
    } finally {
      restoreEnv();
    }
  });
});