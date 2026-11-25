"use client";

/**
 * The freeform 16:9 canvas. Geometry is fractions of the canvas box, so the
 * same elements render identically at any width. The editor reuses
 * `CanvasElementView` — it never reimplements how a slide looks.
 */

import { Lock } from "lucide-react";
import { SlideChart, SlideMarkdown, type SlidePalette } from "@/components/slide-shared";
import type { CanvasElement } from "@/lib/slides";

export type CanvasFonts = { heading: string; body: string };

export function CanvasElementView({
  element,
  palette,
  fonts,
}: {
  element: CanvasElement;
  palette: SlidePalette;
  fonts: CanvasFonts;
}) {
  switch (element.kind) {
    case "text":
      return (
        <SlideMarkdown
          text={element.text}
          className="h-full overflow-hidden text-[clamp(0.55rem,1.5vw,1.35rem)] leading-tight [&_p]:my-0 [&_h1]:text-[1.4em] [&_h2]:text-[1.3em] [&_h3]:text-[1.15em]"
        />
      );
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded B2 URL, object-contain letterboxes
        <img src={element.src} alt={element.alt} className="h-full w-full object-contain" draggable={false} />
      );
    case "chart":
      return <SlideChart chart={element.chart} palette={palette} fontFamily={fonts.body} className="h-full w-full" />;
    case "shape":
      if (element.shape === "line") {
        return (
          <div className="flex h-full w-full items-center">
            <div className="h-0.5 w-full" style={{ background: palette.accent }} />
          </div>
        );
      }
      return (
        <div
          className="h-full w-full"
          style={{
            background: palette.accent,
            borderRadius: element.shape === "circle" ? "50%" : 6,
            border: `1px solid ${palette.border}`,
          }}
        />
      );
    case "video":
      return (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg px-2 text-center"
          style={{ background: palette.surface, border: `1px dashed ${palette.border}`, color: palette.muted }}
        >
          <Lock className="h-[1.2em] w-[1.2em] shrink-0" />
          <span className="text-[0.7em] leading-tight">Video — Coming Soon</span>
        </div>
      );
  }
}

export function FreeformCanvas({
  elements,
  palette,
  fonts,
  className = "",
}: {
  elements: CanvasElement[];
  palette: SlidePalette;
  fonts: CanvasFonts;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden ${className}`}
      style={{ color: palette.foreground, fontFamily: fonts.body }}
    >
      {elements.map((element) => (
        <div
          key={element.id}
          className="absolute"
          style={{
            left: `${element.x * 100}%`,
            top: `${element.y * 100}%`,
            width: `${element.w * 100}%`,
            height: `${element.h * 100}%`,
          }}
        >
          <CanvasElementView element={element} palette={palette} fonts={fonts} />
        </div>
      ))}
    </div>
  );
}
