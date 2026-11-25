import JSZip from "jszip";
import { isSafeRelativePath, parseScormManifest, type ParsedScormManifest } from "./manifest";
import { getMimeType } from "./mime";

export const SCORM_LIMITS = {
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100 MB per file
  MAX_TOTAL_UNCOMPRESSED_BYTES: 500 * 1024 * 1024, // 500 MB total package
  MAX_FILE_COUNT: 10_000,
} as const;

export interface ExtractedScormFile {
  path: string;
  data: Uint8Array;
  contentType: string;
  sizeBytes: number;
}

export interface ExtractedScormPackage {
  manifest: ParsedScormManifest;
  files: ExtractedScormFile[];
  totalSize: number;
}

/**
 * Normalizes a zip entry relative path and checks for Zip Slip attempts.
 * Returns normalized clean relative path or throws an error.
 */
export function sanitizeZipEntryPath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== "string") {
    throw new Error("Invalid archive entry: missing path");
  }

  // Replace backslashes with forward slashes
  let clean = rawPath.replace(/\\/g, "/");

  if (clean.startsWith("/")) {
    throw new Error(`Malicious archive entry path detected (Zip Slip): "${rawPath}"`);
  }

  if (clean.endsWith("/")) {
    // Directory entry
    return "";
  }

  // Strip leading dot-slash if present
  clean = clean.replace(/^(\.\/)+/, "");

  // Reject any Zip Slip traversal
  if (!isSafeRelativePath(clean)) {
    throw new Error(`Malicious archive entry path detected (Zip Slip): "${rawPath}"`);
  }

  // Additional check: no segment may be ".." or "."
  const segments = clean.split("/");
  for (const seg of segments) {
    if (seg === ".." || seg === ".") {
      throw new Error(`Directory traversal in archive entry: "${rawPath}"`);
    }
  }

  return clean;
}

/**
 * Unpacks and validates a SCORM zip archive buffer.
 */
export async function extractScormArchive(
  zipBuffer: ArrayBuffer | Uint8Array
): Promise<ExtractedScormPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (err) {
    throw new Error(
      `Corrupt or invalid ZIP archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const entries = Object.keys(zip.files);
  if (entries.length === 0) {
    throw new Error("SCORM archive is empty");
  }

  if (entries.length > SCORM_LIMITS.MAX_FILE_COUNT) {
    throw new Error(
      `SCORM archive exceeds maximum allowed file count (${SCORM_LIMITS.MAX_FILE_COUNT})`
    );
  }

  let manifestXml: string | null = null;
  let totalSize = 0;
  const files: ExtractedScormFile[] = [];
  const normalizedFilePaths = new Set<string>();

  // First pass: locate and extract imsmanifest.xml, validate entry paths and sizes
  for (const entryName of entries) {
    const zipEntry = zip.files[entryName] as JSZip.JSZipObject & { unsafeOriginalName?: string };
    if (zipEntry.dir) continue;

    const rawPath = zipEntry.unsafeOriginalName || entryName;
    const cleanPath = sanitizeZipEntryPath(rawPath);
    if (!cleanPath) continue;

    // Check for manifest at root
    if (cleanPath.toLowerCase() === "imsmanifest.xml") {
      manifestXml = await zipEntry.async("text");
    }
  }

  if (!manifestXml) {
    throw new Error("Invalid SCORM package: imsmanifest.xml is missing from archive root");
  }

  // Parse manifest
  const manifest = parseScormManifest(manifestXml);

  // Second pass: extract files with size verification
  for (const entryName of entries) {
    const zipEntry = zip.files[entryName] as JSZip.JSZipObject & { unsafeOriginalName?: string };
    if (zipEntry.dir) continue;

    const rawPath = zipEntry.unsafeOriginalName || entryName;
    const cleanPath = sanitizeZipEntryPath(rawPath);
    if (!cleanPath) continue;

    const data = await zipEntry.async("uint8array");
    const sizeBytes = data.byteLength;

    if (sizeBytes > SCORM_LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File "${cleanPath}" exceeds maximum allowed file size of ${SCORM_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`
      );
    }

    totalSize += sizeBytes;
    if (totalSize > SCORM_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Total uncompressed archive size exceeds limit of ${SCORM_LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES / 1024 / 1024}MB (Zip Bomb defense)`
      );
    }

    normalizedFilePaths.add(cleanPath);
    files.push({
      path: cleanPath,
      data,
      contentType: getMimeType(cleanPath),
      sizeBytes,
    });
  }

  // Verify that the manifest entry point exists among archive files
  // Strip any query string or hash from entry point for checking
  const cleanEntryPoint = manifest.entryPoint.split(/[?#]/)[0];
  if (!normalizedFilePaths.has(cleanEntryPoint)) {
    // Also try case-insensitive match fallback
    const lowerTarget = cleanEntryPoint.toLowerCase();
    const foundCaseInsensitive = Array.from(normalizedFilePaths).find(
      (p) => p.toLowerCase() === lowerTarget
    );
    if (!foundCaseInsensitive) {
      throw new Error(
        `Invalid SCORM package: entry point "${manifest.entryPoint}" specified in imsmanifest.xml was not found in archive`
      );
    }
  }

  return {
    manifest,
    files,
    totalSize,
  };
}
