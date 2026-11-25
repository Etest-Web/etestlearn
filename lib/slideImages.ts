/**
 * Pure policy for slide images. No Convex or React imports, so the presign
 * action, the authoring UI and the CDN Worker all read the same limits and the
 * same path shape. Side effects live in those modules.
 */

/** 10 MB — generous for a screenshot, small enough that a single PUT is cheap. */
export const MAX_SLIDE_IMAGE_BYTES = 10 * 1024 * 1024;

export const SLIDE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type SlideImageType = (typeof SLIDE_IMAGE_TYPES)[number];

const CONTENT_TYPE_EXT: Readonly<Record<SlideImageType, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const EXT_CONTENT_TYPE: Readonly<Record<string, SlideImageType>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Resolve the canonical image type from the browser's MIME plus the file name.
 * Extensions are the fallback because some browsers hand an empty type for
 * dropped files. Returns null when neither maps — the caller refuses it.
 */
export function normalizeSlideImageType(contentType: string, fileName: string): SlideImageType | null {
  const declared = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  if ((SLIDE_IMAGE_TYPES as readonly string[]).includes(declared)) {
    return declared as SlideImageType;
  }
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXT_CONTENT_TYPE[ext] ?? null;
}

export function slideImageExtension(type: SlideImageType): string {
  return CONTENT_TYPE_EXT[type];
}

/** Object key. IDs are Convex ids (alphanumeric/underscore); uuid is v4 hex. */
export function slideImageKey(
  courseId: string,
  lessonId: string,
  uuid: string,
  type: SlideImageType,
): string {
  return `slides/${courseId}/${lessonId}/${uuid}.${slideImageExtension(type)}`;
}

/**
 * CDN URL for a stored key. `origin` is a bare https origin (CDN_ORIGIN);
 * the worker maps `/slides/...` onto the slides bucket.
 */
export function slideImagePublicUrl(origin: string, key: string): string {
  return `${origin.replace(/\/+$/, "")}/${key}`;
}
