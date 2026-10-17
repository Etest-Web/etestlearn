import { describe, expect, it } from "vitest";
import {
  CANVAS_BASELINE_NUDGE,
  CERTIFICATE_FIELDS,
  CERTIFICATE_INK,
  CERTIFICATE_MUTED,
  DEFAULT_LAYOUT,
  TEMPLATE_DEFAULTS,
  certificateField,
  certificateFieldLines,
  effectiveAnchor,
  formatAnchor,
  parseAnchor,
  rgbToCss,
  wrapCharBudget,
  wrapText,
  type CertificateFieldKey,
  type CertificateLayout,
} from "./certificate-layout";

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
