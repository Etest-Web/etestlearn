/**
 * Pure HLS playlist helpers shared by the transcode worker and the
 * auth-gated playback route. No `node:` imports — this runs in Convex
 * isolates as well as Node.
 */

export type LadderVariant = {
  label: string;
  height: number;
  bitrate: number;
  maxrate: number;
  bufsize: number;
  bandwidth: number;
};

/** Master playlist referencing per-variant media playlists by relative name. */
export function buildMasterPlaylist(
  ladder: LadderVariant[],
  widthFor?: (height: number) => number,
): string {
  const lines = ["#EXTM3U"];
  ladder.forEach((v, i) => {
    const width = widthFor ? widthFor(v.height) : Math.round((v.height * 16) / 9);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${width}x${v.height},CODECS="avc1.64001f,mp4a.40.2"`,
      // Served by the playback route as `v{i}.m3u8` (see convex/http.ts).
      `v${i}.m3u8`,
    );
  });
  return `${lines.join("\n")}\n`;
}

export type DecorateOptions = {
  /** Absolute-or-relative key URI, token already included. */
  keyUri: string;
  /** Asset IV as 32-char hex. */
  ivHex: string;
  /** Query string to append to segment URLs (e.g. `t=...`). */
  tokenParam: string;
};

/**
 * Decorate a stored media playlist for delivery: insert `#EXT-X-KEY` after the
 * header and tokenize every segment URL. Stored playlists stay plaintext.
 */
export function decorateMediaPlaylist(manifestText: string, opts: DecorateOptions): string {
  const lines = manifestText.split("\n");
  const out: string[] = [];
  let keyInserted = false;
  for (const line of lines) {
    if (!line.startsWith("#") && line.trim().endsWith(".ts")) {
      out.push(`${line.trim()}?${opts.tokenParam}`);
    } else {
      out.push(line);
    }
    if (!keyInserted && line.startsWith("#EXT-X-TARGETDURATION")) {
      out.push(`#EXT-X-KEY:METHOD=AES-128,URI="${opts.keyUri}",IV=0x${opts.ivHex}`);
      keyInserted = true;
    }
  }
  if (!keyInserted) {
    throw new Error("Manifest missing #EXT-X-TARGETDURATION; refusing to decorate");
  }
  return out.join("\n");
}

/** Tokenize playlist references in the master playlist (`out_*.m3u8`). */
export function decorateMasterPlaylist(manifestText: string, tokenParam: string): string {
  return manifestText
    .split("\n")
    .map((line) => (line.trim().endsWith(".m3u8") ? `${line.trim()}?${tokenParam}` : line))
    .join("\n");
}
