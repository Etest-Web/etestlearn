/**
 * The certificate template (queries and mutations).
 *
 * There is exactly one. It is the background PDF an admin uploads and every new
 * certificate is stamped onto, and there is no gallery to choose from — so
 * nothing here activates, deactivates, or renames anything. Uploading again
 * *replaces* the design, which is what an admin means by "I fixed the border".
 *
 * Upload validation and previews need the node runtime and live in
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
} from "./helpers/auth";
import { getInstalledTemplate } from "./helpers/certificateTemplate";
import { logAudit } from "./helpers/audit";

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

/**
 * The installed template with its bytes location, for the node actions that
 * render or preview a certificate. Null when nothing is installed, which is the
 * signal to draw the built-in artwork instead.
 */
export const getActiveTemplate = internalQuery({
  args: {},
  handler: async (ctx) => {
    const active = await getInstalledTemplate(ctx);

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

/**
 * Installs a validated template over whatever was there.
 *
 * Called only after `certificateTemplateActions.prepareTemplateUpload` has
 * verified the bytes. The existing row is patched rather than a second one
 * inserted, so the template id stays stable — certificates record it at
 * issuance, and a new id per upload would orphan that history for no benefit.
 * Field positions survive the swap, since they are fractions of the page and
 * usually still describe the same artwork; the editor tells the admin to check
 * them.
 */
export const saveTemplate = mutation({
  args: {
    name: v.string(),
    pdfStorageId: v.id("_storage"),
    pageWidth: v.number(),
    pageHeight: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const name = args.name.trim();
    if (!name) throw new Error("Give the template a name");

    if (args.pageWidth <= 0 || args.pageHeight <= 0) {
      throw new Error("Invalid template page size");
    }

    const existing = await getInstalledTemplate(ctx);

    let id: Id<"certificateTemplates">;
    if (existing) {
      id = existing._id;
      await ctx.db.patch(existing._id, {
        name,
        pdfStorageId: args.pdfStorageId,
        pageWidth: args.pageWidth,
        pageHeight: args.pageHeight,
        active: true,
      });
      // The superseded artwork would otherwise sit in storage forever.
      await ctx.storage.delete(existing.pdfStorageId);
    } else {
      id = await ctx.db.insert("certificateTemplates", {
        name,
        pdfStorageId: args.pdfStorageId,
        pageWidth: args.pageWidth,
        pageHeight: args.pageHeight,
        active: true,
        createdAt: Date.now(),
        createdBy: admin._id,
      });
    }

    await logAudit(ctx, {
      actorId: admin._id,
      action: "certificate_template.save",
      targetType: "certificateTemplate",
      targetId: id,
      details: { name, replaced: existing !== null },
    });

    return id;
  },
});

/**
 * Moves individual text fields. Each field is a fraction of the page; a field
 * set to null is not drawn at all, which is how a template that already prints
 * its own title avoids getting a second one.
 */
export const updateTemplateLayout = mutation({
  args: { layout: layoutValidator },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const template = await getInstalledTemplate(ctx);
    if (!template) throw new Error("No certificate template uploaded");

    for (const anchor of Object.values(args.layout)) {
      if (anchor && (anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1)) {
        throw new Error("Field positions must be between 0 and 1");
      }
    }

    await ctx.db.patch(template._id, { layout: args.layout });

    // Layout changes steer where learner names land on every future
    // certificate, so a template quietly repointed at a different recipient
    // line is exactly the kind of tampering the log exists to catch.
    await logAudit(ctx, {
      actorId: admin._id,
      action: "certificate_template.layout_update",
      targetType: "certificateTemplate",
      targetId: template._id,
      details: { name: template.name },
    });
  },
});

/**
 * Removes the template. New certificates fall back to the built-in artwork;
 * already-issued ones keep the PDF they were rendered with.
 */
export const deleteTemplate = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    const template = await getInstalledTemplate(ctx);
    if (!template) throw new Error("No certificate template uploaded");

    await ctx.db.delete(template._id);
    // Orphaned PDFs would otherwise sit in storage forever.
    await ctx.storage.delete(template.pdfStorageId);

    await logAudit(ctx, {
      actorId: admin._id,
      action: "certificate_template.delete",
      targetType: "certificateTemplate",
      targetId: template._id,
      // The row is gone, so the name lives on only here — keep it in details.
      details: { name: template.name },
    });
  },
});

/** The installed template, for the admin UI. Admin only. */
export const getTemplate = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const template = await getInstalledTemplate(ctx);
    if (!template) return null;

    return {
      _id: template._id,
      name: template.name,
      pageWidth: template.pageWidth,
      pageHeight: template.pageHeight,
      layout: template.layout ?? null,
      createdAt: template.createdAt,
      previewUrl: await ctx.storage.getUrl(template.pdfStorageId),
    };
  },
});
