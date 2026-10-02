"use node";

/**
 * Node-runtime half of certificate templates: upload validation and previews.
 *
 * Both need to parse a PDF, which the default Convex runtime cannot do. They
 * live apart from `convex/certificateTemplates.ts` because a `"use node"` module
 * may only export actions.
 */
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import { PDFDocument } from "pdf-lib";
import type { DataModel } from "./_generated/dataModel";
import { renderCertificatePdf } from "../lib/certificate-pdf";
import { layoutValidator } from "./certificateTemplates";

/** Vector artwork, so generous — but not unbounded. */
const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

/**
 * Actions have no `ctx.db`, so identity resolution goes through an internal
 * query rather than duplicating the Clerk lookup here.
 */
async function requireAdminAction(ctx: GenericActionCtx<DataModel>) {
  const role = await ctx.runQuery(internal.certificateTemplates.getCallerRole, {});
  if (role !== "admin") {
    throw new Error("Not authorized");
  }
}

/**
 * Verifies an uploaded template and returns its storage id plus page geometry.
 *
 * Checks that matter here rather than in the client:
 *  - the bytes really are a PDF (magic `%PDF-`, not a claimed content type)
 *  - the PDF actually parses, so a corrupt file fails at upload not at render
 *  - it has a page to draw on
 *  - it is not absurdly large
 */
export const prepareTemplateUpload = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("Uploaded file not found");

    if (blob.size > MAX_TEMPLATE_BYTES) {
      throw new Error(
        `Template is too large (${Math.round(blob.size / (1024 * 1024))} MB). Maximum is ${MAX_TEMPLATE_BYTES / (1024 * 1024)} MB.`,
      );
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    if (new TextDecoder("latin1").decode(bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error("That file is not a valid PDF");
    }

    let doc: PDFDocument;
    try {
      // Admins often export protected PDFs; we only read the artwork.
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      throw new Error("That PDF could not be read — it may be corrupt");
    }

    if (doc.getPageCount() === 0) {
      throw new Error("That PDF has no pages");
    }

    const { width, height } = doc.getPage(0).getSize();

    return { storageId: args.storageId, pageWidth: width, pageHeight: height };
  },
});

/**
 * Renders a throwaway sample against a template with sample data, so an admin
 * can check placement before it goes live. Nothing is persisted.
 */
export const previewTemplate = action({
  args: {
    templateId: v.id("certificateTemplates"),
    layout: v.optional(layoutValidator),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const template = await ctx.runQuery(
      internal.certificateTemplates.getTemplateForPreview,
      { templateId: args.templateId },
    );
    if (!template) throw new Error("Template not found");

    const blob = await ctx.storage.get(template.storageId);
    const templateBytes = blob
      ? new Uint8Array(await blob.arrayBuffer())
      : undefined;

    const pdf = await renderCertificatePdf(
      {
        serial: "GL-2026-PREVIEW1",
        holderName: "Sample Learner",
        courseTitle: "Sample Course Title For Placement Checking",
        issuerName: "Sample Instructor",
        issuedAt: Date.UTC(2026, 0, 1),
        verifyUrl: "https://example.com/verify/GL-2026-PREVIEW1",
      },
      { templateBytes, layout: args.layout ?? undefined },
    );

    const storageId = await ctx.storage.store(
      new Blob([pdf as unknown as BlobPart], { type: "application/pdf" }),
    );

    // Previews are disposable; hand back a URL and clean the object up after.
    const url = await ctx.storage.getUrl(storageId);
    await ctx.scheduler.runAfter(
      60 * 60 * 1000,
      internal.certificateArtifacts.deletePreviewFile,
      { storageId },
    );

    return { url, storageId };
  },
});