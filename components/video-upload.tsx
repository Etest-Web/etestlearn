"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Progress,
} from "@/components/ui";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Video } from "lucide-react";
import { toast } from "sonner";

export function VideoUpload({ lessonId }: { lessonId: Id<"lessons"> }) {
  const updateLesson = useMutation(api.courses.updateLesson);
  const [uploading, setUploading] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorModal, setErrorModal] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgressPercent(5);
    setStatusMessage("Requesting secure upload URL…");

    try {
      const urlRes = await fetch("/api/publitio/upload-url", { method: "POST" });
      if (!urlRes.ok) {
        const errorData = await urlRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to initialize Publit.io upload");
      }
      const { uploadUrl } = await urlRes.json();

      setProgressPercent(10);
      setStatusMessage("Uploading file to Publit.io…");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("privacy", "1"); // Public/unlisted for streaming

      // Upload directly to Publit.io with XMLHttpRequest to track upload progress
      const publitioResult = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = 10 + Math.round((event.loaded / event.total) * 75);
            setProgressPercent(percent);
            setStatusMessage(`Uploading video (${Math.round((event.loaded / 1024 / 1024) * 10) / 10} MB / ${Math.round((event.total / 1024 / 1024) * 10) / 10} MB)…`);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.success === false) {
                reject(new Error(res.error?.message || "Publit.io upload failed"));
              } else {
                resolve(res);
              }
            } catch {
              reject(new Error("Invalid response from Publit.io"));
            }
          } else {
            reject(new Error(`Publit.io upload error (${xhr.status}): ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during Publit.io upload"));
        xhr.send(formData);
      });

      setProgressPercent(90);
      setStatusMessage("Cloud transcoding started on Publit.io…");

      // Publit.io returns url_preview or url_download
      // The direct streaming URL is typically publitioResult.url_download or .url_preview
      const streamUrl = publitioResult.url_download || publitioResult.url_preview;

      if (!streamUrl) {
        throw new Error("Publit.io did not return a valid video URL");
      }

      setStatusMessage("Saving video URL to lesson…");
      await updateLesson({
        lessonId,
        content: streamUrl,
        contentType: "video",
      });

      setProgressPercent(100);
      toast.success("Video uploaded to Publit.io successfully!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Video upload failed";
      setErrorModal({ open: true, message: msg });
    } finally {
      setUploading(false);
      setProgressPercent(0);
      setStatusMessage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRetry() {
    setErrorModal((prev) => ({ ...prev, open: false }));
    fileInputRef.current?.click();
  }

  return (
    <div className="space-y-4 rounded-md border border-rule bg-surface-sunken p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>Lesson video file</Label>
          <p className="text-xs leading-[1.5] text-muted-foreground">
            Videos are uploaded and automatically transcoded to adaptive quality levels by Publit.io.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          disabled={uploading}
          onChange={handleFileSelect}
        />

        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          {uploading ? "Uploading to Publit.io…" : "Upload Video to Publit.io"}
        </Button>
      </div>

      {uploading && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {statusMessage}
            </span>
            <span className="tabular-nums font-semibold text-foreground">
              {progressPercent}%
            </span>
          </div>
          <Progress value={progressPercent} className="w-full" />
        </div>
      )}

      {/* Error Retry Dialog */}
      <Dialog open={errorModal.open} onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <DialogTitle>Publit.io Upload Failed</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-muted-foreground">
              Failed to upload or transcode the video on Publit.io. Check your network connection and retry.
            </DialogDescription>
          </DialogHeader>

          {errorModal.message && (
            <div className="rounded-md bg-destructive/10 p-3 text-xs font-mono text-destructive">
              {errorModal.message}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setErrorModal((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleRetry} className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
