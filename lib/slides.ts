/**
 * Shared slide vocabulary. Pure types and constants — no Convex or React
 * imports — so the renderer, the authoring UI and the Convex validators all
 * read the same list of kinds and the same theme presets.
 *
 * `kind` is optional on stored rows: decks authored before this existed are
 * plain heading/body/reveals and render as `bullets` via `asDeckSlide`.
 */

export const SLIDE_KINDS = [
  "bullets",
  "cover",
  "split",
  "code",
  "quote",
  "chart",
  "image",
  "freeform",
  "video",
] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];

export const CHART_KINDS = ["bar", "line", "pie", "donut"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
export type ChartRow = { label: string; value: number };

/** 16:9 freeform canvas. Geometry is a fraction of the canvas box (0..1). */
export const SHAPE_KINDS = ["rect", "circle", "line"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type CanvasBox = { x: number; y: number; w: number; h: number };

export type CanvasElement = CanvasBox & { id: string } & (
  | { kind: "text"; text: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "chart"; chart: { type: ChartKind; rows: ChartRow[] } }
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "video" }
);

export const CANVAS_ELEMENT_LIMITS = { perSlide: 40, minSize: 0.02 } as const;

export type DeckSlide = {
  kind: SlideKind;
  heading: string;
  body: string;
  reveals: string[];
  /** `cover` and `split` use a short kicker above the heading. */
  subtitle?: string;
  /** `code` only. */
  code?: string;
  language?: string;
  /** `quote` only. */
  attribution?: string;
  /** `image` only. URL is always a same-origin upload. */
  image?: { url: string; alt: string };
  /** `chart` only. */
  chart?: { type: ChartKind; rows: ChartRow[] };
  /** `freeform` only. Positioned boxes on a 16:9 canvas, back to front. */
  elements?: CanvasElement[];
};

export const DECK_PALETTES = ["ink", "cream", "forest", "royal"] as const;
export type DeckPalette = (typeof DECK_PALETTES)[number];
export const DECK_FONT_PAIRS = ["modern", "editorial", "terminal"] as const;
export type DeckFontPair = (typeof DECK_FONT_PAIRS)[number];
export const DECK_BACKGROUNDS = ["plain", "wash", "grid"] as const;
export type DeckBackground = (typeof DECK_BACKGROUNDS)[number];

export type DeckTheme = {
  palette: DeckPalette;
  fontPair: DeckFontPair;
  background: DeckBackground;
};

export const DEFAULT_DECK_THEME: DeckTheme = {
  palette: "ink",
  fontPair: "modern",
  background: "plain",
};

/** Authoring caps, shared by the editor and the Convex trust boundary. */
export const SLIDE_LIMITS = {
  slides: 60,
  revealsPerSlide: 12,
  chartRows: 12,
} as const;

/** CSS values, one row per palette. Read by the renderer's inline styles. */
export const PALETTE_STYLES: Record<
  DeckPalette,
  {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
    accentForeground: string;
    surface: string;
    border: string;
  }
> = {
  ink: {
    background: "#0b1020",
    foreground: "#f8fafc",
    muted: "#94a3b8",
    accent: "#818cf8",
    accentForeground: "#0b1020",
    surface: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.14)",
  },
  cream: {
    background: "#faf6ef",
    foreground: "#1c1917",
    muted: "#78716c",
    accent: "#b45309",
    accentForeground: "#ffffff",
    surface: "rgba(0,0,0,0.04)",
    border: "rgba(0,0,0,0.12)",
  },
  forest: {
    background: "#0c1a17",
    foreground: "#e7f5ee",
    muted: "#8fb9a8",
    accent: "#34d399",
    accentForeground: "#052e22",
    surface: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.12)",
  },
  royal: {
    background: "#1e1b4b",
    foreground: "#f5f3ff",
    muted: "#a5b4fc",
    accent: "#f472b6",
    accentForeground: "#1e1b4b",
    surface: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.14)",
  },
};

/** System stacks only — no webfont request, so no CSP origin change. */
export const FONT_PAIR_STYLES: Record<DeckFontPair, { heading: string; body: string }> = {
  modern: {
    heading: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  editorial: {
    heading: 'Georgia, "Times New Roman", serif',
    body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  terminal: {
    heading: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    body: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
};

export const BACKGROUND_STYLES: Record<
  DeckBackground,
  { image: string; size: string }
> = {
  plain: { image: "none", size: "auto" },
  wash: {
    image:
      "radial-gradient(100% 100% at 12% 0%, rgba(255,255,255,0.16), transparent 62%), radial-gradient(80% 80% at 100% 100%, rgba(0,0,0,0.12), transparent 60%)",
    size: "auto",
  },
  grid: {
    image:
      "linear-gradient(rgba(127,127,127,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(127,127,127,0.13) 1px, transparent 1px)",
    size: "32px 32px",
  },
};

/** Only bullets and split have reveal steps. Every other kind is one step. */
export function isRevealable(kind: SlideKind): boolean {
  return kind === "bullets" || kind === "split";
}

export function slideStepCount(slide: DeckSlide): number {
  return isRevealable(slide.kind) ? 1 + slide.reveals.length : 1;
}

/** Fill defaults on legacy/partial rows without touching caller data. */
export function asDeckSlide(
  raw: Partial<DeckSlide> & Pick<DeckSlide, "heading" | "body">,
): DeckSlide {
  return {
    kind: raw.kind ?? "bullets",
    heading: raw.heading,
    body: raw.body,
    reveals: raw.reveals ?? [],
    ...(raw.subtitle ? { subtitle: raw.subtitle } : {}),
    ...(raw.code ? { code: raw.code } : {}),
    ...(raw.language ? { language: raw.language } : {}),
    ...(raw.attribution ? { attribution: raw.attribution } : {}),
    ...(raw.image ? { image: raw.image } : {}),
    ...(raw.chart ? { chart: raw.chart } : {}),
    ...(raw.elements ? { elements: raw.elements } : {}),
  };
}

/** Client-side ids only — used as React keys, never as a database handle. */
export function newCanvasElementId(): string {
  return `e${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Keep a box inside the canvas. Editor and Convex sanitizer share this so a
 * dragged element and a stored element can never disagree about the bounds.
 */
export function clampCanvasBox(box: CanvasBox, minSize = CANVAS_ELEMENT_LIMITS.minSize): CanvasBox {
  const num = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
  const w = Math.min(1, Math.max(minSize, num(box.w, minSize)));
  const h = Math.min(1, Math.max(minSize, num(box.h, minSize)));
  const x = Math.min(1 - w, Math.max(0, num(box.x, 0)));
  const y = Math.min(1 - h, Math.max(0, num(box.y, 0)));
  return { x, y, w, h };
}

/** Paste format: one `label, value` (or `label: value` / tab) row per line. */
export function parseChartRows(text: string): ChartRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,:\t]/, 2);
      const label = (parts[0] ?? "").trim();
      // Number("") is 0, so a header/no-value line would become a phantom bar.
      const rawValue = (parts[1] ?? "").trim();
      const value = rawValue === "" ? Number.NaN : Number(rawValue);
      return { label, value };
    })
    .filter((row) => row.label.length > 0 && Number.isFinite(row.value));
}

export function formatChartRows(rows: ChartRow[]): string {
  return rows.map((row) => `${row.label}, ${row.value}`).join("\n");
}
