"use client"

/**
 * 21st.dev "Glowing Shadow" (designali-in · demo id 5655 · retrieved via the
 * 21st MCP) — re-composed for the concept composer. The original is built
 * around two animations: a blob orbiting the card and a conic hot-spot
 * chasing its own border. For a search field the light should stay put and
 * only breathe:
 *
 *  · One blurred violet haze the exact shape of the pill sits directly
 *    under it, slightly wider — light starts at the rim and bleeds out.
 *  · `glow-breathe` eases opacity/blur in and out on a 4.5s sine — the rim
 *    light inhales and exhales; it never travels. Reduced motion: static.
 *  · The conic border bloom is pinned at the pill's middle — luminous
 *    gradient core, no drift.
 *  · Hover/click state changes removed; the glow is inert.
 *
 * Hue remains the brand violet (280°). `<style jsx>` is Next's built-in
 * styled-jsx.
 */

import type { ReactNode } from "react"

interface GlowingShadowProps {
  children: ReactNode
}

export function GlowingShadow({ children }: GlowingShadowProps) {
  return (
    <>
      <style jsx>{`
        .glow-container {
          --hue: 280;
          position: relative;
          width: 100%;
          height: 100%;
          z-index: 1;
          border-radius: 9999px;
        }

        .glow-content {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          z-index: 1;
        }

        /* The violet haze: pill-shaped, sitting directly under the pill.
           Breathes slowly — opacity and blur rising and falling on a sine
           so the rim light feels alive without ever going anywhere. */
        .glow {
          display: block;
          position: absolute;
          left: -22px;
          top: -5px;
          width: calc(100% + 44px);
          height: calc(100% + 10px);
          border-radius: 9999px;
          background: hsl(var(--hue) 100% 62%);
          filter: blur(24px);
          opacity: 0.7;
          z-index: -1;
          animation: glow-breathe 4.5s ease-in-out infinite;
        }

        @keyframes glow-breathe {
          0%, 100% {
            opacity: 0.5;
            filter: blur(22px);
          }
          50% {
            opacity: 0.9;
            filter: blur(30px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .glow {
            animation: none;
          }
        }

        /* The conic border bloom, pinned at the pill's middle: a luminous
           gradient core that does not travel. */
        .glow-content:before {
          content: "";
          display: block;
          position: absolute;
          width: calc(100% + 3px);
          height: calc(100% + 3px);
          left: -1.5px;
          top: -1.5px;
          border-radius: 9999px;
          mix-blend-mode: color-burn;
          z-index: -1;
          background: hsl(0deg 0% 16%) radial-gradient(
            32% 32% at 50% 50%,
            hsl(var(--hue) 100% 90%) 0%,
            hsl(var(--hue) 100% 80%) 20%,
            hsl(var(--hue) 100% 60%) 40%,
            transparent 100%
          );
        }
      `}</style>

      <div className="glow-container">
        <span className="glow" />
        <div className="glow-content">{children}</div>
      </div>
    </>
  )
}
