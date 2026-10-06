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
 * Extracts a streamable embed URL for YouTube, Vimeo, or a Publit.io custom player.
 */
function getEmbedUrl(src: string): string | null {
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

  // Publit.io custom player embed ("main")
  // e.g. https://media.publit.io/file/8D4Nr5G1.mp4 or https://media.publit.io/file/8D4Nr5G1.html
  if (host.includes("publit.io")) {
    // If it's already an embed link (ends with .html), ensure player param is attached
    if (url.pathname.endsWith(".html")) {
      url.searchParams.set("player", "main");
      return url.toString();
    }
    // Convert file link (e.g. /file/ID.mp4) to embed link (/file/ID.html?player=main)
    const match = url.pathname.match(/\/file\/([^/.]+)(?:\.[^/]+)?$/);
    if (match?.[1]) {
      return `https://${url.hostname}/file/${match[1]}.html?player=main`;
    }
  }

  return null;
}

/**
 * Renders a lesson video.
 * Uses the custom "main" player embed for cloud-hosted files,
 * embeds YouTube/Vimeo, or falls back to protected HTML5 video.
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
