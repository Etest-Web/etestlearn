import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { SchemaDefinition } from "convex/server";
import type { GenericSchema } from "convex/server";

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
