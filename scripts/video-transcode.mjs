#!/usr/bin/env node
/**
 * Phase 3 transcode worker.
 *
 * Runs on a GitHub Actions runner, never in Convex. It claims one queued
 * asset, downloads the raw object from B2, builds the 360p/720p HLS ladder
 * with FFmpeg, strips the `#EXT-X-KEY` line the encryptor wrote (the playback
 * gate decorates playlists per viewer in Phase 4), uploads the objects to the
 * private `glypha-media` bucket, and reports completion or failure.
 *
 * Layout must match `edge/cdn-worker/src/policy.ts` and
 * `lib/video-transcode-job.ts`:
 *
 *   hls/<assetId>/master.m3u8
 *   hls/<assetId>/<variant>/index.m3u8
 *   hls/<assetId>/<variant>/seg_<n>.ts
 *
 * Secrets are read from the environment and never logged. The AES key travels
 * from Convex to this process and into a throwaway key file; it is not printed
 * and the file is removed with the temp directory.
 *
 * Usage: ASSET_ID=<id> node scripts/video-transcode.mjs
 *        node scripts/video-transcode.mjs --asset-id <id>
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  // Secrets copied out of a `.env` file keep their surrounding quotes; every
  // consumer here (URL parsing, S3 signing) rejects them, so strip them once.
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * A secret pasted from a `.env` file often arrives wrapped in quotes, which
 * `new URL()` rejects with a bare "Invalid URL" that names no variable. Strip
 * the wrapping and prove it is absolute here, so the failure is readable.
 */
function requireSiteUrl() {
  const raw = requireEnv("CONVEX_SITE_URL").trim().replace(/^["']|["']$/g, "");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail("CONVEX_SITE_URL must be an absolute http(s) URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail("CONVEX_SITE_URL must be an absolute http(s) URL");
  }
  return raw;
}

function assetIdFromArgs() {
  const flagIndex = process.argv.indexOf("--asset-id");
  const value = flagIndex >= 0 ? process.argv[flagIndex + 1] : process.env.ASSET_ID;
  if (!value || !ASSET_ID_PATTERN.test(value)) fail("Missing or invalid asset id");
  return value;
}

/** Run a child process, collecting stderr so a failure has a usable reason. */
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

async function postProgress(siteUrl, token, assetId, progress) {
  try {
    await postConvex(siteUrl, token, "/transcode/progress", { assetId, progress });
  } catch {
    // Progress is best-effort; a dropped update must not fail the transcode.
  }
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
    fail("Could not read the source video dimensions");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    fail("Could not read the source video duration");
  }
  return { width, height, duration };
}

function evenWidth(sourceWidth, sourceHeight, height) {
  const scaled = Math.round((sourceWidth * height) / sourceHeight);
  return Math.max(2, scaled % 2 === 0 ? scaled : scaled - 1);
}

async function postConvex(siteUrl, token, path, payload) {
  const response = await fetch(new URL(path, siteUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`Convex ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

function s3Client() {
  const endpoint = requireEnv("B2_ENDPOINT");
  const region = requireEnv("B2_REGION");
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("B2_TRANSCODE_KEY_ID"),
      secretAccessKey: requireEnv("B2_TRANSCODE_KEY"),
    },
  });
}

async function downloadSource(client, bucket, rawKey, destination) {
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: rawKey }),
  );
  if (!response.Body) fail("B2 returned an empty source body");
  await pipeline(response.Body, createWriteStream(destination));
}

async function transcodeVariant({
  sourcePath,
  outDir,
  spec,
  keyInfoPath,
  keyUri,
  durationSeconds,
  onProgress,
}) {
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

  // The playback gate adds `#EXT-X-KEY` per viewer (with a tokenized URI).
  // A stored key line would either duplicate that or expose a bare key URL.
  const playlistPath = join(directory, "index.m3u8");
  const playlist = await readFile(playlistPath, "utf8");
  const cleaned = playlist
    .split("\n")
    .filter((line) => !line.startsWith("#EXT-X-KEY"))
    .join("\n");
  await writeFile(playlistPath, cleaned, "utf8");

  // Keep `keyUri` referenced so the intent of the key-info file is explicit;
  // it is stripped above and never uploaded.
  void keyUri;
}

function masterPlaylist(assetId, variants, sourceWidth, sourceHeight) {
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
  // Best effort: a failed job leaves unreferenced objects behind, which the
  // Phase 5 cleanup can sweep. Nothing in Convex points at them.
  await client
    .send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: files.map((file) => ({ Key: `hls/${assetId}/${file}` })) },
      }),
    )
    .catch(() => {});
}


async function main() {
  const assetId = assetIdFromArgs();
  const siteUrl = requireSiteUrl();
  const token = requireEnv("VIDEO_TRANSCODE_TOKEN");
  const bucket = requireEnv("B2_RAW_BUCKET");

  const client = s3Client();
  const workDir = await mkdtemp(join(tmpdir(), "glypha-transcode-"));
  let uploaded = [];
  // `/transcode/complete` is the point of no return: from there the ladder is
  // referenced by Convex, so this worker may neither delete it nor report the
  // job as failed. Anything after that call is best-effort.
  let completed = false;

  try {
    const job = await postConvex(siteUrl, token, "/transcode/claim", { assetId });
    if (!job.rawKey || !job.keyB64 || !job.ivHex) {
      fail("Claim response is missing source or key material");
    }

    const sourcePath = join(workDir, "source");
    await downloadSource(client, bucket, job.rawKey, sourcePath);

    const { width, height, duration } = await probe(sourcePath);
    if (height < 360) fail(`Source is ${height}p; the minimum ladder starts at 360p`);

    const variants = LADDER.filter((variant) => variant.height <= height);
    if (variants.length === 0) fail("No ladder variant fits the source");

    const keyPath = join(workDir, "key.bin");
    await writeFile(keyPath, Buffer.from(job.keyB64, "base64"));
    const keyInfoPath = join(workDir, "key-info.txt");
    const keyUri = "key";
    await writeFile(
      keyInfoPath,
      `${keyUri}\n${keyPath}\n${job.ivHex}\n`,
      "utf8",
    );

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
      await postProgress(siteUrl, token, assetId, value);
    };

    await postProgress(siteUrl, token, assetId, 1);
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      await transcodeVariant({
        sourcePath,
        outDir,
        spec: variant,
        keyInfoPath,
        keyUri,
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

    uploaded = await uploadTree(client, bucket, assetId, outDir);

    await postConvex(siteUrl, token, "/transcode/complete", {
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
    });

    // The raw source is deleted by `videoTranscodeJobs.complete`, which
    // schedules `videoStorage.deleteRawSource`; the worker owns no cleanup
    // after a successful report.
    completed = true;

    // Visible in the Actions log; contains no key material or credentials.
    console.log(
      `Transcoded ${assetId} at ${variants.map((variant) => variant.label).join(", ")}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcode failed";
    if (!completed) {
      try {
        await postConvex(siteUrl, token, "/transcode/fail", {
          assetId,
          errorMessage: message.slice(0, 500),
        });
        // Only now is Convex's record of this job terminal, so nothing
        // references the uploaded objects and deleting them is safe. A report
        // that is refused (already `ready`) must leave the ladder alone; any
        // genuinely orphaned objects are swept by the Phase 5 cleanup.
        await removeUploadedObjects(client, bucket, assetId, uploaded);
      } catch (reportError) {
        console.error(
          `Could not report transcode failure: ${
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Transcode failed");
  process.exitCode = 1;
});
