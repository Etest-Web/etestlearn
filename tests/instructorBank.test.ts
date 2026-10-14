import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  decryptAccountNumber,
  encryptAccountNumber,
  maskAccountNumber,
} from "../convex/helpers/encryption";

/**
 * Instructor payout bank details: one-shot verification, encrypted at rest,
 * rate-limited before it reaches Paystack.
 *
 * The store path is tested through `internal.instructorBank.persistVerifiedAccount`
 * (what the action calls) rather than only through the action, because that is
 * the function that owns the policy — the action adds a network call on top.
 * The action itself is covered once per branch with `fetch` stubbed, so no test
 * ever touches Paystack.
 *
 * Mail env is cleared for the action tests: the confirmation email is
 * best-effort by design, and a test process must never discover a developer's
 * exported SMTP_* variables and try to send for real.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
// Typed against the *real* schema, the same way `tests/notifications.test.ts`
// does it: `convexTest` above receives the generic definition, so `ctx` inside
// `t.run` would otherwise only know the system indexes — hence `TestCtx` for
// the database handle and loose `t` for the instance.
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

const INSTRUCTOR = "clerk_bank_instructor";
const STUDENT = "clerk_bank_student";
const ACCOUNT_NUMBER = "0123456789";
const BANK_CODE = "058"; // Guaranty Trust Bank

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
  // A fresh key per test: a key shared across tests would let a bug that
  // decrypts with the wrong key pass by accident.
  setEnv("BANK_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  setEnv("PAYSTACK_SECRET_KEY", "sk_test_dummy_for_unit_tests");
  for (const key of MAIL_ENV_KEYS) setEnv(key, undefined);
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
  vi.unstubAllGlobals();
});

async function seedUser(
  t: any,
  subject: string,
  role: "student" | "instructor",
) {
  return t.run(async (ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email: `${subject}@test.com`,
      name: subject,
      role,
      createdAt: Date.now(),
    }),
  );
}

/** A fresh instance bound to `subject`'s identity, with their row seeded. */
async function as(subject: string, role: "student" | "instructor") {
  const t = convexTest(testSchema, modules).withIdentity({
    subject,
    tokenIdentifier: subject,
  });
  await seedUser(t, subject, role);
  return t;
}

async function userRow(t: any, subject: string) {
  return t.run(async (ctx: TestCtx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", subject))
      .unique(),
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const mock = vi.fn(async (input: unknown, init?: RequestInit) =>
    handler(String(input), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function resolveOk(accountName: string) {
  return {
    ok: true,
    json: async () => ({ status: true, message: "ok", data: { account_name: accountName } }),
  };
}

function resolveFail(message: string) {
  return { ok: false, json: async () => ({ status: false, message }) };
}

describe("encryption helper", () => {
  test("round-trips an account number", async () => {
    const payload = await encryptAccountNumber(ACCOUNT_NUMBER);
    expect(payload).not.toContain(ACCOUNT_NUMBER);
    expect(await decryptAccountNumber(payload)).toBe(ACCOUNT_NUMBER);
  });

  test("uses a fresh IV per encryption", async () => {
    // Identical plaintexts must not produce identical ciphertexts, or the
    // stored values leak which instructors share an account number.
    const a = await encryptAccountNumber(ACCOUNT_NUMBER);
    const b = await encryptAccountNumber(ACCOUNT_NUMBER);
    expect(a).not.toBe(b);
  });

  test("fails closed when the key is missing", async () => {
    setEnv("BANK_ENCRYPTION_KEY", undefined);
    await expect(encryptAccountNumber(ACCOUNT_NUMBER)).rejects.toThrow(
      /BANK_ENCRYPTION_KEY is not set/,
    );
  });

  test("rejects a wrong-length key", async () => {
    setEnv("BANK_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    await expect(encryptAccountNumber(ACCOUNT_NUMBER)).rejects.toThrow(
      /exactly 32 bytes/,
    );
  });

  test("detects tampering", async () => {
    const payload = await encryptAccountNumber(ACCOUNT_NUMBER);
    const [iv, ciphertext] = payload.split(".");
    // Flip a character inside the ciphertext while keeping it valid base64url.
    const flipped = ciphertext.startsWith("A")
      ? `B${ciphertext.slice(1)}`
      : `A${ciphertext.slice(1)}`;
    await expect(decryptAccountNumber(`${iv}.${flipped}`)).rejects.toThrow();
  });

  test("masks all but the last four digits", () => {
    expect(maskAccountNumber(ACCOUNT_NUMBER)).toBe("******6789");
    expect(maskAccountNumber("12")).toBe("**");
  });
});

describe("getBankInfo / needsPayoutSetup", () => {
  test("reports nothing on file before verification", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    const info = await t.query(api.instructorBank.getBankInfo, {});
    expect(info).toEqual({
      verified: false,
      accountNumberMasked: null,
      bankCode: null,
      accountName: null,
      updatedAt: null,
    });
    expect(await t.query(api.instructorBank.needsPayoutSetup, {})).toBe(true);
  });

  test("returns only a mask after verification", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    await t.mutation(internal.instructorBank.persistVerifiedAccount, {
      accountNumber: ACCOUNT_NUMBER,
      bankCode: BANK_CODE,
      accountName: "Ada Obi",
    });

    const info = await t.query(api.instructorBank.getBankInfo, {});
    expect(info.verified).toBe(true);
    expect(info.accountNumberMasked).toBe("******6789");
    expect(info.accountName).toBe("Ada Obi");
    expect(info.bankCode).toBe(BANK_CODE);
    // The raw number must not cross the query boundary in any field.
    expect(JSON.stringify(info)).not.toContain(ACCOUNT_NUMBER);

    expect(await t.query(api.instructorBank.needsPayoutSetup, {})).toBe(false);
  });

  test("is false for a student — the banner must not render for them", async () => {
    const t = await as(STUDENT, "student");
    expect(await t.query(api.instructorBank.needsPayoutSetup, {})).toBe(false);
  });
});

describe("persistVerifiedAccount", () => {
  test("stores ciphertext, not the account number", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    const saved = await t.mutation(
      internal.instructorBank.persistVerifiedAccount,
      {
        accountNumber: ACCOUNT_NUMBER,
        bankCode: BANK_CODE,
        accountName: "Ada Obi",
      },
    );
    expect(saved.accountNumberMasked).toBe("******6789");

    const row = await userRow(t, INSTRUCTOR);
    expect(row?.bankVerified).toBe(true);
    expect(row?.bankCode).toBe(BANK_CODE);
    expect(row?.bankAccountName).toBe("Ada Obi");
    expect(typeof row?.bankDetailsUpdatedAt).toBe("number");

    const encrypted = row?.bankAccountEncrypted;
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain(ACCOUNT_NUMBER);
    expect(await decryptAccountNumber(encrypted!)).toBe(ACCOUNT_NUMBER);
  });

  test("refuses a second save and names the support route", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    const args = {
      accountNumber: ACCOUNT_NUMBER,
      bankCode: BANK_CODE,
      accountName: "Ada Obi",
    };
    await t.mutation(internal.instructorBank.persistVerifiedAccount, args);

    await expect(
      t.mutation(internal.instructorBank.persistVerifiedAccount, {
        ...args,
        accountNumber: "9988776655",
      }),
    ).rejects.toThrow(/already saved[\s\S]*noreply@glypha\.com\.ng/);

    // The original account is untouched — the refusal must not half-write.
    const row = await userRow(t, INSTRUCTOR);
    expect(await decryptAccountNumber(row!.bankAccountEncrypted!)).toBe(
      ACCOUNT_NUMBER,
    );
  });

  test("refuses students", async () => {
    const t = await as(STUDENT, "student");
    await expect(
      t.mutation(internal.instructorBank.persistVerifiedAccount, {
        accountNumber: ACCOUNT_NUMBER,
        bankCode: BANK_CODE,
        accountName: "Ada Obi",
      }),
    ).rejects.toThrow(/Only instructors/);
  });

  test.each([["12345"], ["12345678901"], ["123456789a"], [""]])(
    "refuses the malformed account number %j",
    async (accountNumber) => {
      const t = await as(INSTRUCTOR, "instructor");
      await expect(
        t.mutation(internal.instructorBank.persistVerifiedAccount, {
          accountNumber,
          bankCode: BANK_CODE,
          accountName: "Ada Obi",
        }),
      ).rejects.toThrow(/10 digits/);
    },
  );

  test("writes the confirmation notification and a masked audit row", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    const userId = await userRow(t, INSTRUCTOR);
    await t.mutation(internal.instructorBank.persistVerifiedAccount, {
      accountNumber: ACCOUNT_NUMBER,
      bankCode: BANK_CODE,
      accountName: "Ada Obi",
    });

    const notifications = await t.run(async (ctx: TestCtx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q: any) =>
          q.eq("userId", userId!._id).eq("readAt", undefined),
        )
        .collect(),
    );
    const confirmation = notifications.find(
      (n) => n.type === "bank_details_added",
    );
    expect(confirmation).toBeTruthy();
    expect(confirmation?.href).toBe("/dashboard/instructor/bank");

    const audit = await t.run(async (ctx: TestCtx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_actor", (q: any) => q.eq("actorId", userId!._id))
        .collect(),
    );
    const entry = audit.find((row) => row.action === "user.save_bank_details");
    expect(entry).toBeTruthy();
    // The audit trail records which account without carrying the number.
    expect(entry!.details).toContain(BANK_CODE);
    expect(entry!.details).toContain("******6789");
    expect(entry!.details).not.toContain(ACCOUNT_NUMBER);
  });
});

describe("ensurePayoutNudge", () => {
  test("writes the inbox nudge exactly once", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    const userId = await userRow(t, INSTRUCTOR);

    expect(
      (await t.mutation(api.instructorBank.ensurePayoutNudge, {})).created,
    ).toBe(true);
    // Every future login calls this again — it must not pile up rows.
    expect(
      (await t.mutation(api.instructorBank.ensurePayoutNudge, {})).created,
    ).toBe(false);

    const rows = await t.run(async (ctx: TestCtx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q: any) =>
          q.eq("userId", userId!._id).eq("readAt", undefined),
        )
        .collect(),
    );
    expect(
      rows.filter((row) => row.type === "bank_info_required"),
    ).toHaveLength(1);
    expect(rows.find((row) => row.type === "bank_info_required")?.href).toBe(
      "/dashboard/instructor/bank",
    );
  });

  test("skips students and instructors who already verified", async () => {
    const student = await as(STUDENT, "student");
    expect(
      (await student.mutation(api.instructorBank.ensurePayoutNudge, {}))
        .created,
    ).toBe(false);

    const t = await as(INSTRUCTOR, "instructor");
    await t.mutation(internal.instructorBank.persistVerifiedAccount, {
      accountNumber: ACCOUNT_NUMBER,
      bankCode: BANK_CODE,
      accountName: "Ada Obi",
    });
    expect(
      (await t.mutation(api.instructorBank.ensurePayoutNudge, {})).created,
    ).toBe(false);
  });
});

describe("consumeVerifyAttempt", () => {
  test("allows five attempts an hour, then refuses", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.instructorBank.consumeVerifyAttempt, {});
    }
    await expect(
      t.mutation(internal.instructorBank.consumeVerifyAttempt, {}),
    ).rejects.toThrow(/Too many requests — please wait \d+ seconds/);
  });
});

describe("verifyBankAccount action + confirmBankAccount mutation", () => {
  test("verify resolves via Paystack, then confirm saves and returns the mask", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    const fetchMock = stubFetch(() => resolveOk("Ada Obi"));

    // Step 1: verify
    const verifyResult = await t.action(
      api.bankVerification.verifyBankAccount,
      { accountNumber: ` ${ACCOUNT_NUMBER} `, bankCode: BANK_CODE },
    );

    expect(verifyResult.accountName).toBe("Ada Obi");

    // The call went where it should, with the secret in the header.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      "https://api.paystack.co/bank/resolve",
    );
    expect(calledUrl.searchParams.get("account_number")).toBe(ACCOUNT_NUMBER);
    expect(calledUrl.searchParams.get("bank_code")).toBe(BANK_CODE);
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_dummy_for_unit_tests");

    // Nothing saved yet
    let row = await userRow(t, INSTRUCTOR);
    expect(row?.bankVerified).toBeFalsy();

    // Step 2: confirm
    const confirmResult = await t.mutation(
      api.instructorBank.confirmBankAccount,
      { accountNumber: ACCOUNT_NUMBER, bankCode: BANK_CODE, accountName: "Ada Obi" },
    );

    expect(confirmResult.accountName).toBe("Ada Obi");
    expect(confirmResult.accountNumberMasked).toBe("******6789");

    row = await userRow(t, INSTRUCTOR);
    expect(row?.bankVerified).toBe(true);
    expect(await decryptAccountNumber(row!.bankAccountEncrypted!)).toBe(
      ACCOUNT_NUMBER,
    );
  });

  test("verify rejects malformed input before any network call", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    const fetchMock = stubFetch(() => resolveOk("Ada Obi"));

    await expect(
      t.action(api.bankVerification.verifyBankAccount, {
        accountNumber: "12345",
        bankCode: BANK_CODE,
      }),
    ).rejects.toThrow(/10 digits/);
    await expect(
      t.action(api.bankVerification.verifyBankAccount, {
        accountNumber: ACCOUNT_NUMBER,
        bankCode: "abc",
      }),
    ).rejects.toThrow(/Invalid bank code/);

    expect(fetchMock).not.toHaveBeenCalled();
    const row = await userRow(t, INSTRUCTOR);
    expect(row?.bankVerified).toBeFalsy();
  });

  test("verify surfaces Paystack's reason and saves nothing", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    stubFetch(() => resolveFail("Account does not exist"));

    await expect(
      t.action(api.bankVerification.verifyBankAccount, {
        accountNumber: ACCOUNT_NUMBER,
        bankCode: BANK_CODE,
      }),
    ).rejects.toThrow("Account does not exist");

    const row = await userRow(t, INSTRUCTOR);
    expect(row?.bankVerified).toBeFalsy();
    expect(row?.bankAccountEncrypted).toBeUndefined();

    // The failed lookup still burned quota — otherwise a typo loop is free
    // while a successful save is not.
    for (let i = 0; i < 4; i++) {
      await t.mutation(internal.instructorBank.consumeVerifyAttempt, {});
    }
    await expect(
      t.mutation(internal.instructorBank.consumeVerifyAttempt, {}),
    ).rejects.toThrow(/Too many requests/);
  });

  test("verify requires a signed-in caller", async () => {
    const t = convexTest(testSchema, modules);
    stubFetch(() => resolveOk("Ada Obi"));
    await expect(
      t.action(api.bankVerification.verifyBankAccount, {
        accountNumber: ACCOUNT_NUMBER,
        bankCode: BANK_CODE,
      }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("confirm rejects if account already verified", async () => {
    const t = await as(INSTRUCTOR, "instructor");
    // First verify + confirm
    const fetchMock = stubFetch(() => resolveOk("Ada Obi"));
    await t.action(api.bankVerification.verifyBankAccount, {
      accountNumber: ACCOUNT_NUMBER,
      bankCode: BANK_CODE,
    });
    await t.mutation(api.instructorBank.confirmBankAccount, {
      accountNumber: ACCOUNT_NUMBER,
      bankCode: BANK_CODE,
      accountName: "Ada Obi",
    });

    // Second confirm should fail
    await expect(
      t.mutation(api.instructorBank.confirmBankAccount, {
        accountNumber: "9988776655",
        bankCode: BANK_CODE,
        accountName: "Different Name",
      }),
    ).rejects.toThrow(/already saved/);
  });
});
