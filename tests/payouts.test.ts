import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * The payout ledger.
 *
 * Everything an instructor is shown about money, and everything an admin acts
 * on, is derived from two things: the same lifetime earnings the Earnings page
 * computes, and the rows in `payouts`. So these tests seed real courses and paid
 * purchases rather than poking a balance field — there is no balance field to
 * poke, which is the point (see `lib/payouts.ts`).
 *
 * The suite is one shared world per test, switched between identities with
 * `withIdentity`, because a payout only makes sense across two roles: an
 * instructor who asks, and an admin who pays.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;
type Test = TestConvex<typeof testSchema>;

const INSTRUCTOR = "clerk_payout_instructor";
const ADMIN = "clerk_payout_admin";
const RIVAL = "clerk_payout_rival";
const STUDENT = "clerk_payout_student";

/** One settled sale nets the instructor this much (80% of a ₦1,000 course). */
const SHARE_KOBO = 80_000;
const GROSS_KOBO = 100_000;

const MAIL_ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "MAIL_FROM_INSTRUCTORS",
] as const;

const savedEnv = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined) {
  if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  // A test process must never discover a developer's exported mail credentials
  // and try to send a real payout notification.
  for (const key of MAIL_ENV_KEYS) setEnv(key, undefined);
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
});

interface World {
  t: Test;
  instructorId: Id<"users">;
  rivalId: Id<"users">;
  adminId: Id<"users">;
  studentId: Id<"users">;
}

interface WorldOptions {
  /** Whether the instructor has a verified payout account. Default true. */
  verified?: boolean;
  /** Lifetime net earnings to seed, in kobo. Default one settled sale. */
  earnedKobo?: number;
}

/**
 * One instructor, one rival instructor, one admin and one buyer, all in the same
 * database so a request can be raised by one identity and resolved by another.
 */
async function seedWorld(options: WorldOptions = {}): Promise<World> {
  const t = convexTest(testSchema, modules);
  const now = Date.now();
  const verified = options.verified ?? true;
  const earnedKobo = options.earnedKobo ?? SHARE_KOBO;

  async function insertUser(
    clerkId: string,
    name: string,
    role: "student" | "instructor" | "admin",
    bankVerified = false,
  ) {
    return t.run((ctx: TestCtx) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@test.com`,
        name,
        role,
        ...(bankVerified ? { bankVerified: true } : {}),
        createdAt: now,
      }),
    );
  }

  const instructorId = await insertUser(
    INSTRUCTOR,
    "Ada Instructor",
    "instructor",
    verified,
  );
  const rivalId = await insertUser(RIVAL, "Rival Instructor", "instructor", true);
  const adminId = await insertUser(ADMIN, "Admin Person", "admin");
  const studentId = await insertUser(STUDENT, "Sam Student", "student");

  if (earnedKobo > 0) {
    const courseId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("courses", {
        title: "Sold Course",
        slug: "sold-course",
        description: "Has buyers",
        instructorId,
        published: true,
        price: GROSS_KOBO,
        currency: "NGN",
        createdAt: now,
        updatedAt: now,
      }),
    );
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("purchases", {
        userId: studentId,
        courseId,
        paystackReference: "ref-1",
        amount: GROSS_KOBO,
        listAmount: GROSS_KOBO,
        // Snapshot the share explicitly rather than leaning on the legacy
        // fallback: these tests are about the ledger, not the split rule.
        instructorShareKobo: earnedKobo,
        currency: "NGN",
        status: "paid",
        paidAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  return { t, instructorId, rivalId, adminId, studentId };
}

const asInstructor = (w: World) =>
  w.t.withIdentity({ subject: INSTRUCTOR, tokenIdentifier: INSTRUCTOR });
const asRival = (w: World) =>
  w.t.withIdentity({ subject: RIVAL, tokenIdentifier: RIVAL });
const asAdmin = (w: World) =>
  w.t.withIdentity({ subject: ADMIN, tokenIdentifier: ADMIN });
const asStudent = (w: World) =>
  w.t.withIdentity({ subject: STUDENT, tokenIdentifier: STUDENT });

async function ledgerRows(w: World, instructorId: Id<"users">) {
  return w.t.run((ctx: TestCtx) =>
    ctx.db
      .query("payouts")
      .withIndex("by_instructor", (q) => q.eq("instructorId", instructorId))
      .collect(),
  );
}

async function auditActions(w: World, actorId: Id<"users">) {
  const rows = await w.t.run((ctx: TestCtx) =>
    ctx.db
      .query("auditLogs")
      .withIndex("by_actor", (q) => q.eq("actorId", actorId))
      .collect(),
  );
  return rows.map((row) => row.action);
}

async function notificationsFor(w: World, userId: Id<"users">) {
  return w.t.run((ctx: TestCtx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", userId).eq("readAt", undefined),
      )
      .collect(),
  );
}

describe("requestPayout", () => {
  test("requires a signed-in caller", async () => {
    const w = await seedWorld();
    await expect(
      w.t.mutation(api.payouts.requestPayout, {}),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("rejects students", async () => {
    const w = await seedWorld();
    await expect(
      asStudent(w).mutation(api.payouts.requestPayout, {}),
    ).rejects.toThrow(/Only instructors and admins/);
  });

  test("refuses staff with no verified payout account", async () => {
    const w = await seedWorld({ verified: false });
    await expect(
      asInstructor(w).mutation(api.payouts.requestPayout, {}),
    ).rejects.toThrow(/verified payout account/);
    expect(await ledgerRows(w, w.instructorId)).toHaveLength(0);
  });

  test("refuses when nothing is available", async () => {
    const w = await seedWorld({ earnedKobo: 0 });
    await expect(
      asInstructor(w).mutation(api.payouts.requestPayout, {}),
    ).rejects.toThrow(/nothing available/);
    expect(await ledgerRows(w, w.instructorId)).toHaveLength(0);
  });

  test("requests the full available balance and records who to tell", async () => {
    const w = await seedWorld();
    const result = await asInstructor(w).mutation(api.payouts.requestPayout, {
      note: "End of month",
    });

    const rows = await ledgerRows(w, w.instructorId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("requested");
    expect(rows[0].amountKobo).toBe(SHARE_KOBO);
    expect(rows[0].note).toBe("End of month");
    expect(rows[0].currency).toBe("NGN");
    expect(result).toEqual({ payoutId: rows[0]._id, amountKobo: SHARE_KOBO });

    // The audit trail names the money, not just the fact that a button was hit.
    const actions = await auditActions(w, w.instructorId);
    expect(actions).toContain("payout.request");

    // The admin learns about it in their inbox.
    const adminInbox = await notificationsFor(w, w.adminId);
    const nudge = adminInbox.find((n) => n.type === "payout_requested");
    expect(nudge).toBeTruthy();
    expect(nudge?.href).toBe("/dashboard/admin/payouts");

    // The requester is not told about their own request.
    const ownInbox = await notificationsFor(w, w.instructorId);
    expect(ownInbox.some((n) => n.type === "payout_requested")).toBe(false);
  });

  test("blocks a second request while one is pending", async () => {
    const w = await seedWorld();
    await asInstructor(w).mutation(api.payouts.requestPayout, {});
    await expect(
      asInstructor(w).mutation(api.payouts.requestPayout, {}),
    ).rejects.toThrow(/already have a payout request/);
    expect(await ledgerRows(w, w.instructorId)).toHaveLength(1);
  });

  test("rate limits to three requests a day", async () => {
    const w = await seedWorld();
    // A pending request blocks a second, so withdraw between attempts to reach
    // the limiter rather than the duplicate guard.
    for (let i = 0; i < 3; i++) {
      const { payoutId } = await asInstructor(w).mutation(
        api.payouts.requestPayout,
        {},
      );
      await asInstructor(w).mutation(api.payouts.cancelPayoutRequest, {
        payoutId,
      });
    }
    await expect(
      asInstructor(w).mutation(api.payouts.requestPayout, {}),
    ).rejects.toThrow(/Too many requests/);
  });
});

describe("cancelPayoutRequest", () => {
  test("withdraws a pending request and frees the balance again", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );

    await asInstructor(w).mutation(api.payouts.cancelPayoutRequest, { payoutId });

    const rows = await ledgerRows(w, w.instructorId);
    expect(rows[0].status).toBe("cancelled");
    expect(rows[0].resolvedAt).toBeTypeOf("number");

    const overview = await asInstructor(w).query(
      api.payouts.getPayoutOverview,
      {},
    );
    expect(overview.balance.pendingKobo).toBe(0);
    expect(overview.balance.availableKobo).toBe(SHARE_KOBO);

    expect(await auditActions(w, w.instructorId)).toContain("payout.cancel");
  });

  test("cannot withdraw someone else's request", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );
    await expect(
      asRival(w).mutation(api.payouts.cancelPayoutRequest, { payoutId }),
    ).rejects.toThrow(/not found/);
    expect((await ledgerRows(w, w.instructorId))[0].status).toBe("requested");
  });

  test("cannot withdraw a request that is already resolved", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );
    await asAdmin(w).mutation(api.payouts.markPayoutPaid, {
      payoutId,
      reference: "TRF_1",
    });

    await expect(
      asInstructor(w).mutation(api.payouts.cancelPayoutRequest, { payoutId }),
    ).rejects.toThrow(/no longer be withdrawn/);
  });
});

describe("markPayoutPaid", () => {
  test("is admin-only", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );
    await expect(
      asInstructor(w).mutation(api.payouts.markPayoutPaid, { payoutId }),
    ).rejects.toThrow(/admin access required/);
    expect((await ledgerRows(w, w.instructorId))[0].status).toBe("requested");
  });

  test("records the transfer, notifies the instructor, and audits the admin", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );

    await asAdmin(w).mutation(api.payouts.markPayoutPaid, {
      payoutId,
      reference: "TRF_abc123",
    });

    const [row] = await ledgerRows(w, w.instructorId);
    expect(row.status).toBe("paid");
    expect(row.reference).toBe("TRF_abc123");
    expect(row.recordedBy).toBe(w.adminId);
    expect(row.resolvedAt).toBeTypeOf("number");

    const inbox = await notificationsFor(w, w.instructorId);
    expect(inbox.some((n) => n.type === "payout_paid")).toBe(true);

    expect(await auditActions(w, w.adminId)).toContain("payout.mark_paid");
  });

  test("refuses a request that has already been resolved", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );
    await asAdmin(w).mutation(api.payouts.markPayoutPaid, { payoutId });
    await expect(
      asAdmin(w).mutation(api.payouts.markPayoutPaid, { payoutId }),
    ).rejects.toThrow(/already been resolved/);
  });

  test("rejects an over-long reference before writing", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );
    await expect(
      asAdmin(w).mutation(api.payouts.markPayoutPaid, {
        payoutId,
        reference: "x".repeat(201),
      }),
    ).rejects.toThrow(/200 characters/);
  });
});

describe("declinePayoutRequest", () => {
  test("cancels the request and tells the instructor why", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );

    await asAdmin(w).mutation(api.payouts.declinePayoutRequest, {
      payoutId,
      note: "Your account is under review",
    });

    const [row] = await ledgerRows(w, w.instructorId);
    expect(row.status).toBe("cancelled");

    const inbox = await notificationsFor(w, w.instructorId);
    const declined = inbox.find((n) => n.type === "payout_declined");
    expect(declined).toBeTruthy();
    expect(declined?.body).toContain("under review");

    expect(await auditActions(w, w.adminId)).toContain("payout.decline");
  });

  test("is admin-only", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );
    await expect(
      asInstructor(w).mutation(api.payouts.declinePayoutRequest, { payoutId }),
    ).rejects.toThrow(/admin access required/);
  });
});

describe("recordPayout", () => {
  test("is admin-only", async () => {
    const w = await seedWorld();
    await expect(
      asInstructor(w).mutation(api.payouts.recordPayout, {
        instructorId: w.instructorId,
        amountKobo: 10_000,
      }),
    ).rejects.toThrow(/admin access required/);
  });

  test("writes an already-paid row and notifies the instructor", async () => {
    const w = await seedWorld();
    await asAdmin(w).mutation(api.payouts.recordPayout, {
      instructorId: w.instructorId,
      amountKobo: 25_000,
      reference: "TRF_manual",
      note: "Sent outside a request",
    });

    const [row] = await ledgerRows(w, w.instructorId);
    expect(row.status).toBe("paid");
    expect(row.amountKobo).toBe(25_000);
    expect(row.reference).toBe("TRF_manual");
    expect(row.recordedBy).toBe(w.adminId);

    const inbox = await notificationsFor(w, w.instructorId);
    expect(inbox.some((n) => n.type === "payout_paid")).toBe(true);
    expect(await auditActions(w, w.adminId)).toContain("payout.record");
  });

  test("refuses a non-staff recipient", async () => {
    const w = await seedWorld();
    await expect(
      asAdmin(w).mutation(api.payouts.recordPayout, {
        instructorId: w.studentId,
        amountKobo: 10_000,
      }),
    ).rejects.toThrow(/instructors and admins/);
  });

  test.each([[0], [-1], [1.5]])(
    "refuses the invalid amount %j",
    async (amountKobo) => {
      const w = await seedWorld();
      await expect(
        asAdmin(w).mutation(api.payouts.recordPayout, {
          instructorId: w.instructorId,
          amountKobo,
        }),
      ).rejects.toThrow(/positive whole number/);
    },
  );
});

describe("getPayoutOverview", () => {
  test("computes earned, pending, paid and available from the ledger", async () => {
    const w = await seedWorld();
    const instructor = asInstructor(w);

    let overview = await instructor.query(api.payouts.getPayoutOverview, {});
    expect(overview.balance).toEqual({
      earnedKobo: SHARE_KOBO,
      paidKobo: 0,
      pendingKobo: 0,
      availableKobo: SHARE_KOBO,
    });

    const { payoutId } = await instructor.mutation(api.payouts.requestPayout, {});

    overview = await instructor.query(api.payouts.getPayoutOverview, {});
    expect(overview.balance.pendingKobo).toBe(SHARE_KOBO);
    expect(overview.balance.availableKobo).toBe(0);

    await asAdmin(w).mutation(api.payouts.markPayoutPaid, { payoutId });

    overview = await instructor.query(api.payouts.getPayoutOverview, {});
    expect(overview.balance.pendingKobo).toBe(0);
    expect(overview.balance.paidKobo).toBe(SHARE_KOBO);
    expect(overview.balance.availableKobo).toBe(0);

    // History is returned newest-first and describes the resolved row.
    expect(overview.payouts).toHaveLength(1);
    expect(overview.payouts[0].status).toBe("paid");
    expect(overview.bankVerified).toBe(true);
  });

  test("a non-admin cannot read another instructor's ledger", async () => {
    const w = await seedWorld();
    await expect(
      asInstructor(w).query(api.payouts.getPayoutOverview, {
        instructorId: w.rivalId,
      }),
    ).rejects.toThrow(/admin access required/);
  });

  test("an admin can read a named instructor's ledger", async () => {
    const w = await seedWorld();
    const overview = await asAdmin(w).query(api.payouts.getPayoutOverview, {
      instructorId: w.instructorId,
    });
    expect(overview.balance.availableKobo).toBe(SHARE_KOBO);
  });
});

describe("admin queue reads", () => {
  test("countPendingPayouts counts only requested rows and is admin-only", async () => {
    const w = await seedWorld();
    const { payoutId } = await asInstructor(w).mutation(
      api.payouts.requestPayout,
      {},
    );

    expect(await asAdmin(w).query(api.payouts.countPendingPayouts, {})).toBe(1);
    await expect(
      asInstructor(w).query(api.payouts.countPendingPayouts, {}),
    ).rejects.toThrow(/admin access required/);

    await asAdmin(w).mutation(api.payouts.markPayoutPaid, { payoutId });
    expect(await asAdmin(w).query(api.payouts.countPendingPayouts, {})).toBe(0);
  });

  test("listPayoutQueue joins the instructor and filters by status", async () => {
    const w = await seedWorld();
    await asInstructor(w).mutation(api.payouts.requestPayout, {});

    const requested = await asAdmin(w).query(api.payouts.listPayoutQueue, {
      status: "requested",
    });
    expect(requested).toHaveLength(1);
    expect(requested[0].instructorName).toBe("Ada Instructor");
    expect(requested[0].amountKobo).toBe(SHARE_KOBO);

    const paid = await asAdmin(w).query(api.payouts.listPayoutQueue, {
      status: "paid",
    });
    expect(paid).toHaveLength(0);

    await expect(asInstructor(w).query(api.payouts.listPayoutQueue, {})).rejects.toThrow(
      /admin access required/,
    );
  });

  test("listPayoutRecipients returns staff only, and is admin-only", async () => {
    const w = await seedWorld();
    const recipients = await asAdmin(w).query(
      api.payouts.listPayoutRecipients,
      {},
    );
    expect(recipients.map((r) => r.id).sort()).toEqual(
      [w.instructorId, w.rivalId, w.adminId].sort(),
    );
    expect(recipients.some((r) => r.id === w.studentId)).toBe(false);
    expect(
      recipients.find((r) => r.id === w.instructorId)?.bankVerified,
    ).toBe(true);

    await expect(
      asInstructor(w).query(api.payouts.listPayoutRecipients, {}),
    ).rejects.toThrow(/admin access required/);
  });
});

describe("sendPayoutRequestEmail", () => {
  test("is a no-op when no mail provider is configured", async () => {
    const w = await seedWorld();
    // A mail outage must not roll back a request that has already committed.
    await expect(
      w.t.action(internal.bankVerification.sendPayoutRequestEmail, {
        payoutId: "payout_1",
        amountKobo: SHARE_KOBO,
        userName: "Ada Instructor",
        userEmail: "ada@test.com",
      }),
    ).resolves.toBeNull();
  });
});
