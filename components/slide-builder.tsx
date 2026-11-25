"use client";

/**
 * Authoring UI for a slide deck. Fully controlled: the lesson edit page owns
 * the slides and theme state and saves them through `courses.updateLesson`.
 * Only deck-wide theme presets are exposed — no per-slide colour or font
 * pickers — and the image control uploads to B2 rather than taking a URL.
 */

import { useCallback } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Label } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { SlideImageUploader } from "@/components/slide-image-uploader";
import type { SlideImageValue } from "@/components/slide-image-uploader";
import { SlideCanvasEditor } from "@/components/slide-canvas-editor";
import {
  CHART_KINDS,
  DECK_BACKGROUNDS,
  DECK_FONT_PAIRS,
  DECK_PALETTES,
  SLIDE_KINDS,
  SLIDE_LIMITS,
  isRevealable,
  type ChartKind,
  type ChartRow,
  type DeckSlide,
  type DeckTheme,
  type SlideKind,
} from "@/lib/slides";

const KIND_LABELS: Record<SlideKind, string> = {
  bullets: "Bullets (reveals)",
  cover: "Cover",
  split: "Split (reveals)",
  code: "Code",
  quote: "Quote",
  chart: "Chart",
  image: "Image",
  freeform: "Freeform canvas",
  video: "Video — Coming Soon",
};

const PALETTE_LABELS: Record<DeckTheme["palette"], string> = {
  ink: "Ink (dark)",
  cream: "Cream (light)",
  forest: "Forest (dark)",
  royal: "Royal (dark)",
};

const FONT_LABELS: Record<DeckTheme["fontPair"], string> = {
  modern: "Modern sans",
  editorial: "Editorial serif",
  terminal: "Terminal mono",
};

const BACKGROUND_LABELS: Record<DeckTheme["background"], string> = {
  plain: "Plain",
  wash: "Soft wash",
  grid: "Grid",
};

type Patch = Partial<DeckSlide>;

export function SlideBuilder({
  lessonId,
  slides,
  onSlidesChange,
  theme,
  onThemeChange,
}: {
  lessonId: Id<"lessons">;
  slides: DeckSlide[];
  onSlidesChange: (next: DeckSlide[]) => void;
  theme: DeckTheme;
  onThemeChange: (next: DeckTheme) => void;
}) {
  const patchAt = useCallback(
    (index: number, patch: Patch) => {
      onSlidesChange(slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
    },
    [onSlidesChange, slides],
  );

  const addSlide = () => {
    if (slides.length >= SLIDE_LIMITS.slides) return;
    onSlidesChange([
      ...slides,
      { kind: "bullets", heading: "", body: "", reveals: [] },
    ]);
  };

  const removeAt = (index: number) => {
    onSlidesChange(slides.filter((_, i) => i !== index));
  };

  const moveAt = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onSlidesChange(next);
  };

  const setReveals = (index: number, reveals: string[]) => {
    patchAt(index, { reveals });
  };

  const setRows = (index: number, rows: ChartRow[]) => {
    const current = slides[index]?.chart;
    if (!current) return;
    patchAt(index, { chart: { ...current, rows } });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Deck theme</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Palette</Label>
            <Select
              value={theme.palette}
              onValueChange={(value) => onThemeChange({ ...theme, palette: value as DeckTheme["palette"] })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECK_PALETTES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PALETTE_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Font pair</Label>
            <Select
              value={theme.fontPair}
              onValueChange={(value) => onThemeChange({ ...theme, fontPair: value as DeckTheme["fontPair"] })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECK_FONT_PAIRS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {FONT_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Background</Label>
            <Select
              value={theme.background}
              onValueChange={(value) => onThemeChange({ ...theme, background: value as DeckTheme["background"] })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECK_BACKGROUNDS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {BACKGROUND_LABELS[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {slides.map((slide, index) => (
          <Card key={index}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Slide {index + 1}</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => moveAt(index, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === slides.length - 1}
                    onClick={() => moveAt(index, 1)}
                  >
                    Down
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeAt(index)}>
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Slide type</Label>
                <Select
                  value={slide.kind}
                  onValueChange={(value) => patchAt(index, { kind: value as SlideKind })}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SLIDE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind} disabled={kind === "video"}>
                        {KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {slide.kind === "freeform" ? (
                <SlideCanvasEditor
                  lessonId={lessonId}
                  theme={theme}
                  elements={slide.elements ?? []}
                  onChange={(elements) => patchAt(index, { elements })}
                />
              ) : slide.kind === "video" ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Video slides are coming soon. Pick another type for now.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Heading</Label>
                    <Input
                      value={slide.heading}
                      onChange={(e) => patchAt(index, { heading: e.target.value })}
                    />
                  </div>

                  {(slide.kind === "cover" || slide.kind === "split") && (
                    <div className="space-y-1.5">
                      <Label>Subtitle</Label>
                      <Input
                        value={slide.subtitle ?? ""}
                        onChange={(e) => patchAt(index, { subtitle: e.target.value })}
                      />
                    </div>
                  )}

                  {slide.kind !== "image" && slide.kind !== "chart" && (
                    <div className="space-y-1.5">
                      <Label>Body</Label>
                      <Textarea
                        rows={4}
                        value={slide.body}
                        onChange={(e) => patchAt(index, { body: e.target.value })}
                        placeholder={slide.kind === "code" ? "Explanation shown beside the code" : undefined}
                      />
                    </div>
                  )}

                  {slide.kind === "code" && (
                    <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                      <div className="space-y-1.5">
                        <Label>Code</Label>
                        <Textarea
                          rows={6}
                          className="font-mono"
                          value={slide.code ?? ""}
                          onChange={(e) => patchAt(index, { code: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Language</Label>
                        <Input
                          value={slide.language ?? ""}
                          onChange={(e) => patchAt(index, { language: e.target.value })}
                          placeholder="ts"
                        />
                      </div>
                    </div>
                  )}

                  {slide.kind === "quote" && (
                    <div className="space-y-1.5">
                      <Label>Attribution</Label>
                      <Input
                        value={slide.attribution ?? ""}
                        onChange={(e) => patchAt(index, { attribution: e.target.value })}
                      />
                    </div>
                  )}

                  {isRevealable(slide.kind) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Reveal steps</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={slide.reveals.length >= SLIDE_LIMITS.revealsPerSlide}
                          onClick={() => setReveals(index, [...slide.reveals, ""])}
                        >
                          Add step
                        </Button>
                      </div>
                      {slide.reveals.map((reveal, revealIndex) => (
                        <div key={revealIndex} className="flex items-center gap-2">
                          <Input
                            value={reveal}
                            onChange={(e) => {
                              const next = [...slide.reveals];
                              next[revealIndex] = e.target.value;
                              setReveals(index, next);
                            }}
                            placeholder={`Step ${revealIndex + 1}`}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setReveals(
                                index,
                                slide.reveals.filter((_, i) => i !== revealIndex),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {slide.kind === "image" && (
                    <SlideImageUploader
                      lessonId={lessonId}
                      value={slide.image as SlideImageValue | undefined}
                      onChange={(image) => patchAt(index, { image })}
                    />
                  )}

                  {slide.kind === "chart" && (
                    <ChartEditor
                      type={slide.chart?.type ?? "bar"}
                      rows={slide.chart?.rows ?? []}
                      onTypeChange={(type) => patchAt(index, {
                        chart: { type, rows: slide.chart?.rows ?? [] },
                      })}
                      onRowsChange={(rows) => {
                        if (!slide.chart) {
                          patchAt(index, { chart: { type: "bar", rows } });
                        } else {
                          setRows(index, rows);
                        }
                      }}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}

        <Button
          type="button"
          variant="outline"
          disabled={slides.length >= SLIDE_LIMITS.slides}
          onClick={addSlide}
        >
          Add slide
        </Button>
        <p className="text-xs text-muted-foreground">
          {slides.length} / {SLIDE_LIMITS.slides} slides. Use Left/Right, click or swipe to advance
          in the learner view; reveal steps only apply to Bullets and Split slides.
        </p>
      </div>
    </div>
  );
}

function ChartEditor({
  type,
  rows,
  onTypeChange,
  onRowsChange,
}: {
  type: ChartKind;
  rows: ChartRow[];
  onTypeChange: (type: ChartKind) => void;
  onRowsChange: (rows: ChartRow[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label>Chart type</Label>
        <Select value={type} onValueChange={(value) => onTypeChange(value as ChartKind)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHART_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label>Data (label and value)</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={rows.length >= SLIDE_LIMITS.chartRows}
          onClick={() => onRowsChange([...rows, { label: "", value: 0 }])}
        >
          Add row
        </Button>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            className="flex-1"
            value={row.label}
            onChange={(e) => {
              const next = [...rows];
              next[index] = { ...row, label: e.target.value };
              onRowsChange(next);
            }}
            placeholder="Label"
          />
          <Input
            type="number"
            className="w-28"
            value={row.value}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              const next = [...rows];
              next[index] = { ...row, value: Number.isFinite(parsed) ? parsed : 0 };
              onRowsChange(next);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
