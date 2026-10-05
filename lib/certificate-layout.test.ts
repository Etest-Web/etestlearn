import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_FIELDS,
  DEFAULT_LAYOUT,
  TEMPLATE_DEFAULTS,
  effectiveAnchor,
  formatAnchor,
  parseAnchor,
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
});
