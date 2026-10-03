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
 * PDF object keys that turn a passive document into an active one.
 *
 * `/JavaScript` and `/JS` execute script inside a viewer, `/Launch` runs an
 * external program, `/OpenAction` fires the moment the document is opened —
 * before the reader has seen anything — and `/AA` wires that behaviour to
 * annotation events. None belong in a certificate background: templates are
 * artwork we stamp text onto, and the stored file is served straight from
 * Convex storage, so anyone who opens it in a real viewer would be at risk.
 *
 * Matching is case-sensitive on purpose: PDF names are case-sensitive, so a
 * viewer honours `/OpenAction` but not `/openaction` — matching the wrong
 * case would only widen false positives without stopping anything executable.
 */
const ACTIVE_CONTENT_KEYS = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/OpenAction",
  "/AA",
] as const;

/**
 * Scans the raw file for {@link ACTIVE_CONTENT_KEYS}; returns the offending
 * key, or null if the file looks inert.
 *
 * The scan runs on the bytes and BEFORE `PDFDocument.load`, for two reasons:
 *  - only stream payloads are ever compressed — dictionary KEYS always sit in
 *    plaintext — so the keys are visible even in a deflated file, and
 *  - refusing before parsing means a deliberately malformed file never
 *    reaches pdf-lib's parser at all.
 *
 * Two subtleties, both handled rather than hoped away:
 *  - stream payloads are stripped first. They are binary (usually deflate),
 *    and a random 3-byte run like "/JS" turns up often enough in megabytes of
 *    compressed data to reject innocent artwork; streams also contain the
 *    literal text drawn on the page, where a stray "/JavaScript" would
 *    legitimately appear.
 *  - `#xx` name escapes are decoded first, because PDF treats `/Java#53cript`
 *    and `/JavaScript` as the SAME name and a viewer would too, so a naive
 *    substring check could be walked around with one escape.
 *
 * Known trade-off: a literal "/JavaScript" written OUTSIDE a stream (e.g. in
 * an uncompressed metadata field) is a false positive and gets rejected. That
 * is acceptable for a reject-with-a-clear-message upload flow — the admin just
 * re-exports the artwork — and erring towards rejection is the right default
 * for active content.
 *
 * Known gap: keys inside a compressed object stream (/ObjStm) are not
 * plaintext and no raw scan can see them, including this one.
 */
function findActiveContent(rawBytes: Uint8Array): string | null {
  // latin1 decodes one byte per character, so compressed payloads survive the
  // round-trip exactly instead of collapsing into U+FFFD (which would hide
  // stray matches and distort length).
  let text = new TextDecoder("latin1").decode(rawBytes);

  // Drop stream payloads; see above.
  text = text.replace(/stream(?:\r\n|\r|\n)[\s\S]*?endstream/g, "");

  // Decode `#xx` name escapes; see above.
  text = text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  for (const key of ACTIVE_CONTENT_KEYS) {
    if (text.includes(key)) return key;
  }
  return null;
}

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
 *  - the PDF carries no active content (JavaScript/launch actions) — checked
 *    on the raw bytes and before parsing, so a hostile file never reaches the
 *    parser; see `findActiveContent` for why the scan looks the way it does
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

    // Refuse JavaScript/launch/OpenAction payloads before pdf-lib sees them.
    // The keys are plaintext by spec — PDF encrypts strings and streams, never
    // names — so this scan works even on the encrypted artwork admins tend to
    // export, and a template is inert artwork: nothing legitimate ever needs
    // one of these keys.
    const activeKey = findActiveContent(bytes);
    if (activeKey) {
      throw new Error(
        "That PDF contains active content (JavaScript/launch actions) and was rejected",
      );
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