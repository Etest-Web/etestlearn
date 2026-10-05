/**
 * UploadThing source validation (isolate-safe: no `node:` imports).
 *
 * The transcode worker fetches the raw upload over HTTPS, so the URL it is
 * handed must be pinned to UploadThing hosts — otherwise `registerSource`
 * becomes an SSRF primitive into our ffmpeg worker.
 */

const UPLOADTHING_HOSTS = [/^([a-z0-9-]+\.)?ufs\.sh$/, /^utfs\.io$/];

export function isUploadthingFileUrl(url: string): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return UPLOADTHING_HOSTS.some((re) => re.test(host));
}

/** Throw unless the URL is an https UploadThing file URL. */
export function assertUploadthingFileUrl(url: string): void {
  if (!isUploadthingFileUrl(url)) {
    throw new Error("Source must be an UploadThing file URL");
  }
}
