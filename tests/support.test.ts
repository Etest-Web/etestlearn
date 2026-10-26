import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { SchemaDefinition } from "convex/server";
import type { GenericSchema } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;

describe("Support Desk System", () => {
  it("allows creating a support ticket and queries it", async () => {
    const t = convexTest(testSchema, modules);

    // 1. Submit ticket
    const result = await t.mutation(api.support.createTicket, {
      name: "Chidi Nnamdi",
      email: "chidi@example.com",
      subject: "Cannot view certificate",
      category: "certificates",
      priority: "high",
      message: "I finished the course but the certificate PDF fails to load.",
    });

    expect(result.ticketId).toBeDefined();
    expect(result.ticketNumber).toMatch(/^TICK-/);

    // 2. Lookup public ticket
    const lookup = await t.query(api.support.lookupPublicTicket, {
      ticketNumber: result.ticketNumber,
      email: "chidi@example.com",
    });

    expect(lookup).not.toBeNull();
    expect(lookup?.ticket.subject).toBe("Cannot view certificate");
    expect(lookup?.messages.length).toBe(1);
    expect(lookup?.messages[0].body).toContain("certificate PDF fails to load");

    // 3. Admin review and reply
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "clerk_admin_1",
        email: "admin@glypha.com.ng",
        name: "Admin Staff",
        role: "admin",
        createdAt: Date.now(),
      });
    });

    const asAdmin = t.withIdentity({ subject: "clerk_admin_1", tokenIdentifier: "clerk_admin_1" });

    // Admin lists tickets
    const adminTickets = await asAdmin.query(api.support.adminListTickets, {});
    expect(adminTickets.length).toBe(1);
    expect(adminTickets[0].ticketNumber).toBe(result.ticketNumber);

    // Admin replies
    await asAdmin.mutation(api.support.adminReplyTicket, {
      ticketId: result.ticketId,
      body: "We have resolved the rendering glitch, please refresh your page.",
      isInternalNote: false,
      newStatus: "resolved",
    });

    // Check stats
    const stats = await asAdmin.query(api.support.adminGetSupportStats, {});
    expect(stats.total).toBe(1);
    expect(stats.resolved).toBe(1);
  });
});

/**
 * M-3 (who may mint an upload URL) and M-4 (how much entropy a ticket number
 * carries) — both were reachable by an unauthenticated caller.
 */
describe("Support Desk — upload minting & ticket-number entropy", () => {
  it("mints an upload URL only with a session or a usable email", async () => {
    const t = convexTest(testSchema, modules);

    // No identity, nothing to key a rate limit on → refused outright.
    await expect(t.mutation(api.support.generateSupportUploadUrl, {})).rejects.toThrow(
      /email address \(or sign in\)/,
    );

    // A malformed address is not a usable bucket either.
    await expect(
      t.mutation(api.support.generateSupportUploadUrl, { email: "not-an-email" }),
    ).rejects.toThrow(/email address \(or sign in\)/);

    // A valid one mints.
    const url = await t.mutation(api.support.generateSupportUploadUrl, {
      email: "guest@example.com",
    });
    expect(url).toMatch(/^https:\/\//);

    // …and is rate-limited: 20 per hour, so the 21st is refused.
    let lastError: unknown = null;
    for (let i = 0; i < 20; i++) {
      try {
        await t.mutation(api.support.generateSupportUploadUrl, {
          email: "guest@example.com",
        });
      } catch (err) {
        lastError = err;
        break;
      }
    }
    expect(lastError).not.toBeNull();
    expect(String(lastError)).toMatch(/Too many requests/);
  });

  it("issues high-entropy, unique ticket numbers", async () => {
    const t = convexTest(testSchema, modules);

    const numbers = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const res = await t.mutation(api.support.createTicket, {
        name: "Ada Obi",
        email: `ada${i}@example.com`,
        subject: `Subject ${i}`,
        category: "other",
        message: "Body of the ticket.",
      });
      // 8 Crockford-base32 characters after the year — not the old 7 digits.
      expect(res.ticketNumber).toMatch(/^TICK-\d{4}-[0-9A-HJKMNP-TV-Z]{8}$/);
      numbers.add(res.ticketNumber);
    }
    expect(numbers.size).toBe(3);
  });

  it("rejects a ticket carrying too many attachments", async () => {
    const t = convexTest(testSchema, modules);
    // A `_storage`-shaped id: `v.id("_storage")` is what validates it, and the
    // system table itself is read-only in convex-test, so no file is minted.
    const storageId = "0000000000000000000_storage" as Id<"_storage">;
    const attachment = (n: number) => ({
      storageId,
      fileName: `file-${n}.png`,
      mimeType: "image/png",
      size: 1024,
    });

    await expect(
      t.mutation(api.support.createTicket, {
        name: "Ada Obi",
        email: "ada@example.com",
        subject: "Too many",
        category: "other",
        message: "Body.",
        attachments: [1, 2, 3, 4, 5, 6].map(attachment),
      }),
    ).rejects.toThrow(/at most 5 attachments/);

    // …and one with a bad MIME type / oversized declared size.
    await expect(
      t.mutation(api.support.createTicket, {
        name: "Ada Obi",
        email: "ada@example.com",
        subject: "Bad mime",
        category: "other",
        message: "Body.",
        attachments: [{ ...attachment(1), mimeType: "not a mime type" }],
      }),
    ).rejects.toThrow(/type is invalid/);

    await expect(
      t.mutation(api.support.createTicket, {
        name: "Ada Obi",
        email: "ada@example.com",
        subject: "Too big",
        category: "other",
        message: "Body.",
        attachments: [{ ...attachment(1), size: 64 * 1024 * 1024 }],
      }),
    ).rejects.toThrow(/smaller than 16MB/);

    // A well-formed set still goes through.
    const ok = await t.mutation(api.support.createTicket, {
      name: "Ada Obi",
      email: "ada@example.com",
      subject: "With attachment",
      category: "other",
      message: "Body.",
      attachments: [attachment(1), attachment(2)],
    });
    expect(ok.ticketId).toBeDefined();
  });
});
