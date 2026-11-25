"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Card } from "@/components/ui";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

export type DeckSlide = {
  heading: string;
  body: string;
  reveals: string[];
};

/** Click-through deck: body first, then one reveal per click, then next slide. */
export function SlideDeck({ slides }: { slides: DeckSlide[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const slide = slides[index];
  const stepsBefore = slides
    .slice(0, index)
    .reduce((n, s) => n + 1 + s.reveals.length, 0);
  const totalSteps = slides.reduce((n, s) => n + 1 + s.reveals.length, 0);
  const percent = totalSteps
    ? Math.round(((stepsBefore + 1 + revealed) / totalSteps) * 100)
    : 100;
  const lastSlide = index === slides.length - 1;
  const lastReveal = revealed >= slide.reveals.length;

  function advance() {
    if (!lastReveal) {
      setRevealed((r) => r + 1);
    } else if (!lastSlide) {
      setIndex((i) => i + 1);
      setRevealed(0);
    }
  }

  function back() {
    if (revealed > 0) {
      setRevealed((r) => r - 1);
    } else if (index > 0) {
      setIndex((i) => i - 1);
      setRevealed(slides[index - 1].reveals.length);
    }
  }

  function restart() {
    setIndex(0);
    setRevealed(0);
  }

  return (
    <Card className="gap-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="tabular">
            Slide {index + 1} of {slides.length}
          </span>
          <span className="tabular">{percent}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-label="Slide progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div aria-live="polite" className="space-y-3">
        <h2 className="text-xl font-semibold sm:text-2xl">{slide.heading}</h2>
        <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{slide.body}</ReactMarkdown>
        </div>
        {slide.reveals.slice(0, revealed).map((point, i) => (
          <div
            key={i}
            className="rounded-sm border-l-2 border-brand bg-brand/5 px-3 py-2 text-sm"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{point}</ReactMarkdown>
          </div>
        ))}
      </div>

      <nav aria-label="Slide navigation" className="flex flex-col-reverse items-stretch gap-2 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="outline"
          onClick={back}
          disabled={index === 0 && revealed === 0}
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" /> Previous
        </Button>
        {lastSlide && lastReveal ? (
          <Button onClick={restart} className="w-full sm:w-auto">
            <RotateCcw className="h-4 w-4" /> Restart deck
          </Button>
        ) : (
          <Button onClick={advance} className="w-full sm:w-auto">
            {lastReveal ? "Next slide" : "Reveal"} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </nav>
    </Card>
  );
}
