/**
 * Admin-managed certificate templates (queries and mutations).
 *
 * An admin uploads a designed background PDF; certificates are rendered by
 * stamping learner data onto page 1 of the active template. Upload validation
 * and previews need the node runtime and live in
 * `convex/certificateTemplateActions.ts` — a `"use node"` module cannot also
 * export mutations.
 */
import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getCurrentUser,
  requireUser,
  type AnyCtx,
  type Id,
  type WriteCtx,
} from "./helpers/auth";

/**
 * A field's placement, or `null` to keep it off the certificate. A nullable
 * union rather than a nested optional — `v.optional(v.optional(...))` is not
 * something every Convex runtime handles.
 */
const fieldAnchor = v.object({
  x: v.number(),
  y: v.number(),
  size: v.optional(v.number()),
});

const placement = v.optional(v.union(v.null(), fieldAnchor));

export const layoutValidator = v.object({
  heading: placement,
  recipient: placement,
  course: placement,
  issuedOn: placement,
  issuer: placement,
  serial: placement,
});

async function requireAdmin(ctx: AnyCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Not authorized");
  }
  return user;
}

/** The template certificates currently render onto, if any. */
export const getActiveTemplate = internalQuery({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db
      .query("certificateTemplates")
      .withIndex("by_active", (q) => q.eq("active", true))
      .unique();

    if (!active) return null;

    return {
      _id: active._id,
      storageId: active.pdfStorageId,
      layout: active.layout ?? null,
      pageWidth: active.pageWidth,
      pageHeight: active.pageHeight,
    };
  },
});

/**
 * Role of the caller, for node actions.
 *
 * Actions have no `ctx.db`, so they cannot call `requireUser` directly — they go
 * through this query instead rather than re-implementing identity resolution.
 */
export const getCallerRole = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return user?.role ?? null;
  },
});

export const getTemplateForPreview = internalQuery({
  args: { templateId: v.id("certificateTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;
    return {
      storageId: template.pdfStorageId,
      layout: template.layout ?? null,
      pageWidth: template.pageWidth,
      pageHeight: template.pageHeight,
    };
  },
});

/** Saves a validated template. Passing `activate: true` makes it the live one. */
export const createTemplate = mutation({
  args: {
    name: v.string(),
    pdfStorageId: v.id("_storage"),
    pageWidth: v.number(),
    pageHeight: v.number(),
    activate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const name = args.name.trim();
    if (!name) throw new Error("Give the template a name");

    if (args.pageWidth <= 0 || args.pageHeight <= 0) {
      throw new Error("Invalid template page size");
    }

    const id = await ctx.db.insert("certificateTemplates", {
      name,
      pdfStorageId: args.pdfStorageId,
      pageWidth: args.pageWidth,
      pageHeight: args.pageHeight,
      active: args.activate === true ? true : false,
      createdAt: Date.now(),
      createdBy: admin._id,
    });

    if (args.activate === true) {
      await deactivateOthers(ctx, id);
    }

    return id;
  },
});

/** Exactly one template renders certificates, so activating one clears the rest. */
async function deactivateOthers(ctx: WriteCtx, keepId: Id<"certificateTemplates">) {
  const others = await ctx.db
    .query("certificateTemplates")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();

  for (const other of others) {
    if (other._id !== keepId) {
      await ctx.db.patch(other._id, { active: false });
    }
  }
}

export const activateTemplate = mutation({
  args: { templateId: v.id("certificateTemplates") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    await deactivateOthers(ctx, args.templateId);
    await ctx.db.patch(args.templateId, { active: true });
  },
});

export const deactivateTemplate = mutation({
  args: { templateId: v.id("certificateTemplates") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    await ctx.db.patch(args.templateId, { active: false });
  },
});

/**
 * Moves individual text fields. Each field is a fraction of the page; a field
 * set to null is not drawn at all, which is how a template that already prints
 * its own title avoids getting a second one.
 */
export const updateTemplateLayout = mutation({
  args: {
    templateId: v.id("certificateTemplates"),
    layout: layoutValidator,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    for (const anchor of Object.values(args.layout)) {
      if (anchor && (anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1)) {
        throw new Error("Field positions must be between 0 and 1");
      }
    }

    await ctx.db.patch(args.templateId, { layout: args.layout });
  },
});

export const deleteTemplate = mutation({
  args: { templateId: v.id("certificateTemplates") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    await ctx.db.delete(args.templateId);
    // Orphaned PDFs would otherwise sit in storage forever.
    await ctx.storage.delete(template.pdfStorageId);
  },
});

/** Templates for the admin UI. Admin only. */
export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const templates = await ctx.db
      .query("certificateTemplates")
      .order("desc")
      .collect();

    return await Promise.all(
      templates.map(async (template) => ({
        _id: template._id,
        name: template.name,
        active: template.active === true,
        pageWidth: template.pageWidth,
        pageHeight: template.pageHeight,
        layout: template.layout ?? null,
        createdAt: template.createdAt,
        previewUrl: await ctx.storage.getUrl(template.pdfStorageId),
      })),
    );
  },
});