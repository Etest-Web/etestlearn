import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, rgb } from "pdf-lib";
import zlib from "node:zlib";
import {
  DEFAULT_LAYOUT,
  renderCertificatePdf,
  type CertificatePdfInput,
} from "./certificate-pdf";

/**
 * Text drawn on a page, decoded from the content stream.
 *
 * pdf-lib writes text as hex strings in WinAnsi encoding, so the assertion has
 * to decode them — reading the stream as plain text finds nothing.
 */
function pageText(doc: PDFDocument, pageIndex: number): string {
  const contents = doc.getPage(pageIndex).node.Contents();
  if (!(contents instanceof PDFArray)) return "";

  let out = "";
  for (let i = 0; i < contents.size(); i += 1) {
    const stream = doc.context.lookup(contents.lookup(i));
    if (!(stream instanceof PDFRawStream)) continue;

    // pdf-lib flate-compresses content streams on save.
    const raw = Buffer.from(stream.getContents() as Uint8Array);
    let source: string;
    try {
      source = zlib.inflateSync(raw).toString("latin1");
    } catch {
      source = raw.toString("latin1");
    }
    for (const match of source.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) {
      out += Buffer.from(match[1], "hex").toString("latin1");
      out += "\n";
    }
  }
  return out;
}

const base: CertificatePdfInput = {
  serial: "GL-2026-3F9A1C77",
  holderName: "Adaeze Okonkwo",
  courseTitle: "Introduction to Product Design",
  issuerName: "Dr. Bambo Adeyemi",
  issuedAt: Date.UTC(2026, 2, 9),
  verifyUrl: "https://glypha.learn/verify/GL-2026-3F9A1C77",
};

/** A two-page template so we can assert only page 1 is kept. */
async function buildTemplate(pages = 1, size: [number, number] = [841.89, 595.28]) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage(size);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(`TEMPLATE PAGE ${i + 1}`, {
      x: 40,
      y: size[1] - 60,
      size: 24,
      font,
      color: rgb(0.1, 0.1, 0.6),
    });
  }
  return await doc.save();
}

describe("renderCertificatePdf without a template", () => {
  it("produces a single landscape A4 page", async () => {
    const bytes = await renderCertificatePdf(base);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
    expect(Math.round(width)).toBe(842);
  });

  it("renders a revoked certificate", async () => {
    const bytes = await renderCertificatePdf({
      ...base,
      revokedAt: Date.UTC(2026, 5, 1),
      revocationReason: "Issued in error",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("renders a long course title on multiple lines without failing", async () => {
    const bytes = await renderCertificatePdf({
      ...base,
      courseTitle:
        "Advanced Data Structures and Algorithm Analysis for Competitive Programming",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe("renderCertificatePdf with a template", () => {
  it("keeps the template's page size", async () => {
    const template = await buildTemplate(1, [1000, 700]);
    const bytes = await renderCertificatePdf(base, { templateBytes: template });
    const doc = await PDFDocument.load(bytes);

    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(1000);
    expect(Math.round(height)).toBe(700);
  });

  it("uses only page 1, dropping extra template pages", async () => {
    const template = await buildTemplate(3);
    const bytes = await renderCertificatePdf(base, { templateBytes: template });
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBe(1);
  });

  it("falls back to built-in artwork when the template is not a PDF", async () => {
    const notAPdf = new TextEncoder().encode("this is definitely not a pdf");
    const bytes = await renderCertificatePdf(base, {
      templateBytes: notAPdf,
    });
    const doc = await PDFDocument.load(bytes);

    // Falls back rather than throwing, so a bad template can never cost a
    // learner their certificate.
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(842);
    expect(width).toBeGreaterThan(height);
  });

  it("falls back when template bytes are empty", async () => {
    const bytes = await renderCertificatePdf(base, {
      templateBytes: new Uint8Array(0),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("keeps the template artwork and adds the certificate's own text", async () => {
    const template = await buildTemplate();
    const bytes = await renderCertificatePdf(base, { templateBytes: template });
    const doc = await PDFDocument.load(bytes);

    const drawn = pageText(doc, 0);

    // Artwork from the template survives and the learner's data sits on top of
    // it — the only assertion that proves real overlay rather than a blank page
    // with some text on it.
    expect(drawn).toContain("TEMPLATE PAGE 1");
    expect(drawn).toContain("Okonkwo");
    expect(drawn).toContain(base.serial);
  });

  it("accepts per-field layout overrides", async () => {
    const template = await buildTemplate();
    const bytes = await renderCertificatePdf(base, {
      templateBytes: template,
      layout: {
        recipient: { x: 0.2, y: 0.8, size: 18 },
        serial: { x: 0.5, y: 0.99, size: 6 },
      },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("falls back to defaults for fields the layout omits", () => {
    expect(DEFAULT_LAYOUT.recipient).toBeDefined();
    expect(DEFAULT_LAYOUT.recipient!.y).toBeLessThan(1);
    expect(DEFAULT_LAYOUT.serial!.y).toBeGreaterThan(DEFAULT_LAYOUT.recipient!.y);
  });

  it("does not draw its own heading over a template", async () => {
    const template = await buildTemplate();
    const bytes = await renderCertificatePdf(base, { templateBytes: template });
    const drawn = pageText(await PDFDocument.load(bytes), 0);

    // A designed background normally prints its own title; doubling it up is
    // what produces the overlapping-text look.
    expect(drawn).toContain("TEMPLATE PAGE 1");
    expect(drawn).not.toContain("CERTIFICATE OF COMPLETION");
    // The data fields still land.
    expect(drawn).toContain("Okonkwo");
  });

  it("draws a heading when the admin positions one explicitly", async () => {
    const template = await buildTemplate();
    const bytes = await renderCertificatePdf(base, {
      templateBytes: template,
      layout: { heading: { x: 0.5, y: 0.1, size: 22 } },
    });
    const drawn = pageText(await PDFDocument.load(bytes), 0);

    expect(drawn).toContain("CERTIFICATE OF COMPLETION");
  });

  it("suppresses a field the admin sets to null", async () => {
    const template = await buildTemplate();
    const bytes = await renderCertificatePdf(base, {
      templateBytes: template,
      layout: { issuer: null },
    });
    const drawn = pageText(await PDFDocument.load(bytes), 0);

    expect(drawn).not.toContain("Adeyemi");
    expect(drawn).toContain("Okonkwo");
  });

  it("still draws its own heading with no template", async () => {
    const bytes = await renderCertificatePdf(base);
    const drawn = pageText(await PDFDocument.load(bytes), 0);
    expect(drawn).toContain("CERTIFICATE OF COMPLETION");
  });
});