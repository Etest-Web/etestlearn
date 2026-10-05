import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import type { LadderVariant } from "./video-playlists";

/**
 * ffmpeg ladder helpers for self-hosted HLS (Node-only: transcode worker).
 *
 * ffmpeg produces plaintext MPEG-TS segments plus one media playlist per
 * variant. Segments are encrypted separately in `lib/video-encryption.ts`;
 * manifests stay plaintext in storage and are decorated with the `#EXT-X-KEY`
 * line and tokenized URLs at serve time by the auth-gated route.
 */

const FULL_LADDER: LadderVariant[] = [
  { label: "1080p", height: 1080, bitrate: 5_000_000, maxrate: 5_350_000, bufsize: 10_000_000, bandwidth: 5_350_000 },
  { label: "720p", height: 720, bitrate: 2_800_000, maxrate: 3_000_000, bufsize: 5_600_000, bandwidth: 3_000_000 },
  { label: "480p", height: 480, bitrate: 1_400_000, maxrate: 1_500_000, bufsize: 2_800_000, bandwidth: 1_500_000 },
  { label: "270p", height: 270, bitrate: 700_000, maxrate: 750_000, bufsize: 1_400_000, bandwidth: 750_000 },
];

/** Cap the ladder to variants at or below the source height. */
export function pickLadder(sourceHeight: number): LadderVariant[] {
  const ladder = FULL_LADDER.filter((v) => v.height <= sourceHeight);
  return ladder.length > 0 ? ladder : [FULL_LADDER[FULL_LADDER.length - 1]];
}

export type ProbedVideo = { durationSeconds: number; width: number; height: number };

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/** Probe duration and dimensions with ffprobe. */
export async function probeVideo(
  inputPath: string,
  bins: { ffprobe?: string } = {},
): Promise<ProbedVideo> {
  const ffprobe = bins.ffprobe ?? "ffprobe";
  const raw = await run(ffprobe, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json",
    inputPath,
  ]);
  const parsed = JSON.parse(raw) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const durationSeconds = Number(parsed.format?.duration ?? 0);
  if (!stream?.width || !stream?.height || !Number.isFinite(durationSeconds)) {
    throw new Error("Could not probe video dimensions/duration");
  }
  return { durationSeconds, width: stream.width, height: stream.height };
}

/** Build one ffmpeg invocation emitting the full ladder as MPEG-TS HLS. */
export function buildFfmpegArgs(inputPath: string, outDir: string, ladder: LadderVariant[]): string[] {
  const splits = ladder.map((_, i) => `[v${i}]`).join("");
  const scales = ladder
    .map((v, i) => `[v${i}]scale=-2:${v.height}[v${i}o]`)
    .join(";");
  const filter = `[0:v]split=${ladder.length}${splits};${scales}`;
  const args = ["-y", "-i", inputPath, "-filter_complex", filter];
  ladder.forEach((v, i) => {
    args.push(
      "-map", `[v${i}o]`,
      `-c:v:${i}`, "libx264",
      `-preset:${i}`, "veryfast",
      `-b:v:${i}`, String(v.bitrate),
      `-maxrate:${i}`, String(v.maxrate),
      `-bufsize:${i}`, String(v.bufsize),
      `-g:${i}`, "48",
      `-keyint_min:${i}`, "48",
      `-sc_threshold:${i}`, "0",
    );
  });
  args.push(
    "-map", "0:a?",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-hls_segment_type", "mpegts",
    "-hls_segment_filename", `${outDir}/seg_%v_%03d.ts`,
    "-hls_flags", "independent_segments",
    "-master_pl_name", "master.m3u8",
    "-f", "hls",
    `${outDir}/out_%v.m3u8`,
  );
  return args;
}

/** Run ffmpeg to emit plaintext HLS into `outDir`. */
export async function transcodeToHls(
  inputPath: string,
  outDir: string,
  ladder: LadderVariant[],
  bins: { ffmpeg?: string } = {},
): Promise<void> {
  const ffmpeg = bins.ffmpeg ?? "ffmpeg";
  await run(ffmpeg, buildFfmpegArgs(inputPath, outDir, ladder));
}

/** Segment file names for one variant, in playlist order. */
export function listVariantSegments(outDir: string, variantIndex: number): string[] {
  const prefix = `seg_${variantIndex}_`;
  return readdirSync(outDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".ts"))
    .sort();
}
