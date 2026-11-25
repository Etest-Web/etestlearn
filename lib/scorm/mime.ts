/**
 * Comprehensive MIME type mapping for SCORM package web assets.
 */

const EXTENSION_MAP: Record<string, string> = {
  // Web Core
  html: "text/html",
  htm: "text/html",
  xhtml: "application/xhtml+xml",
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",

  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",

  // Audio & Video
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/aac",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  flv: "video/x-flv",

  // Fonts
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",

  // Documents & Data
  pdf: "application/pdf",
  csv: "text/csv",
  zip: "application/zip",
  swf: "application/x-shockwave-flash",
};

/**
 * Resolve MIME content-type from file path or extension.
 */
export function getMimeType(filePath: string): string {
  const parts = filePath.split(/[?#]/)[0].split(".");
  if (parts.length < 2) {
    return "application/octet-stream";
  }
  const ext = parts.pop()!.toLowerCase();
  return EXTENSION_MAP[ext] || "application/octet-stream";
}
