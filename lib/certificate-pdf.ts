"use node";

/**
 * PDF rendering for course certificates. Runs as a Convex node action because
 * pdf-lib needs the node runtime, and the result is stored in Convex storage so
 * the download link survives redeploys.
 *
 * An admin-uploaded template PDF supplies the artwork (border, guilloche, logo,
 * typography). We stamp the certificate's data onto page 1 of it. Field
 * positions are fractions of the page, so one set of defaults works for any
 * template size, and an admin can nudge individual fields in the template UI.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import {
  DEFAULT_LAYOUT,
  TEMPLATE_DEFAULTS,
  type CertificateLayout,
  type FieldAnchor,
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

const PURPLE = rgb(148 / 255, 93 / 255, 163 / 255);
const INK = rgb(31 / 255, 27 / 255, 29 / 255);
const MUTED = rgb(107 / 255, 101 / 255, 112 / 255);
const DANGER = rgb(0.75, 0.25, 0.25);

/** Wraps text to a character budget so long course titles stay inside the page. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (line.length === 0) {
      line = word;
    } else if (line.length + 1 + word.length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
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

/** Draws centred, wrapped text. The first line sits on the anchor. */
function drawCenteredWrapped(
  page: PDFPage,
  text: string,
  anchor: FieldAnchor,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
) {
  const size = anchor.size ?? 22;
  const lineHeight = size * 1.2;
  // 80% of page width is the safe area a template's own border usually allows.
  const maxChars = Math.max(20, Math.floor((page.getWidth() * 0.8) / (size * 0.5)));

  wrap(text, maxChars).forEach((line, i) => {
    drawCentered(
      page,
      line,
      { ...anchor, y: anchor.y + i * (lineHeight / page.getHeight()) },
      font,
      color,
    );
  });
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

/**
 * Stamps certificate data onto a template.
 *
 * `templateBytes` is the admin's uploaded background. When absent the built-in
 * fallback artwork is drawn instead. Only page 1 is used — extra pages in the
 * template are dropped so a stray second page can never leak into a
 * learner's certificate.
 */
export async function renderCertificatePdf(
  input: CertificatePdfInput,
  options: { templateBytes?: Uint8Array; layout?: CertificateLayout } = {},
): Promise<Uint8Array> {
  const revoked = typeof input.revokedAt === "number";

  let doc: PDFDocument;
  let page: PDFPage;
  let usedTemplate = false;

  if (options.templateBytes && options.templateBytes.length > 0) {
    try {
      // IgnoreEncryption: admins often export protected PDFs, and we only read
      // the artwork. A template we cannot open falls back to plain artwork
      // rather than failing the whole certificate.
      const template = await PDFDocument.load(options.templateBytes, {
        ignoreEncryption: true,
      });
      if (template.getPageCount() > 0) {
        doc = await PDFDocument.create();
        const [copied] = await doc.copyPages(template, [0]);
        page = doc.addPage(copied);
        usedTemplate = true;
      } else {
        doc = await PDFDocument.create();
        page = await drawFallbackArtwork(doc, revoked);
      }
    } catch {
      doc = await PDFDocument.create();
      page = await drawFallbackArtwork(doc, revoked);
    }
  } else {
    doc = await PDFDocument.create();
    page = await drawFallbackArtwork(doc, revoked);
  }

  // With a template the artwork already supplies the title, so our default
  // heading is suppressed unless the admin positioned one explicitly.
  const defaults = usedTemplate ? TEMPLATE_DEFAULTS : DEFAULT_LAYOUT;
  const layout: CertificateLayout = { ...defaults, ...options.layout };

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };

  /**
   * Resolves a field's anchor. `null` means "do not draw this field at all" —
   * that is how an admin keeps a field off a template that already prints it,
   * and how the heading stays off template-backed certificates.
   */
  const anchor = (key: keyof CertificateLayout): FieldAnchor | null => {
    const value = layout[key];
    return value === null ? null : (value ?? defaults[key]);
  };

  const draw = (
    key: keyof CertificateLayout,
    text: string,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
  ) => {
    const at = anchor(key);
    if (at) drawCentered(page, text, at, font, color);
  };

  const issuedOn = new Date(input.issuedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  draw(
    "heading",
    revoked ? "CERTIFICATE OF COMPLETION (REVOKED)" : "CERTIFICATE OF COMPLETION",
    fonts.bold,
    INK,
  );

  draw("recipient", input.holderName.slice(0, 46), fonts.italic, INK);

  const courseAt = anchor("course");
  if (courseAt) {
    drawCenteredWrapped(page, input.courseTitle, courseAt, fonts.bold, INK);
  }

  draw("issuedOn", `Completed on ${issuedOn}`, fonts.regular, MUTED);

  draw("issuer", input.issuerName, fonts.bold, INK);

  draw(
    "serial",
    revoked
      ? `Revoked${input.revocationReason ? `: ${input.revocationReason}` : ""}`
      : `Verify at ${input.verifyUrl}`,
    revoked ? fonts.bold : fonts.regular,
    revoked ? DANGER : MUTED,
  );

  return await doc.save();
}