/**
 * SCORM package ceilings, in one place.
 *
 * Split out of `zip.ts` because the instructor uploader needs the archive cap
 * to reject a file before it is POSTed, and `zip.ts` imports JSZip — which has
 * no business in a browser bundle.
 */
export const SCORM_LIMITS = {
  /** A single extracted file. */
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
  /** Everything extracted, summed. The Zip Bomb defence. */
  MAX_TOTAL_UNCOMPRESSED_BYTES: 500 * 1024 * 1024,
  /** Entries in the archive, including directories. */
  MAX_FILE_COUNT: 10_000,
  /** The uploaded `.zip` itself. Compression can only shrink, so a legitimate
   * archive is never larger than the package it expands to. */
  MAX_ARCHIVE_BYTES: 500 * 1024 * 1024,
} as const;
