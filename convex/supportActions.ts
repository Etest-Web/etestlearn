"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { isMailConfigured, sendMail, siteUrl } from "../lib/mail";
import { renderEmail } from "../lib/emails/templates";
import { supportEmail } from "../lib/support";

/**
 * Send automated confirmation email when ticket is opened.
 */
export const sendTicketConfirmation = internalAction({
  args: {
    ticketId: v.id("supportTickets"),
    ticketNumber: v.string(),
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    category: v.string(),
    messageExcerpt: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isMailConfigured()) return;

    const ticketUrl = `${siteUrl()}/support?ticketNumber=${encodeURIComponent(
      args.ticketNumber
    )}&email=${encodeURIComponent(args.email)}`;

    try {
      const rendered = renderEmail("supportTicketReceived", {
        name: args.name,
        ticketNumber: args.ticketNumber,
        subject: args.subject,
        category: args.category,
        messageExcerpt: args.messageExcerpt,
        ticketUrl,
      });

      await sendMail({
        group: "account",
        to: args.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      // Also notify internal support team email
      const internalRecipient = supportEmail();
      if (internalRecipient && internalRecipient !== args.email) {
        await sendMail({
          group: "account",
          to: internalRecipient,
          subject: `[Internal Alert] New Support Ticket #${args.ticketNumber}: ${args.subject}`,
          text: `New support ticket from ${args.name} (${args.email})\nCategory: ${args.category}\n\n${args.messageExcerpt}\n\nView in admin dashboard: ${siteUrl()}/dashboard/admin/support?ticketId=${args.ticketId}`,
          html: `<p>New support ticket from <strong>${args.name}</strong> (${args.email})</p><p>Category: <em>${args.category}</em></p><blockquote>${args.messageExcerpt}</blockquote><p><a href="${siteUrl()}/dashboard/admin/support?ticketId=${args.ticketId}">View in Admin Dashboard</a></p>`,
        });
      }
    } catch (error) {
      console.error("Failed to send ticket confirmation email:", error);
    }
  },
});

/**
 * Send email when staff replies to a ticket.
 */
export const sendStaffReplyEmail = internalAction({
  args: {
    ticketId: v.id("supportTickets"),
    ticketNumber: v.string(),
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    staffName: v.string(),
    replyExcerpt: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isMailConfigured()) return;

    const ticketUrl = `${siteUrl()}/support?ticketNumber=${encodeURIComponent(
      args.ticketNumber
    )}&email=${encodeURIComponent(args.email)}`;

    try {
      const rendered = renderEmail("supportTicketStaffReply", {
        name: args.name,
        ticketNumber: args.ticketNumber,
        subject: args.subject,
        staffName: args.staffName,
        replyExcerpt: args.replyExcerpt,
        ticketUrl,
      });

      await sendMail({
        group: "account",
        to: args.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (error) {
      console.error("Failed to send staff reply email:", error);
    }
  },
});

/**
 * Send email when ticket is marked as resolved.
 */
export const sendResolvedEmail = internalAction({
  args: {
    ticketId: v.id("supportTickets"),
    ticketNumber: v.string(),
    name: v.string(),
    email: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isMailConfigured()) return;

    const ticketUrl = `${siteUrl()}/support?ticketNumber=${encodeURIComponent(
      args.ticketNumber
    )}&email=${encodeURIComponent(args.email)}`;

    try {
      const rendered = renderEmail("supportTicketResolved", {
        name: args.name,
        ticketNumber: args.ticketNumber,
        subject: args.subject,
        ticketUrl,
      });

      await sendMail({
        group: "account",
        to: args.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (error) {
      console.error("Failed to send ticket resolved email:", error);
    }
  },
});
