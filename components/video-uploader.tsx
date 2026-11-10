"use client";

/**
 * Instructor B2 uploader (phase 1: raw landing in Backblaze).
 *
 * The browser PUTs every 10 MiB part straight to B2 through presigned URLs —
 * bytes never transit Convex. Per part: retry with exponential backoff and a
 * fresh single-part presign, then keep the ETag exactly as the PUT returned
 * it. Because landed parts hold their ETags, restarting the loop only
 * re-signs and re-PUTs the parts that are still missing; a batch never
 * re-signs a part that already has one.
 *
 * `completeUpload` verifies the landed object and marks the asset `queued`.
 * The runner (Phase 3) reports transcode progress via `/transcode/progress`,
 * which is surfaced here with the same progress bar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui";
import { Progress } from "@/components/ui";
import {
  RAW_UPLOAD_PART_SIZE_BYTES,
  fingerprintError,
  normalizeRawContentType,
  rawPartCount,
  rawUploadError,
} from "@/lib/videos";

const CONCURRENT_PART_PUTS = 3;
const MAX_PART_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 500;
const PARTS_PER_SIGN = 50;

const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.m4v,.mov,.webm,.mkv";

type Phase = "idle" | "initializing" | "uploading" | "assembling" | "queued" | "failed";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function partSlice(file: File, partNumber: number): Blob {
  const start = (partNumber - 1) * RAW_UPLOAD_PART_SIZE_BYTES;
  return file.slice(start, Math.min(start + RAW_UPLOAD_PART_SIZE_BYTES, file.size));
}

class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** One part PUT attempt. ETag is returned untouched, exactly as B2 sent it. */
async function putPartOnce(
  url: string,
  file: File,
  partNumber: number,
  contentType: string,
): Promise<string | null> {
  const res = await fetch(url, {
    method: "PUT",
    body: partSlice(file, partNumber),
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`Part ${partNumber} rejected by storage (${res.status})`);
  }
  return res.headers.get("ETag");
}

/**
 * Per-part loop with exponential backoff. The first attempt uses the URL the
 * batch presigned; every retry gets one fresh single-part presign, so a part
 * whose URL expired is re-signed by itself, never the whole batch again.
 */
async function putPartWithRetry(
  partNumber: number,
  contentType: string,
  file: File,
  initialUrl: string,
  resign: () => Promise<string>,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_PART_ATTEMPTS; attempt++) {
    try {
      const url = attempt === 0 ? initialUrl : await resign();
      const etag = await putPartOnce(url, file, partNumber, contentType);
      if (etag === null) throw new Error(`Part ${partNumber}: storage returned no ETag`);
      return etag;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_PART_ATTEMPTS - 1) await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Part ${partNumber} failed`);
}

/** Run `run` with at most `limit` items in flight; results keep input order. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const item = items[cursor];
      cursor += 1;
      if (item === undefined) return;
      results[cursor - 1] = await run(item);
    }
  });
  await Promise.all(workers);
  return results;
}

export function VideoUploader({ lessonId }: { lessonId: Id<"lessons"> }) {
  const initUpload = useAction(api.videoStorage.initUpload);
  const signParts = useAction(api.videoStorage.signParts);
  const completeUpload = useAction(api.videoStorage.completeUpload);
  const abortUpload = useAction(api.videoStorage.abortUpload);
  const listUploadedParts = useAction(api.videoStorage.listUploadedParts);
  const draft = useQuery(api.videoAssets.getUploadDraft, { lessonId });
  const assetStatus = useQuery(api.videoAssets.getAssetStatus, { lessonId });

  const [phase, setPhase] = useState<Phase>("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<Id<"videoAssets"> | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase === "initializing" || phase === "uploading" || phase === "assembling";

  const managerAsset = assetStatus?.role === "manager" ? (assetStatus.asset as any) : null;
  const transcodeStatus = managerAsset?.status as string | undefined;
  const transcodeProgress =
    typeof managerAsset?.transcodeProgress === "number" ? managerAsset.transcodeProgress : 0;
  const processingStartedAt =
    typeof managerAsset?.processingStartedAt === "number" ? managerAsset.processingStartedAt : undefined;
  const queuedAt =
    typeof managerAsset?.updatedAt === "number" ? managerAsset.updatedAt : undefined;
  const transcodeError =
    typeof managerAsset?.errorMessage === "string" ? managerAsset.errorMessage : undefined;

  const isTranscoding = transcodeStatus === "queued" || transcodeStatus === "processing";
  const isTranscodeReady = transcodeStatus === "ready";
  const isTranscodeFailed = transcodeStatus === "failed";

  useEffect(() => {
    if (!isTranscoding) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isTranscoding]);

  useEffect(() => {
    if (isTranscodeReady && (phase === "queued" || phase === "idle")) {
      setProgressPercent(100);
    }
  }, [isTranscodeReady, phase]);

  const handleStart = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      const contentType = normalizeRawContentType(file.type, file.name);
      if (!contentType) {
        setMessage("Unsupported video format");
        setPhase("failed");
        return;
      }
      const violation = rawUploadError(file.size, contentType);
      if (violation) {
        setMessage(violation);
        setPhase("failed");
        return;
      }

      const totalParts = rawPartCount(file.size);
      setProgressPercent(0);
      setMessage(null);
      cancelledRef.current = false;
      setPhase("initializing");

      let activeAssetId: Id<"videoAssets">;
      let queue: number[] = Array.from({ length: totalParts }, (_, i) => i + 1);

      try {
        // A reload can resume the multipart upload it left behind — but only
        // for the exact same file. The fingerprint check here duplicates the
        // server's, so a wrong pick never re-signs a single part.
        if (draft) {
          const mismatch = fingerprintError(
            { sizeBytes: draft.sizeBytes, lastModified: draft.lastModified },
            { sizeBytes: file.size, lastModified: file.lastModified },
          );
          if (mismatch) {
            setMessage(`${mismatch}. Cancel the waiting upload to start over.`);
            setPhase("failed");
            return;
          }
          activeAssetId = draft.assetId;
          const landed = await listUploadedParts({ assetId: activeAssetId });
          const landedNumbers = new Set(landed.parts.map((part) => part.partNumber));
          queue = queue.filter((partNumber) => !landedNumbers.has(partNumber));
          setProgressPercent(
            Math.round(((totalParts - queue.length) / totalParts) * 100),
          );
        } else {
          const { assetId: newAssetId, totalParts: serverParts } = await initUpload({
            lessonId,
            sizeBytes: file.size,
            contentType,
            fingerprintLastModified: file.lastModified,
          });
          if (serverParts !== totalParts) throw new Error("Upload parts disagree; retry");
          activeAssetId = newAssetId;
        }

        setAssetId(activeAssetId);
        setPhase("uploading");

        let landedSoFar = totalParts - queue.length;

        // Batches restart cleanly: the queue only holds parts B2 has not
        // confirmed, so already-landed parts are never re-signed.
        while (queue.length > 0) {
          if (cancelledRef.current) throw new UploadCancelledError();
          const batch = queue.splice(0, PARTS_PER_SIGN);
          const signed = await signParts({
            assetId: activeAssetId,
            partNumbers: batch,
            sizeBytes: file.size,
            fingerprintLastModified: file.lastModified,
          });
          const urlByPart = new Map(signed.urls.map((u) => [u.partNumber, u.url]));

          const batchResults = await runWithConcurrency(batch, CONCURRENT_PART_PUTS, async (partNumber) => {
            if (cancelledRef.current) throw new UploadCancelledError();
            const initialUrl = urlByPart.get(partNumber);
            if (!initialUrl) throw new Error(`Storage did not sign part ${partNumber}`);
            await putPartWithRetry(
              partNumber,
              contentType,
              file,
              initialUrl,
              async () => {
                const fresh = await signParts({
                  assetId: activeAssetId,
                  partNumbers: [partNumber],
                  sizeBytes: file.size,
                  fingerprintLastModified: file.lastModified,
                });
                const url = fresh.urls.find((u) => u.partNumber === partNumber)?.url;
                if (!url) throw new Error(`Storage did not sign part ${partNumber}`);
                return url;
              },
            );
            return partNumber;
          });

          landedSoFar += batchResults.length;
          setProgressPercent(Math.round((landedSoFar / totalParts) * 100));
        }

        setPhase("assembling");
        await completeUpload({ assetId: activeAssetId });
        setPhase("queued");
        setProgressPercent(0);
        setNow(Date.now());
      } catch (err) {
        if (err instanceof UploadCancelledError || cancelledRef.current) {
          setPhase("idle");
          setMessage("Upload cancelled.");
          setProgressPercent(0);
        } else {
          setMessage(err instanceof Error ? err.message : "Upload failed");
          setPhase("failed");
        }
      }
    },
    [lessonId, draft, initUpload, signParts, completeUpload, listUploadedParts],
  );

  const handleCancel = useCallback(async () => {
    cancelledRef.current = true;
    setProgressPercent(0);
    if (assetId) {
      try {
        await abortUpload({ assetId });
      } catch (err) {
        setMessage(err instanceof Error ? `Cancel failed: ${err.message}` : "Cancel failed");
      }
    }
  }, [assetId, abortUpload]);

  /**
   * A reload leaves an `awaiting_upload` row behind. Choosing the *same* file
   * resumes it; choosing another cannot, and a lesson would stay blocked by a
   * draft nobody can finish — so the waiting draft is discardable from here.
   */
  const handleDiscardDraft = useCallback(async () => {
    if (!draft) return;
    setMessage(null);
    try {
      await abortUpload({ assetId: draft.assetId });
      setPhase("idle");
    } catch (err) {
      setMessage(err instanceof Error ? `Could not discard: ${err.message}` : "Could not discard");
    }
  }, [draft, abortUpload]);

  const showTranscodePanel =
    isTranscoding ||
    (isTranscodeReady && (phase === "queued" || phase === "idle")) ||
    isTranscodeFailed;

  const transcodeLabel = isTranscoding
    ? transcodeStatus === "processing"
      ? "Transcoding video…"
      : "Queued for transcoding…"
    : isTranscodeReady
      ? "Transcoding complete"
      : "Transcoding failed";

  const elapsedStart = processingStartedAt ?? queuedAt;
  const elapsedMs = elapsedStart ? now - elapsedStart : 0;
  const barValue = busy
    ? phase === "uploading"
      ? progressPercent
      : 0
    : isTranscodeReady
      ? 100
      : isTranscoding
        ? Math.max(0, Math.min(100, transcodeProgress))
        : 0;

  return (
    <div className="space-y-2 rounded-md border border-dashed p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">Direct upload (up to 2 GB)</p>
          <p className="text-xs leading-[1.5] text-muted-foreground">
            Large uploads go straight to storage and are transcoded after landing.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleStart}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose video
        </Button>
      </div>

      {draft && !busy && !isTranscoding && phase !== "queued" ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-2 py-1.5">
          <p className="text-xs leading-[1.5] text-muted-foreground">
            An unfinished upload is waiting. Pick the same file to resume it.
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={handleDiscardDraft}>
            Discard
          </Button>
        </div>
      ) : null}

      {busy ? (
        <div className="space-y-2">
          <Progress value={phase === "uploading" ? progressPercent : 0} />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {phase === "initializing"
                ? "Starting multipart upload…"
                : phase === "assembling"
                  ? "Confirming landed parts…"
                  : `${progressPercent}% uploaded`}
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "queued" && !showTranscodePanel ? (
        <p className="text-xs text-green-700 dark:text-green-400">
          Upload complete — queued for transcoding.
        </p>
      ) : null}

      {showTranscodePanel ? (
        <div className="space-y-2">
          <Progress value={barValue} />
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs ${isTranscodeFailed ? "text-red-600" : isTranscodeReady ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
              {transcodeLabel}
              {isTranscoding ? ` ${barValue}%` : ""}
              {isTranscoding && elapsedMs > 0 ? ` · ${formatElapsed(elapsedMs)} elapsed` : ""}
            </p>
          </div>
          {isTranscodeFailed ? (
            <p className="text-xs text-red-600">{transcodeError ?? "Transcode failed."}</p>
          ) : null}
        </div>
      ) : null}

      {phase === "failed" ? <p className="text-xs text-red-600">{message ?? "Upload failed."}</p> : null}
    </div>
  );
}
