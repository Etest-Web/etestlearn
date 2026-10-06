"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export type WatchProgress = {
  positionSeconds: number;
  durationSeconds: number;
  percent: number;
};

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Player for self-hosted encrypted HLS ladders.
 *
 * The manifest URL carries a short-lived playback token minted by
 * `videoAssets.issuePlaybackToken`; hls.js follows the tokenized key and
 * segment URLs stamped into the served playlists. There are deliberately no
 * native controls and no source URL a viewer can copy — context menu is
 * suppressed and the only chrome is the custom bar below.
 */
export function EncryptedVideoPlayer({
  assetId,
  title,
  onProgress,
}: {
  assetId: Id<"videoAssets">;
  title: string;
  onProgress?: (p: WatchProgress) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastReportRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const issueToken = useMutation(api.videoAssets.issuePlaybackToken);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
        if (!site) throw new Error("Playback is not configured");
        const { token } = await issueToken({ assetId });
        if (!cancelled) setMasterUrl(`${site}/video/${assetId}/master.m3u8?t=${token}`);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start playback");
      }
    })();
    return () => { cancelled = true; };
  }, [assetId, issueToken]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !masterUrl) return;
    setError(null);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = masterUrl;
      return;
    }
    if (!Hls.isSupported()) {
      setError("This browser cannot play encrypted video");
      return;
    }
    const hls = new Hls({ enableWorker: true });
    hlsRef.current = hls;
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) setError("Playback failed. Please retry.");
    });
    hls.loadSource(masterUrl);
    hls.attachMedia(video);
    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [masterUrl]);

  const report = useCallback((position: number, total: number, force = false) => {
    if (!onProgressRef.current || total <= 0) return;
    const now = Date.now();
    if (!force && now - lastReportRef.current < 5000) return;
    lastReportRef.current = now;
    onProgressRef.current({
      positionSeconds: position,
      durationSeconds: total,
      percent: Math.min(100, (position / total) * 100),
    });
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, seconds));
  }, []);

  const enterPiP = useCallback(async () => {
    try {
      await videoRef.current?.requestPictureInPicture();
    } catch {
      /* PiP unavailable — ignore */
    }
  }, []);

  const enterFullscreen = useCallback(() => {
    void videoRef.current?.parentElement?.requestFullscreen().catch(() => {});
  }, []);

  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-sm bg-surface-sunken p-8" style={{ aspectRatio: "16 / 9" }}>
        <p className="text-sm text-foreground/80">{error}</p>
      </div>
    );
  }

  return (
    <div className="group relative w-full overflow-hidden rounded-sm bg-surface-sunken" style={{ aspectRatio: "16 / 9" }}>
      <video
        ref={videoRef}
        title={title}
        preload="metadata"
        playsInline
        className="absolute inset-0 h-full w-full"
        onContextMenu={(e) => e.preventDefault()}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          const v = videoRef.current;
          if (v) report(v.currentTime, v.duration, true);
        }}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v) return;
          setCurrentTime(v.currentTime);
          if (v.buffered.length > 0) setBufferedEnd(v.buffered.end(v.buffered.length - 1));
          report(v.currentTime, v.duration);
        }}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (v) {
            setDuration(v.duration);
            setMuted(v.muted);
          }
        }}
        onEnded={() => {
          const v = videoRef.current;
          if (v) report(v.duration, v.duration, true);
        }}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.1}
          value={Math.min(currentTime, duration)}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full accent-white"
          style={{
            background: `linear-gradient(to right, white ${(duration ? (currentTime / duration) * 100 : 0).toFixed(1)}%, rgba(255,255,255,0.25) ${(duration ? (currentTime / duration) * 100 : 0).toFixed(1)}%)`,
          }}
        />
        <div className="flex items-center gap-2 text-foreground">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="rounded p-1 hover:bg-input/40">
            {playing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            )}
          </button>
          <span className="text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          {bufferedEnd > 0 && duration > 0 && (
            <span className="text-[11px] text-foreground/60 tabular-nums">buffered {formatTime(bufferedEnd)}</span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            className="rounded p-1 hover:bg-input/40"
          >
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16 8.5l5 7m0-7l-5 7" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
            )}
          </button>
          <button type="button" onClick={enterPiP} aria-label="Picture in picture" className="rounded p-1 hover:bg-white/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="12" y="11" width="6" height="4" rx="1" fill="currentColor" stroke="none" /></svg>
          </button>
          <button type="button" onClick={enterFullscreen} aria-label="Fullscreen" className="rounded p-1 hover:bg-input/40">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
