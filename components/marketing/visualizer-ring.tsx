"use client";

import { useEffect, useRef } from "react";

/**
 * Audio-visualizer outline for the composer: a smooth, continuously
 * undulating stroke that follows the pill's rounded-rect perimeter and
 * breathes in and out like a waveform.
 *
 * The offset from the border at arclength s is a stack of sines phased by s —
 * smooth everywhere, organically non-repeating, and anchored to zero at the
 * two rounded caps' extremes is unnecessary (it stays between -PAD and
 * +len_max by construction). It is not reading a microphone (there is nothing
 * to measure); it is a periodic pseudo-noise field that looks alive.
 *
 * The canvas is larger than the pill by PAD on every side so the curve can
 * ripple outward without being clipped by its own buffer. Reduced motion
 * draws one static frame.
 */

const PAD = 20;

function perimeterPoint(s: number, w: number, h: number, r: number) {
  const straightX = Math.max(0, w - 2 * r);
  const straightY = Math.max(0, h - 2 * r);
  const arc = (Math.PI / 2) * r;
  const total = 2 * straightX + 2 * straightY + 4 * arc;
  let u = ((s % total) + total) % total;

  if (u < straightX) return { x: r + u, y: 0, nx: 0, ny: -1 };
  u -= straightX;
  if (u < arc) {
    const a = -Math.PI / 2 + u / r;
    return { x: w - r + Math.cos(a) * r, y: r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  u -= arc;
  if (u < straightY) return { x: w, y: r + u, nx: 1, ny: 0 };
  u -= straightY;
  if (u < arc) {
    const a = u / r;
    return { x: w - r + Math.cos(a) * r, y: h - r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  u -= arc;
  if (u < straightX) return { x: w - r - u, y: h, nx: 0, ny: 1 };
  u -= straightX;
  if (u < arc) {
    const a = Math.PI / 2 + u / r;
    return { x: r + Math.cos(a) * r, y: h - r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  }
  u -= arc;
  if (u < straightY) return { x: 0, y: h - r - u, nx: -1, ny: 0 };
  u -= straightY;
  const a = Math.PI + u / r;
  return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
}

export function VisualizerRing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const brand =
      getComputedStyle(wrap).getPropertyValue("--brand").trim() ||
      "oklch(56% 0.12 318.82)";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;

    const draw = (t: number) => {
      // Pill-space dimensions; the canvas carries PAD around them.
      const w = width - 2 * PAD;
      const h = height - 2 * PAD;
      ctx.clearRect(0, 0, width, height);
      if (w < 10 || h < 10) return;

      const r = h / 2;
      const straightX = Math.max(0, w - 2 * r);
      const straightY = Math.max(0, h - 2 * r);
      const perimeter = 2 * straightX + 2 * straightY + 4 * ((Math.PI / 2) * r);
      const step = 3.5;
      const count = Math.max(64, Math.floor(perimeter / step));

      // Offset along the perimeter — the wave's breathing amplitude.
      const offsetAt = (s: number) => {
        const slow = Math.sin(s * 0.011 - t * 0.0009 + 1.7) * 0.5 + 0.5;
        const mid = Math.sin(s * 0.045 + t * 0.0015) * 0.5 + 0.5;
        const jitter = Math.sin(s * 0.12 - t * 0.0026 + 4.2) * 0.5 + 0.5;
        return 1.5 + (slow * 0.55 + mid * 0.32 + jitter * 0.13) * 13;
      };

      ctx.save();
      ctx.translate(PAD, PAD);

      // Outer wave line, sampled on the same arclength grid.
      const outer: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= count; i++) {
        const s = (i / count) * perimeter;
        const p = perimeterPoint(s, w, h, r);
        const d = offsetAt(s);
        outer.push({ x: p.x + p.nx * d, y: p.y + p.ny * d });
      }

      // The membrane between border and wave: a filled ribbon, brand at
      // low alpha, following the same outer points back along the base edge.
      ctx.beginPath();
      ctx.moveTo(outer[0].x, outer[0].y);
      for (const p of outer) ctx.lineTo(p.x, p.y);
      for (let i = count; i >= 0; i--) {
        const p = perimeterPoint((i / count) * perimeter, w, h, r);
        ctx.lineTo(p.x + p.nx * 1.5, p.y + p.ny * 1.5);
      }
      ctx.closePath();
      ctx.fillStyle = brand;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;

      // The wave itself, with a soft glow around it.
      ctx.beginPath();
      ctx.moveTo(outer[0].x, outer[0].y);
      for (const p of outer) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.strokeStyle = brand;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.shadowBlur = 14;
      ctx.shadowColor = brand;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      ctx.restore();
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    let raf = 0;
    if (!reduce) {
      const loop = (t: number) => {
        draw(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none absolute z-10"
      style={{ inset: `-${PAD}px` }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
