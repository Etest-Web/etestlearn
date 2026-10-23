import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdmin, requireUser } from "./helpers/auth";
import { requireRateLimit } from "./helpers/rateLimit";
import { createNotification } from "./helpers/notifications";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

export const categoryValidator = v.union(
  v.literal("account"),
  v.literal("billing"),
  v.literal("courses"),
  v.literal("certificates"),
  v.literal("technical"),
  v.literal("other")
);

export const priorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent")
);

export const statusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("waiting_user"),
  v.literal("resolved"),
  v.literal("closed")
);

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  const timePart = Date.now().toString().slice(-3);
  return `TICK-${year}-${timePart}${randomPart}`;
}

/**
 * Public/authenticated ticket creation.
 * Can be called by signed-in users or anonymously (if valid email + name provided).
 */
export const createTicket = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    category: categoryValidator,
    message: v.string(),
    priority: v.optional(priorityValidator),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const trimmedName = args.name.trim();
    const trimmedEmail = args.email.trim().toLowerCase();
    const trimmedSubject = args.subject.trim();
    const trimmedMessage = args.message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      throw new Error("All fields are required");
    }

    if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
      throw new Error("Please provide a valid email address");
    }

    // Rate limit: 5 tickets per hour per IP / user
    const rateLimitKey = user
      ? `support:createTicket:${user._id}`
      : `support:createTicket:${trimmedEmail}`;
    await requireRateLimit(ctx, rateLimitKey, 5, 60 * 60 * 1000);

    const now = Date.now();
    const ticketNumber = generateTicketNumber();

    const ticketId = await ctx.db.insert("supportTickets", {
      ticketNumber,
      userId: user?._id,
      email: trimmedEmail,
      name: trimmedName,
      subject: trimmedSubject,
      category: args.category,
      priority: args.priority ?? "medium",
      status: "open",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("supportTicketMessages", {
      ticketId,
      senderType: "user",
      senderId: user?._id,
      senderName: trimmedName,
      body: trimmedMessage,
      isInternalNote: false,
      createdAt: now,
    });

    // Notify admins in-app
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .take(10);

    for (const admin of admins) {
      await createNotification(ctx, {
        userId: admin._id,
        type: "support_ticket_created",
        title: `New Support Ticket #${ticketNumber}`,
        body: `${trimmedName}: ${trimmedSubject}`,
        href: `/dashboard/admin/support?ticketId=${ticketId}`,
        actorId: user?._id,
      });
    }

    // Schedule confirmation email to user
    await ctx.scheduler.runAfter(0, internal.supportActions.sendTicketConfirmation, {
      ticketId,
      ticketNumber,
      name: trimmedName,
      email: trimmedEmail,
      subject: trimmedSubject,
      category: args.category,
      messageExcerpt: trimmedMessage.slice(0, 150),
    });

    return { ticketId, ticketNumber };
  },
});

/**
 * Learner queries: list their own tickets.
 */
export const listMyTickets = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("supportTickets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

/**
 * Get ticket details + messages for authorized user or staff.
 */
export const getTicketDetails = query({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    const isOwner = ticket.userId === user._id;
    const isStaff = user.role === "admin";

    if (!isOwner && !isStaff) {
      throw new Error("Not authorized to view this ticket");
    }

    const messages = await ctx.db
      .query("supportTicketMessages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    // Hide internal notes from non-staff
    const visibleMessages = isStaff
      ? messages
      : messages.filter((m) => !m.isInternalNote);

    return {
      ticket,
      messages: visibleMessages,
    };
  },
});

/**
 * Public lookup by ticket number and email (for guests/anonymous users to check status).
 */
export const lookupPublicTicket = query({
  args: {
    ticketNumber: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedNumber = args.ticketNumber.trim().toUpperCase();
    const normalizedEmail = args.email.trim().toLowerCase();

    const ticket = await ctx.db
      .query("supportTickets")
      .withIndex("by_ticket_number", (q) => q.eq("ticketNumber", normalizedNumber))
      .unique();

    if (!ticket || ticket.email.toLowerCase() !== normalizedEmail) {
      return null;
    }

    const messages = await ctx.db
      .query("supportTicketMessages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
      .filter((q) => q.eq(q.field("isInternalNote"), false))
      .collect();

    return {
      ticket,
      messages,
    };
  },
});

/**
 * Reply to a ticket as a user or guest.
 */
export const replyTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    body: v.string(),
    email: v.optional(v.string()), // Required if anonymous
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const trimmedBody = args.body.trim();
    if (!trimmedBody) throw new Error("Reply cannot be empty");

    let senderName = "User";
    if (user) {
      const isOwner = ticket.userId === user._id;
      const isAdmin = user.role === "admin";
      if (!isOwner && !isAdmin) {
        throw new Error("Not authorized to reply to this ticket");
      }
      senderName = user.name?.trim() || "User";
    } else {
      if (!args.email || args.email.trim().toLowerCase() !== ticket.email.toLowerCase()) {
        throw new Error("Email does not match ticket owner");
      }
      senderName = ticket.name;
    }

    const now = Date.now();
    await ctx.db.insert("supportTicketMessages", {
      ticketId: ticket._id,
      senderType: "user",
      senderId: user?._id,
      senderName,
      body: trimmedBody,
      isInternalNote: false,
      createdAt: now,
    });

    // Reopen ticket if user replies to a resolved ticket
    const newStatus = ticket.status === "resolved" || ticket.status === "closed" ? "open" : "open";

    await ctx.db.patch(ticket._id, {
      status: newStatus,
      updatedAt: now,
    });

    return { success: true };
  },
});

/* -------------------------------------------------------------------------- */
/* ADMIN OPERATIONS                                                           */
/* -------------------------------------------------------------------------- */

export const adminListTickets = query({
  args: {
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    priority: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    let tickets: Doc<"supportTickets">[];

    if (args.status && args.status !== "all") {
      const s = args.status as Doc<"supportTickets">["status"];
      tickets = await ctx.db
        .query("supportTickets")
        .withIndex("by_status", (q) => q.eq("status", s))
        .order("desc")
        .take(args.limit ?? 100);
    } else if (args.category && args.category !== "all") {
      const c = args.category as Doc<"supportTickets">["category"];
      tickets = await ctx.db
        .query("supportTickets")
        .withIndex("by_category", (q) => q.eq("category", c))
        .order("desc")
        .take(args.limit ?? 100);
    } else {
      tickets = await ctx.db
        .query("supportTickets")
        .order("desc")
        .take(args.limit ?? 100);
    }

    // In-memory filter for search or combined filters
    return tickets.filter((t) => {
      if (args.priority && args.priority !== "all" && t.priority !== args.priority) {
        return false;
      }
      if (args.category && args.category !== "all" && t.category !== args.category) {
        return false;
      }
      if (args.status && args.status !== "all" && t.status !== args.status) {
        return false;
      }
      if (args.search) {
        const term = args.search.toLowerCase();
        const matchNumber = t.ticketNumber.toLowerCase().includes(term);
        const matchSubject = t.subject.toLowerCase().includes(term);
        const matchEmail = t.email.toLowerCase().includes(term);
        const matchName = t.name.toLowerCase().includes(term);
        return matchNumber || matchSubject || matchEmail || matchName;
      }
      return true;
    });
  },
});

export const adminGetTicket = query({
  args: { ticketId: v.id("supportTickets") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;

    const messages = await ctx.db
      .query("supportTicketMessages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    let assignedAdminName: string | null = null;
    if (ticket.assignedTo) {
      const assignedUser = await ctx.db.get(ticket.assignedTo);
      assignedAdminName = assignedUser?.name ?? null;
    }

    return {
      ticket,
      messages,
      assignedAdminName,
    };
  },
});

export const adminReplyTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    body: v.string(),
    isInternalNote: v.boolean(),
    newStatus: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const trimmedBody = args.body.trim();
    if (!trimmedBody) throw new Error("Message cannot be empty");

    const now = Date.now();
    await ctx.db.insert("supportTicketMessages", {
      ticketId: ticket._id,
      senderType: "staff",
      senderId: admin._id,
      senderName: admin.name?.trim() || "Support Staff",
      body: trimmedBody,
      isInternalNote: args.isInternalNote,
      createdAt: now,
    });

    const status = args.newStatus ?? (args.isInternalNote ? ticket.status : "waiting_user");
    await ctx.db.patch(ticket._id, {
      status,
      updatedAt: now,
    });

    // Notify user if not an internal note
    if (!args.isInternalNote) {
      if (ticket.userId) {
        await createNotification(ctx, {
          userId: ticket.userId,
          type: "support_ticket_replied",
          title: `Reply to ticket #${ticket.ticketNumber}`,
          body: trimmedBody.slice(0, 100),
          href: `/support?ticketNumber=${ticket.ticketNumber}&email=${encodeURIComponent(ticket.email)}`,
          actorId: admin._id,
        });
      }

      await ctx.scheduler.runAfter(0, internal.supportActions.sendStaffReplyEmail, {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        name: ticket.name,
        email: ticket.email,
        subject: ticket.subject,
        staffName: admin.name?.trim() || "Support Team",
        replyExcerpt: trimmedBody.slice(0, 300),
      });
    }

    return { success: true };
  },
});

export const adminUpdateTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    status: v.optional(statusValidator),
    priority: v.optional(priorityValidator),
    category: v.optional(categoryValidator),
    assignedTo: v.optional(v.union(v.null(), v.id("users"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const patch: Partial<Doc<"supportTickets">> = {
      updatedAt: Date.now(),
    };

    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "resolved" || args.status === "closed") {
        patch.resolvedAt = Date.now();
        if (ticket.userId) {
          await createNotification(ctx, {
            userId: ticket.userId,
            type: "support_ticket_resolved",
            title: `Ticket #${ticket.ticketNumber} marked resolved`,
            body: ticket.subject,
            href: `/support?ticketNumber=${ticket.ticketNumber}&email=${encodeURIComponent(ticket.email)}`,
            actorId: admin._id,
          });
        }
        await ctx.scheduler.runAfter(0, internal.supportActions.sendResolvedEmail, {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          name: ticket.name,
          email: ticket.email,
          subject: ticket.subject,
        });
      }
    }

    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.category !== undefined) patch.category = args.category;
    if (args.assignedTo !== undefined) patch.assignedTo = args.assignedTo ?? undefined;

    await ctx.db.patch(ticket._id, patch);
    return { success: true };
  },
});

export const adminGetSupportStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const allTickets = await ctx.db.query("supportTickets").collect();

    let open = 0;
    let inProgress = 0;
    let waitingUser = 0;
    let resolved = 0;
    let closed = 0;
    let urgent = 0;

    for (const t of allTickets) {
      if (t.status === "open") open++;
      else if (t.status === "in_progress") inProgress++;
      else if (t.status === "waiting_user") waitingUser++;
      else if (t.status === "resolved") resolved++;
      else if (t.status === "closed") closed++;

      if (t.priority === "urgent" && (t.status === "open" || t.status === "in_progress")) {
        urgent++;
      }
    }

    return {
      total: allTickets.length,
      open,
      inProgress,
      waitingUser,
      resolved,
      closed,
      urgent,
    };
  },
});
