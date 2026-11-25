"use client";

import { useMemo } from "react";

function extractYouTubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") {
    return url.pathname.slice(1) || null;
  }
  if (url.searchParams.get("v")) {
    return url.searchParams.get("v");
  }
  const embedMatch = url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
  return embedMatch?.[1] ?? null;
}

/**
 * Extracts a streamable embed URL for YouTube or Vimeo.
 *
 * Exported so `tests/video-player-embed.test.ts` can pin the host allow-list;
 * it is a pure string→string map with no React in it.
 */
export function getEmbedUrl(src: string): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    const id = extractYouTubeId(url);
    if (!id) return null;
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }

  if (host === "player.vimeo.com" && /^\/video\//.test(url.pathname)) {
    return url.toString();
  }

  if (host === "vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) {
      return `https://player.vimeo.com/video/${id}`;
    }
  }

  return null;
}

/**
 * Renders a lesson video.
 * Embeds YouTube/Vimeo, or falls back to protected HTML5 video.
 */
export function VideoPlayer({ src, title }: { src: string; title: string }) {
  const embed = useMemo(() => getEmbedUrl(src), [src]);

  if (embed) {
    return (
      <div className="relative w-full overflow-hidden rounded-sm bg-black" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          src={embed}
          title={title}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <video
      controls
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
      onContextMenu={(e) => e.preventDefault()}
      preload="metadata"
      className="w-full rounded-sm bg-black select-none"
      style={{ aspectRatio: "16 / 9" }}
      src={src}
    >
      Your browser does not support video playback.
    </video>
  );
}
