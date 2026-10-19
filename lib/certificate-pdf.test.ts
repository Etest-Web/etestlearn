import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import { DEFAULT_LAYOUT } from "./certificate-layout";
import { renderCertificatePdf, type CertificatePdfInput } from "./certificate-pdf";
import { TINY_JPEG, buildPng } from "@/tests/helpers/png";

/**
 * The runs of text on a page, as a reader reads them.
 *
 * Two encodings meet in a certificate. A standard font (Helvetica) writes
 * WinAnsi bytes into the content stream, so the hex string *is* the text. A
 * custom face writes two-byte glyph ids and carries a ToUnicode map saying
 * which character each id stands for — read the hex bytes directly and a
 * certificate set in Inter comes out as a row of numbers.
 *
 * So the text is read the way a reader reads it, through pdf.js, which applies
 * the font's own map. That also makes this the assertion that matters: what a
 * learner gets when they select the verification link to copy it.
 *
 * Each run carries the text matrix it was drawn at, so a test can ask *where*
 * a line landed and not only what it said.
 */
interface TextRun {
  str: string;
  /** The text matrix: [a, b, c, d, x, y]. */
  transform: number[];
}

async function textRuns(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<TextRun[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();

  return content.items
    .filter((item) => "str" in item)
    .map((item) => ({ str: item.str, transform: item.transform }));
}

async function pageText(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const runs = await textRuns(bytes, pageIndex);
  return runs.map((run) => run.str).join("\n");
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

  it("truncates a long learner name where the editor does", async () => {
    // The canvas shows the same clip, so the two only stay in step while the
    // shared maxLength is the one doing the cutting.
    const bytes = await renderCertificatePdf(
      { ...base, holderName: "A".repeat(80) },
      // Set small enough that the whole clipped name fits the page. Text that
      // hangs off the edge is not on the page, and pdf.js only reports what is
      // on the page — at the default 40pt the name is wider than the sheet, so
      // this would be measuring the crop rather than the clip.
      { layout: { recipient: { x: 0.5, y: 0.5, size: 18 } } },
    );
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("A".repeat(46));
    expect(drawn).not.toContain("A".repeat(47));
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

    const drawn = await pageText(bytes, 0);

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
    const drawn = await pageText(bytes, 0);

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
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("CERTIFICATE OF COMPLETION");
  });

  it("suppresses a field the admin sets to null", async () => {
    const template = await buildTemplate();
    const bytes = await renderCertificatePdf(base, {
      templateBytes: template,
      layout: { issuer: null },
    });
    const drawn = await pageText(bytes, 0);

    expect(drawn).not.toContain("Adeyemi");
    expect(drawn).toContain("Okonkwo");
  });

  it("still draws its own heading with no template", async () => {
    const bytes = await renderCertificatePdf(base);
    const drawn = await pageText(bytes, 0);
    expect(drawn).toContain("CERTIFICATE OF COMPLETION");
  });
});

describe("renderCertificatePdf with an image background", () => {
  it("renders at the recorded page size, not at the image's pixel size", async () => {
    // The image is 40×30px; the page it prints on is whatever the upload
    // recorded. This is the assertion that separates "image scaled onto the
    // page" from "page sized after the image" — the built-in artwork would
    // also produce 842pt, so the size alone is not the proof.
    const bytes = await renderCertificatePdf(base, {
      templateBytes: buildPng(40, 30),
      templatePageSize: { width: 1000, height: 700 },
    });
    const doc = await PDFDocument.load(bytes);

    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(1000);
    expect(Math.round(height)).toBe(700);
  });

  it("keeps the certificate's own text on top of the image", async () => {
    const bytes = await renderCertificatePdf(base, {
      templateBytes: buildPng(40, 30),
      templatePageSize: { width: 841.89, height: 595.28 },
    });
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("Okonkwo");
    expect(drawn).toContain(base.serial);
  });

  it("normalises an image with no recorded size onto the A4 long edge", async () => {
    // The upload always records a size, so this is the rule the upload itself
    // applies — asserted here so a change to it is a visible decision rather
    // than a silent drift between the two.
    const bytes = await renderCertificatePdf(base, {
      templateBytes: buildPng(40, 30),
    });
    const { width, height } = (await PDFDocument.load(bytes)).getPage(0).getSize();

    expect(Math.round(width)).toBe(1123);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(width);
  });

  it("embeds a JPEG as readily as a PNG", async () => {
    const bytes = await renderCertificatePdf(base, {
      templateBytes: TINY_JPEG,
      templatePageSize: { width: 900, height: 600 },
    });
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPage(0).getSize().width).toBeCloseTo(900, 1);
    expect(await pageText(bytes, 0)).toContain("Okonkwo");
  });

  it("falls back when the file only claims to be an image", async () => {
    // PNG magic, then nothing a decoder would accept — a renamed file, or an
    // upload cut short.
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const bytes = await renderCertificatePdf(base, {
      templateBytes: fake,
      templatePageSize: { width: 1000, height: 700 },
    });
    const doc = await PDFDocument.load(bytes);

    // The built-in artwork's page, not the 1000pt one that was asked for —
    // so this proves the embed was attempted and refused, not skipped.
    expect(Math.round(doc.getPage(0).getSize().width)).toBe(842);
  });

  it("suppresses its own heading over an image, and restores it on request", async () => {
    const page = { width: 841.89, height: 595.28 };

    const suppressed = await renderCertificatePdf(base, {
      templateBytes: buildPng(40, 30),
      templatePageSize: page,
    });
    expect(
      await pageText(suppressed, 0),
    ).not.toContain("CERTIFICATE OF COMPLETION");

    // An image usually has a title of its own printed into it, which is the
    // same reasoning as for a PDF — one default serves both kinds.
    const restored = await renderCertificatePdf(base, {
      templateBytes: buildPng(40, 30),
      templatePageSize: page,
      layout: { heading: { x: 0.5, y: 0.1, size: 22 } },
    });
    expect(await pageText(restored, 0)).toContain(
      "CERTIFICATE OF COMPLETION",
    );
  });
});

describe("per-field typography", () => {
  /**
   * The fonts a PDF actually carries, by name.
   *
   * Read back through pdf-lib rather than by scanning the bytes: pdf-lib
   * writes its objects into compressed object streams, so the names are in
   * there but not in plain sight.
   */
  const embeddedFonts = async (bytes: Uint8Array): Promise<string[]> => {
    const doc = await PDFDocument.load(bytes);
    const names: string[] = [];

    for (const page of doc.getPages()) {
      const fonts = page.node.Resources()?.lookup(PDFName.of("Font"));
      if (!(fonts instanceof PDFDict)) continue;
      for (const [, ref] of fonts.entries()) {
        const font = doc.context.lookup(ref);
        if (!(font instanceof PDFDict)) continue;
        const base = font.lookup(PDFName.of("BaseFont"));
        if (base instanceof PDFName) names.push(base.decodeText());
      }
    }

    return names;
  };

  it("sets a field in the face the admin chose", async () => {
    const serif = await renderCertificatePdf(base, {
      layout: { issuer: { x: 0.5, y: 0.85, size: 14, font: "cormorant" } },
    });
    const mono = await renderCertificatePdf(base, {
      layout: { issuer: { x: 0.5, y: 0.85, size: 14, font: "jetbrains" } },
    });

    // The face is not just a label on the field: it is the font the PDF
    // carries, and the learner's name still reads back as text.
    expect((await embeddedFonts(serif)).join(" ")).toMatch(/Cormorant/i);
    expect((await embeddedFonts(mono)).join(" ")).toMatch(/JetBrains/i);
    expect(await pageText(serif, 0)).toContain("Dr. Bambo Adeyemi");
  });

  it("applies the letter case before it draws", async () => {
    const bytes = await renderCertificatePdf(base, {
      layout: { issuer: { x: 0.5, y: 0.85, size: 14, case: "upper" } },
    });
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("DR. BAMBO ADEYEMI");
    expect(drawn).not.toContain("Dr. Bambo Adeyemi");
  });

  it("stacks a wrapped field at the line height it is given", async () => {
    const title =
      "Advanced Data Structures and Algorithm Analysis for Competitive Programming";
    const runs = async (lineHeight: number) => {
      const bytes = await renderCertificatePdf(
        { ...base, courseTitle: title },
        { layout: { course: { x: 0.5, y: 0.58, size: 22, lineHeight } } },
      );
      const drawn = await textRuns(bytes, 0);
      return drawn.filter(
        (run) => run.str.includes("Advanced") || run.str.includes("Programming"),
      );
    };

    const tight = await runs(1);
    const loose = await runs(2);

    expect(tight).toHaveLength(2);
    expect(loose).toHaveLength(2);

    // The gap between the two lines is the line height, in points.
    const gap = (runs: TextRun[]) =>
      Math.abs(runs[0].transform[5] - runs[1].transform[5]);
    expect(gap(tight)).toBeCloseTo(22, 0);
    expect(gap(loose)).toBeCloseTo(44, 0);
  });
});

describe("certificate wording", () => {
  it("prints the heading the admin saved", async () => {
    const bytes = await renderCertificatePdf(base, {
      texts: { heading: "CERTIFICATE OF EXCELLENCE" },
    });
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("CERTIFICATE OF EXCELLENCE");
    expect(drawn).not.toContain("CERTIFICATE OF COMPLETION");
  });

  it("prints the prefixes it is given", async () => {
    const bytes = await renderCertificatePdf(base, {
      texts: { issuedOnPrefix: "Finished on", serialPrefix: "Check it at" },
    });
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("Finished on 9 March 2026");
    expect(drawn).toContain("Check it at https://glypha.learn/verify/");
  });

  it("keeps the default wording when the template says nothing", async () => {
    const bytes = await renderCertificatePdf(base);
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("CERTIFICATE OF COMPLETION");
    expect(drawn).toContain("Completed on 9 March 2026");
  });
});

describe("names the faces cannot spell", () => {
  it("draws the certificate anyway rather than refusing to print", async () => {
    // The old standard font threw on this, and a throw inside the render is a
    // learner who never receives a certificate. The face has no glyph for the
    // name, so the name prints as a blank — but the certificate around it is
    // still a certificate.
    const bytes = await renderCertificatePdf({
      ...base,
      holderName: "李明",
    });
    const drawn = await pageText(bytes, 0);

    expect(drawn).toContain("CERTIFICATE OF COMPLETION");
    expect(drawn).toContain("Dr. Bambo Adeyemi");
  });
});