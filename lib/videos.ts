/**
 * Pure policy for the B2 staged-upload video pipeline.
 *
 * No Convex imports on purpose: the backend actions
 * (`convex/videoStorage.ts`), the client uploader
 * (`components/video-uploader.tsx`) and the guarded transitions in
 * `convex/videoAssets.ts` all read the same numbers from here, so a cap
 * loosened on one side can never silently contradict another side. Side
 * effects live in the modules above; this file only decides.
 */

/** Raw upload ceiling: 2 GiB. The transcode worker consumes the whole part stream later. */
export const MAX_RAW_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/** Every multipart part is one fixed-size slice (the final part may be short). */
export const RAW_UPLOAD_PART_SIZE_BYTES = 10 * 1024 * 1024;

/** How many parts one `signParts` call may presign — keeps a presign response bounded. */
export const MAX_PARTS_PER_SIGN = 50;

/** Presigned part PUT expiry: 1 hour, refreshed per batch. */
export const SIGN_URL_TTL_SECONDS = 3600;

/** S3 multipart hard cap on parts per upload. */
export const MAX_RAW_UPLOAD_PARTS = 10_000;

/** At most this many `awaiting_upload` assets may exist for one instructor. */
export const MAX_IN_FLIGHT_UPLOADS_PER_OWNER = 2;

/** Total declared bytes across one instructor's in-flight uploads. */
export const MAX_IN_FLIGHT_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

/** Extra presigned part URLs beyond `partCount`, so retries cannot overrun. */
export const PRESIGN_URL_SLACK = 50;

/** Content types a raw upload accepts at initiate time. */
export const ALLOWED_RAW_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

/** Extension fallback when the browser reports an empty/unknown MIME type. */
const EXTENSION_CONTENT_TYPES: Readonly<
  Record<string, (typeof ALLOWED_RAW_CONTENT_TYPES)[number]>
> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

export function isAllowedRawContentType(contentType: string): boolean {
  return (ALLOWED_RAW_CONTENT_TYPES as readonly string[]).includes(contentType);
}

/**
 * Resolve the upload's content type from the declared type plus the file
 * name. Returns the canonical allowed type, or null when neither the declared
 * type nor the extension maps to one — the caller refuses those uploads.
 */
export function normalizeRawContentType(contentType: string, fileName: string): string | null {
  const declared = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if (isAllowedRawContentType(declared)) return declared;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_CONTENT_TYPES[ext] ?? null;
}

/** How many fixed-size parts a body of `sizeBytes` needs. */
export function rawPartCount(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / RAW_UPLOAD_PART_SIZE_BYTES));
}

/** Byte length of one part; the final part is short when the body does not divide evenly. */
export function uploadPartSize(sizeBytes: number, partNumber: number): number {
  const start = (partNumber - 1) * RAW_UPLOAD_PART_SIZE_BYTES;
  return Math.min(RAW_UPLOAD_PART_SIZE_BYTES, sizeBytes - start);
}

/**
 * A resumed upload must continue the exact file the draft was created for.
 * `lastModified` is the File API's millisecond timestamp — enough to tell two
 * different recordings apart without hashing gigabytes in the browser.
 */
export interface UploadFingerprint {
  sizeBytes: number;
  lastModified: number;
}

export function fingerprintError(
  declared: UploadFingerprint,
  presented: UploadFingerprint,
): string | null {
  if (!Number.isSafeInteger(presented.sizeBytes) || presented.sizeBytes <= 0) {
    return "Invalid upload size";
  }
  if (!Number.isSafeInteger(presented.lastModified) || presented.lastModified <= 0) {
    return "Invalid file fingerprint";
  }
  if (
    declared.sizeBytes !== presented.sizeBytes ||
    declared.lastModified !== presented.lastModified
  ) {
    return "This is a different file than the upload was started with";
  }
  return null;
}

/**
 * Validate one `signParts` batch. Range is checked against the server's own
 * part count, not a client-supplied one, so a crafted number can never reach
 * B2's presigner.
 */
export function partNumbersError(
  partNumbers: readonly number[],
  partCount: number,
  maxPerCall = MAX_PARTS_PER_SIGN,
): string | null {
  if (partNumbers.length === 0) return "No parts requested";
  if (partNumbers.length > maxPerCall) {
    return `Too many parts requested (max ${maxPerCall})`;
  }
  if (!Number.isInteger(partCount) || partCount < 1) return "Upload has no parts";
  const seen = new Set<number>();
  for (const partNumber of partNumbers) {
    if (!Number.isInteger(partNumber) || partNumber < 1) return "Invalid part number";
    if (partNumber > partCount) return `Part number out of range: ${partNumber}`;
    if (seen.has(partNumber)) return "Duplicate part number";
    seen.add(partNumber);
  }
  return null;
}

/** Total presigned part URLs one asset may ever be issued. */
export function presignBudget(partCount: number): number {
  return partCount + PRESIGN_URL_SLACK;
}

export function presignBudgetError(
  alreadyIssued: number,
  requested: number,
  partCount: number,
): string | null {
  if (!Number.isInteger(requested) || requested <= 0) return "No parts requested";
  if (alreadyIssued + requested > presignBudget(partCount)) {
    return "Too many presigned part URLs for this upload";
  }
  return null;
}

/** How many `awaiting_upload` rows and declared bytes one owner may hold. */
export function inFlightUploadError(
  activeUploads: number,
  activeBytes: number,
  incomingBytes: number,
): string | null {
  if (activeUploads >= MAX_IN_FLIGHT_UPLOADS_PER_OWNER) {
    return "Too many uploads in progress; finish or cancel one first";
  }
  if (activeBytes + incomingBytes > MAX_IN_FLIGHT_UPLOAD_BYTES) {
    return "Too much video is already uploading; finish or cancel one first";
  }
  return null;
}

/** One part as B2's `ListParts` reports it — the authoritative landed set. */
export interface UploadedPart {
  partNumber: number;
  sizeBytes: number;
}

/**
 * Verify the landed part list before assembling it. B2 is the source of truth
 * for what actually arrived, so a client that lies about ETags or skips a part
 * cannot produce a corrupt source: the run is refused and aborted instead.
 */
export function rawCompletionError(
  declaredSize: number,
  parts: readonly UploadedPart[],
): string | null {
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
    return "Invalid declared upload size";
  }
  if (declaredSize > MAX_RAW_UPLOAD_BYTES) return "Video exceeds the 2 GB upload limit";

  const total = parts.reduce((sum, part) => sum + part.sizeBytes, 0);
  if (total > MAX_RAW_UPLOAD_BYTES) return "Uploaded video exceeds the 2 GB limit";
  if (total !== declaredSize) {
    return `Uploaded ${total} bytes but ${declaredSize} were declared`;
  }

  const expectedParts = rawPartCount(declaredSize);
  if (parts.length !== expectedParts) {
    return `Upload is incomplete (${parts.length}/${expectedParts} parts landed)`;
  }
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  for (let index = 0; index < ordered.length; index += 1) {
    const part = ordered[index];
    if (!part || part.partNumber !== index + 1) {
      return "Uploaded parts do not cover every part once";
    }
    if (!Number.isInteger(part.sizeBytes) || part.sizeBytes <= 0) {
      return "Uploaded part has an invalid size";
    }
    const expectedSize = uploadPartSize(declaredSize, part.partNumber);
    if (part.sizeBytes !== expectedSize) {
      return `Uploaded part ${part.partNumber} has the wrong size`;
    }
  }
  return null;
}

/** Validate an upload's declared metadata; null when acceptable, else the refusal message. */
export function rawUploadError(sizeBytes: number, contentType: string): string | null {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || !Number.isSafeInteger(sizeBytes)) {
    return "Invalid upload size";
  }
  if (sizeBytes > MAX_RAW_UPLOAD_BYTES) {
    return "Video exceeds the 2 GB upload limit";
  }
  if (!isAllowedRawContentType(contentType)) {
    return "Unsupported video format";
  }
  if (rawPartCount(sizeBytes) > MAX_RAW_UPLOAD_PARTS) {
    return "Video is too large for upload";
  }
  return null;
}

/**
 * Raw object key for an asset. Built from the asset id and never from the
 * instructor's filename: B2 keys are indexed per-asset, so a renamed or
 * hostile filename cannot rewrite somebody else's source object.
 */
export function rawKeyOf(assetId: string): string {
  return `raw/${assetId}/source`;
}

/**
 * How long a ready asset keeps its raw source. The ladder is what learners
 * stream, but the raw object is the only way to rebuild it without asking the
 * instructor for another upload — so it outlives completion by a month and the
 * daily reaper in `convex/videoStorage.ts` owns the deletion.
 */
export const RAW_SOURCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Assets whose `updatedAt` is older than this are past retention. */
export function rawSourceRetentionCutoff(now = Date.now()): number {
  return now - RAW_SOURCE_RETENTION_MS;
}

/**
 * Missing-media strikes: a ready B2 ladder whose CDN objects 404 is retired
 * only after this many misses spread over the grace window. Two hits separated
 * in time rule out a transient edge failure taking a working video down.
 */
export const MISSING_MEDIA_STRIKE_COUNT = 2;
export const MISSING_MEDIA_GRACE_MS = 5 * 60 * 1000;

/** Every status the B2 flow (plus its legacy ladder) can hold. */
export type RawUploadStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "awaiting_upload"
  | "queued";

/**
 * Guard map for B2-pipeline transitions. Legacy paths (UploadThing / Publitio)
 * write `pending/processing/ready/failed` unguarded by design; only this
 * module's consumers route new B2 assets through it. Terminal states have no
 * outgoing edges — a `ready` ladder or a `failed` asset is exactly that.
 */
const RAW_UPLOAD_TRANSITIONS: Readonly<Record<RawUploadStatus, readonly RawUploadStatus[]>> = {
  awaiting_upload: ["queued", "failed"],
  queued: ["processing", "failed"],
  processing: ["ready", "failed"],
  pending: [],
  ready: [],
  failed: [],
};

export function canVideoTransition(from: RawUploadStatus, to: RawUploadStatus): boolean {
  return RAW_UPLOAD_TRANSITIONS[from]?.includes(to) ?? false;
}
