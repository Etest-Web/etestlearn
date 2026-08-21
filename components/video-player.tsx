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
 * Renders a lesson video from a URL: YouTube and Vimeo links become embedded
 * players, anything else is treated as a direct video file (MP4/WebM) —
 * including Convex storage URLs.
 */
export function VideoPlayer({ src, title }: { src: string; title: string }) {
  const embed = useMemo(() => {
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
  }, [src]);

  if (embed) {
    return (
      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          src={embed}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <video
      controls
      preload="metadata"
      className="w-full rounded-xl bg-black"
      style={{ aspectRatio: "16 / 9" }}
      src={src}
    >
      Your browser does not support video playback.
    </video>
  );
}
