/**
 * Certificate field placement — the one definition of where each piece of text
 * sits on the page, and of how that text is set.
 *
 * Plain data with no pdf-lib import, so the renderer (`lib/certificate-pdf.ts`,
 * node runtime) and the live visual editor (a client component) read the same
 * numbers and the same typography. An editor guessing at positions or line
 * breaks the renderer does not use is how "I moved it and nothing happened"
 * happens.
 */

/** A position on the page, as fractions of its width and height. (0,0 = top-left.) */
export interface FieldAnchor {
  /** 0–1 across the page width. */
  x: number;
  /** 0–1 down the page height. */
  y: number;
  size?: number;
  /**
   * The face this field is set in — an id from `CERTIFICATE_FONTS`. Left out,
   * the field's default is used. Deliberately `string` and not the id union:
   * this is read back from the row, where the server has already checked it
   * against the catalogue, and a reader handed a face this build does not know
   * has to render in the default rather than refuse to render at all.
   */
  font?: string;
  /** A preset name (`ink`, `muted`, `white`, `gold`) or `#rrggbb`. */
  color?: string;
  /** Letter case, applied before truncation and wrapping so both match. */
  case?: TextCase;
  /** Line height as a multiple of the font size — 1.2 is the default. */
  lineHeight?: number;
}

/**
 * Wording on the certificate that is not learner data: the title, and the
 * prefixes wrapped around the date and the verify link. Kept apart from
 * `CertificateLayout` because it is copy rather than placement — a field
 * anchor says *where*, this says *what* — and because a layout is a set of
 * positions while this is one small object with its own defaults.
 */
export interface CertificateTexts {
  /** e.g. "CERTIFICATE OF COMPLETION". */
  heading?: string;
  /** e.g. "Completed on", printed before the date. */
  issuedOnPrefix?: string;
  /** e.g. "Verify at", printed before the link. */
  serialPrefix?: string;
}

/** The wording used when a template says nothing, and the editor's reset. */
export const CERTIFICATE_TEXT_DEFAULTS: Required<CertificateTexts> = {
  heading: "CERTIFICATE OF COMPLETION",
  issuedOnPrefix: "Completed on",
  serialPrefix: "Verify at",
};

/**
 * Longest wording accepted, in characters, for any of the three lines.
 *
 * It is copy rather than data, but it is still printed on a document whose
 * margins are fixed, so the editor's inputs and the mutation that stores them
 * have to share one ceiling — a box that accepts 500 characters only for the
 * save to be refused is a way to lose an admin's typing.
 */
export const MAX_TEXT_WORDING = 200;

/**
 * Per-field overrides. A field set to `null` is not drawn at all — that is how a
 * template which already prints its own title avoids getting a second one. A
 * field left out falls back to the defaults for whichever artwork is in play.
 */
export interface CertificateLayout {
  heading?: FieldAnchor | null;
  recipient?: FieldAnchor | null;
  course?: FieldAnchor | null;
  issuedOn?: FieldAnchor | null;
  issuer?: FieldAnchor | null;
  serial?: FieldAnchor | null;
}

export type CertificateFieldKey = keyof CertificateLayout;

/**
 * The font faces a certificate may be set in — six, deliberately: a sans for
 * labels and body copy, a serif for the display lines, and a mono for the
 * verify link. A short list keeps an admin choosing between three looks
 * rather than auditing a type specimen.
 *
 * Every face is a subsetted woff2 of about 22KB, shipped twice over: as a file
 * under `public/fonts` for the on-screen editor, and base64 in
 * `lib/certificate-fonts-data.ts` for the node renderer, which cannot fetch.
 */
export type CertificateFontId =
  | "inter"
  | "inter-bold"
  | "cormorant"
  | "cormorant-bold"
  | "cormorant-italic"
  | "jetbrains";

/** Letter case, applied before truncation and wrapping. */
export type TextCase = "none" | "upper" | "lower" | "title";

/** Which of the four colour presets (or a `#rrggbb`) a field is drawn in. */
export type CertificateColorRole = "ink" | "muted" | "white" | "gold";

/** A colour as 0–1 channels, the form pdf-lib wants. */
export interface RgbTriple {
  r: number;
  g: number;
  b: number;
}

/**
 * The colours a field may print in, defined once.
 *
 * They live here rather than in `certificate-pdf.ts` because the visual editor
 * paints the same text on screen; if the two disagreed, an admin would be
 * matching ink on a canvas to a certificate that prints in another shade.
 * White and gold exist for artwork dark enough that ink would disappear.
 */
export const CERTIFICATE_INK: RgbTriple = {
  r: 31 / 255,
  g: 27 / 255,
  b: 29 / 255,
};
export const CERTIFICATE_MUTED: RgbTriple = {
  r: 107 / 255,
  g: 101 / 255,
  b: 112 / 255,
};

export const CERTIFICATE_COLORS: Record<CertificateColorRole, RgbTriple> = {
  ink: CERTIFICATE_INK,
  muted: CERTIFICATE_MUTED,
  white: { r: 1, g: 1, b: 1 },
  gold: { r: 174 / 255, g: 134 / 255, b: 33 / 255 },
};

/** The presets, in the order the colour picker offers them. */
export const CERTIFICATE_COLOR_PRESETS: ReadonlyArray<{
  id: CertificateColorRole;
  label: string;
}> = [
  { id: "ink", label: "Ink" },
  { id: "muted", label: "Muted" },
  { id: "white", label: "White" },
  { id: "gold", label: "Gold" },
];

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True for a preset name or a literal `#rgb`/`#rrggbb`. */
export function isValidColor(value: string): boolean {
  return value in CERTIFICATE_COLORS || HEX_COLOR.test(value);
}

/**
 * Resolves a stored colour to channels. Anything unrecognised falls back to
 * `fallback` rather than throwing: a certificate that prints in the wrong ink
 * is a defect, but one that refuses to generate is an outage.
 */
export function resolveColor(
  value: string | undefined,
  fallback: CertificateColorRole = "ink",
): RgbTriple {
  if (value && value in CERTIFICATE_COLORS) {
    return CERTIFICATE_COLORS[value as CertificateColorRole];
  }
  if (value && HEX_COLOR.test(value)) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    return {
      r: parseInt(full.slice(0, 2), 16) / 255,
      g: parseInt(full.slice(2, 4), 16) / 255,
      b: parseInt(full.slice(4, 6), 16) / 255,
    };
  }
  return CERTIFICATE_COLORS[fallback];
}

/** The same colour, as a CSS value, for the on-screen editor. */
export function rgbToCss(color: RgbTriple): string {
  const c = (v: number) => Math.round(v * 255);
  return `rgb(${c(color.r)}, ${c(color.g)}, ${c(color.b)})`;
}

/**
 * The font catalogue: the six faces a certificate may be set in.
 *
 * `advance` is the average advance width of the face in em, measured from the
 * shipped file rather than assumed — monospace lands on exactly 0.6, which is
 * how the measurement was validated. Wrapping is calculated from it, so the
 * canvas and the PDF break a line in the same place; guessing one shared ratio
 * would make the preview wrap somewhere the print does not.
 */
export interface CertificateFontFace {
  id: CertificateFontId;
  label: string;
  /** The name the editor's `@font-face` declares. */
  family: string;
  /** The full stack the editor paints with, loaded family first. */
  css: string;
  weight: 400 | 700;
  style: "normal" | "italic";
  advance: number;
  /** File under `public/fonts`; also the key of the renderer's base64 copy. */
  file: string;
}

export const CERTIFICATE_FONTS: Record<CertificateFontId, CertificateFontFace> = {
  inter: {
    id: "inter",
    label: "Inter",
    family: "Inter",
    css: '"Inter", Helvetica, Arial, sans-serif',
    weight: 400,
    style: "normal",
    advance: 0.4821,
    file: "inter-400.woff2",
  },
  "inter-bold": {
    id: "inter-bold",
    label: "Inter Bold",
    family: "Inter",
    css: '"Inter", Helvetica, Arial, sans-serif',
    weight: 700,
    style: "normal",
    advance: 0.4991,
    file: "inter-700.woff2",
  },
  cormorant: {
    id: "cormorant",
    label: "Cormorant Garamond",
    family: "Cormorant Garamond",
    css: '"Cormorant Garamond", "Times New Roman", serif',
    weight: 400,
    style: "normal",
    advance: 0.4128,
    file: "cormorant-400.woff2",
  },
  "cormorant-bold": {
    id: "cormorant-bold",
    label: "Cormorant Garamond Bold",
    family: "Cormorant Garamond",
    css: '"Cormorant Garamond", "Times New Roman", serif',
    weight: 700,
    style: "normal",
    advance: 0.4183,
    file: "cormorant-700.woff2",
  },
  "cormorant-italic": {
    id: "cormorant-italic",
    label: "Cormorant Garamond Italic",
    family: "Cormorant Garamond",
    css: '"Cormorant Garamond", "Times New Roman", serif',
    weight: 400,
    style: "italic",
    advance: 0.3666,
    file: "cormorant-400i.woff2",
  },
  jetbrains: {
    id: "jetbrains",
    label: "JetBrains Mono",
    family: "JetBrains Mono",
    css: '"JetBrains Mono", ui-monospace, monospace',
    weight: 400,
    style: "normal",
    advance: 0.6,
    file: "jetbrains-400.woff2",
  },
};

/** The catalogue, in the order the font picker offers it. */
export const CERTIFICATE_FONT_LIST: ReadonlyArray<CertificateFontFace> =
  Object.values(CERTIFICATE_FONTS);

/**
 * A face for an id the layout does not know — a template written by an older
 * build, or a hand-edited row. Returns the default sans rather than throwing,
 * because a certificate that renders in the wrong face is a defect while one
 * that fails to render is an outage.
 */
export function certificateFont(id: string | undefined): CertificateFontFace {
  return (
    (id ? CERTIFICATE_FONTS[id as CertificateFontId] : undefined) ??
    CERTIFICATE_FONTS.inter
  );
}

/**
 * The `@font-face` rules the editor injects. Font files are served from
 * `/public/fonts`, which the CSP's `font-src 'self'` already allows.
 */
export const CERTIFICATE_FONT_FACES_CSS: string = CERTIFICATE_FONT_LIST.map(
  (face) =>
    `@font-face{font-family:"${face.family}";src:url("/fonts/${face.file}") format("woff2");font-weight:${face.weight};font-style:${face.style};font-display:swap;}`,
).join("\n");

/** What the six fields draw, in the order a reader meets them on the page. */
export const CERTIFICATE_FIELDS: ReadonlyArray<{
  key: CertificateFieldKey;
  label: string;
  font: CertificateFontId;
  color: CertificateColorRole;
  /** Stand-in text for the editor canvas and the sample PDF. */
  sample: string;
  /** True when the renderer wraps the field onto extra lines. */
  wrap?: boolean;
  /** Characters kept before drawing — a long value is truncated here. */
  maxLength?: number;
}> = [
  {
    key: "heading",
    label: "Heading",
    font: "inter-bold",
    color: "ink",
    sample: CERTIFICATE_TEXT_DEFAULTS.heading,
  },
  {
    key: "recipient",
    label: "Learner name",
    font: "cormorant-italic",
    color: "ink",
    sample: "Adaeze Okonkwo",
    // The PDF truncates rather than overflowing the page, so the canvas has to
    // truncate the same way or a long name would sit wider on screen than it
    // prints.
    maxLength: 46,
  },
  {
    key: "course",
    label: "Course title",
    font: "inter-bold",
    color: "ink",
    sample: "Introduction to Product Design",
    wrap: true,
  },
  {
    key: "issuedOn",
    label: "Completion date",
    font: "inter",
    color: "muted",
    sample: `${CERTIFICATE_TEXT_DEFAULTS.issuedOnPrefix} 9 March 2026`,
  },
  {
    key: "issuer",
    label: "Issuer name",
    font: "inter-bold",
    color: "ink",
    sample: "Dr. Bambo Adeyemi",
  },
  {
    key: "serial",
    label: "Certificate ID / verify link",
    font: "inter",
    color: "muted",
    sample: `${CERTIFICATE_TEXT_DEFAULTS.serialPrefix} https://glypha.learn/verify/GL-2026-3F9A1C77`,
  },
];

export function certificateField(
  key: CertificateFieldKey,
): (typeof CERTIFICATE_FIELDS)[number] {
  const field = CERTIFICATE_FIELDS.find((f) => f.key === key);
  if (!field) throw new Error(`Unknown certificate field: ${key}`);
  return field;
}

/** Fraction of the page width the renderer keeps as a margin for wrapped text. */
export const SAFE_WIDTH_RATIO = 0.8;

/** Height of a drawn line, as a multiple of the font size. */
export const LINE_HEIGHT_RATIO = 1.2;

/**
 * The line height range a field may be set to.
 *
 * Defined here rather than at each control or in the Convex validator, because
 * the editor's number box, the canvas that paints with the value and the
 * mutation that rejects it have to share one idea of legal — a slider that can
 * reach 3 while the server refuses past 2.5 is a way to lose work.
 */
export const LINE_HEIGHT_MIN = 0.8;
export const LINE_HEIGHT_MAX = 2.5;

/**
 * Fallback placement for a certificate drawn with **no** template, where we own
 * the whole page and must supply a title ourselves.
 */
export const DEFAULT_LAYOUT: Required<CertificateLayout> = {
  heading: { x: 0.5, y: 0.14, size: 30 },
  recipient: { x: 0.5, y: 0.42, size: 40 },
  course: { x: 0.5, y: 0.58, size: 22 },
  issuedOn: { x: 0.5, y: 0.72, size: 12 },
  issuer: { x: 0.5, y: 0.85, size: 14 },
  serial: { x: 0.5, y: 0.95, size: 9 },
};

/**
 * Fallback placement when a **template** is in play.
 *
 * A designed background usually already contains the title, the "this certifies
 * that" line, and the signature rules — drawing our own heading on top of that
 * artwork is what produces overlapping text. So the heading is suppressed by
 * default and the template owns it. Every other field sits slightly higher for
 * the same reason. An admin can still opt any field back in by setting an
 * explicit position.
 */
export const TEMPLATE_DEFAULTS: Required<CertificateLayout> = {
  heading: null,
  recipient: { x: 0.5, y: 0.38, size: 40 },
  course: { x: 0.5, y: 0.54, size: 22 },
  issuedOn: { x: 0.5, y: 0.68, size: 12 },
  issuer: { x: 0.5, y: 0.82, size: 14 },
  serial: { x: 0.5, y: 0.93, size: 9 },
};

/** The position a field actually renders at: the override, else the default. */
export function effectiveAnchor(
  key: CertificateFieldKey,
  layout: CertificateLayout | null | undefined,
  defaults: Required<CertificateLayout>,
): FieldAnchor | null {
  const value = layout?.[key];
  return value === null ? null : (value ?? defaults[key]);
}

/**
 * Renders an anchor as the admin types it: `x,y` or `x,y,size`. `null` becomes
 * `off` (the word that suppresses a field) and an absent anchor becomes the
 * empty string, which means "use the default".
 */
export function formatAnchor(anchor: FieldAnchor | null | undefined): string {
  if (anchor === null) return "off";
  if (!anchor) return "";
  const base = `${anchor.x},${anchor.y}`;
  return anchor.size === undefined ? base : `${base},${anchor.size}`;
}

/**
 * Parses one placement box. Returns:
 *  - `undefined` — blank, so fall back to the default
 *  - `null` — `off`, keep the field off the certificate
 *  - an anchor
 *
 * Throws on anything else rather than silently dropping it: a mistyped position
 * that quietly falls back to the default is worse than a message saying so.
 *
 * Syntax only. Whether an anchor is on the page (0–1) is enforced server-side by
 * `certificateTemplates.updateTemplateLayout`, so the rule has one home.
 */
export function parseAnchor(
  raw: string,
): FieldAnchor | null | undefined {
  const text = raw.trim();
  if (text === "") return undefined;
  if (text.toLowerCase() === "off") return null;

  const parts = text.split(",");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`“${text}” is not a position — use x,y or x,y,size`);
  }

  const [x, y, size] = parts.map((part) => Number(part.trim()));
  if (Number.isNaN(x) || Number.isNaN(y) || (parts.length === 3 && Number.isNaN(size))) {
    throw new Error(`“${text}” is not a position — use x,y or x,y,size`);
  }

  return { x, y, size: parts.length === 3 ? size : undefined };
}

/**
 * Wraps text to a character budget.
 *
 * Character-based rather than measurement-based on purpose: pdf-lib measures
 * with the embedded standard font, and reproducing that in the browser would
 * mean shipping a font metric table to guess at a result the PDF already knows.
 * A budget derived from the font size keeps the two in step exactly, which is
 * what lets the visual editor promise "what you see is what prints".
 */
export function wrapText(text: string, maxChars: number): string[] {
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

/**
 * Applies a letter-case mode.
 *
 * Run before truncation and wrapping, never after: uppercasing a line that has
 * already been wrapped would let a narrow face grow past the margin, and
 * casing after truncation would count characters the reader never sees. Both
 * renderers call this exact function, so they cannot drift.
 */
export function applyCase(text: string, mode: TextCase | undefined): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      // First letter of each word upper, the rest lower. A leading bracket or
      // quote is skipped rather than left holding a lowercase word, so
      // "(certificate" becomes "(Certificate".
      return text
        .toLowerCase()
        .split(/(\s+)/)
        .map((token) =>
          token.replace(
            /^([^A-Za-zÀ-ɏ]*)([A-Za-zÀ-ɏ])/,
            (_m, prefix: string, letter: string) => prefix + letter.toUpperCase(),
          ),
        )
        .join("");
    default:
      return text;
  }
}

/**
 * The character budget the renderer wraps a given field to.
 *
 * `advance` is the face's measured average width in em. The default keeps the
 * estimate wrapping used before per-field fonts existed (Helvetica's real
 * mixed-case average is about 0.448, so 0.5 was a shade conservative), which
 * is what keeps existing callers and their tests on the same line breaks.
 */
export function wrapCharBudget(
  pageWidth: number,
  size: number,
  advance = 0.5,
): number {
  return Math.max(20, Math.floor((pageWidth * SAFE_WIDTH_RATIO) / (size * advance)));
}

export interface FieldLinesOptions {
  /** The face to measure for. Falls back to the field's own default face. */
  font?: CertificateFontId;
  /** Letter case to apply first. Left out, the text is used as written. */
  case?: TextCase;
}

/**
 * The lines a field draws: cased, truncated, then wrapped if it is a wrapping
 * field — in that order, always that order.
 *
 * The canvas calls this so it stacks words exactly where the PDF will, and so
 * a field set to UPPER CASE clips at the same character in both. It is the one
 * place those three rules are applied; `drawCenteredWrapped` in the renderer
 * used to wrap without truncating or casing, which is how a preview and a
 * print can quietly disagree.
 */
export function certificateFieldLines(
  key: CertificateFieldKey,
  text: string,
  pageWidth: number,
  size: number,
  options: FieldLinesOptions = {},
): string[] {
  const field = certificateField(key);
  const face = certificateFont(options.font ?? field.font);
  const cased = applyCase(text, options.case);
  const clipped = field.maxLength ? cased.slice(0, field.maxLength) : cased;
  return field.wrap
    ? wrapText(clipped, wrapCharBudget(pageWidth, size, face.advance))
    : [clipped];
}

/**
 * Correction, in ems, between where the renderer puts a line and where a CSS
 * line box puts it.
 *
 * pdf-lib draws with the *baseline* at `y`, and `drawCentered` sets that
 * baseline a full font size below the anchor, so a line's cap height lands
 * about 0.28em under the anchor. A CSS box with line-height 1.2 centres its
 * glyphs in the line box, putting the cap height about 0.23em under the box
 * top. Adding the difference stops the canvas preview sitting a hair above
 * where the text actually prints — visible at the sizes a name is set in.
 */
export const CANVAS_BASELINE_NUDGE = 0.05;

/**
 * The font sizes a field may be set to, in points.
 *
 * The canvas's drag handle and the panel's size input clamp to this same range,
 * because a handle that can reach 240pt next to a box that refuses it is a way
 * to lose work rather than a way to express a limit.
 */
export const MIN_FIELD_SIZE = 4;
export const MAX_FIELD_SIZE = 200;
