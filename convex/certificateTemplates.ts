/**
 * The certificate template (queries and mutations).
 *
 * There is exactly one. It is the background artwork an admin uploads — a PDF,
 * a PNG or a JPEG — and every new certificate is stamped onto it, and there is
 * no gallery to choose from — so nothing here activates, deactivates, or
 * renames anything. Uploading again *replaces* the design, which is what an
 * admin means by "I fixed the border".
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
import {
  CERTIFICATE_FIELDS,
  CERTIFICATE_FONTS,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  MAX_TEXT_WORDING,
  isValidColor,
  type CertificateTexts,
  type FieldAnchor,
} from "../lib/certificate-layout";

/**
 * A field's placement, or `null` to keep it off the certificate. A nullable
 * union rather than a nested optional — `v.optional(v.optional(...))` is not
 * something every Convex runtime handles.
 *
 * The face, colour, case and line height are all strings or small unions with
 * their ranges checked in the handler below, so the *rules* live in one place
 * rather than being restated between this validator and the schema's.
 */
const fieldAnchor = v.object({
  x: v.number(),
  y: v.number(),
  size: v.optional(v.number()),
  font: v.optional(v.string()),
  color: v.optional(v.string()),
  case: v.optional(
    v.union(
      v.literal("none"),
      v.literal("upper"),
      v.literal("lower"),
      v.literal("title"),
    ),
  ),
  lineHeight: v.optional(v.number()),
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

/**
 * Editable wording — the heading, and the prefixes wrapped around the date and
 * the verify link. Separate from the layout because it is copy rather than
 * placement, and passed as its own argument so `layout` stays a map of anchors.
 */
export const textsValidator = v.object({
  heading: v.optional(v.string()),
  issuedOnPrefix: v.optional(v.string()),
  serialPrefix: v.optional(v.string()),
});

/**
 * Checks one field's typography. Throws with a message that says which rule
 * failed, because an admin who typed a hex colour deserves to learn that here
 * rather than by watching Save appear to work and the certificate stay black.
 */
function validateAnchor(key: string, anchor: FieldAnchor) {
  if (anchor.x < 0 || anchor.x > 1 || anchor.y < 0 || anchor.y > 1) {
    throw new Error("Field positions must be between 0 and 1");
  }
  if (anchor.font !== undefined && !(anchor.font in CERTIFICATE_FONTS)) {
    throw new Error(`${key}: “${anchor.font}” is not a certificate font`);
  }
  if (anchor.color !== undefined && !isValidColor(anchor.color)) {
    throw new Error(`${key}: “${anchor.color}” is not a colour`);
  }
  if (anchor.lineHeight !== undefined &&
      (!Number.isFinite(anchor.lineHeight) ||
        anchor.lineHeight < LINE_HEIGHT_MIN ||
        anchor.lineHeight > LINE_HEIGHT_MAX)) {
    throw new Error(
      `${key}: line height must be between ${LINE_HEIGHT_MIN} and ${LINE_HEIGHT_MAX}`,
    );
  }
}

/**
 * Checks the editable wording. Capped rather than trusted: it is admin-written
 * copy, but it is also printed on a document a learner will forward, and an
 * unbounded string is a way to ship a certificate that no longer fits its page.
 */
function validateTexts(texts: CertificateTexts) {
  for (const [key, value] of Object.entries(texts)) {
    if (value !== undefined && value.length > MAX_TEXT_WORDING) {
      throw new Error(
        `${key} must be ${MAX_TEXT_WORDING} characters or fewer — ${value.length} given`,
      );
    }
  }
}

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
      // Same treatment as `layout`: the wording lives on the row, and the two
      // node actions that render or preview a certificate need both.
      texts: active.texts ?? null,
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
 * them. The wording survives it too, and for a better reason: it is copy, not
 * a position, so a new border does not make "CERTIFICATE OF COMPLETION" wrong.
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
 * Moves individual text fields and rewrites their wording. Each field is a
 * fraction of the page; a field set to null is not drawn at all, which is how a
 * template that already prints its own title avoids getting a second one.
 *
 * `texts` is separate from `layout` so the anchors stay a map of anchors — it
 * used to be tempting to hang wording off the same object, which would have put
 * a non-anchor through the position checks below.
 */
export const updateTemplateLayout = mutation({
  args: { layout: layoutValidator, texts: v.optional(textsValidator) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const template = await getInstalledTemplate(ctx);
    if (!template) throw new Error("No certificate template uploaded");

    for (const field of CERTIFICATE_FIELDS) {
      const anchor = args.layout[field.key];
      if (anchor) validateAnchor(field.key, anchor);
    }
    if (args.texts) validateTexts(args.texts);

    // An omitted `texts` leaves the wording alone, so a caller that only wants
    // to move a field does not have to know what wording is currently saved.
    await ctx.db.patch(
      template._id,
      args.texts
        ? { layout: args.layout, texts: args.texts }
        : { layout: args.layout },
    );

    // Layout changes steer where learner names land on every future
    // certificate, so a template quietly repointed at a different recipient
    // line is exactly the kind of tampering the log exists to catch.
    await logAudit(ctx, {
      actorId: admin._id,
      action: "certificate_template.layout_update",
      targetType: "certificateTemplate",
      targetId: template._id,
      details: {
        name: template.name,
        ...(args.texts ? { wording: Object.keys(args.texts).join(", ") } : {}),
      },
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
      // The wording the certificate prints, so the editor's boxes show what is
      // saved rather than the defaults.
      texts: template.texts ?? null,
      createdAt: template.createdAt,
      previewUrl: await ctx.storage.getUrl(template.pdfStorageId),
    };
  },
});
