"use client";

/**
 * One image for one slide, uploaded straight to B2 through a presigned PUT.
 * Bytes never transit Convex. The public URL comes back from the presign
 * action and is stored on the slide by the lesson editor's save — so a picked
 * file is not committed until the lesson itself is saved.
 *
 * Alt text is owned here because it is the only place the author sees the
 * image while describing it. The Convex sanitizer rejects an image without
 * alt, so an undescribed slide cannot be saved even if this control is bypassed.
 */

import { useCallback, useRef, useState } from "react";
import { useAction } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { presignSlideImage } from "@/lib/slide-images-api";
import {
  MAX_SLIDE_IMAGE_BYTES,
  normalizeSlideImageType,
} from "@/lib/slideImages";
import { toast } from "sonner";

export interface SlideImageValue {
  url: string;
  alt: string;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";

export function SlideImageUploader({
  lessonId,
  value,
  onChange,
}: {
  lessonId: Id<"lessons">;
  value?: SlideImageValue;
  onChange: (next: SlideImageValue | undefined) => void;
}) {
  const presign = useAction(presignSlideImage);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      const type = normalizeSlideImageType(file.type, file.name);
      if (!type) {
        toast.error("Use PNG, JPEG, WebP or GIF images only");
        return;
      }
      if (file.size > MAX_SLIDE_IMAGE_BYTES) {
        toast.error(`Image must be ${Math.round(MAX_SLIDE_IMAGE_BYTES / 1024 / 1024)} MB or less`);
        return;
      }

      setUploading(true);
      try {
        const signed = await presign({
          lessonId,
          contentType: type,
          fileName: file.name,
          sizeBytes: file.size,
        });
        const res = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": type },
          body: file,
        });
        if (!res.ok) throw new Error(`Storage rejected the upload (${res.status})`);
        // Keep the alt the author already typed, if any — replacing an image
        // should not silently drop its description.
        onChange({ url: signed.publicUrl, alt: value?.alt ?? "" });
        toast.success("Image uploaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Image upload failed");
      } finally {
        setUploading(false);
      }
    },
    [lessonId, onChange, presign, value],
  );

  const setAlt = (alt: string) => {
    if (!value) return;
    onChange({ ...value, alt });
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFile}
      />

      {value ? (
        <>
          <div className="flex justify-center rounded-md bg-muted/40 p-2">
            {/* contain, not cover: a slide image must never be cropped. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.url}
              alt={value.alt || "Slide image preview"}
              className="max-h-56 w-full object-contain"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="slide-image-alt">Alt text (required)</Label>
            <Input
              id="slide-image-alt"
              value={value.alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Describe the image for screen readers"
            />
            {!value.alt.trim() ? (
              <p className="text-xs text-amber-600">Add alt text before saving.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Replace image"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={uploading}
              onClick={() => onChange(undefined)}
            >
              Remove image
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-[1.5] text-muted-foreground">
            PNG, JPEG, WebP or GIF, up to {Math.round(MAX_SLIDE_IMAGE_BYTES / 1024 / 1024)} MB.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Choose image"}
          </Button>
        </div>
      )}
    </div>
  );
}
