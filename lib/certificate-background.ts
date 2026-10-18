/**
 * What an uploaded certificate background actually is.
 *
 * The kind is sniffed from the bytes rather than read from a content type: the
 * type is a claim the uploader makes, and getting it wrong sends the renderer
 * down the wrong path — trying to parse a PNG with a PDF parser, or handing a
 * viewer something it may try to execute. Every consumer decides from the same
 * eight bytes.
 *
 * Plain data with no pdf-lib import, so the browser-side canvas and the
 * node-side renderer can share it without either importing the other's
 * runtime.
 */

/**
 * The three shapes a background can take.
 *
 * `null` from the sniffer means none of them — which the renderer treats as
 * "no usable artwork" and draws the built-in page, and the editor treats as a
 * background it could not draw.
 *
 * Notably absent: SVG, which can carry script and is refused by not being on
 * this list; and GIF/WebP, which pdf-lib cannot embed and which would only
 * produce a certificate that renders differently from what the admin saw.
 */
export type CertificateBackgroundKind = "pdf" | "png" | "jpeg";

/** A background's page, in points. */
export interface BackgroundPageSize {
  width: number;
  height: number;
}

/** `%PDF-` */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** `\x89PNG\r\n\x1a\n` — only the first four bytes are checked, which is what every decoder checks. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** `\xff\xd8\xff` — the JPEG SOI marker plus the first byte of the next marker. */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

/**
 * Identifies a background from its leading bytes, or null when it is neither
 * a PDF nor a PNG nor a JPEG.
 *
 * `null` is a real answer, not an error: it is how a mislabelled upload, a
 * renamed file and a truncated upload are all refused the same way, and how
 * the renderer decides to fall back to the built-in artwork instead of
 * failing a certificate over a bad file.
 */
export function sniffBackgroundKind(
  bytes: Uint8Array,
): CertificateBackgroundKind | null {
  if (startsWith(bytes, PDF_MAGIC)) return "pdf";
  if (startsWith(bytes, PNG_MAGIC)) return "png";
  if (startsWith(bytes, JPEG_MAGIC)) return "jpeg";
  return null;
}

/**
 * The longest edge of the page an image background is laid out on, in points.
 *
 * A PDF arrives with a page size; an image arrives with pixels, and pixels are
 * not a page size. A 2000px-wide PNG and a 1000px-wide one carry the same
 * design, but storing their raw dimensions would print the second one's name
 * at twice the size of the first's — field sizes are absolute in page units,
 * so the page has to be too.
 *
 * 1123.15 is A4 landscape's long edge in points, which puts the built-in font
 * sizes (9–40pt) in the right range for the artwork an admin actually draws.
 */
export const IMAGE_PAGE_LONG_EDGE = 1123.15;

/**
 * The page an image of the given pixel dimensions is scaled onto.
 *
 * Aspect ratio is preserved and the long edge lands on A4 landscape's, so a
 * design drawn at any resolution lays out identically. Both this and the
 * renderer take their page size from the value stored at upload time rather
 * than recomputing it, so a future change here cannot silently move every
 * already-saved placement.
 */
export function imagePageSize(
  widthPx: number,
  heightPx: number,
): BackgroundPageSize {
  const longEdge = Math.max(widthPx, heightPx);
  if (!Number.isFinite(longEdge) || longEdge <= 0) {
    return { width: IMAGE_PAGE_LONG_EDGE, height: IMAGE_PAGE_LONG_EDGE };
  }
  const scale = IMAGE_PAGE_LONG_EDGE / longEdge;
  return { width: widthPx * scale, height: heightPx * scale };
}

/**
 * Reads an image's intrinsic pixel size from its headers alone.
 *
 * This exists because measuring by embedding is not safe. `embedPng` hands the
 * file to a decoder that expands it to RGBA in memory — a 1×1 PNG with a
 * forged 40000×40000 IHDR is a few kilobytes on the wire and several
 * gigabytes of heap before anyone has had the chance to object. Reading the
 * header first is what makes refusing an oversized upload a cheap check
 * instead of an apology after the fact.
 *
 * JPEG is the opposite: pdf-lib copies its compressed bytes without decoding,
 * so this is a consistency measure there rather than a defence. Both parsers
 * return null rather than throwing — a truncated header is an invalid file,
 * and that is the caller's answer either way.
 */
export function readImageSize(
  bytes: Uint8Array,
  kind: "png" | "jpeg",
): { width: number; height: number } | null {
  if (kind === "png") return readPngSize(bytes);
  return readJpegSize(bytes);
}

/** Signature, then a length, then `IHDR`, then width and height. Fixed layout. */
function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  // 8 signature + 4 length + 4 type + 4 width + 4 height.
  if (bytes.length < 24) return null;
  if (
    bytes[12] !== 0x49 || // "IHDR"
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }
  return {
    width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
    height:
      (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23],
  };
}

/** Baseline, progressive and lossless frames all carry their size in an SOFn. */
const SOF_MARKERS = new Set([
  0xffc0, 0xffc1, 0xffc2, 0xffc3, 0xffc5, 0xffc6, 0xffc7, 0xffc8, 0xffc9,
  0xffca, 0xffcb, 0xffcc, 0xffcd, 0xffce, 0xffcf,
]);

function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let pos = 2;
  let marker = 0;
  while (pos + 1 < view.byteLength) {
    marker = view.getUint16(pos);
    pos += 2;
    if (SOF_MARKERS.has(marker)) break;
    // A standalone marker (RSTn, TEM) carries no length to skip.
    if (marker === 0xff01 || (marker >= 0xffd0 && marker <= 0xffd9)) continue;
    if (pos + 1 >= view.byteLength) return null;
    pos += view.getUint16(pos);
  }

  if (!SOF_MARKERS.has(marker)) return null;
  // Past the segment length and the precision byte: height, then width.
  if (pos + 4 >= view.byteLength) return null;
  pos += 2;
  pos += 1;
  const height = view.getUint16(pos);
  const width = view.getUint16(pos + 2);

  if (width <= 0 || height <= 0) return null;
  return { width, height };
}
