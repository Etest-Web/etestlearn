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
}

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

/** Which of the three embedded standard fonts a field is drawn in. */
export type CertificateFontRole = "sans" | "sans-bold" | "serif-italic";

/** Which of the two text colours a field is drawn in. */
export type CertificateColorRole = "ink" | "muted";

/** A colour as 0–1 channels, the form pdf-lib wants. */
export interface RgbTriple {
  r: number;
  g: number;
  b: number;
}

/**
 * The two colours the renderer uses, defined once.
 *
 * They live here rather than in `certificate-pdf.ts` because the visual editor
 * paints the same text on screen; if the two disagreed, an admin would be
 * matching ink on a canvas to a certificate that prints in another shade.
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
};

/** The same colour, as a CSS value, for the on-screen editor. */
export function rgbToCss(color: RgbTriple): string {
  const c = (v: number) => Math.round(v * 255);
  return `rgb(${c(color.r)}, ${c(color.g)}, ${c(color.b)})`;
}

/**
 * CSS stacks standing in for the three standard fonts pdf-lib embeds. The
 * substitutes are the closest metric-compatible faces a browser is guaranteed
 * to have, which is what keeps the on-screen preview the right width.
 */
export const CERTIFICATE_FONT_CSS: Record<CertificateFontRole, string> = {
  sans: 'Helvetica, "Helvetica Neue", Arial, sans-serif',
  "sans-bold": 'Helvetica, "Helvetica Neue", Arial, sans-serif',
  "serif-italic": '"Times New Roman", Times, serif',
};

export const CERTIFICATE_FONT_WEIGHT: Record<CertificateFontRole, number> = {
  sans: 400,
  "sans-bold": 700,
  "serif-italic": 400,
};

export const CERTIFICATE_FONT_STYLE: Record<CertificateFontRole, string> = {
  sans: "normal",
  "sans-bold": "normal",
  "serif-italic": "italic",
};

/** What the six fields draw, in the order a reader meets them on the page. */
export const CERTIFICATE_FIELDS: ReadonlyArray<{
  key: CertificateFieldKey;
  label: string;
  font: CertificateFontRole;
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
    font: "sans-bold",
    color: "ink",
    sample: "CERTIFICATE OF COMPLETION",
  },
  {
    key: "recipient",
    label: "Learner name",
    font: "serif-italic",
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
    font: "sans-bold",
    color: "ink",
    sample: "Introduction to Product Design",
    wrap: true,
  },
  {
    key: "issuedOn",
    label: "Completion date",
    font: "sans",
    color: "muted",
    sample: "Completed on 9 March 2026",
  },
  {
    key: "issuer",
    label: "Issuer name",
    font: "sans-bold",
    color: "ink",
    sample: "Dr. Bambo Adeyemi",
  },
  {
    key: "serial",
    label: "Certificate ID / verify link",
    font: "sans",
    color: "muted",
    sample: "Verify at https://glypha.learn/verify/GL-2026-3F9A1C77",
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

/** The character budget the renderer wraps a given field to. */
export function wrapCharBudget(pageWidth: number, size: number): number {
  // 0.5em is the average advance width of Helvetica at mixed case — the same
  // estimate the renderer has always used.
  return Math.max(20, Math.floor((pageWidth * SAFE_WIDTH_RATIO) / (size * 0.5)));
}

/**
 * The lines a field draws: truncated first, then wrapped if it is a wrapping
 * field. The canvas calls this so it stacks words exactly where the PDF will.
 */
export function certificateFieldLines(
  key: CertificateFieldKey,
  text: string,
  pageWidth: number,
  size: number,
): string[] {
  const field = certificateField(key);
  const clipped = field.maxLength ? text.slice(0, field.maxLength) : text;
  return field.wrap
    ? wrapText(clipped, wrapCharBudget(pageWidth, size))
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
