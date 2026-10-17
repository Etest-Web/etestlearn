"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  CANVAS_BASELINE_NUDGE,
  CERTIFICATE_COLORS,
  CERTIFICATE_FIELDS,
  CERTIFICATE_FONT_CSS,
  CERTIFICATE_FONT_STYLE,
  CERTIFICATE_FONT_WEIGHT,
  LINE_HEIGHT_RATIO,
  MAX_FIELD_SIZE,
  MIN_FIELD_SIZE,
  certificateFieldLines,
  rgbToCss,
  type CertificateFieldKey,
  type CertificateLayout,
  type FieldAnchor,
} from "@/lib/certificate-layout";

/**
 * The live placement canvas: the certificate page, drawn at its true
 * proportions, with the six text fields sitting on it as draggable objects.
 *
 * This replaces the `x,y` boxes. Every number the renderer uses — the anchor,
 * the font size, the wrap width, the truncation — is read from
 * `lib/certificate-layout.ts` and reproduced here in CSS, so what an admin
 * drags is where the PDF will actually print. The background is the real
 * uploaded artwork, rasterised with pdf.js, because positioning text against a
 * grey rectangle is guesswork.
 *
 * With no artwork installed it draws the built-in bordered page instead, which
 * is exactly what a certificate would be stamped onto today.
 */

type BackgroundStatus = "idle" | "loading" | "ready" | "failed";

interface Props {
  pageWidth: number;
  pageHeight: number;
  /** The background PDF's URL, or null to draw the built-in artwork. */
  backgroundUrl: string | null;
  /** Every field resolved to an anchor, or null when it is switched off. */
  layout: Required<CertificateLayout>;
  selected: CertificateFieldKey | null;
  onSelect: (key: CertificateFieldKey) => void;
  /** Emitted continuously while dragging, and by the panel's precision inputs. */
  onChange: (key: CertificateFieldKey, anchor: FieldAnchor) => void;
  /** Centre lines and page margins. */
  showGuides?: boolean;
}

/** Fraction of the page the magnetic centre line claims. ~3pt on A4 landscape. */
const SNAP_TO_CENTRE = 0.004;

/** Arrow-key movement, in fractions of the page. */
const NUDGE = 0.002;
const NUDGE_LARGE = 0.01;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * pdf.js, loaded only when there is artwork to rasterise.
 *
 * `import()` rather than a top-level import: the module is large enough to
 * matter on a dashboard route, and it belongs to the browser alone, so
 * deferring it to an effect keeps it out of both the server render and this
 * route's initial bundle.
 *
 * The worker is handed a real URL rather than being inlined because pdf.js
 * insists on one; `new URL(..., import.meta.url)` is how the bundler turns the
 * worker file into a same-origin asset, which is what `worker-src 'self'` in
 * the CSP allows.
 */
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        return pdfjs;
      })
      .catch((err) => {
        // Do not cache a failure: the admin may retry after a flaky load.
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

/**
 * The bordered page `lib/certificate-pdf.ts` draws when nothing is uploaded,
 * restated in canvas terms. Point-for-point the same two rectangles.
 */
function paintFallbackArtwork(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Work in points so the strokes land at the widths the PDF uses.
  ctx.setTransform(canvas.width / pageWidth, 0, 0, canvas.width / pageWidth, 0, 0);
  ctx.clearRect(0, 0, pageWidth, pageHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  ctx.strokeStyle = "rgb(148, 93, 163)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, pageWidth - 48, pageHeight - 48);

  ctx.strokeStyle = "rgb(232, 227, 232)";
  ctx.lineWidth = 0.75;
  ctx.strokeRect(32, 32, pageWidth - 64, pageHeight - 64);
}

export function CertificateCanvas({
  pageWidth,
  pageHeight,
  backgroundUrl,
  layout,
  selected,
  onSelect,
  onChange,
  showGuides = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<
    | {
        mode: "move" | "resize";
        key: CertificateFieldKey;
        pointerId: number;
        /** The anchor the drag began from, so moves never lose its size. */
        startAnchor: FieldAnchor;
        /** Pointer position relative to the anchor, so the field does not jump. */
        offsetX: number;
        offsetY: number;
        /** Half the field's rendered width, in px — the resize lever. */
        startHalfWidth: number;
      }
    | null
  >(null);

  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<BackgroundStatus>("idle");
  const [dragging, setDragging] = useState<CertificateFieldKey | null>(null);
  const [snapped, setSnapped] = useState(false);

  // The raster is drawn at device resolution, so it needs redrawing when the
  // box changes size — the canvas is not vector-scaled by the browser.
  const [paintToken, setPaintToken] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
      setPaintToken((t) => t + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Loads the background artwork, or falls back to the built-in page. */
  useEffect(() => {
    let cancelled = false;
    docRef.current = null;

    if (!backgroundUrl) {
      setStatus("ready");
      setPaintToken((t) => t + 1);
      return;
    }

    setStatus("loading");
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const response = await fetch(backgroundUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setStatus("ready");
        setPaintToken((t) => t + 1);
      } catch {
        if (cancelled) return;
        setStatus("failed");
        setPaintToken((t) => t + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backgroundUrl]);

  /** Draws the background at the current device-pixel size. */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = container.clientWidth;
    const cssHeight = (cssWidth * pageHeight) / pageWidth;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));

    const doc = docRef.current;
    if (!doc) {
      paintFallbackArtwork(canvas, pageWidth, pageHeight);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(1);
        if (cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const viewport = page.getViewport({
          scale: canvas.width / pageWidth,
        });
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch {
        if (!cancelled) paintFallbackArtwork(canvas, pageWidth, pageHeight);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paintToken, width, pageWidth, pageHeight]);

  const height = (width * pageHeight) / pageWidth;
  const scale = width / pageWidth;

  /** Applies one pointer position to whichever drag is in flight. */
  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      const el = containerRef.current;
      if (!drag || !el) return;

      const rect = el.getBoundingClientRect();

      if (drag.mode === "move") {
        const x = (clientX - rect.left - drag.offsetX) / rect.width;
        const y = (clientY - rect.top - drag.offsetY) / rect.height;
        const nearCentre = Math.abs(x - 0.5) < SNAP_TO_CENTRE;
        setSnapped(nearCentre);
        onChange(drag.key, {
          ...drag.startAnchor,
          x: nearCentre ? 0.5 : clamp(x, 0, 1),
          y: clamp(y, 0, 1),
        });
        return;
      }

      // Resize: keep the position, follow the pointer with the text's right
      // edge. A drag past the anchor collapses to the floor rather than
      // inverting the size.
      const anchorPx = rect.left + drag.startAnchor.x * rect.width;
      const halfWidth = Math.max(1, drag.startHalfWidth);
      const startSize = drag.startAnchor.size ?? 14;
      const raw = startSize * ((clientX - anchorPx) / halfWidth);
      onChange(drag.key, {
        ...drag.startAnchor,
        size: clamp(
          Number.isFinite(raw) ? raw : MIN_FIELD_SIZE,
          MIN_FIELD_SIZE,
          MAX_FIELD_SIZE,
        ),
      });
    },
    [onChange],
  );

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    setSnapped(false);
    if (!drag) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-certificate-field="${drag.key}"]`,
    );
    // The browser drops capture on pointerup anyway; releasing a pointer the
    // element no longer holds throws, so check first rather than let a stray
    // exception swallow the rest of the handler.
    if (el?.hasPointerCapture?.(drag.pointerId)) {
      try {
        el.releasePointerCapture(drag.pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  const startDrag = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      key: CertificateFieldKey,
      mode: "move" | "resize",
    ) => {
      const anchor = layout[key];
      if (!anchor) return;
      if (event.button !== 0) return;

      const el = containerRef.current;
      const fieldEl = event.currentTarget;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const halfWidth = Math.max(1, fieldEl.offsetWidth / 2);

      dragRef.current = {
        mode,
        key,
        pointerId: event.pointerId,
        startAnchor: anchor,
        offsetX: event.clientX - rect.left - anchor.x * rect.width,
        offsetY: event.clientY - rect.top - anchor.y * rect.height,
        startHalfWidth: mode === "resize" ? halfWidth : 0,
      };

      fieldEl.setPointerCapture(event.pointerId);
      onSelect(key);
      setDragging(key);
      event.preventDefault();
    },
    [layout, onSelect],
  );

  const nudge = useCallback(
    (key: CertificateFieldKey, dx: number, dy: number) => {
      const anchor = layout[key];
      if (!anchor) return;
      onChange(key, {
        ...anchor,
        x: clamp(anchor.x + dx, 0, 1),
        y: clamp(anchor.y + dy, 0, 1),
      });
    },
    [layout, onChange],
  );

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative w-full touch-none overflow-hidden rounded-md border border-rule bg-white select-none"
        style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }}
        onPointerMove={(e) => {
          if (dragRef.current) applyDrag(e.clientX, e.clientY);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block" />

        {showGuides && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 border-x border-dashed border-sky-400/70"
              style={{ left: "5%", right: "5%" }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 border-y border-dashed border-sky-400/70"
              style={{ top: "5%", bottom: "5%" }}
            />
          </>
        )}

        <div
          className="pointer-events-none absolute inset-y-0 border-l border-dashed border-sky-500"
          style={{
            left: `${0.5 * width}px`,
            opacity: snapped ? 1 : 0,
          }}
        />

        {CERTIFICATE_FIELDS.map((field) => {
          const anchor = layout[field.key];
          if (!anchor) return null;

          const size = anchor.size ?? 14;
          const lines = certificateFieldLines(
            field.key,
            field.sample,
            pageWidth,
            size,
          );
          const isSelected = selected === field.key;

          return (
            <div
              key={field.key}
              data-certificate-field={field.key}
              role="button"
              tabIndex={0}
              aria-label={`${field.label}: ${Math.round(anchor.x * 100)}% across, ${Math.round(anchor.y * 100)}% down, ${Math.round(size)} point. Drag to move, or use the arrow keys.`}
              onPointerDown={(e) => startDrag(e, field.key, "move")}
              onKeyDown={(e) => {
                const step = e.shiftKey ? NUDGE_LARGE : NUDGE;
                const map: Record<string, [number, number]> = {
                  ArrowLeft: [-step, 0],
                  ArrowRight: [step, 0],
                  ArrowUp: [0, -step],
                  ArrowDown: [0, step],
                };
                const delta = map[e.key];
                if (!delta) return;
                e.preventDefault();
                onSelect(field.key);
                nudge(field.key, delta[0], delta[1]);
              }}
              className="absolute cursor-grab rounded-sm outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                left: anchor.x * width,
                top: anchor.y * height + CANVAS_BASELINE_NUDGE * size * scale,
                transform: "translateX(-50%)",
                // While one field moves, the rest recede — alignment against
                // them is exactly what the admin is lining it up to.
                opacity: dragging && dragging !== field.key ? 0.45 : 1,
                transition: "opacity 120ms ease",
                color: rgbToCss(CERTIFICATE_COLORS[field.color]),
                fontFamily: CERTIFICATE_FONT_CSS[field.font],
                fontWeight: CERTIFICATE_FONT_WEIGHT[field.font],
                fontStyle: CERTIFICATE_FONT_STYLE[field.font] as "normal" | "italic",
                fontSize: size * scale,
                lineHeight: LINE_HEIGHT_RATIO,
                whiteSpace: "pre",
                // Every line is centred on the anchor in the PDF, so wrapped
                // lines have to be centred in the box too — left-aligned, the
                // second line of a long course title would sit off to one side.
                textAlign: "center",
                // Lift the text off the artwork just enough to stay readable
                // over a busy background without looking like a highlight.
                textShadow: isSelected
                  ? "0 0 0.6em rgba(255,255,255,0.95)"
                  : "0 0 0.4em rgba(255,255,255,0.8)",
                boxShadow: isSelected
                  ? "0 0 0 1px rgba(37,99,235,0.9), 0 0 0 4px rgba(37,99,235,0.25)"
                  : undefined,
              }}
            >
              {lines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}

              {isSelected && (
                <span
                  // Pure mouse affordance: the panel's Size input is the
                  // keyboard and screen-reader path to the same control, so
                  // this stays out of the accessibility tree rather than
                  // nesting a second button inside this one.
                  aria-hidden="true"
                  title="Drag to change the font size"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    startDrag(e, field.key, "resize");
                  }}
                  className="absolute -right-2.5 -bottom-2.5 h-3 w-3 cursor-nwse-resize rounded-full border-2 border-white bg-blue-600 shadow"
                />
              )}
            </div>
          );
        })}

        {/* Status sits over the artwork, where a missing background is obvious. */}
        {(status === "loading" || status === "failed") && (
          <div className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-md border border-rule bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
            {status === "loading" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Drawing the background…
              </>
            ) : status === "failed" ? (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-600" /> Background not
                shown — placement still works, but check the PDF preview
              </>
            ) : null}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag a field to move it; drag the blue dot on a selected field to resize
        its text. Arrow keys nudge, hold Shift to move ten steps. The dashed
        centre line catches fields as they pass the middle of the page.
      </p>
    </div>
  );
}
