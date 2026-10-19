import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CANVAS_BASELINE_NUDGE,
  CERTIFICATE_COLORS,
  CERTIFICATE_FIELDS,
  CERTIFICATE_FONT_LIST,
  CERTIFICATE_INK,
  CERTIFICATE_MUTED,
  DEFAULT_LAYOUT,
  TEMPLATE_DEFAULTS,
  applyCase,
  certificateField,
  certificateFieldLines,
  certificateFont,
  effectiveAnchor,
  formatAnchor,
  isValidColor,
  parseAnchor,
  resolveColor,
  rgbToCss,
  wrapCharBudget,
  wrapText,
  type CertificateFieldKey,
  type CertificateLayout,
} from "./certificate-layout";
import { certificateFontBytes } from "./certificate-fonts-data";

describe("effectiveAnchor", () => {
  it("falls back to the defaults for a field the layout omits", () => {
    const layout: CertificateLayout = { recipient: { x: 0.2, y: 0.8 } };

    expect(effectiveAnchor("recipient", layout, TEMPLATE_DEFAULTS)).toEqual({
      x: 0.2,
      y: 0.8,
    });
    expect(effectiveAnchor("issuer", layout, TEMPLATE_DEFAULTS)).toEqual(
      TEMPLATE_DEFAULTS.issuer,
    );
  });

  it("honours an explicit null — the field is not drawn at all", () => {
    expect(
      effectiveAnchor("heading", { heading: null }, TEMPLATE_DEFAULTS),
    ).toBeNull();
  });

  it("treats a missing layout as all defaults", () => {
    expect(effectiveAnchor("serial", null, TEMPLATE_DEFAULTS)).toEqual(
      TEMPLATE_DEFAULTS.serial,
    );
  });
});

describe("formatAnchor", () => {
  it("omits the size when there is none", () => {
    expect(formatAnchor({ x: 0.5, y: 0.25 })).toBe("0.5,0.25");
    expect(formatAnchor({ x: 0.5, y: 0.25, size: 12 })).toBe("0.5,0.25,12");
  });

  it("renders the suppression keyword and the empty string", () => {
    expect(formatAnchor(null)).toBe("off");
    expect(formatAnchor(undefined)).toBe("");
  });
});

describe("parseAnchor", () => {
  it("reads back what formatAnchor wrote", () => {
    for (const field of CERTIFICATE_FIELDS) {
      const anchor = effectiveAnchor(
        field.key,
        null,
        field.key === "heading" ? TEMPLATE_DEFAULTS : DEFAULT_LAYOUT,
      );
      expect(parseAnchor(formatAnchor(anchor))).toEqual(
        anchor === undefined ? undefined : anchor,
      );
    }
  });

  it("maps blank to the default and off to suppression", () => {
    expect(parseAnchor("")).toBeUndefined();
    expect(parseAnchor("   ")).toBeUndefined();
    expect(parseAnchor("off")).toBeNull();
    expect(parseAnchor("OFF")).toBeNull();
  });

  it("accepts x,y with or without a size", () => {
    expect(parseAnchor("0.5,0.4")).toEqual({ x: 0.5, y: 0.4, size: undefined });
    expect(parseAnchor(" 0.5 , 0.4 , 28 ")).toEqual({ x: 0.5, y: 0.4, size: 28 });
  });

  it("refuses a mistyped position instead of silently defaulting", () => {
    // Falling back quietly would print the field in the wrong place with no
    // indication that the input was ignored.
    expect(() => parseAnchor("0.5")).toThrow(/not a position/);
    expect(() => parseAnchor("0.5,0.4,12,9")).toThrow(/not a position/);
    expect(() => parseAnchor("a,b")).toThrow(/not a position/);
  });

  it("leaves the on-page range to the server", () => {
    // Syntactically valid, semantically off-page: updateTemplateLayout is the
    // single place that rejects it, so the editor shows the server's message.
    expect(parseAnchor("0,5")).toEqual({ x: 0, y: 5, size: undefined });
  });
});

describe("the shipped defaults", () => {
  it("are inside the page", () => {
    for (const defaults of [DEFAULT_LAYOUT, TEMPLATE_DEFAULTS]) {
      for (const [key, anchor] of Object.entries(defaults)) {
        if (!anchor) continue;
        expect(anchor.x, key).toBeGreaterThan(0);
        expect(anchor.x, key).toBeLessThan(1);
        expect(anchor.y, key).toBeGreaterThan(0);
        expect(anchor.y, key).toBeLessThan(1);
      }
    }
  });

  it("suppress the heading only when artwork supplies its own", () => {
    // Overlapping our title on a designed background is the thing TEMPLATE_DEFAULTS
    // exists to prevent; with no template we own the page and must supply one.
    expect(DEFAULT_LAYOUT.heading).not.toBeNull();
    expect(TEMPLATE_DEFAULTS.heading).toBeNull();
  });

  it("set a size for every drawn field", () => {
    // The canvas renders at the size it is given; a missing one would fall back
    // to a different number than the PDF's own fallback and drift apart.
    for (const defaults of [DEFAULT_LAYOUT, TEMPLATE_DEFAULTS]) {
      for (const field of CERTIFICATE_FIELDS) {
        if (!defaults[field.key]) continue;
        expect(defaults[field.key]!.size, field.key).toBeGreaterThan(0);
      }
    }
  });
});

describe("certificateField", () => {
  it("describes every field the canvas has to draw", () => {
    for (const field of CERTIFICATE_FIELDS) {
      const meta = certificateField(field.key);
      // The editor paints sample words it has never been given; if a field were
      // added without one, its text would render as blank and look like a bug
      // in the placement rather than a missing value.
      expect(meta.sample.length, field.key).toBeGreaterThan(0);
      expect(meta.label.length, field.key).toBeGreaterThan(0);
    }
  });

  it("refuses a key the renderer would not draw", () => {
    expect(() => certificateField("nope" as CertificateFieldKey)).toThrow(
      /Unknown certificate field/,
    );
  });
});

describe("wrapText", () => {
  it("breaks on word boundaries within the budget", () => {
    expect(wrapText("one two three four", 9)).toEqual([
      "one two",
      "three",
      "four",
    ]);
  });

  it("keeps a word that cannot fit on its own line", () => {
    // Refusing to break inside a word is what stops a long course title
    // losing characters the certificate is supposed to show.
    expect(wrapText("superfragilistic word", 5)).toEqual([
      "superfragilistic",
      "word",
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(wrapText("   ", 20)).toEqual([]);
  });
});

describe("wrapCharBudget", () => {
  it("scales the budget with the page and the font size", () => {
    // A4 landscape at 40pt fits fewer characters per line than at 9pt.
    expect(wrapCharBudget(841.89, 40)).toBeLessThan(wrapCharBudget(841.89, 9));
    expect(wrapCharBudget(1600, 22)).toBeGreaterThan(wrapCharBudget(841.89, 22));
  });

  it("never drops below a readable floor", () => {
    expect(wrapCharBudget(100, 200)).toBe(20);
  });
});

describe("certificateFieldLines", () => {
  it("truncates the learner name where the PDF does", () => {
    const long = "A".repeat(80);
    const [line] = certificateFieldLines("recipient", long, 841.89, 40);
    expect(line).toHaveLength(46);
  });

  it("wraps a long course title onto extra lines", () => {
    const lines = certificateFieldLines(
      "course",
      "Advanced Data Structures and Algorithm Analysis for Competitive Programming",
      841.89,
      22,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toContain("Advanced Data Structures");
  });

  it("leaves a single-line field alone however long it is", () => {
    // The issuer is drawn as one line; wrapping it here would show text in the
    // editor that the certificate never prints.
    const lines = certificateFieldLines("issuer", "A very long issuing body name", 841.89, 14);
    expect(lines).toHaveLength(1);
  });
});

describe("rgbToCss", () => {
  it("writes a colour the canvas can paint", () => {
    expect(rgbToCss({ r: 0, g: 0, b: 0 })).toBe("rgb(0, 0, 0)");
    expect(rgbToCss(CERTIFICATE_INK)).toBe("rgb(31, 27, 29)");
    expect(rgbToCss(CERTIFICATE_MUTED)).toBe("rgb(107, 101, 112)");
  });
});

describe("CANVAS_BASELINE_NUDGE", () => {
  it("is a sub-em correction rather than a visible jump", () => {
    // It bridges the gap between pdf-lib's baseline and a CSS line box. Large
    // enough to matter and small enough to be a correction: see the comment on
    // the constant for the derivation.
    expect(CANVAS_BASELINE_NUDGE).toBeGreaterThan(0);
    expect(CANVAS_BASELINE_NUDGE).toBeLessThan(0.2);
  });
});

describe("the font catalogue", () => {
  it("ships a file for every face, and the renderer has the bytes", () => {
    for (const face of CERTIFICATE_FONT_LIST) {
      // The editor loads the file over HTTP; a face with no file would draw in
      // whatever the browser happened to have.
      expect(existsSync(join(process.cwd(), "public", "fonts", face.file))).toBe(
        true,
      );
      // The renderer cannot fetch — its copy is in the bundle.
      const bytes = certificateFontBytes(face.id);
      expect(bytes).not.toBeNull();
      expect(bytes!.length).toBeGreaterThan(1000);
    }
  });

  it("gives the renderer a TrueType program, not a woff2", () => {
    // pdf-lib embeds the bytes it is handed as the PDF's font program, and a
    // woff2 is a brotli wrapper that no reader can draw.
    const bytes = certificateFontBytes("inter")!;
    expect([...bytes.slice(0, 4)]).toEqual([0x00, 0x01, 0x00, 0x00]);
  });

  it("falls back to the default face for an id it does not know", () => {
    // A row written by a build with a face this one dropped must still print.
    expect(certificateFont("no-such-face").id).toBe("inter");
    expect(certificateFont(undefined).id).toBe("inter");
  });

  it("measures each face for itself, so wrapping differs by typeface", () => {
    // Monospace is exactly 0.6em — which is how the measurement was checked —
    // and a narrow serif is well under the one-size estimate it replaced.
    expect(certificateFont("jetbrains").advance).toBe(0.6);
    expect(certificateFont("cormorant").advance).toBeLessThan(0.45);
    expect(certificateFont("inter").advance).toBeGreaterThan(0.45);
  });
});

describe("applyCase", () => {
  it("leaves the text alone when no case is set", () => {
    expect(applyCase("Adaeze Okonkwo", undefined)).toBe("Adaeze Okonkwo");
    expect(applyCase("Adaeze Okonkwo", "none")).toBe("Adaeze Okonkwo");
  });

  it("upper-cases and lower-cases", () => {
    expect(applyCase("Adaeze", "upper")).toBe("ADAEZE");
    expect(applyCase("Adaeze", "lower")).toBe("adaeze");
  });

  it("title-cases each word", () => {
    expect(applyCase("completed on 9 march 2026", "title")).toBe(
      "Completed On 9 March 2026",
    );
  });

  it("title-cases a word that starts with a bracket", () => {
    // The bracket is not the word, so it must not be the thing that gets
    // capitalised instead.
    expect(applyCase("(certificate", "title")).toBe("(Certificate");
  });
});

describe("certificateFieldLines with typography", () => {
  it("applies the case before it truncates", () => {
    // Both the canvas and the PDF clip through this function, so a name set to
    // UPPER has to lose its tail at the same character as the same name as
    // typed — otherwise the preview shows more of the name than the print.
    const typed = certificateFieldLines("recipient", "a".repeat(60), 841.89, 40);
    const upper = certificateFieldLines("recipient", "a".repeat(60), 841.89, 40, {
      case: "upper",
    });

    expect(typed[0]).toHaveLength(46);
    expect(upper[0]).toHaveLength(46);
    expect(upper[0]).toBe("A".repeat(46));
  });

  it("wraps to the width of the face it is set in", () => {
    const title = "Advanced Data Structures and Algorithm Analysis for Competitive";
    const narrow = certificateFieldLines("course", title, 841.89, 22, {
      font: "cormorant",
    });
    const wide = certificateFieldLines("course", title, 841.89, 22, {
      font: "jetbrains",
    });

    // A narrower face fits more on a line; a monospace one fits least.
    expect(narrow).toHaveLength(1);
    expect(wide.length).toBeGreaterThan(narrow.length);
  });
});

describe("resolveColor", () => {
  it("reads a preset", () => {
    expect(resolveColor("ink")).toEqual(CERTIFICATE_INK);
    expect(resolveColor("muted")).toEqual(CERTIFICATE_MUTED);
    expect(resolveColor("white")).toEqual(CERTIFICATE_COLORS.white);
  });

  it("reads a hex colour, long or short", () => {
    expect(resolveColor("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
    expect(resolveColor("#f00")).toEqual({ r: 1, g: 0, b: 0 });
    expect(resolveColor("#102030").r).toBeCloseTo(16 / 255, 5);
  });

  it("falls back rather than throwing on a colour it does not know", () => {
    // A certificate that prints in the wrong ink is a defect; one that refuses
    // to print is an outage.
    expect(resolveColor("chartreuse", "muted")).toEqual(CERTIFICATE_MUTED);
    expect(resolveColor(undefined, "gold")).toEqual(CERTIFICATE_COLORS.gold);
  });

  it("knows which colours it accepts", () => {
    expect(isValidColor("ink")).toBe(true);
    expect(isValidColor("#abcdef")).toBe(true);
    expect(isValidColor("#12zz34")).toBe(false);
    expect(isValidColor("chartreuse")).toBe(false);
  });
});
