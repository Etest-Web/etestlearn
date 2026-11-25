"use client";

/**
 * Freeform canvas authoring. The editor owns the undo stack and commits the
 * whole element array to the controlled slide; the learner renderer never
 * sees editor state. Drag/resize snap to quarter guides, stay in bounds and
 * allow overlap — the slide is a poster, not a layout engine.
 */

import { useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { SlideImageUploader } from "@/components/slide-image-uploader";
import type { SlideImageValue } from "@/components/slide-image-uploader";
import { CanvasElementView, type CanvasFonts } from "@/components/slide-canvas";
import {
  CANVAS_ELEMENT_LIMITS,
  CHART_KINDS,
  clampCanvasBox,
  FONT_PAIR_STYLES,
  formatChartRows,
  newCanvasElementId,
  PALETTE_STYLES,
  parseChartRows,
  SHAPE_KINDS,
  type CanvasBox,
  type CanvasElement,
  type ChartKind,
  type DeckTheme,
  type ShapeKind,
} from "@/lib/slides";

const MARKS = [0, 0.25, 0.5, 0.75, 1];
const SNAP = 0.015;
const HISTORY_LIMIT = 60;

type Guides = { x?: number; y?: number };
type DragState = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origin: CanvasBox;
  rect: DOMRect;
  before: CanvasElement[];
};

function snapBox(box: CanvasBox, mode: DragState["mode"]): { box: CanvasBox; guides: Guides } {
  const snap = (value: number) => {
    for (const mark of MARKS) {
      if (Math.abs(value - mark) <= SNAP) return { value: mark, mark };
    }
    return { value, mark: null };
  };
  const guides: Guides = {};
  let { x, y, w, h } = box;
  if (mode === "move") {
    let hit = snap(x);
    x = hit.value;
    if (hit.mark !== null) guides.x = hit.mark;
    hit = snap(x + w);
    if (hit.mark !== null) {
      guides.x = hit.mark;
      x = hit.mark - w;
    }
    hit = snap(y);
    y = hit.value;
    if (hit.mark !== null) guides.y = hit.mark;
    hit = snap(y + h);
    if (hit.mark !== null) {
      guides.y = hit.mark;
      y = hit.mark - h;
    }
  } else {
    let hit = snap(x + w);
    if (hit.mark !== null) {
      guides.x = hit.mark;
      w = hit.mark - x;
    }
    hit = snap(y + h);
    if (hit.mark !== null) {
      guides.y = hit.mark;
      h = hit.mark - y;
    }
  }
  return { box: clampCanvasBox({ x, y, w, h }), guides };
}

export function SlideCanvasEditor({
  lessonId,
  theme,
  elements,
  onChange,
}: {
  lessonId: Id<"lessons">;
  theme: DeckTheme;
  elements: CanvasElement[];
  onChange: (next: CanvasElement[]) => void;
}) {
  const [current, setCurrent] = useState(elements);
  const currentRef = useRef(elements);
  const lastEmittedRef = useRef(elements);
  const [past, setPast] = useState<CanvasElement[][]>([]);
  const [future, setFuture] = useState<CanvasElement[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides>({});
  const [pendingImage, setPendingImage] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Reordering or hydrating slides changes the prop while we are mounted.
  // The echo of our own onChange matches lastEmittedRef and is ignored, so
  // the undo stack survives a keystroke.
  useEffect(() => {
    if (JSON.stringify(elements) === JSON.stringify(lastEmittedRef.current)) return;
    lastEmittedRef.current = elements;
    currentRef.current = elements;
    setCurrent(elements);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
  }, [elements]);

  const palette = PALETTE_STYLES[theme.palette];
  const fonts: CanvasFonts = FONT_PAIR_STYLES[theme.fontPair];
  const selected = current.find((el) => el.id === selectedId) ?? null;

  const update = (next: CanvasElement[]) => {
    currentRef.current = next;
    setCurrent(next);
  };

  const emit = (next: CanvasElement[]) => {
    lastEmittedRef.current = next;
    onChange(next);
  };

  const commit = (next: CanvasElement[], previous = currentRef.current) => {
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    setPast((p) => [...p, previous].slice(-HISTORY_LIMIT));
    setFuture([]);
    update(next);
    emit(next);
  };

  const undo = () => {
    if (!past.length) return;
    const previous = past[past.length - 1]!;
    setFuture((f) => [currentRef.current, ...f].slice(0, HISTORY_LIMIT));
    setPast((p) => p.slice(0, -1));
    update(previous);
    emit(previous);
    setSelectedId(null);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0]!;
    setPast((p) => [...p, currentRef.current].slice(-HISTORY_LIMIT));
    setFuture((f) => f.slice(1));
    update(next);
    emit(next);
    setSelectedId(null);
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    element: CanvasElement,
    mode: DragState["mode"],
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(element.id);
    dragRef.current = {
      id: element.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: element.x, y: element.y, w: element.w, h: element.h },
      rect: canvas.getBoundingClientRect(),
      before: currentRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / drag.rect.width;
    const dy = (event.clientY - drag.startY) / drag.rect.height;
    const raw: CanvasBox =
      drag.mode === "move"
        ? { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy }
        : { ...drag.origin, w: drag.origin.w + dx, h: drag.origin.h + dy };
    const snapped = snapBox(raw, drag.mode);
    setGuides(snapped.guides);
    update(
      currentRef.current.map((el) =>
        el.id === drag.id ? ({ ...el, ...snapped.box } as CanvasElement) : el,
      ),
    );
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setGuides({});
    commit(currentRef.current, drag.before);
  };

  const updateElement = (updater: (element: CanvasElement) => CanvasElement) => {
    if (!selectedId) return;
    commit(currentRef.current.map((el) => (el.id === selectedId ? updater(el) : el)));
  };

  const addElement = (element: CanvasElement) => {
    commit([...currentRef.current, element]);
    setSelectedId(element.id);
    setPendingImage(false);
  };

  const addText = () => {
    if (currentRef.current.length >= CANVAS_ELEMENT_LIMITS.perSlide) return;
    addElement({
      id: newCanvasElementId(),
      x: 0.1,
      y: 0.1,
      w: 0.4,
      h: 0.2,
      kind: "text",
      text: "New text",
    });
  };

  const addChart = () => {
    if (currentRef.current.length >= CANVAS_ELEMENT_LIMITS.perSlide) return;
    addElement({
      id: newCanvasElementId(),
      x: 0.1,
      y: 0.35,
      w: 0.4,
      h: 0.45,
      kind: "chart",
      chart: { type: "bar", rows: [{ label: "A", value: 1 }, { label: "B", value: 2 }] },
    });
  };

  const addShape = () => {
    if (currentRef.current.length >= CANVAS_ELEMENT_LIMITS.perSlide) return;
    addElement({
      id: newCanvasElementId(),
      x: 0.55,
      y: 0.15,
      w: 0.25,
      h: 0.25,
      kind: "shape",
      shape: "rect",
    });
  };

  const duplicateSelected = () => {
    if (!selected || currentRef.current.length >= CANVAS_ELEMENT_LIMITS.perSlide) return;
    const copy = {
      ...selected,
      id: newCanvasElementId(),
      x: clampCanvasBox(selected).x + 0.02,
      y: clampCanvasBox(selected).y + 0.02,
    } as CanvasElement;
    addElement(copy);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    commit(currentRef.current.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  const reorder = (mode: -1 | 1 | "front" | "back") => {
    if (!selectedId) return;
    const from = currentRef.current.findIndex((el) => el.id === selectedId);
    if (from < 0) return;
    const next = [...currentRef.current];
    const [item] = next.splice(from, 1);
    const to =
      mode === "front" ? next.length : mode === "back" ? 0 : Math.min(next.length, Math.max(0, from + mode));
    next.splice(to, 0, item!);
    commit(next);
  };

  const setBox = (key: keyof CanvasBox, percent: number) => {
    if (!selected) return;
    updateElement((el) => ({ ...el, ...clampCanvasBox({ ...el, [key]: percent / 100 }) }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={addText}>Add text</Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setPendingImage(true)}
          disabled={current.length >= CANVAS_ELEMENT_LIMITS.perSlide}
        >
          Add image
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={addChart}>Add chart</Button>
        <Button type="button" size="sm" variant="outline" onClick={addShape}>Add shape</Button>
        <Button type="button" size="sm" variant="outline" disabled title="Coming soon">Video — Coming Soon</Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={!past.length}>Undo</Button>
        <Button type="button" size="sm" variant="ghost" onClick={redo} disabled={!future.length}>Redo</Button>
      </div>

      {pendingImage && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium">Upload an image, then it lands on the canvas.</p>
          <SlideImageUploader
            lessonId={lessonId}
            onChange={(value: SlideImageValue | undefined) => {
              if (!value) return;
              if (currentRef.current.length >= CANVAS_ELEMENT_LIMITS.perSlide) return;
              addElement({
                id: newCanvasElementId(),
                x: 0.15,
                y: 0.2,
                w: 0.35,
                h: 0.4,
                kind: "image",
                src: value.url,
                alt: value.alt,
              });
            }}
          />
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setPendingImage(false)}>
            Cancel
          </Button>
        </div>
      )}

      <div
        ref={canvasRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black/5 dark:bg-white/5"
        onPointerDown={() => setSelectedId(null)}
      >
        {current.map((element) => (
          <div
            key={element.id}
            className={`absolute ${selectedId === element.id ? "outline-2 outline-offset-0 outline-indigo-500" : "hover:outline-1 hover:outline-offset-0 hover:outline-indigo-300"}`}
            style={{
              left: `${element.x * 100}%`,
              top: `${element.y * 100}%`,
              width: `${element.w * 100}%`,
              height: `${element.h * 100}%`,
              touchAction: "none",
              cursor: "move",
            }}
            onPointerDown={(event) => beginDrag(event, element, "move")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="pointer-events-none h-full w-full">
              <CanvasElementView element={element} palette={palette} fonts={fonts} />
            </div>
            {selectedId === element.id && (
              <div
                className="absolute bottom-0 right-0 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border border-indigo-500 bg-white"
                onPointerDown={(event) => beginDrag(event, element, "resize")}
                onPointerMove={(event) => {
                  event.stopPropagation();
                  moveDrag(event);
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  endDrag();
                }}
                onPointerCancel={endDrag}
              />
            )}
          </div>
        ))}
        {guides.x !== undefined && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-indigo-500" style={{ left: `${guides.x * 100}%` }} />
        )}
        {guides.y !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 h-px bg-indigo-500" style={{ top: `${guides.y * 100}%` }} />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag to move, corner to resize, quarter guides snap. Overlap is allowed.{" "}
        {current.length} / {CANVAS_ELEMENT_LIMITS.perSlide} elements.
      </p>

      {selected ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Selected: {selected.kind}</p>
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => reorder("back")}>Back</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => reorder(-1)}>Up</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => reorder(1)}>Down</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => reorder("front")}>Front</Button>
              <Button type="button" size="sm" variant="ghost" onClick={duplicateSelected}>Duplicate</Button>
              <Button type="button" size="sm" variant="ghost" onClick={deleteSelected}>Delete</Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {([
              ["x", "X %"],
              ["y", "Y %"],
              ["w", "W %"],
              ["h", "H %"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  step={1}
                  min={0}
                  max={100}
                  value={Math.round(selected[key] * 100)}
                  onChange={(e) => setBox(key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
          <ElementFields
            key={`${selected.id}:${selected.kind}`}
            element={selected}
            lessonId={lessonId}
            update={updateElement}
            addImage={(value) => updateElement(() => ({
              ...selected,
              kind: "image",
              src: value.url,
              alt: value.alt,
            }) as CanvasElement)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Select an element to edit its content and layer order.</p>
      )}
    </div>
  );
}

function ElementFields({
  element,
  lessonId,
  update,
  addImage,
}: {
  element: CanvasElement;
  lessonId: Id<"lessons">;
  update: (updater: (element: CanvasElement) => CanvasElement) => void;
  addImage: (value: SlideImageValue) => void;
}) {
  switch (element.kind) {
    case "text":
      return (
        <div className="space-y-1.5">
          <Label>Text (Markdown)</Label>
          <Textarea
            rows={4}
            value={element.text}
            onChange={(e) => update((el) => (el.kind === "text" ? { ...el, text: e.target.value } : el))}
          />
        </div>
      );
    case "image":
      return (
        <div className="space-y-1.5">
          <Label>Image and alt text</Label>
          <SlideImageUploader
            lessonId={lessonId}
            value={{ url: element.src, alt: element.alt }}
            onChange={(value) => {
              if (value) addImage(value);
            }}
          />
        </div>
      );
    case "chart":
      return (
        <ChartFields
          chart={element.chart}
          onTypeChange={(type) =>
            update((el) => (el.kind === "chart" ? { ...el, chart: { ...el.chart, type } } : el))
          }
          onRowsChange={(rows) =>
            update((el) => (el.kind === "chart" ? { ...el, chart: { ...el.chart, rows } } : el))
          }
        />
      );
    case "shape":
      return (
        <div className="space-y-1.5">
          <Label>Shape</Label>
          <Select
            value={element.shape}
            onValueChange={(value) =>
              update((el) => (el.kind === "shape" ? { ...el, shape: value as ShapeKind } : el))
            }
          >
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SHAPE_KINDS.map((shape) => (
                <SelectItem key={shape} value={shape}>{shape}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case "video":
      return <p className="text-sm text-muted-foreground">Video elements are coming soon.</p>;
  }
}

function ChartFields({
  chart,
  onTypeChange,
  onRowsChange,
}: {
  chart: { type: ChartKind; rows: { label: string; value: number }[] };
  onTypeChange: (type: ChartKind) => void;
  onRowsChange: (rows: { label: string; value: number }[]) => void;
}) {
  const [text, setText] = useState(() => formatChartRows(chart.rows));
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label>Chart type</Label>
        <Select value={chart.type} onValueChange={(value) => onTypeChange(value as ChartKind)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHART_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Paste rows: label, value — one per line</Label>
        <Textarea rows={5} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onRowsChange(parseChartRows(text).slice(0, 12))}
        >
          Apply rows
        </Button>
      </div>
    </div>
  );
}
