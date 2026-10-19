"use node";

/**
 * Node-runtime half of the certificate template: upload validation and
 * previews.
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
import {
  imagePageSize,
  readImageSize,
  sniffBackgroundKind,
} from "../lib/certificate-background";
import { layoutValidator, textsValidator } from "./certificateTemplates";

/** Artwork rather than a photo library, so generous — but not unbounded. */
const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

/**
 * Largest edge an image background may have, in pixels.
 *
 * A memory ceiling as much as a practical one: pdf-lib expands a PNG to RGBA
 * in memory when embedding it, so an unbounded edge means an unbounded
 * allocation on the server that issues the certificate. 10000px is roughly 33
 * inches at 300dpi — far beyond any real certificate, and about 300MB of
 * decoded RGBA at the ceiling, which is the number this cap exists to bound.
 *
 * Checked against the headers before decoding; see `measureImage`.
 */
const MAX_IMAGE_EDGE_PX = 10000;

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
 * Reads an image's intrinsic pixel size from its headers, then checks the
 * ceiling, and only then lets pdf-lib embed it.
 *
 * The order is the whole point. `embedPng` expands the file to RGBA in memory
 * — a few kilobytes claiming 40000×40000 would be several gigabytes of heap
 * before a size check could object, so measuring by embedding is not something
 * to do twice, and not at all before the ceiling has been passed.
 */
async function measureImage(
  bytes: Uint8Array,
  kind: "png" | "jpeg",
): Promise<{ width: number; height: number }> {
  const size = readImageSize(bytes, kind);
  if (!size) {
    throw new Error(
      kind === "png"
        ? "That PNG could not be read — it may be truncated"
        : "That JPEG could not be read — it may be truncated",
    );
  }

  if (size.width > MAX_IMAGE_EDGE_PX || size.height > MAX_IMAGE_EDGE_PX) {
    throw new Error(
      `That image is ${size.width}×${size.height}px. The maximum is ${MAX_IMAGE_EDGE_PX}px on either edge.`,
    );
  }

  // Past the ceiling, so decoding is bounded by it. This also validates the
  // file properly: an image whose headers are fine but whose data is not
  // fails here rather than at the moment a learner downloads their
  // certificate.
  try {
    const scratch = await PDFDocument.create();
    if (kind === "png") {
      await scratch.embedPng(bytes);
    } else {
      await scratch.embedJpg(bytes);
    }
  } catch {
    throw new Error(
      kind === "png"
        ? "That PNG could not be read — it may be corrupt or use an unsupported colour type"
        : "That JPEG could not be read — it may be corrupt",
    );
  }

  return size;
}

/**
 * Verifies an uploaded template and returns its storage id plus page geometry.
 *
 * The background may be a PDF, a PNG or a JPEG; the kind is read from the
 * bytes, never from the file's claimed type, because every decision below
 * depends on getting it right. Checks that matter here rather than in the
 * client:
 *  - the bytes really are one of those three formats (magic bytes, not a
 *    content type)
 *  - a PDF carries no active content (JavaScript/launch actions) — checked
 *    on the raw bytes and before parsing, so a hostile file never reaches the
 *    parser; see `findActiveContent` for why the scan looks the way it does
 *  - it actually parses, so a corrupt file fails at upload not at render
 *  - a PDF has a page to draw on; an image has sane dimensions
 *  - it is not absurdly large
 *
 * `assetKind` comes back so the editor can say which of the two it installed.
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
    const kind = sniffBackgroundKind(bytes);

    // An image is measured and normalised onto a page of its own; a PDF brings
    // its page with it. Anything else — a renamed executable, an SVG, a
    // truncated upload — is refused before any parser sees it.
    if (kind === "png" || kind === "jpeg") {
      const pixels = await measureImage(bytes, kind);

      // Recorded now so field positions can be stored as fractions of a page
      // that will not move — the renderer scales the image onto exactly this.
      const page = imagePageSize(pixels.width, pixels.height);
      return {
        storageId: args.storageId,
        pageWidth: page.width,
        pageHeight: page.height,
        assetKind: "image" as const,
      };
    }

    if (kind !== "pdf") {
      throw new Error("That file is not a PDF, PNG or JPEG");
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

    return {
      storageId: args.storageId,
      pageWidth: width,
      pageHeight: height,
      assetKind: "pdf" as const,
    };
  },
});

/**
 * Renders a throwaway sample with sample data, so an admin can check placement
 * before it goes live. Nothing is persisted. Works with or without a template
 * installed — with none, it previews the built-in artwork.
 */
export const previewTemplate = action({
  args: {
    layout: v.optional(layoutValidator),
    texts: v.optional(textsValidator),
  },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);

    const template = await ctx.runQuery(
      internal.certificateTemplates.getActiveTemplate,
      {},
    );

    // No template installed yet — preview the built-in artwork, which is what
    // certificates would actually be stamped onto today.
    const blob = template
      ? await ctx.storage.get(template.storageId)
      : null;
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
      {
        templateBytes,
        // The page the placement was authored against. A PDF re-derives it
        // from the artwork itself; an image needs it told, or a high-resolution
        // export would render at its pixel size with every field still at the
        // fractions that were measured for the smaller one.
        templatePageSize: template
          ? { width: template.pageWidth, height: template.pageHeight }
          : undefined,
        layout: args.layout ?? undefined,
        // Unsaved wording first, then what the template row actually says —
        // a preview that quietly dropped an edited heading would read as
        // "my change did nothing".
        texts: args.texts ?? template?.texts ?? undefined,
      },
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