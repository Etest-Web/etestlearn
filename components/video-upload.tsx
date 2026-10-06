"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Label } from "@/components/ui";
import { Loader2, UploadCloud, Video } from "lucide-react";
import { toast } from "sonner";
import { fetchFile } from "@ffmpeg/util";
import {
  getFFmpeg,
  arrayBufferToHex,
  encryptSegment,
} from "@/lib/client-video-transcode";
import { buildMasterPlaylist, type LadderVariant } from "@/lib/video-playlists";

export function VideoUpload({ lessonId }: { lessonId: Id<"lessons"> }) {
  const assetState = useQuery(api.videoAssets.getAssetStatus, { lessonId });
  const initClientTranscode = useMutation(api.videoAssets.initClientTranscode);
  const completeClientTranscode = useMutation(api.videoAssets.completeClientTranscode);
  const failClientTranscode = useMutation(api.videoAssets.failClientTranscode);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const asset = assetState?.role === "manager" ? assetState.asset : null;

  async function uploadBlobToConvex(blob: Blob): Promise<Id<"_storage">> {
    const postUrl = await generateUploadUrl();
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
    });
    if (!res.ok) throw new Error("Failed to upload file chunk");
    const { storageId } = await res.json();
    return storageId;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    let createdAssetId: Id<"videoAssets"> | null = null;

    try {
      setStatusMessage("Initializing transcode session…");
      const { assetId } = await initClientTranscode({ lessonId });
      createdAssetId = assetId;

      setStatusMessage("Loading WebAssembly FFmpeg…");
      const ffmpeg = await getFFmpeg((msg) => {
        // Filter out noisy debug lines
        if (msg.includes("frame=") || msg.includes("fps=")) {
          setStatusMessage(`Transcoding: ${msg.trim()}`);
        }
      });

      setStatusMessage("Reading video into memory…");
      const videoData = await fetchFile(file);
      await ffmpeg.writeFile("input.mp4", videoData);

      setStatusMessage("Transcoding to HLS (this may take a few minutes)…");
      // Produce standard HLS stream (720p cap for client performance)
      await ffmpeg.exec([
        "-i", "input.mp4",
        "-vf", "scale=-2:min(720\\,ih)",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-b:v", "1500k",
        "-maxrate", "1600k",
        "-bufsize", "3000k",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "48000",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
        "-hls_segment_type", "mpegts",
        "-hls_segment_filename", "seg_0_%03d.ts",
        "-f", "hls",
        "out_0.m3u8",
      ]);

      setStatusMessage("Encrypting segments with AES-128…");
      const rawKey = window.crypto.getRandomValues(new Uint8Array(16));
      const rawIv = window.crypto.getRandomValues(new Uint8Array(16));
      const ivHex = arrayBufferToHex(rawIv);

      const keyStorageId = await uploadBlobToConvex(
        new Blob([rawKey.buffer], { type: "application/octet-stream" })
      );

      // Read output directory files
      const dirList = (await ffmpeg.listDir(".")) as Array<{ name: string; isDir: boolean }>;
      const segmentFiles = dirList
        .filter((entry) => entry.name.startsWith("seg_0_") && entry.name.endsWith(".ts"))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (segmentFiles.length === 0) {
        throw new Error("Transcode yielded no video segments");
      }

      const uploadedSegments: Array<{ variant: number; name: string; storageId: Id<"_storage"> }> = [];
      let segIndex = 0;

      for (const seg of segmentFiles) {
        segIndex++;
        setStatusMessage(`Encrypting and uploading segment ${segIndex}/${segmentFiles.length}…`);
        const rawTs = (await ffmpeg.readFile(seg.name)) as Uint8Array;
        const ciphertext = await encryptSegment(rawTs, rawKey, rawIv);

        const storageId = await uploadBlobToConvex(
          new Blob([ciphertext.buffer], { type: "video/mp2t" })
        );
        uploadedSegments.push({ variant: 0, name: seg.name, storageId });
        await ffmpeg.deleteFile(seg.name);
      }

      setStatusMessage("Saving playlist manifests…");
      const manifestBytes = (await ffmpeg.readFile("out_0.m3u8")) as Uint8Array;
      const variantManifestStorageId = await uploadBlobToConvex(
        new Blob([manifestBytes.buffer], { type: "application/x-mpegURL" })
      );
      await ffmpeg.deleteFile("out_0.m3u8");
      await ffmpeg.deleteFile("input.mp4");

      const ladder: LadderVariant[] = [
        { label: "720p", height: 720, bitrate: 1500000, maxrate: 1600000, bufsize: 3000000, bandwidth: 1600000 },
      ];
      const masterManifest = buildMasterPlaylist(ladder);
      const masterManifestStorageId = await uploadBlobToConvex(
        new Blob([masterManifest], { type: "application/x-mpegURL" })
      );

      setStatusMessage("Completing video asset…");
      await completeClientTranscode({
        assetId: createdAssetId,
        masterManifestStorageId,
        variantManifestStorageIds: [variantManifestStorageId],
        segments: uploadedSegments,
        keyStorageId,
        ivHex,
        variants: ladder,
        durationSeconds: 0, // In browser HLS duration probed by player
      });

      toast.success("Video transcoded, encrypted, and ready!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Video transcode failed";
      toast.error(msg);
      if (createdAssetId) {
        await failClientTranscode({ assetId: createdAssetId, errorMessage: msg }).catch(() => {});
      }
    } finally {
      setProcessing(false);
      setStatusMessage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-rule bg-surface-sunken p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>Lesson video file</Label>
          <p className="text-xs leading-[1.5] text-muted-foreground">
            Video is transcoded to adaptive HLS and AES-128 encrypted directly in your browser.
          </p>
        </div>
        {asset && (
          <span className="text-xs tabular text-muted-foreground">
            {asset.status === "ready"
              ? "Ready (HLS encrypted)"
              : asset.status === "failed"
                ? `Failed: ${asset.errorMessage ?? "transcode error"}`
                : "Processing…"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          disabled={processing}
          onChange={handleFileSelect}
        />

        <Button
          type="button"
          variant="outline"
          disabled={processing}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          {processing ? "Transcoding…" : "Select Video File"}
        </Button>

        {processing && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {statusMessage}
          </span>
        )}
      </div>

      {asset?.status === "processing" && !processing ? (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <UploadCloud className="h-4 w-4" />
          Transcoding in progress…
        </p>
      ) : null}
    </div>
  );
}
