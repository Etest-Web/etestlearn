/**
 * OpenGraph card palette, canvas and font loading.
 * ================================================
 *
 * Why a separate module
 * ---------------------
 * `next/og` renders with satori, which is NOT a browser. Two consequences that
 * this file exists to absorb:
 *
 *   1. **satori cannot parse `oklch()`.** Every token in `app/globals.css` is
 *      oklch, so a card cannot read the design system directly — it would throw
 *      on the first colour. The values below are the sRGB encodings of the real
 *      tokens, produced by `scripts/oklch-to-hex.py` rather than by eye. Two of
 *      them can be cross-checked against comments already in the codebase:
 *      `--brand` → `#945DA3` (the `themeColor` note in `app/layout.tsx:42`) and
 *      `--brand-ink` → `#6C3C78` (the note at `app/globals.css:129`). If those
 *      stop agreeing, the tokens moved and this file needs re-running.
 *
 *   2. **satori needs real font bytes**, not a CSS font-family string. The
 *      weights are committed as static TTFs and read off disk — see
 *      `scripts/build-og-fonts.py` for why the obvious sources all fail
 *      (woff2, and latin subsets that contain no naira sign).
 *
 * Nothing here is Next-specific, so it stays testable in the node vitest env.
 */

import { readFile } from "node:fs/promises";
import type { ImageResponse } from "next/og";

/**
 * The font descriptor `next/og` accepts.
 *
 * Derived from the constructor rather than imported: this version of Next does
 * not export a `FontOptions`/`FontData` type from `next/og`, and pinning our
 * own copy would drift from the shape satori actually validates. The import is
 * type-only, so nothing from `next/og` is loaded at runtime here.
 */
type ImageResponseOptions = ConstructorParameters<typeof ImageResponse>[1];
export type OgFont = NonNullable<
  NonNullable<ImageResponseOptions>["fonts"]
>[number];

/** The OG/Twitter safe canvas. 1200×630 is 1.91:1, which both Meta and X crop
 * to. A taller image is centre-cropped and lands on nothing. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * Palette — sRGB encodings of the design tokens.
 *
 * `brand` is the mark itself (fills, chips); `brandInk` is the deepened purple
 * the design system uses for text ON light brand surfaces (8.22:1 on white);
 * `brandSoft` is the dark-mode step of the same hue, used here as the light
 * accent on a brand fill.
 */
export const ogPalette = {
  brand: "#945DA3",
  brandInk: "#6C3C78",
  brandSoft: "#C090CD",
  surface: "#FEFBFF",
  ink: "#0C090D",
  muted: "#F6F1F8",
  white: "#FFFFFF",
} as const;

/**
 * A readable white for body copy on the brand fill.
 *
 * Pure white on `--brand` is ~4.8:1 — fine for the large title, thin for a
 * 22px subtitle. `rgba(255,255,255,0.82)` over `#945DA3` lands near 7:1.
 */
export const ogOnBrandSubtle = "rgba(255, 255, 255, 0.82)";

/** The display face. Archivo, not Outfit: it is the design system's
 * `--font-display` (`app/globals.css:12`) *and* the only site face whose
 * character set contains U+20A6 (₦) — `next/og`'s bundled Noto Sans fallback
 * is latin-subset and does not, so an Outfit card would fail to find a glyph
 * for every priced course. */
export const OG_FONT_FAMILY = "Archivo";

const FONT_FILES: Record<string, string> = {
  "400": "Archivo-Regular.ttf",
  "600": "Archivo-SemiBold.ttf",
};

/**
 * Reads the two weights off disk, once per isolate.
 *
 * `new URL(..., import.meta.url)` rather than `process.cwd()`-relative paths:
 * it is the form Next's output-file tracing statically follows, so the TTFs
 * are pulled into the deployed bundle instead of being assumed to sit next to
 * a working directory that does not exist on a serverless function.
 * `next.config.ts` additionally lists them in `outputFileTracingIncludes` as a
 * belt-and-braces measure — a missing font is not a degraded card, it is every
 * card 500ing.
 */
let fontCache: Promise<OgFont[]> | null = null;

export function loadOgFonts(): Promise<OgFont[]> {
  fontCache ??= Promise.all(
    Object.entries(FONT_FILES).map(async ([weight, file]) => ({
      name: OG_FONT_FAMILY,
      data: await readFile(new URL(`../assets/fonts/${file}`, import.meta.url)),
      weight: Number(weight) as OgFont["weight"],
      style: "normal" as const,
    })),
  );
  return fontCache;
}

/**
 * Hard-caps text, collapsing runs of whitespace first.
 *
 * satori wraps, but a long unbroken token (a course title full of hyphenated
 * jargon, a URL) has no break point and overflows the card instead. The cap is
 * the defence; the ellipsis keeps the truncation from looking like a bug.
 *
 * `max` is measured in code points so a title containing an emoji or a
 * non-Latin character cannot be cut in half into a replacement glyph.
 */
export function clampOgText(raw: string | undefined | null, max: number): string {
  if (!raw) return "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const points = [...text];
  return `${points.slice(0, max - 1).join("").trimEnd()}…`;
}
