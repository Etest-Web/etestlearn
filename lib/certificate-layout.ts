/**
 * Certificate field placement — the one definition of where each piece of text
 * sits on the page.
 *
 * Plain data with no pdf-lib import, so the renderer (`lib/certificate-pdf.ts`,
 * node runtime) and the admin placement editor (a client component) read the
 * same numbers. An editor guessing at positions the renderer does not use is
 * how "I moved it and nothing happened" happens.
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

/** The six fields, in the order a reader meets them on the finished page. */
export const CERTIFICATE_FIELDS: ReadonlyArray<{
  key: CertificateFieldKey;
  label: string;
}> = [
  { key: "heading", label: "Heading" },
  { key: "recipient", label: "Learner name" },
  { key: "course", label: "Course title" },
  { key: "issuedOn", label: "Completion date" },
  { key: "issuer", label: "Issuer name" },
  { key: "serial", label: "Certificate ID / verify link" },
];

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
