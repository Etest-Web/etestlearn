import { describe, expect, test } from "vitest";
import {
  asDeckSlide,
  CANVAS_ELEMENT_LIMITS,
  clampCanvasBox,
  formatChartRows,
  parseChartRows,
  type CanvasElement,
} from "./slides";
import { sanitizeDeckSlides } from "../convex/helpers/slides";

function textEl(id: string, x = 0.1): CanvasElement {
  return { id, kind: "text", x, y: 0.1, w: 0.2, h: 0.1, text: "Hi" };
}

describe("asDeckSlide", () => {
  test("defaults kind/reveals and does not mutate the input", () => {
    const raw = { heading: "Hi", body: "Body" };
    const slide = asDeckSlide(raw);
    expect(slide.kind).toBe("bullets");
    expect(slide.reveals).toEqual([]);
    expect(raw).toEqual({ heading: "Hi", body: "Body" });
  });
});

describe("clampCanvasBox", () => {
  test("pulls an oversized box back inside the canvas", () => {
    expect(clampCanvasBox({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 })).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    });
    expect(clampCanvasBox({ x: -1, y: -1, w: 2, h: 2 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test("recovers from non-finite geometry", () => {
    const nan = Number.NaN;
    expect(clampCanvasBox({ x: nan, y: nan, w: nan, h: nan })).toEqual({
      x: 0,
      y: 0,
      w: CANVAS_ELEMENT_LIMITS.minSize,
      h: CANVAS_ELEMENT_LIMITS.minSize,
    });
  });
});

describe("chart rows", () => {
  test("paste parse accepts comma/colon/tab and drops header or junk lines", () => {
    const rows = parseChartRows("A, 1\nB: 2\nC\t3\nHeader\nbad, nope\n, 5");
    expect(rows).toEqual([
      { label: "A", value: 1 },
      { label: "B", value: 2 },
      { label: "C", value: 3 },
    ]);
    expect(parseChartRows(formatChartRows(rows))).toEqual(rows);
  });
});

describe("sanitizeDeckSlides canvas hygiene", () => {
  const base = { kind: "freeform" as const, heading: "H", body: "", reveals: [] };

  test("clamps hand-edited geometry instead of rejecting the slide", () => {
    const [out] = sanitizeDeckSlides([{ ...base, elements: [textEl("a", 9)] }])!;
    expect(out.elements![0].x).toBe(1 - out.elements![0].w);
  });

  test("rejects duplicate ids — they would break drag/resize targeting", () => {
    expect(() =>
      sanitizeDeckSlides([{ ...base, elements: [textEl("a"), textEl("a")] }]),
    ).toThrow(/unique ids/);
  });

  test("requires a URL and alt on canvas images", () => {
    const noAlt = { ...textEl("a"), kind: "image" as const, src: "https://cdn.test/a.png", alt: "" };
    expect(() => sanitizeDeckSlides([{ ...base, elements: [noAlt] }])).toThrow(/alt text/);
  });

  test("refuses a non-http(s) canvas image URL", () => {
    const bad = { ...textEl("a"), kind: "image" as const, src: "javascript:alert(1)", alt: "x" };
    expect(() => sanitizeDeckSlides([{ ...base, elements: [bad] }])).toThrow(/http\(s\)/);
  });

  test("caps element count per slide", () => {
    const many = Array.from({ length: CANVAS_ELEMENT_LIMITS.perSlide + 1 }, (_, i) =>
      textEl(`e${i}`),
    );
    expect(() => sanitizeDeckSlides([{ ...base, elements: many }])).toThrow(/Too many canvas/);
  });
});
