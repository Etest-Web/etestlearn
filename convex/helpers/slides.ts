/**
 * Convex-side validators and hygiene for slide decks.
 *
 * The browser can call any Convex function directly, so every deck that comes
 * in through a mutation is re-checked here. The shape mirrors `lib/slides.ts`;
 * that file owns the vocabulary, this one owns the trust boundary.
 */

import { v } from "convex/values";
import {
  sanitizeMultiline,
  sanitizeSingleLine,
  sanitizeStoredUrl,
  TEXT_LIMITS,
} from "../../lib/sanitize-text";
import {
  asDeckSlide,
  CANVAS_ELEMENT_LIMITS,
  clampCanvasBox,
  DECK_BACKGROUNDS,
  DECK_FONT_PAIRS,
  DECK_PALETTES,
  DEFAULT_DECK_THEME,
  SHAPE_KINDS,
  SLIDE_LIMITS,
  type CanvasElement,
  type ChartKind,
  type ChartRow,
  type DeckSlide,
  type DeckTheme,
} from "../../lib/slides";

const slideKindValidator = v.union(
  v.literal("bullets"),
  v.literal("cover"),
  v.literal("split"),
  v.literal("code"),
  v.literal("quote"),
  v.literal("chart"),
  v.literal("image"),
  v.literal("freeform"),
  v.literal("video"),
);

const chartKindValidator = v.union(
  v.literal("bar"),
  v.literal("line"),
  v.literal("pie"),
  v.literal("donut"),
);

const shapeKindValidator = v.union(
  v.literal("rect"),
  v.literal("circle"),
  v.literal("line"),
);

const canvasBoxFields = {
  id: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
};

/** Discriminated by `kind`; every variant carries the same absolute box. */
const canvasElementValidator = v.union(
  v.object({ ...canvasBoxFields, kind: v.literal("text"), text: v.string() }),
  v.object({ ...canvasBoxFields, kind: v.literal("image"), src: v.string(), alt: v.string() }),
  v.object({
    ...canvasBoxFields,
    kind: v.literal("chart"),
    chart: v.object({
      type: chartKindValidator,
      rows: v.array(v.object({ label: v.string(), value: v.number() })),
    }),
  }),
  v.object({ ...canvasBoxFields, kind: v.literal("shape"), shape: shapeKindValidator }),
  v.object({ ...canvasBoxFields, kind: v.literal("video") }),
);

export const slideValidator = v.object({
  kind: slideKindValidator,
  heading: v.string(),
  body: v.string(),
  reveals: v.array(v.string()),
  subtitle: v.optional(v.string()),
  code: v.optional(v.string()),
  language: v.optional(v.string()),
  attribution: v.optional(v.string()),
  image: v.optional(v.object({ url: v.string(), alt: v.string() })),
  chart: v.optional(
    v.object({
      type: chartKindValidator,
      rows: v.array(v.object({ label: v.string(), value: v.number() })),
    }),
  ),
  elements: v.optional(v.array(canvasElementValidator)),
});

export const deckThemeValidator = v.object({
  palette: v.union(
    v.literal("ink"),
    v.literal("cream"),
    v.literal("forest"),
    v.literal("royal"),
  ),
  fontPair: v.union(v.literal("modern"), v.literal("editorial"), v.literal("terminal")),
  background: v.union(v.literal("plain"), v.literal("wash"), v.literal("grid")),
});

const MAX_SLIDES = SLIDE_LIMITS.slides;
const MAX_REVEALS = SLIDE_LIMITS.revealsPerSlide;
const MAX_CHART_ROWS = SLIDE_LIMITS.chartRows;
const SLIDE_BODY_LIMIT = 5_000;
const CODE_LIMIT = 20_000;
const CANVAS_TEXT_LIMIT = 1_000;

/** Shared by the slide-level chart and the freeform chart element. */
function sanitizeChart(
  raw: { type: ChartKind; rows: ChartRow[] },
): { type: ChartKind; rows: ChartRow[] } {
  if (raw.rows.length > MAX_CHART_ROWS) {
    throw new Error(`Too many chart rows (max ${MAX_CHART_ROWS})`);
  }
  return {
    type: raw.type,
    rows: raw.rows.map((row) => {
      if (!Number.isFinite(row.value)) throw new Error("Chart values must be numbers");
      return { label: sanitizeSingleLine(row.label, 80), value: row.value };
    }),
  };
}

/**
 * Freeform canvas hygiene. Ids are kept only if unique — duplicate React keys
 * would make drag/resize target the wrong element. Bad boxes are clamped in
 * bounds rather than rejected, so a hand-edited row cannot push a slide off
 * the canvas.
 */
function sanitizeCanvasElements(raw: CanvasElement[] | undefined): CanvasElement[] | undefined {
  if (raw === undefined) return undefined;
  if (raw.length > CANVAS_ELEMENT_LIMITS.perSlide) {
    throw new Error(`Too many canvas elements (max ${CANVAS_ELEMENT_LIMITS.perSlide})`);
  }
  const seen = new Set<string>();
  return raw.map((element) => {
    const box = clampCanvasBox(element);
    const id = sanitizeSingleLine(element.id, 64);
    if (!id || seen.has(id)) throw new Error("Canvas elements need unique ids");
    seen.add(id);
    switch (element.kind) {
      case "text":
        return {
          ...box,
          id,
          kind: "text",
          text: sanitizeMultiline(element.text, CANVAS_TEXT_LIMIT),
        };
      case "image": {
        const src = sanitizeStoredUrl(element.src, "Canvas image URL");
        const alt = sanitizeSingleLine(element.alt, TEXT_LIMITS.title);
        if (!src || !alt) throw new Error("Canvas image needs a URL and alt text");
        return { ...box, id, kind: "image", src, alt };
      }
      case "chart":
        return { ...box, id, kind: "chart", chart: sanitizeChart(element.chart) };
      case "shape":
        return {
          ...box,
          id,
          kind: "shape",
          shape: (SHAPE_KINDS as readonly string[]).includes(element.shape)
            ? element.shape
            : "rect",
        };
      case "video":
        return { ...box, id, kind: "video" };
    }
  });
}

/** Re-check and cap every field, then return the stored shape. */
export function sanitizeDeckSlides(raw: DeckSlide[] | undefined): DeckSlide[] | undefined {
  if (raw === undefined) return undefined;
  if (raw.length > MAX_SLIDES) throw new Error(`Too many slides (max ${MAX_SLIDES})`);

  return raw.map((s) => {
    const slide = asDeckSlide(s);
    if (slide.reveals.length > MAX_REVEALS) {
      throw new Error(`Too many reveal steps on one slide (max ${MAX_REVEALS})`);
    }
    const out: DeckSlide = {
      kind: slide.kind,
      heading: sanitizeSingleLine(slide.heading, TEXT_LIMITS.title),
      body: sanitizeMultiline(slide.body, SLIDE_BODY_LIMIT),
      reveals: slide.reveals.map((r) => sanitizeMultiline(r, SLIDE_BODY_LIMIT)),
    };
    if (slide.subtitle) out.subtitle = sanitizeSingleLine(slide.subtitle, TEXT_LIMITS.title);
    if (slide.code) out.code = sanitizeMultiline(slide.code, CODE_LIMIT);
    if (slide.language) out.language = sanitizeSingleLine(slide.language, 40);
    if (slide.attribution) out.attribution = sanitizeSingleLine(slide.attribution, TEXT_LIMITS.title);
    if (slide.image) {
      const url = sanitizeStoredUrl(slide.image.url, "Slide image URL");
      const alt = sanitizeSingleLine(slide.image.alt, TEXT_LIMITS.title);
      if (!url || !alt) throw new Error("Slide image needs a URL and alt text");
      out.image = { url, alt };
    }
    if (slide.chart) out.chart = sanitizeChart(slide.chart);
    if (slide.elements) {
      const elements = sanitizeCanvasElements(slide.elements);
      if (elements) out.elements = elements;
    }
    return out;
  });
}

/** Unknown preset names fall back to the default instead of breaking a deck. */
export function sanitizeDeckTheme(raw: DeckTheme | undefined): DeckTheme | undefined {
  if (raw === undefined) return undefined;
  return {
    palette: (DECK_PALETTES as readonly string[]).includes(raw.palette)
      ? raw.palette
      : DEFAULT_DECK_THEME.palette,
    fontPair: (DECK_FONT_PAIRS as readonly string[]).includes(raw.fontPair)
      ? raw.fontPair
      : DEFAULT_DECK_THEME.fontPair,
    background: (DECK_BACKGROUNDS as readonly string[]).includes(raw.background)
      ? raw.background
      : DEFAULT_DECK_THEME.background,
  } as DeckTheme;
}
