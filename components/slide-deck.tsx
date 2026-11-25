"use client";

/**
 * Click-through slide renderer. Every visual choice comes from the deck-wide
 * preset theme; copy is the only per-slide input. Kinds that are not
 * revealable (`cover`/`code`/`quote`/`chart`/`image`/`video`) are a single
 * step and click straight through to the next slide.
 *
 * Motion is tiered, not all-or-nothing: with `prefers-reduced-motion` the
 * slide-to-slide travel drops to a short crossfade and reveals fade in place,
 * while the progress bar still moves — the information stays, the movement
 * does not.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button, Card } from "@/components/ui";
import { ArrowLeft, ArrowRight, Lock, RotateCcw } from "lucide-react";
import { SlideChart, SlideMarkdown, type SlidePalette } from "@/components/slide-shared";
import { FreeformCanvas } from "@/components/slide-canvas";
import {
  asDeckSlide,
  BACKGROUND_STYLES,
  DEFAULT_DECK_THEME,
  FONT_PAIR_STYLES,
  isRevealable,
  PALETTE_STYLES,
  slideStepCount,
  type DeckSlide,
  type DeckTheme,
} from "@/lib/slides";

export type { DeckSlide, DeckTheme } from "@/lib/slides";

function pick<T>(map: Record<string, T>, key: string | undefined, fallback: string): T {
  return (key && map[key]) || map[fallback];
}

function SlideBody({
  slide,
  revealed,
  palette,
  fonts,
  reduce,
}: {
  slide: DeckSlide;
  revealed: number;
  palette: SlidePalette;
  fonts: { heading: string; body: string };
  reduce: boolean;
}) {
  const heading = (
    <h2 className="text-2xl font-bold leading-tight sm:text-4xl" style={{ fontFamily: fonts.heading }}>
      {slide.heading}
    </h2>
  );
  const markdownClass = "text-[0.95rem] sm:text-lg [&_p]:my-2 [&_*]:!text-current";

  if (slide.kind === "cover") {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center sm:min-h-[380px]">
        {slide.subtitle && (
          <span
            className="text-xs font-semibold uppercase tracking-[0.3em]"
            style={{ color: palette.accent, fontFamily: fonts.body }}
          >
            {slide.subtitle}
          </span>
        )}
        {heading}
        {slide.body && <SlideMarkdown text={slide.body} className={markdownClass} />}
        <div className="h-1 w-16 rounded-full" style={{ background: palette.accent }} />
      </div>
    );
  }

  if (slide.kind === "split") {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col justify-center gap-4">
          {slide.subtitle && (
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: palette.accent }}>
              {slide.subtitle}
            </span>
          )}
          {heading}
          {slide.body && <SlideMarkdown text={slide.body} className={markdownClass} />}
        </div>
        <div className="flex flex-col gap-3" style={{ borderLeft: `1px solid ${palette.border}` }}>
          <AnimatePresence initial={false}>
            {slide.reveals.slice(0, revealed).map((point, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: reduce ? 0 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduce ? 0 : -12 }}
                transition={{ duration: reduce ? 0.12 : 0.28 }}
                className="rounded-lg px-4 py-3 text-sm sm:text-base"
                style={{ background: palette.surface, border: `1px solid ${palette.border}` }}
              >
                <SlideMarkdown text={point} className="[&_p]:my-0" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  if (slide.kind === "code") {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        {slide.body && <SlideMarkdown text={slide.body} className={markdownClass} />}
        <div
          className="overflow-x-auto rounded-xl p-4 text-sm leading-relaxed sm:p-6"
          style={{
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            fontFamily: fonts.body,
          }}
        >
          {slide.language && (
            <div className="mb-2 text-[0.7rem] uppercase tracking-widest" style={{ color: palette.accent }}>
              {slide.language}
            </div>
          )}
          <pre className="whitespace-pre font-mono text-[0.85rem] sm:text-sm">
            <code>{slide.code ?? ""}</code>
          </pre>
        </div>
      </div>
    );
  }

  if (slide.kind === "quote") {
    return (
      <figure className="flex min-h-[300px] flex-col justify-center gap-5 sm:min-h-[380px]">
        <span className="text-6xl leading-none" style={{ color: palette.accent, fontFamily: fonts.heading }}>
          &ldquo;
        </span>
        <blockquote
          className="text-xl font-medium leading-relaxed sm:text-3xl"
          style={{ fontFamily: fonts.heading }}
        >
          {slide.body}
        </blockquote>
        {slide.attribution && (
          <figcaption className="text-sm" style={{ color: palette.muted }}>
            &mdash; {slide.attribution}
          </figcaption>
        )}
      </figure>
    );
  }

  if (slide.kind === "chart") {
    return (
      <div className="flex flex-col gap-5">
        {heading}
        {slide.body && <SlideMarkdown text={slide.body} className={markdownClass} />}
        {slide.chart ? (
          <SlideChart chart={slide.chart} palette={palette} fontFamily={fonts.body} />
        ) : (
          <p className="text-sm" style={{ color: palette.muted }}>No chart data.</p>
        )}
      </div>
    );
  }

  if (slide.kind === "image") {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        {slide.body && <SlideMarkdown text={slide.body} className={markdownClass} />}
        {slide.image ? (
          <div
            className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl sm:min-h-[360px]"
            style={{ background: palette.surface, border: `1px solid ${palette.border}` }}
          >
            {/* object-contain letterboxes instead of cropping — the alt lives on the img. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.image.url}
              alt={slide.image.alt}
              className="max-h-[60vh] w-full object-contain"
            />
          </div>
        ) : (
          <p className="text-sm" style={{ color: palette.muted }}>No image uploaded.</p>
        )}
      </div>
    );
  }

  if (slide.kind === "freeform") {
    return <FreeformCanvas elements={slide.elements ?? []} palette={palette} fonts={fonts} />;
  }

  if (slide.kind === "video") {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center sm:min-h-[380px]">
        {heading}
        <div
          className="flex flex-col items-center gap-3 rounded-xl px-8 py-10"
          style={{ background: palette.surface, border: `1px dashed ${palette.border}` }}
        >
          <Lock className="h-8 w-8" style={{ color: palette.muted }} />
          <p className="font-semibold" style={{ fontFamily: fonts.heading }}>Video &mdash; Coming Soon</p>
          <p className="max-w-sm text-sm" style={{ color: palette.muted }}>
            Video slides are not available yet. This slot is reserved so the lesson outline is ready for them.
          </p>
        </div>
      </div>
    );
  }

  // bullets (and any future revealable default)
  return (
    <div className="flex flex-col gap-4">
      {heading}
      {slide.body && <SlideMarkdown text={slide.body} className={markdownClass} />}
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {slide.reveals.slice(0, revealed).map((point, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: reduce ? 0.12 : 0.26 }}
              className="rounded-lg px-4 py-3 text-sm sm:text-base"
              style={{
                background: palette.surface,
                borderLeft: `3px solid ${palette.accent}`,
              }}
            >
              <SlideMarkdown text={point} className="[&_p]:my-0" />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export function SlideDeck({
  slides: rawSlides,
  theme,
}: {
  slides: DeckSlide[];
  theme?: DeckTheme;
}) {
  const slides = useMemo(() => rawSlides.map(asDeckSlide), [rawSlides]);
  const reduce = Boolean(useReducedMotion());
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [direction, setDirection] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const swiped = useRef(false);

  const slide = slides[index];
  const stepCount = slideStepCount(slide);
  const lastReveal = !isRevealable(slide.kind) || revealed >= slide.reveals.length;
  const lastSlide = index === slides.length - 1;
  const totalSteps = slides.reduce((n, s) => n + slideStepCount(s), 0);
  const stepsBefore = slides.slice(0, index).reduce((n, s) => n + slideStepCount(s), 0);
  const stepWithin = isRevealable(slide.kind) ? Math.min(revealed, slide.reveals.length) : 0;
  const percent = totalSteps
    ? Math.round(((stepsBefore + stepWithin + 1) / totalSteps) * 100)
    : 100;

  const advance = useCallback(() => {
    if (!lastReveal) {
      setRevealed((r) => r + 1);
    } else if (!lastSlide) {
      setDirection(1);
      setIndex((i) => i + 1);
      setRevealed(0);
    }
  }, [lastReveal, lastSlide]);

  const back = useCallback(() => {
    if (revealed > 0 && isRevealable(slide.kind)) {
      setRevealed((r) => r - 1);
    } else if (index > 0) {
      setDirection(-1);
      const prev = slides[index - 1];
      setIndex((i) => i - 1);
      setRevealed(isRevealable(prev.kind) ? prev.reveals.length : 0);
    }
  }, [index, revealed, slide.kind, slides]);

  const restart = useCallback(() => {
    setDirection(-1);
    setIndex(0);
    setRevealed(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back]);

  const palette = pick(PALETTE_STYLES, theme?.palette, DEFAULT_DECK_THEME.palette);
  const fonts = pick(FONT_PAIR_STYLES, theme?.fontPair, DEFAULT_DECK_THEME.fontPair);
  const bg = pick(BACKGROUND_STYLES, theme?.background, DEFAULT_DECK_THEME.background);

  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * 48 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduce ? 0 : dir * -48 }),
  };

  if (!slides.length) return null;

  return (
    <Card className="gap-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs" style={{ color: palette.muted }}>
          <span className="tabular">
            Slide {index + 1} of {slides.length}
          </span>
          <span className="tabular">{percent}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Slide progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ background: palette.surface }}
        >
          <motion.div
            className="h-full"
            style={{ background: palette.accent }}
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: reduce ? 0.12 : 0.35, ease: "easeOut" }}
          />
        </div>
      </div>

      <div
        className="relative cursor-pointer select-none overflow-hidden rounded-2xl p-6 sm:p-10"
        style={{
          background: palette.background,
          color: palette.foreground,
          fontFamily: fonts.body,
          backgroundImage: bg.image,
          backgroundSize: bg.size,
          border: `1px solid ${palette.border}`,
        }}
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          advance();
        }}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(dx) > 50) {
            swiped.current = true;
            if (dx < 0) advance();
            else back();
          }
        }}
        aria-live="polite"
      >
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={index}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.14 : 0.3, ease: "easeOut" }}
          >
            <SlideBody
              slide={slide}
              revealed={revealed}
              palette={palette}
              fonts={fonts}
              reduce={reduce}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <nav
        aria-label="Slide navigation"
        className="flex flex-col-reverse items-stretch gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: palette.border }}
      >
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
            {lastReveal ? `Next · ${stepCount > 1 ? "new slide" : "continue"}` : "Reveal"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </nav>
    </Card>
  );
}
