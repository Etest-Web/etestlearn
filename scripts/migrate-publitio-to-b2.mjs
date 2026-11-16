#!/usr/bin/env node
/**
 * Migrate Publit.io-hosted lesson videos into the B2 + self-hosted HLS pipeline.
 *
 * For each Publit.io video lesson (content URL on publit.io, not yet migrated to
 * a ready B2 ladder) this script, one video at a time:
 *
 *   1. Resolves a downloadable source (Publit.io API when possible, with
 *      resilient fallbacks to direct/derived URLs).
 *   2. Downloads the raw file to a temp directory.
 *   3. Creates a draft `videoAssets` row in Convex (awaiting_upload).
 *   4. Multipart-uploads the raw object to B2 at `raw/<assetId>/source`.
 *   5. Verifies the landed object, stores the per-asset AES key, and marks the
 *      asset `queued` in Convex.
 *   6. Transcodes immediately (ffmpeg + probe + B2 HLS upload) and reports
 *      claim/progress/complete/fail to Convex via `npx convex run
 *      internal.videoTranscodeJobs.*`, so no VIDEO_TRANSCODE_TOKEN/HTTP worker
 *      is required locally. Each asset is fully processed before the next.
 *
 * Convex records are created through internal functions run with deployment
 * admin access (`npx convex run`), producing assets indistinguishable from the
 * normal B2 pipeline (lesson.videoAssetId is repointed on completion).
 *
 * Required env (shell / .env.local / .env):
 *   Publit.io:   PUBLITIO_API_KEY, PUBLITIO_API_SECRET
 *   B2 upload:   B2_ENDPOINT, B2_REGION, B2_APP_KEY_ID, B2_APP_KEY, B2_RAW_BUCKET
 *   Transcode:   B2_TRANSCODE_KEY_ID, B2_TRANSCODE_KEY (B2_* endpoint/region/bucket reused)
 *   Convex CLI:  configured deployment so `npx convex run` targets the right backend.
 *                pass --prod for production.
 *
 * Prerequisites: ffmpeg + ffprobe on PATH (for the transcode step).
 *
 * Usage:
 *   node scripts/migrate-publitio-to-b2.mjs [--dry-run] [--prod] [--skip-transcode]
 *        [--lesson <lessonId>] [--course <courseId>] [--limit N] [--include-migrated]
 *
 * Notes:
 *   - Re-runs skip lessons already migrated to a ready B2/HLS asset (unless
 *     --include-migrated). In-flight assets are reported and skipped.
 *   - The Publit.io content URL is left in place; playback switches once the
 *     transcode repoints lesson.videoAssetId. Keep Publit.io content until verified.
 *   - Secrets and capability URLs (download/part URLs) are never printed.
 */

import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PART_SIZE = 10 * 1024 * 1024; // must match RAW_UPLOAD_PART_SIZE_BYTES
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;

/** Folder number is part of the Worker contract: 0 = 360p, 1 = 720p. */
const LADDER = [
  {
    variant: 0,
    label: "360p",
    height: 360,
    bitrate: 800_000,
    bandwidth: 900_000,
    maxrate: "800k",
    bufsize: "1600k",
    audioBitrate: "96k",
  },
  {
    variant: 1,
    label: "720p",
    height: 720,
    bitrate: 2_800_000,
    bandwidth: 3_000_000,
    maxrate: "2800k",
    bufsize: "5600k",
    audioBitrate: "128k",
  },
];

const CONTENT_TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

function loadEnvFile(file) {
  const path = join(root, file);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

// Populate process.env from files without overriding explicit shell env.
const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
// Allow deriving Convex site URL for tooling that expects it (not required here).
if (!process.env.CONVEX_SITE_URL && process.env.NEXT_PUBLIC_CONVEX_SITE_URL) {
  process.env.CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    prod: false,
    skipTranscode: false,
    includeMigrated: false,
    limit: Infinity,
    lessonId: undefined,
    courseId: undefined,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--prod") opts.prod = true;
    else if (a === "--skip-transcode") opts.skipTranscode = true;
    else if (a === "--include-migrated") opts.includeMigrated = true;
    else if (a === "--lesson") opts.lessonId = argv[++i];
    else if (a === "--course") opts.courseId = argv[++i];
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/migrate-publitio-to-b2.mjs [--dry-run] [--prod] [--skip-transcode] [--lesson <id>] [--course <id>] [--limit N] [--include-migrated]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/* ── Publit.io API (same signing scheme as lib/publitio.ts) ─────────────── */

function publitioSignature(apiSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = 10000000 + (randomBytes(4).readUInt32BE(0) % 90000000);
  const signature = createHash("sha1")
    .update(`${timestamp}${nonce}${apiSecret}`)
    .digest("hex");
  return { api_timestamp: String(timestamp), api_nonce: String(nonce), api_signature: signature };
}

function publitioApiUrl(path, apiKey, apiSecret, params = {}) {
  const query = new URLSearchParams({
    api_key: apiKey,
    ...publitioSignature(apiSecret),
  });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) query.set(k, String(v));
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `https://api.publit.io/v1${normalized}?${query.toString()}`;
}

function publitioIdCandidatesFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "publit.io" && !host.endsWith(".publit.io")) return [];
    const candidates = [];
    const fileMatch = /^\/file\/([A-Za-z0-9_.-]+)/.exec(parsed.pathname);
    if (fileMatch?.[1]) candidates.push(fileMatch[1]);
    const downloadMatch = /^\/download\/([^/]+)$/.exec(parsed.pathname);
    if (downloadMatch?.[1]) {
      const name = downloadMatch[1].replace(/\.[^.]+$/, "");
      if (name) candidates.push(name);
    }
    return uniqueStrings(candidates);
  } catch {
    return [];
  }
}

async function publitioShowFile(apiKey, apiSecret, fileId) {
  const res = await fetch(publitioApiUrl(`/files/show/${fileId}`, apiKey, apiSecret));
  const text = await res.text();
  if (!res.ok) throw new Error(`Publit.io show ${fileId} failed (${res.status}): ${text.slice(0, 200)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Publit.io show ${fileId} returned non-JSON`);
  }
  if (json && json.success === false) {
    throw new Error(`Publit.io show ${fileId}: ${json.error?.message || "request failed"}`);
  }
  return json;
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    if (typeof v !== "string" || v.length === 0) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function htmlToMp4Url(contentUrl) {
  try {
    const parsed = new URL(contentUrl);
    if (parsed.pathname.endsWith(".html")) {
      parsed.pathname = parsed.pathname.replace(/\.html$/, ".mp4");
      parsed.search = "";
      return parsed.toString();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function stripQuery(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function pickDownloadUrls(fileInfo, fallbackContentUrl) {
  const derived = htmlToMp4Url(fallbackContentUrl);
  const candidates = uniqueStrings([
    fileInfo?.url_download,
    fileInfo?.url_original,
    fileInfo?.download_url,
    fileInfo?.url_preview,
    derived,
    derived ? stripQuery(derived) : null,
    fallbackContentUrl,
    stripQuery(fallbackContentUrl),
  ]);
  return candidates;
}

async function resolveSource(lesson, apiKey, apiSecret) {
  const idCandidates = publitioIdCandidatesFromUrl(lesson.content);
  let fileInfo = null;
  for (const fileId of idCandidates) {
    console.log(`  publitio id candidate: ${fileId}`);
    try {
      fileInfo = await publitioShowFile(apiKey, apiSecret, fileId);
      if (fileInfo) break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  publitio API lookup failed: ${msg.slice(0, 160)}`);
    }
  }
  if (!fileInfo && idCandidates.length === 0) {
    console.log("  (no publitio id in URL; will use direct content URL)");
  }
  const urls = pickDownloadUrls(fileInfo, lesson.content);
  const reportedSize = Number(fileInfo?.size || fileInfo?.bytes || 0) || undefined;
  return { fileInfo, urls, reportedSize };
}

/* ── Convex CLI helpers (admin access via configured deployment) ────────── */

function convexRun(functionName, argsObj, { prod = false } = {}) {
  const cliArgs = ["convex", "run", functionName, JSON.stringify(argsObj)];
  if (prod) cliArgs.push("--prod");
  const res = spawnSync("npx", cliArgs, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim().slice(0, 800);
    throw new Error(`convex run ${functionName} failed: ${detail}`);
  }
  const out = (res.stdout || "").trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* keep looking */
      }
    }
    throw new Error(`convex run ${functionName} returned non-JSON: ${out.slice(0, 300)}`);
  }
}

/* ── B2 helpers ─────────────────────────────────────────────────────────── */

function b2RawClient() {
  const endpoint = requireEnv("B2_ENDPOINT");
  const region = requireEnv("B2_REGION");
  return {
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireEnv("B2_APP_KEY_ID"),
        secretAccessKey: requireEnv("B2_APP_KEY"),
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
    bucket: requireEnv("B2_RAW_BUCKET"),
  };
}

function b2TranscodeClient() {
  const endpoint = requireEnv("B2_ENDPOINT");
  const region = requireEnv("B2_REGION");
  return {
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireEnv("B2_TRANSCODE_KEY_ID"),
        secretAccessKey: requireEnv("B2_TRANSCODE_KEY"),
      },
    }),
    bucket: requireEnv("B2_RAW_BUCKET"),
  };
}

/* ── Process helpers ────────────────────────────────────────────────────── */

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(-1500)}`));
    });
  });
}

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(-1500)}`));
    });
  });
}

function runFfmpegWithProgress(args, { durationSeconds, onProgress }) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdoutBuffer = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const [key, value] = line.trim().split("=");
        if (!key || value === undefined) continue;
        if (key === "out_time_ms" || key === "out_time_us") {
          const us = key === "out_time_ms" ? Number(value) * 1000 : Number(value);
          if (Number.isFinite(us) && durationSeconds > 0) {
            const ratio = Math.max(0, Math.min(1, us / 1_000_000 / durationSeconds));
            onProgress(ratio);
          }
        } else if (key === "progress" && value === "end") {
          onProgress(1);
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-1500)}`));
    });
  });
}

async function probe(sourcePath) {
  const raw = await runCapture("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    sourcePath,
  ]);
  const parsed = JSON.parse(raw);
  const stream = parsed?.streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  const duration = Number(parsed?.format?.duration);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Could not read the source video dimensions");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read the source video duration");
  }
  return { width, height, duration };
}

function evenWidth(sourceWidth, sourceHeight, height) {
  const scaled = Math.round((sourceWidth * height) / sourceHeight);
  return Math.max(2, scaled % 2 === 0 ? scaled : scaled - 1);
}

/* ── Download + upload ──────────────────────────────────────────────────── */

async function downloadToFile(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status})`);
  }
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error("Download URL returned HTML (not a media file)");
  }
  const nodeStream = Readable.fromWeb(res.body);
  await pipeline(nodeStream, createWriteStream(destPath));
  const s = await stat(destPath);
  return s.size;
}

async function downloadWithFallback(urls, destPath) {
  let lastErr;
  for (const url of urls) {
    try {
      const bytes = await downloadToFile(url, destPath);
      return { url, bytes };
    } catch (err) {
      lastErr = err;
      await rm(destPath, { force: true }).catch(() => {});
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All download attempts failed");
}

/* ── Transcode (mirrors scripts/video-transcode.mjs, state via convex run) ─ */

async function transcodeVariant({ sourcePath, outDir, spec, keyInfoPath, durationSeconds, onProgress }) {
  const directory = join(outDir, String(spec.variant));
  await run("mkdir", ["-p", directory]);

  let lastReported = -1;
  const report = (ratio) => {
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    if (pct !== lastReported) {
      lastReported = pct;
      onProgress(pct);
    }
  };

  await runFfmpegWithProgress(
    [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      `scale=-2:${spec.height}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      spec.height >= 720 ? "22" : "23",
      "-maxrate",
      spec.maxrate,
      "-bufsize",
      spec.bufsize,
      "-c:a",
      "aac",
      "-b:a",
      spec.audioBitrate,
      "-ac",
      "2",
      "-ar",
      "48000",
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-hls_segment_filename",
      join(directory, "seg_%d.ts"),
      "-hls_key_info_file",
      keyInfoPath,
      "-progress",
      "pipe:1",
      "-nostats",
      join(directory, "index.m3u8"),
    ],
    { durationSeconds, onProgress: report },
  );

  const playlistPath = join(directory, "index.m3u8");
  const playlist = await readFile(playlistPath, "utf8");
  const cleaned = playlist
    .split("\n")
    .filter((line) => !line.startsWith("#EXT-X-KEY"))
    .join("\n");
  await writeFile(playlistPath, cleaned, "utf8");
}

function masterPlaylist(assetId, variants, sourceWidth, sourceHeight) {
  void assetId;
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];
  for (const variant of variants) {
    const width = evenWidth(sourceWidth, sourceHeight, variant.height);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${width}x${variant.height},CODECS="avc1.4d401f,mp4a.40.2"`,
      `${variant.variant}/index.m3u8`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function listFilesRecursive(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

async function uploadTree(client, bucket, assetId, outDir) {
  const files = await listFilesRecursive(outDir);
  for (const relative of files.sort()) {
    const absolute = join(outDir, relative);
    const extension = relative.slice(relative.lastIndexOf("."));
    const body = await readFile(absolute);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `hls/${assetId}/${relative}`,
        Body: body,
        ContentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  return files;
}

async function removeUploadedObjects(client, bucket, assetId, files) {
  if (files.length === 0) return;
  await client
    .send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: files.map((file) => ({ Key: `hls/${assetId}/${file}` })) },
      }),
    )
    .catch(() => {});
}

async function setProgressSafe(assetId, progress, opts) {
  try {
    convexRun(
      "internal.videoTranscodeJobs.setProgress",
      { assetId, progress: Math.max(0, Math.min(100, Math.round(progress))) },
      { prod: opts.prod },
    );
  } catch {
    /* best effort */
  }
}

async function transcodeViaConvex(assetId, opts) {
  const { client, bucket } = b2TranscodeClient();
  const workDir = await mkdtemp(join(tmpdir(), "glypha-migrate-transcode-"));
  let uploaded = [];
  let completed = false;

  try {
    const job = convexRun("internal.videoTranscodeJobs.claim", { assetId }, { prod: opts.prod });
    if (!job?.rawKey || !job?.keyB64 || !job?.ivHex) {
      throw new Error("Claim response is missing source or key material");
    }

    const sourcePath = join(workDir, "source");
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: job.rawKey }));
    if (!response.Body) throw new Error("B2 returned an empty source body");
    await pipeline(response.Body, createWriteStream(sourcePath));

    const { width, height, duration } = await probe(sourcePath);
    if (height < 360) throw new Error(`Source is ${height}p; the minimum ladder starts at 360p`);
    const variants = LADDER.filter((variant) => variant.height <= height);
    if (variants.length === 0) throw new Error("No ladder variant fits the source");

    const keyPath = join(workDir, "key.bin");
    await writeFile(keyPath, Buffer.from(job.keyB64, "base64"));
    const keyInfoPath = join(workDir, "key-info.txt");
    await writeFile(keyInfoPath, `key\n${keyPath}\n${job.ivHex}\n`, "utf8");

    const outDir = join(workDir, "out");
    await run("mkdir", ["-p", outDir]);

    let lastProgressPost = 0;
    let lastProgressValue = -1;
    const reportOverall = async (overallPercent) => {
      const value = Math.max(0, Math.min(99, Math.round(overallPercent)));
      const now = Date.now();
      if (value === lastProgressValue) return;
      if (value < 99 && now - lastProgressPost < 3000 && value - lastProgressValue < 3) return;
      lastProgressValue = value;
      lastProgressPost = now;
      await setProgressSafe(assetId, value, opts);
    };

    await setProgressSafe(assetId, 1, opts);
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      await transcodeVariant({
        sourcePath,
        outDir,
        spec: variant,
        keyInfoPath,
        durationSeconds: duration,
        onProgress: (variantPercent) => {
          const overall = ((i + variantPercent / 100) / variants.length) * 100;
          void reportOverall(overall);
        },
      });
      await reportOverall(((i + 1) / variants.length) * 100);
    }

    await writeFile(
      join(outDir, "master.m3u8"),
      masterPlaylist(assetId, variants, width, height),
      "utf8",
    );

    console.log("  uploading HLS to B2…");
    uploaded = await uploadTree(client, bucket, assetId, outDir);

    convexRun(
      "internal.videoTranscodeJobs.complete",
      {
        assetId,
        durationSeconds: duration,
        variants: variants.map((variant) => ({
          variant: variant.variant,
          label: variant.label,
          height: variant.height,
          width: evenWidth(width, height, variant.height),
          bitrate: variant.bitrate,
          bandwidth: variant.bandwidth,
        })),
        masterPlaylistKey: `hls/${assetId}/master.m3u8`,
        variantPlaylistKeys: variants.map((variant) => ({
          variant: variant.variant,
          key: `hls/${assetId}/${variant.variant}/index.m3u8`,
        })),
      },
      { prod: opts.prod },
    );
    completed = true;
    console.log(`  transcoded at ${variants.map((v) => v.label).join(", ")}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcode failed";
    if (!completed) {
      try {
        convexRun(
          "internal.videoTranscodeJobs.fail",
          { assetId, errorMessage: message.slice(0, 500) },
          { prod: opts.prod },
        );
        await removeUploadedObjects(client, bucket, assetId, uploaded);
      } catch (reportError) {
        console.error(
          `  could not report transcode failure: ${
            reportError instanceof Error ? reportError.message : "unknown error"
          }`,
        );
      }
    }
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ── Per-lesson migration ───────────────────────────────────────────────── */

async function migrateOne(lesson, opts, clients) {
  const { apiKey, apiSecret } = clients.publitio;
  const label = `${lesson.lessonId} "${lesson.title}"`;
  console.log(`\n→ ${label}`);
  console.log(`  source: ${lesson.content}`);

  const { fileInfo, urls, reportedSize } = await resolveSource(lesson, apiKey, apiSecret);
  if (reportedSize) console.log(`  reported size: ${(reportedSize / (1024 * 1024)).toFixed(1)} MB`);

  if (opts.dryRun) {
    console.log(`  [dry-run] ${urls.length} download candidate(s); would upload to B2 and transcode.`);
    return { status: "dry-run" };
  }

  const workDir = await mkdtemp(join(tmpdir(), "publitio-migrate-"));
  let assetId = null;
  let rawKey = null;
  try {
    const localPath = join(workDir, "source");
    console.log("  downloading source…");
    const { bytes: downloadedBytes } = await downloadWithFallback(urls, localPath);
    console.log(`  downloaded: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB`);

    if (!Number.isSafeInteger(downloadedBytes) || downloadedBytes <= 0) {
      throw new Error("Downloaded file is empty");
    }
    if (downloadedBytes > MAX_SOURCE_BYTES) {
      throw new Error("Source exceeds 2 GB upload limit");
    }

    // 1) Draft asset in Convex.
    const draft = convexRun(
      "internal.publitioMigration.createMigrationDraft",
      { lessonId: lesson.lessonId, sizeBytes: downloadedBytes },
      { prod: opts.prod },
    );
    assetId = draft.assetId;
    rawKey = draft.rawKey;
    console.log(`  draft asset: ${assetId}`);

    // 2) Multipart upload to B2.
    const { client, bucket } = b2RawClient();
    const contentType =
      (typeof fileInfo?.extension === "string" && fileInfo.extension === "mp4" && "video/mp4") ||
      "video/mp4";
    const created = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: rawKey,
        ContentType: contentType,
      }),
    );
    const uploadId = created.UploadId;
    if (!uploadId) throw new Error("B2 did not return a multipart upload id");

    convexRun(
      "internal.publitioMigration.attachMigrationUpload",
      { assetId, uploadId, rawKey },
      { prod: opts.prod },
    );

    try {
      const totalParts = Math.max(1, Math.ceil(downloadedBytes / PART_SIZE));
      const parts = [];
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * PART_SIZE;
        const end = Math.min(start + PART_SIZE, downloadedBytes);
        const body = createReadStream(localPath, { start, end: end - 1 });
        const res = await client.send(
          new UploadPartCommand({
            Bucket: bucket,
            Key: rawKey,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: body,
            ContentLength: end - start,
          }),
        );
        if (!res.ETag) throw new Error(`B2 did not return an ETag for part ${partNumber}`);
        parts.push({ ETag: res.ETag, PartNumber: partNumber });
        const pct = Math.round((partNumber / totalParts) * 100);
        process.stdout.write(`\r  B2 upload: ${partNumber}/${totalParts} parts (${pct}%)`);
      }
      process.stdout.write("\n");

      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: rawKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }),
      );
    } catch (err) {
      await client
        .send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: rawKey, UploadId: uploadId }))
        .catch(() => {});
      throw err;
    }

    // 3) Verify object size, store key, mark queued.
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: rawKey }));
    const landed = head.ContentLength ?? -1;
    if (landed !== downloadedBytes) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: rawKey })).catch(() => {});
      throw new Error(`B2 object size mismatch (expected ${downloadedBytes}, got ${landed})`);
    }

    const keyB64 = randomBytes(16).toString("base64");
    convexRun(
      "internal.publitioMigration.finalizeMigrationUpload",
      { assetId, keyB64 },
      { prod: opts.prod },
    );
    console.log("  queued for transcode.");

    // 4) Transcode immediately, one by one (sequential).
    if (!opts.skipTranscode) {
      console.log("  transcoding…");
      await transcodeViaConvex(assetId, opts);
      console.log("  transcode complete.");
    } else {
      console.log(`  [skip-transcode] left queued (asset ${assetId}).`);
    }

    return { status: opts.skipTranscode ? "queued" : "migrated", assetId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  FAILED: ${message}`);
    if (assetId) {
      try {
        convexRun(
          "internal.publitioMigration.failMigrationDraft",
          { assetId, errorMessage: message.slice(0, 500) },
          { prod: opts.prod },
        );
      } catch {
        /* best effort */
      }
      if (rawKey) {
        try {
          const { client, bucket } = b2RawClient();
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: rawKey }));
        } catch {
          /* orphaned object; cleanup/reaper can reconcile */
        }
      }
    }
    return { status: "failed", assetId, error: message };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function checkCommandExists(cmd) {
  const res = spawnSync(cmd, ["-version"], { encoding: "utf8" });
  return res.status === 0 || res.stdout?.length > 0 || res.stderr?.length > 0;
}

async function main() {
  const opts = parseArgs(process.argv);
  const apiKey = requireEnv("PUBLITIO_API_KEY");
  const apiSecret = requireEnv("PUBLITIO_API_SECRET");
  // Validate B2 env early for a real run so we fail before touching data.
  if (!opts.dryRun) {
    requireEnv("B2_ENDPOINT");
    requireEnv("B2_REGION");
    requireEnv("B2_APP_KEY_ID");
    requireEnv("B2_APP_KEY");
    requireEnv("B2_RAW_BUCKET");
    if (!opts.skipTranscode) {
      requireEnv("B2_TRANSCODE_KEY_ID");
      requireEnv("B2_TRANSCODE_KEY");
      if (!checkCommandExists("ffmpeg") || !checkCommandExists("ffprobe")) {
        throw new Error("ffmpeg and ffprobe are required on PATH for transcode");
      }
    }
  }

  console.log("Listing Publit.io lessons via Convex…");
  const queryArgs = { includeMigrated: opts.includeMigrated };
  if (opts.courseId) queryArgs.courseId = opts.courseId;
  const lessons = convexRun("internal.publitioMigration.listPublitioLessons", queryArgs, {
    prod: opts.prod,
  });

  let items = Array.isArray(lessons) ? lessons : [];
  if (opts.lessonId) items = items.filter((l) => l.lessonId === opts.lessonId);
  if (Number.isFinite(opts.limit)) items = items.slice(0, opts.limit);

  if (items.length === 0) {
    console.log("No Publit.io lessons to migrate.");
    return;
  }
  console.log(`Found ${items.length} lesson(s) to migrate${opts.dryRun ? " (dry run)" : ""}.`);

  const summary = { migrated: 0, queued: 0, dryRun: 0, failed: 0, skipped: 0 };
  for (const lesson of items) {
    if (lesson.migratedReady && !opts.includeMigrated) {
      console.log(`\n↷ ${lesson.lessonId} already migrated, skipping.`);
      summary.skipped++;
      continue;
    }
    const inFlight = ["awaiting_upload", "queued", "processing", "pending"];
    if (lesson.assetStatus && inFlight.includes(lesson.assetStatus) && !opts.includeMigrated) {
      console.log(
        `\n↷ ${lesson.lessonId} has an in-flight asset (${lesson.assetStatus}), skipping. Resolve or retry it before migrating.`,
      );
      summary.skipped++;
      continue;
    }
    const result = await migrateOne(lesson, opts, { publitio: { apiKey, apiSecret } });
    if (result.status === "migrated") summary.migrated++;
    else if (result.status === "queued") summary.queued++;
    else if (result.status === "dry-run") summary.dryRun++;
    else summary.failed++;
  }

  console.log("\nSummary:", summary);
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
