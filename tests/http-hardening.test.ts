import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";

/**
 * Guards for the hardening added to the two webhook routes (`convex/http.ts`)
 * and to `prepareTemplateUpload` (PDF active-content scan).
 *
 * The webhooks are the only unauthenticated surface in the app, so the tests
 * pin down the exact order of the checks there: origin → size cap →
 * signature → JSON parse → process → 200. Each stage must reject BEFORE the
 * next one runs, otherwise a cheap refusal could be turned into expensive
 * work (or worse, a parser call) by an anonymous caller.
 */
const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestCtx = GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>>;
type TestWorld = TestConvex<typeof testSchema>;

// Read at call time by the handlers, so the tests install their own values
// and restore the developer's environment afterwards.
const PAYSTACK_SECRET = "sk_test_hardening_secret";
const CLERK_WEBHOOK_SECRET = `whsec_${Buffer.from(
  "clerk-hardening-secret-bytes",
).toString("base64")}`;
const SAVED_ENV = { ...process.env };

beforeAll(() => {
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;
  process.env.CLERK_WEBHOOK_SECRET = CLERK_WEBHOOK_SECRET;
});

afterAll(() => {
  process.env = { ...SAVED_ENV };
});

/** The digest Paystack computes over the raw body with your secret key. */
function paystackSignature(body: string): string {
  return createHmac("sha512", PAYSTACK_SECRET).update(body, "utf8").digest("hex");
}

/** Build a POST init whose Paystack signature is valid unless told otherwise. */
function paystackPost(
  body: string,
  opts: { signature?: string | null; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.signature === undefined) {
    headers["x-paystack-signature"] = paystackSignature(body);
  } else if (opts.signature !== null) {
    headers["x-paystack-signature"] = opts.signature;
  }
  return {
    method: "POST",
    headers: { ...headers, ...(opts.headers ?? {}) },
    body,
  };
}

/**
 * svix/Clerk signature: base64 HMAC-SHA256 over `<msgId>.<timestamp>.<body>`
 * with the decoded (post-`whsec_`) key — exactly what standardwebhooks
 * recomputes in `verify()`.
 */
function svixHeaders(payload: string) {
  const msgId = "msg_hardening_1";
  const timestamp = Math.floor(Date.now() / 1000);
  const key = Buffer.from(CLERK_WEBHOOK_SECRET.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key)
    .update(`${msgId}.${timestamp}.${payload}`, "utf8")
    .digest("base64");
  return {
    "svix-id": msgId,
    "svix-timestamp": `${timestamp}`,
    "svix-signature": `v1,${signature}`,
  };
}

function clerkPost(
  payload: string,
  opts: { signed?: boolean; headers?: Record<string, string> } = {},
) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.signed === false ? {} : svixHeaders(payload)),
      ...(opts.headers ?? {}),
    },
    body: payload,
  };
}

async function seedAdmin(t: TestWorld) {
  await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_admin",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      createdAt: Date.now(),
    }),
  );
}

/** A pending purchase the Paystack `charge.success` handler should fulfil. */
async function seedPendingPurchase(t: TestWorld, reference: string) {
  const now = Date.now();
  const userId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_buyer",
      email: "buyer@test.com",
      name: "Buyer",
      role: "student",
      createdAt: now,
    }),
  );
  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Paid Course",
      slug: "paid-course",
      description: "A course that costs money",
      instructorId: userId,
      published: true,
      price: 50000,
      currency: "NGN",
      searchText: "Paid Course",
      createdAt: now,
      updatedAt: now,
    }),
  );
  await t.run((ctx: TestCtx) =>
    ctx.db.insert("purchases", {
      userId,
      courseId,
      paystackReference: reference,
      amount: 50000,
      currency: "NGN",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    }),
  );
}

/**
 * A minimal but genuinely parseable PDF whose page content stream is NOT
 * compressed, so the literal text drawn on it is visible in the raw bytes.
 * Offsets are byte-accurate because the fixture is pure ASCII.
 */
function buildPdfWithPlaintextStream(streamContent: string): string {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return out;
}

/** A file that claims `%PDF-` and carries `key` in an object dictionary. */
function pdfWithKeyOutsideStream(key: string): string {
  return `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${key} 3 0 R >>\nendobj\n%%EOF\n`;
}

async function storeFile(t: TestWorld, content: string | Uint8Array) {
  return await t.run((ctx) =>
    ctx.storage.store(new Blob([content as BlobPart], { type: "application/pdf" })),
  );
}

describe("webhook hardening — request size cap", () => {
  it("refuses an oversized declared Content-Length before even checking the signature", async () => {
    const t = convexTest(testSchema, modules);
    // The signature is garbage on purpose: if the 413 came back as a 401
    // instead, the size check would be running AFTER signature verification.
    const res = await t.fetch("/webhook/paystack", {
      ...paystackPost("{}", {
        signature: "deadbeef",
        headers: { "content-length": "300000" },
      }),
    });
    expect(res.status).toBe(413);
  });

  it("refuses an oversized body when Content-Length is absent", async () => {
    const t = convexTest(testSchema, modules);
    const body = JSON.stringify({ event: "charge.success", pad: "x".repeat(300000) });
    // `Request` does not invent a Content-Length for a string body, so this
    // exercises the actual-bytes check — the path a chunked or lying client
    // would take.
    const res = await t.fetch("/webhook/paystack", paystackPost(body));
    expect(res.status).toBe(413);
  });

  it("refuses an oversized body whose Content-Length lies about its size", async () => {
    const t = convexTest(testSchema, modules);
    const body = JSON.stringify({ event: "charge.success", pad: "x".repeat(300000) });
    const init = paystackPost(body);
    const res = await t.fetch("/webhook/paystack", {
      ...init,
      headers: { ...init.headers, "content-length": "10" },
    });
    expect(res.status).toBe(413);
  });

  it("applies the same cap to the Clerk route", async () => {
    const t = convexTest(testSchema, modules);
    const payload = JSON.stringify({ type: "user.created", pad: "x".repeat(300000) });
    const res = await t.fetch("/webhook/clerk", clerkPost(payload));
    expect(res.status).toBe(413);
  });
});

describe("webhook hardening — signature verification", () => {
  it("rejects a Paystack event with no signature", async () => {
    const t = convexTest(testSchema, modules);
    const res = await t.fetch(
      "/webhook/paystack",
      paystackPost(JSON.stringify({ event: "charge.success" }), { signature: null }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a Paystack event with a wrong signature", async () => {
    const t = convexTest(testSchema, modules);
    const res = await t.fetch(
      "/webhook/paystack",
      paystackPost(JSON.stringify({ event: "charge.success" }), {
        signature: "f".repeat(128),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a Clerk event with no svix headers", async () => {
    const t = convexTest(testSchema, modules);
    const res = await t.fetch(
      "/webhook/clerk",
      clerkPost(JSON.stringify({ type: "user.created", data: { id: "user_x" } }), {
        signed: false,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a Clerk event with a wrong svix signature", async () => {
    const t = convexTest(testSchema, modules);
    const payload = JSON.stringify({ type: "user.created", data: { id: "user_x" } });
    const res = await t.fetch(
      "/webhook/clerk",
      clerkPost(payload, { headers: { "svix-signature": "v1,bm90LXJlYWw=" } }),
    );
    expect(res.status).toBe(401);
  });
});

describe("webhook hardening — payload parsing", () => {
  it("rejects signed-but-malformed Paystack JSON with 400", async () => {
    const t = convexTest(testSchema, modules);
    const res = await t.fetch("/webhook/paystack", paystackPost("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects signed-but-malformed Clerk JSON with 400", async () => {
    const t = convexTest(testSchema, modules);
    const res = await t.fetch("/webhook/clerk", clerkPost("{not json"));
    expect(res.status).toBe(400);
  });
});

describe("webhook hardening — happy path still works", () => {
  it("marks the purchase paid on a valid charge.success and enrols the buyer", async () => {
    const t = convexTest(testSchema, modules);
    await seedPendingPurchase(t, "ref_hardening");

    const res = await t.fetch(
      "/webhook/paystack",
      paystackPost(
        JSON.stringify({ event: "charge.success", data: { reference: "ref_hardening" } }),
      ),
    );
    expect(res.status).toBe(200);

    const purchase = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("purchases")
        .withIndex("by_reference", (q) => q.eq("paystackReference", "ref_hardening"))
        .unique(),
    );
    expect(purchase?.status).toBe("paid");

    const enrollments = await t.run((ctx: TestCtx) => ctx.db.query("enrollments").collect());
    expect(enrollments).toHaveLength(1);
  });

  it("returns 200 for an unrelated Paystack event so the provider stops retrying", async () => {
    const t = convexTest(testSchema, modules);
    const res = await t.fetch(
      "/webhook/paystack",
      paystackPost(JSON.stringify({ event: "invoice.due", data: { id: 42 } })),
    );
    expect(res.status).toBe(200);
  });

  it("creates the user on a valid Clerk user.created", async () => {
    const t = convexTest(testSchema, modules);
    const payload = JSON.stringify({
      type: "user.created",
      data: {
        id: "user_new1",
        first_name: "Ada",
        last_name: "Okafor",
        primary_email_address_id: "email_1",
        email_addresses: [{ id: "email_1", email_address: "ada@example.com" }],
      },
    });

    const res = await t.fetch("/webhook/clerk", clerkPost(payload));
    expect(res.status).toBe(200);

    const user = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_new1"))
        .unique(),
    );
    expect(user?.role).toBe("student");
    expect(user?.name).toBe("Ada Okafor");
    expect(user?.email).toBe("ada@example.com");
  });

  it("returns 200 for an unrelated Clerk event", async () => {
    const t = convexTest(testSchema, modules);
    const res = await t.fetch(
      "/webhook/clerk",
      clerkPost(JSON.stringify({ type: "session.created", data: { id: "sess_1" } })),
    );
    expect(res.status).toBe(200);
  });
});

describe("webhook hardening — browser-originated requests", () => {
  it("refuses a Paystack event carrying an Origin header, even when signed", async () => {
    const t = convexTest(testSchema, modules);
    await seedPendingPurchase(t, "ref_origin");

    const res = await t.fetch(
      "/webhook/paystack",
      paystackPost(
        JSON.stringify({ event: "charge.success", data: { reference: "ref_origin" } }),
        { headers: { origin: "https://evil.example" } },
      ),
    );
    expect(res.status).toBe(403);

    // Nothing was processed on the way past.
    const purchase = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("purchases")
        .withIndex("by_reference", (q) => q.eq("paystackReference", "ref_origin"))
        .unique(),
    );
    expect(purchase?.status).toBe("pending");
  });

  it("refuses a Clerk event carrying an Origin header, even when signed", async () => {
    const t = convexTest(testSchema, modules);
    const payload = JSON.stringify({
      type: "user.created",
      data: { id: "user_blocked", first_name: "No", last_name: "Entry" },
    });

    const res = await t.fetch(
      "/webhook/clerk",
      clerkPost(payload, { headers: { origin: "https://evil.example" } }),
    );
    expect(res.status).toBe(403);

    const user = await t.run((ctx: TestCtx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_blocked"))
        .unique(),
    );
    expect(user).toBeNull();
  });
});

describe("certificate template upload — active content", () => {
  it("rejects a template carrying each dangerous PDF key", async () => {
    for (const key of ["/JavaScript", "/JS", "/Launch", "/OpenAction", "/AA"]) {
      const t = convexTest(testSchema, modules);
      await seedAdmin(t);
      const storageId = await storeFile(t, pdfWithKeyOutsideStream(key));

      await expect(
        t
          .withIdentity({ subject: "clerk_admin", tokenIdentifier: "clerk_admin" })
          .action(api.certificateTemplateActions.prepareTemplateUpload, { storageId }),
      ).rejects.toThrow(/active content/);
    }
  });

  it("rejects a key hidden behind a #xx name escape (a viewer decodes it too)", async () => {
    const t = convexTest(testSchema, modules);
    await seedAdmin(t);
    // `/Java#53cript` is the same PDF name as `/JavaScript` once `#53` is
    // decoded to "S" — a raw substring check would miss it entirely.
    const storageId = await storeFile(
      t,
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Java#53cript 3 0 R >>\nendobj\n%%EOF\n",
    );

    await expect(
      t
        .withIdentity({ subject: "clerk_admin", tokenIdentifier: "clerk_admin" })
        .action(api.certificateTemplateActions.prepareTemplateUpload, { storageId }),
    ).rejects.toThrow(/active content/);
  });

  it("accepts a real PDF whose uncompressed content stream mentions /JavaScript", async () => {
    const t = convexTest(testSchema, modules);
    await seedAdmin(t);

    // Literal text drawn on the page — the documented false-positive case.
    // Stream payloads are stripped before scanning, so inert artwork passes.
    const pdfText = buildPdfWithPlaintextStream(
      "BT (template /JavaScript artwork) Tj ET",
    );
    expect(pdfText).toContain("/JavaScript"); // the fixture proves its own point

    const storageId = await storeFile(t, pdfText);
    const result = await t
      .withIdentity({ subject: "clerk_admin", tokenIdentifier: "clerk_admin" })
      .action(api.certificateTemplateActions.prepareTemplateUpload, { storageId });

    expect(result.pageWidth).toBe(612);
    expect(result.pageHeight).toBe(792);
  });

  it("accepts an ordinary generated PDF and still rejects non-PDFs", async () => {
    const t = convexTest(testSchema, modules);
    await seedAdmin(t);
    const asAdmin = t.withIdentity({
      subject: "clerk_admin",
      tokenIdentifier: "clerk_admin",
    });

    const pdf = await PDFDocument.create();
    pdf.addPage([841.89, 595.28]);
    const generated = await pdf.save();

    const goodId = await storeFile(t, generated);
    const good = await asAdmin.action(api.certificateTemplateActions.prepareTemplateUpload, {
      storageId: goodId,
    });
    expect(good.pageWidth).toBeCloseTo(841.89, 1);

    const notPdfId = await storeFile(t, "hello, not a pdf");
    await expect(
      asAdmin.action(api.certificateTemplateActions.prepareTemplateUpload, {
        storageId: notPdfId,
      }),
    ).rejects.toThrow(/not a valid PDF/);
  });

  it("still refuses non-admin callers", async () => {
    const t = convexTest(testSchema, modules);
    const storageId = await storeFile(t, pdfWithKeyOutsideStream("/OpenAction"));

    await expect(
      t
        .withIdentity({ subject: "clerk_stranger", tokenIdentifier: "clerk_stranger" })
        .action(api.certificateTemplateActions.prepareTemplateUpload, { storageId }),
    ).rejects.toThrow(/Not authorized/);
  });
});
