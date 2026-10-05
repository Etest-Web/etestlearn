"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Label } from "@/components/ui";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { LessonVideoUploadButton } from "@/components/uploadthing";

/**
 * Instructor upload for self-hosted lesson video.
 *
 * The raw file goes to UploadThing (its uploader enforces the 1 GB video
 * cap); on completion the client attaches it via `registerSource`, which
 * re-verifies management rights and kicks off the ffmpeg transcode.
 * Uploading again replaces the video in place; the old ladder keeps serving
 * until the new one is ready.
 */
export function VideoUpload({ lessonId }: { lessonId: Id<"lessons"> }) {
  const assetState = useQuery(api.videoAssets.getAssetStatus, { lessonId });
  const registerSource = useMutation(api.videoAssets.registerSource);
  const [attaching, setAttaching] = useState(false);

  const asset = assetState?.role === "manager" ? assetState.asset : null;

  return (
    <div className="space-y-3 rounded-md border border-rule bg-surface-sunken p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>Lesson video file</Label>
          <p className="text-xs leading-[1.5] text-muted-foreground">
            Uploaded videos are transcoded to adaptive quality levels and encrypted. Re-uploading replaces the video in place.
          </p>
        </div>
        {asset && (
          <span className="text-xs tabular text-muted-foreground">
            {asset.status === "ready" && asset.durationSeconds
              ? `Ready · ${asset.variants?.length ?? 0} qualities · ${Math.round(asset.durationSeconds / 60)} min`
              : asset.status === "failed"
                ? `Failed: ${asset.errorMessage ?? "transcode error"}`
                : "Processing…"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LessonVideoUploadButton
          endpoint="lessonVideo"
          input={{ lessonId }}
          onClientUploadComplete={async (res) => {
            const file = res[0];
            if (!file) return;
            setAttaching(true);
            try {
              await registerSource({
                lessonId,
                sourceFileUrl: file.url,
                sourceFileKey: file.key,
                sizeBytes: file.size,
              });
              toast.success("Upload received — transcoding started");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to attach upload");
            } finally {
              setAttaching(false);
            }
          }}
          onUploadError={(e) => {
            toast.error(e.message);
          }}
        />
        {attaching && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Attaching upload…
          </span>
        )}
      </div>
      {asset?.status === "processing" || asset?.status === "pending" ? (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <UploadCloud className="h-4 w-4" />
          Transcoding in progress — students see the previous video (if any) until the new one is ready.
        </p>
      ) : null}
    </div>
  );
}
