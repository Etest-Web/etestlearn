"use node";

/**
 * PDF rendering for course certificates. Runs as a Convex node action because
 * pdf-lib needs the node runtime, and the result is stored in Convex storage so
 * the download link survives redeploys.
 *
 * An admin-uploaded template — a PDF or an image — supplies the artwork
 * (border, guilloche, logo, typography). We stamp the certificate's data onto
 * it; for a PDF that means page 1, for an image the whole frame scaled onto a
 * page of the recorded size. Field positions are fractions of the page, so one
 * set of defaults works for any template size, and an admin can nudge
 * individual fields in the template UI.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { certificateFontBytes } from "./certificate-fonts-data";
import {
  imagePageSize,
  sniffBackgroundKind,
  type BackgroundPageSize,
} from "./certificate-background";
import {
  CERTIFICATE_TEXT_DEFAULTS,
  DEFAULT_LAYOUT,
  LINE_HEIGHT_RATIO,
  TEMPLATE_DEFAULTS,
  certificateField,
  certificateFieldLines,
  certificateFont,
  resolveColor,
  type CertificateFieldKey,
  type CertificateFontId,
  type CertificateLayout,
  type CertificateTexts,
  type FieldAnchor,
  type RgbTriple,
} from "./certificate-layout";

export interface CertificatePdfInput {
  serial: string;
  holderName: string;
  courseTitle: string;
  issuerName: string;
  issuedAt: number;
  verifyUrl: string;
  revokedAt?: number;
  revocationReason?: string;
}

/**
 * Colours come from the shared layout module: the on-screen editor paints with
 * the same triples, so what an admin matches on the canvas is what prints.
 */
const toRgb = ({ r, g, b }: RgbTriple) => rgb(r, g, b);
const PURPLE = rgb(148 / 255, 93 / 255, 163 / 255);
/**
 * The revoked watermark colour, as the hex form `resolveColor` understands —
 * rgb(0.75, 0.25, 0.25). Named rather than written inline so the revoked
 * certificate has one definition of "this is no longer valid".
 */
const DANGER = "#bf4040";

/**
 * Embeds a catalogue face into this document.
 *
 * fontkit does the work; the bytes are the bundled copy rather than a file
 * read or a fetch, because a node action has no `public/` and an outbound
 * request is not something a learner's certificate should depend on.
 *
 * The faces are embedded whole rather than subsetted, which is worth a few
 * kilobytes on the file and saves two real problems:
 *
 *   - pdf-lib's subset embedder writes no ToUnicode CMap, so the text in a
 *     subsetted certificate cannot be copied, searched or read aloud: it
 *     extracts as glyph indices. The whole-font embedder does write one.
 *   - fontkit's subsetter mis-measures a font it reconstructed from woff2 and
 *     writes past the end of its buffer, which fails the save — after the
 *     promise has already been handed back, so the failure surfaces as a
 *     timeout rather than as an error.
 *
 * A face this build does not ship falls back to Helvetica rather than failing:
 * printing in the wrong face is a defect, but refusing to print is an outage.
 */
async function embedCertificateFont(
  doc: PDFDocument,
  id: CertificateFontId,
): Promise<PDFFont> {
  const bytes = certificateFontBytes(certificateFont(id).id);
  if (!bytes) return await doc.embedFont(StandardFonts.Helvetica);
  return await doc.embedFont(bytes, { subset: true });
}

/**
 * Draws centred text at a fractional anchor. `y` is measured from the top of the
 * page (0 = top edge, 1 = bottom), which is how the template editor presents
 * positions; pdf-lib measures from the bottom, hence the flip.
 */
function drawCentered(
  page: PDFPage,
  text: string,
  anchor: FieldAnchor,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const { width, height } = page.getSize();
  const size = anchor.size ?? 14;
  const x = anchor.x * width - font.widthOfTextAtSize(text, size) / 2;
  const y = height - anchor.y * height - size;
  page.drawText(text, { x, y, size, font, color });
}

/**
 * Certificate with no template: draws a plain bordered A4 landscape page. Keeps
 * the platform usable before an admin has uploaded artwork.
 */
async function drawFallbackArtwork(
  doc: PDFDocument,
  revoked: boolean,
): Promise<PDFPage> {
  const page = doc.addPage([841.89, 595.28]);
  const { width, height } = page.getSize();

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: revoked ? rgb(0.75, 0.7, 0.72) : PURPLE,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 32,
    y: 32,
    width: width - 64,
    height: height - 64,
    borderColor: rgb(0.91, 0.89, 0.91),
    borderWidth: 0.75,
  });

  return page;
}

interface BackgroundOptions {
  /** The admin's uploaded artwork, whatever it turned out to be. */
  templateBytes?: Uint8Array;
  /**
   * The page size recorded when the artwork was uploaded.
   *
   * An image needs this: the layout was authored as fractions of *that* page,
   * so the rendered page has to be the same one or every field lands in the
   * wrong place. For a PDF it is redundant — the page arrives with the
   * artwork — and is ignored.
   */
  templatePageSize?: BackgroundPageSize;
}

/**
 * Builds the page certificate data is stamped onto, from the uploaded artwork.
 *
 * Both an image and a PDF are backgrounds here, which is the point: an admin
 * with a PNG does not have to print it to PDF first. Anything unreadable —
 * corrupt bytes, an unsupported format, an image pdf-lib cannot embed — draws
 * the built-in artwork rather than throwing, because a broken background must
 * never cost a learner their certificate.
 */
async function createBackgroundPage(
  doc: PDFDocument,
  options: BackgroundOptions,
  revoked: boolean,
): Promise<{ page: PDFPage; usedTemplate: boolean }> {
  const bytes = options.templateBytes;
  if (!bytes || bytes.length === 0) {
    return { page: await drawFallbackArtwork(doc, revoked), usedTemplate: false };
  }

  const kind = sniffBackgroundKind(bytes);

  if (kind === "png" || kind === "jpeg") {
    try {
      const image =
        kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const { width, height } =
        options.templatePageSize ?? imagePageSize(image.width, image.height);
      const page = doc.addPage([width, height]);
      // Fills the page rather than stretching to it. The recorded page size
      // comes from this same file at upload, so the two agree by construction;
      // were they ever to disagree, filling keeps the artwork undistorted
      // instead of smearing it across the wrong aspect ratio.
      page.drawImage(image, { x: 0, y: 0, width, height });
      return { page, usedTemplate: true };
    } catch {
      return { page: await drawFallbackArtwork(doc, revoked), usedTemplate: false };
    }
  }

  if (kind === "pdf") {
    try {
      // IgnoreEncryption: admins often export protected PDFs, and we only read
      // the artwork. A template we cannot open falls back to plain artwork
      // rather than failing the whole certificate.
      const template = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (template.getPageCount() > 0) {
        const [copied] = await doc.copyPages(template, [0]);
        return { page: doc.addPage(copied), usedTemplate: true };
      }
    } catch {
      // fall through to the built-in artwork
    }
  }

  return { page: await drawFallbackArtwork(doc, revoked), usedTemplate: false };
}

/**
 * Stamps certificate data onto a template.
 *
 * `options.templateBytes` is the admin's uploaded background — a PDF or an
 * image; the kind is sniffed, never trusted from a label. When absent the
 * built-in fallback artwork is drawn instead. Only page 1 of a PDF template is
 * used, so a stray second page can never leak into a learner's certificate.
 */
export async function renderCertificatePdf(
  input: CertificatePdfInput,
  options: BackgroundOptions & {
    layout?: CertificateLayout;
    /**
     * Editable wording — heading, date prefix, verify prefix. Kept apart from
     * `layout` because it is copy rather than placement, and both are read off
     * the one installed template row.
     */
    texts?: CertificateTexts;
  } = {},
): Promise<Uint8Array> {
  const revoked = typeof input.revokedAt === "number";

  const doc = await PDFDocument.create();
  // The faces are woff2, which only pdf-lib can embed if a font engine is
  // registered first. Registering the engine is what lets it read the font's
  // own metrics instead of guessing them, which is also how a name in a
  // script the face does not cover is drawn rather than refused.
  doc.registerFontkit(fontkit);
  const { page, usedTemplate } = await createBackgroundPage(
    doc,
    options,
    revoked,
  );

  // With a template the artwork already supplies the title, so our default
  // heading is suppressed unless the admin positioned one explicitly.
  const defaults = usedTemplate ? TEMPLATE_DEFAULTS : DEFAULT_LAYOUT;
  const layout: CertificateLayout = { ...defaults, ...options.layout };
  const texts: Required<CertificateTexts> = {
    ...CERTIFICATE_TEXT_DEFAULTS,
    ...options.texts,
  };

  /**
   * Embedded once per face however many fields are set in it — three fields in
   * Inter Bold must not put three copies of the face in the file.
   */
  const fontCache = new Map<CertificateFontId, PDFFont>();
  const fontFor = async (id: CertificateFontId): Promise<PDFFont> => {
    const cached = fontCache.get(id);
    if (cached) return cached;
    const embedded = await embedCertificateFont(doc, id);
    fontCache.set(id, embedded);
    return embedded;
  };

  /**
   * Resolves a field's anchor. `null` means "do not draw this field at all" —
   * that is how an admin keeps a field off a template that already prints it,
   * and how the heading stays off template-backed certificates.
   */
  const anchor = (key: CertificateFieldKey): FieldAnchor | null => {
    const value = layout[key];
    return value === null ? null : (value ?? defaults[key]);
  };

  /**
   * Draws one field: its face, its colour and its lines all resolved from the
   * anchor, falling back to the field's own defaults for anything the admin
   * left alone.
   *
   * Every field now goes through `certificateFieldLines`, which is what applies
   * letter case, the truncation limit and wrapping — recipient used to truncate
   * through it while the course title wrapped around it directly, so a template
   * that changed either rule would have split the two apart.
   */
  const draw = async (
    key: CertificateFieldKey,
    text: string,
    override: { font?: CertificateFontId; color?: string } = {},
  ): Promise<void> => {
    const at = anchor(key);
    if (!at) return;

    const field = certificateField(key);
    const face = certificateFont(override.font ?? at.font ?? field.font);
    const size = at.size ?? 14;
    const lines = certificateFieldLines(key, text, page.getWidth(), size, {
      font: face.id,
      case: at.case,
    });
    const lineHeight = size * (at.lineHeight ?? LINE_HEIGHT_RATIO);
    const color = toRgb(resolveColor(override.color ?? at.color, field.color));
    const font = await fontFor(face.id);

    lines.forEach((line, i) =>
      drawCentered(
        page,
        line,
        { ...at, size, y: at.y + (i * lineHeight) / page.getHeight() },
        font,
        color,
      ),
    );
  };

  const issuedOn = new Date(input.issuedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  await draw(
    "heading",
    `${texts.heading}${revoked ? " (REVOKED)" : ""}`,
  );

  // Truncated through the shared field rules rather than an inline constant,
  // so the canvas and the PDF clip a long name at the same character.
  await draw("recipient", input.holderName);

  await draw("course", input.courseTitle);

  await draw("issuedOn", `${texts.issuedOnPrefix} ${issuedOn}`.trim());

  await draw("issuer", input.issuerName);

  await draw(
    "serial",
    revoked
      ? `Revoked${input.revocationReason ? `: ${input.revocationReason}` : ""}`
      : `${texts.serialPrefix} ${input.verifyUrl}`.trim(),
    // The revoked state keeps red as its signal, but not a forced bold: half
    // the catalogue has no bold partner, and a face that changes under an
    // admin's feet is worse than one that stays put in a colour that says so.
    revoked ? { color: DANGER } : {},
  );

  return await doc.save();
}