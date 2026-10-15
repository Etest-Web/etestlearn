"use client";

/**
 * The rendered half of the product tour.
 *
 * `lib/tutorial.ts` owns *what* the tour says and where each card goes; this
 * file owns the browser: finding the anchor, dimming everything else, keeping
 * focus on the card, and recording that the user got through it. Splitting it
 * that way is what lets the step list and the placement maths be tested without
 * a DOM.
 *
 * ## Why a transparent blocker plus a `box-shadow` spotlight
 *
 * The obvious dim-the-page approach — a full-screen overlay with a cut-out — is
 * fiddly to keep in sync with the anchor's own border radius and clips badly
 * when the anchor sits inside a transformed or scrolled container. Instead the
 * spotlight is a box *exactly over the anchor* with a `0 0 0 9999px` spread
 * shadow: the shadow starts at the anchor's edge and darkens everything else,
 * so the "hole" is always precisely the anchor by construction. A separate
 * transparent layer on top swallows clicks, which is what makes the tour feel
 * like a mode rather than a tooltip you can walk away from mid-sentence.
 *
 * ## Why it never navigates
 *
 * The steps for the *current* route are the only ones that run, so a target is
 * always mounted when a step is shown. The one navigation that exists is the
 * Settings "show me again" path, and that is a plain `router.push` to the
 * role's start route followed by the same effect that opens the tour on a first
 * visit.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { usePathname, useRouter } from "next/navigation";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import {
  positionCard,
  START_ROUTE,
  stepsForRole,
  type Box,
  type TourRole,
  type TourStep,
} from "@/lib/tutorial";

type TourContextValue = {
  /** Opens the tour, hopping to the role's start route if this page has none. */
  start: () => void;
  /** Whether the overlay is currently up. */
  active: boolean;
};

const TourContext = React.createContext<TourContextValue | null>(null);

/**
 * `start()` opens the tour. Outside a `TourProvider` it is a no-op with a
 * documented reason rather than a thrown error: the tour is an enhancement, and
 * a page accidentally rendered outside the dashboard shell should still work.
 */
export function useTour(): TourContextValue {
  return React.useContext(TourContext) ?? NO_PROVIDER;
}

const NO_PROVIDER: TourContextValue = { start: () => {}, active: false };

/**
 * Whether a step's target is on screen right now.
 *
 * The mobile sidebar lives in a closed sheet: the element exists in the DOM but
 * measures 0×0, so presence alone is not enough. A step whose anchor has no
 * area would otherwise spotlight nothing and dim the whole page, so the runner
 * drops it and runs the steps that do point somewhere.
 */
function targetIsVisible(step: TourStep): boolean {
  if (!step.target) return true;
  const el = document.querySelector<HTMLElement>(step.target);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function toBox(rect: DOMRect): Box {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** Value equality, so a remeasure that changed nothing does not re-render. */
function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

export function TourProvider({
  role,
  completedAt,
  children,
}: {
  role: TourRole | undefined;
  /** From `users.tourCompletedAt`; `undefined` means "has never seen it". */
  completedAt: number | undefined;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const [active, setActive] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [steps, setSteps] = React.useState<TourStep[]>([]);
  const [anchor, setAnchor] = React.useState<Box | null>(null);
  const [cardSize, setCardSize] = React.useState({ width: 320, height: 180 });
  const [viewport, setViewport] = React.useState({ width: 1280, height: 800 });
  const [cardReady, setCardReady] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const completeTour = useMutation(api.tutorial.completeTour);
  const titleId = React.useId();
  const bodyId = React.useId();

  // The same page's steps, recomputed cheaply on every render. `route` matching
  // is exact, so this is the page the user is standing on and nothing else.
  const stepsHere = React.useMemo(
    () => (role ? stepsForRole(role, pathname) : []),
    [role, pathname],
  );

  const pendingReplay = React.useRef(false);
  const autoOffered = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Open a step list only once its anchors are laid out. `requestAnimationFrame`
  // gives the page one paint after a route change before we look for them.
  const open = React.useCallback((list: TourStep[]) => {
    if (list.length === 0) return;
    requestAnimationFrame(() => {
      const usable = list.filter(targetIsVisible);
      setSteps(usable.length > 0 ? usable : list);
      setIndex(0);
      setActive(true);
    });
  }, []);

  // First visit: offer the tour exactly once, and only on a page that has
  // steps. Waiting for a page that has steps means a deep link into a sub-route
  // does not strand the user with a tour that cannot run.
  React.useEffect(() => {
    if (autoOffered.current || active) return;
    if (!role || completedAt !== undefined) return;
    if (stepsHere.length === 0) return;
    autoOffered.current = true;
    open(stepsHere);
  }, [role, completedAt, stepsHere, active, open]);

  // "Show me again" from a page the tour has no steps for: go to the start
  // route, and this effect finishes the job once that page renders.
  React.useEffect(() => {
    if (!pendingReplay.current) return;
    if (stepsHere.length === 0) return;
    pendingReplay.current = false;
    open(stepsHere);
  }, [stepsHere, open]);

  const start = React.useCallback(() => {
    if (!role) return;
    if (stepsHere.length > 0) {
      open(stepsHere);
      return;
    }
    pendingReplay.current = true;
    router.push(START_ROUTE[role]);
  }, [role, stepsHere, open, router]);

  const finish = React.useCallback(() => {
    setActive(false);
    // The write is best-effort. A tour is a nicety; a failed save must not
    // surface as an error, and the worst case is that it offers itself again
    // on the next full page load.
    void completeTour().catch(() => {});
  }, [completeTour]);

  const next = React.useCallback(() => {
    setIndex((current) => Math.min(current + 1, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  const back = React.useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  const step = active ? steps[index] : undefined;

  // ── Viewport + card measurement ──────────────────────────────────────────
  // Only while the tour is up: an idle resize should not re-render the
  // dashboard for nothing.
  React.useEffect(() => {
    if (!active) return;
    const update = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active]);

  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!active) {
      setCardReady(false);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setCardSize((previous) =>
        Math.abs(previous.width - rect.width) < 1 &&
        Math.abs(previous.height - rect.height) < 1
          ? previous
          : { width: rect.width, height: rect.height },
      );
      setCardReady(true);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, index]);

  // The spotlight follows the anchor through scrolls and resizes. Scrolling the
  // *page* is locked while the tour is up; this also covers a target inside an
  // independently scrollable pane such as the sidebar.
  React.useEffect(() => {
    if (!active || !step) return;
    const selector = step.target;
    if (!selector) {
      setAnchor(null);
      return;
    }

    let frame = 0;
    let attempts = 0;

    // Only touch state when the box actually moved; a remeasure fired by an
    // unrelated scroll should not re-render the tour.
    const commit = (next: Box | null) => {
      setAnchor((previous) => (sameBox(previous, next) ? previous : next));
    };

    const measure = (el: Element) => {
      const rect = el.getBoundingClientRect();
      commit(rect.width === 0 && rect.height === 0 ? null : toBox(rect));
    };

    const settle = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) {
        // The anchor can still be mounting. Retry for roughly a second before
        // giving up and centring the card, which reads better than an empty
        // spotlight over nothing.
        if (attempts++ < 30) frame = requestAnimationFrame(settle);
        else commit(null);
        return;
      }
      // Bring it into view only if it is not already wholly visible, so a step
      // on something already on screen does not shove the page around.
      const rect = el.getBoundingClientRect();
      const fullyVisible =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth;
      if (!fullyVisible) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
      }
      frame = requestAnimationFrame(() => measure(el));
    };

    const remeasure = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) measure(el);
    };

    settle();
    window.addEventListener("resize", remeasure);
    document.addEventListener("scroll", remeasure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("scroll", remeasure, true);
    };
  }, [active, step]);

  // Lock the page while the tour is up so the anchor cannot slide out from
  // under the spotlight.
  React.useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  // Focus the card on open and on every step change, so a screen reader
  // announces the new title and the keyboard is inside the trap.
  React.useEffect(() => {
    if (active) cardRef.current?.focus();
  }, [active, index]);

  React.useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (index >= steps.length - 1) finish();
        else next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, index, steps.length, finish, next, back]);

  // Keep Tab inside the card. The backdrop already blocks the pointer, so this
  // only has to handle keyboard.
  const onCardKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const root = cardRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const onRoot = document.activeElement === root;
    if (event.shiftKey && (document.activeElement === first || onRoot)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const value = React.useMemo<TourContextValue>(
    () => ({ start, active }),
    [start, active],
  );

  const isLast = index >= steps.length - 1;
  const position = step
    ? positionCard(anchor, step.placement, cardSize, viewport)
    : null;

  return (
    <TourContext.Provider value={value}>
      {children}
      {mounted && active && step
        ? createPortal(
            <div
              data-slot="product-tour"
              className="fixed inset-0 z-[95]"
              role="presentation"
            >
              {/* Transparent click blocker. The dimming comes from the
                  spotlight's spread shadow below, not from this layer — keeping
                  the anchor itself un-dimmed without any cut-out maths. */}
              <div
                className="absolute inset-0"
                onMouseDown={(event) => event.preventDefault()}
              />

              {anchor ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-[var(--radius-md)] transition-all duration-150 ease-out motion-reduce:transition-none"
                  style={{
                    top: anchor.top - 4,
                    left: anchor.left - 4,
                    width: anchor.width + 8,
                    height: anchor.height + 8,
                    boxShadow:
                      "0 0 0 2px var(--brand), 0 0 0 9999px rgb(0 0 0 / 0.55)",
                  }}
                />
              ) : null}

              <div
                ref={cardRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                tabIndex={-1}
                onKeyDown={onCardKeyDown}
                className={cn(
                  "fixed z-[97] w-[min(21rem,calc(100vw-2rem))] rounded-[var(--radius-md)]",
                  "border border-rule bg-background p-5 shadow-xl outline-none",
                  "transition-opacity duration-150 motion-reduce:transition-none",
                  cardReady ? "opacity-100" : "opacity-0",
                )}
                style={{ top: position?.top, left: position?.left }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="eyebrow text-brand">
                    Step {index + 1} of {steps.length}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close the tour"
                    onClick={finish}
                  >
                    <XIcon />
                  </Button>
                </div>

                <h2
                  id={titleId}
                  className="mt-1 text-base font-semibold text-foreground"
                >
                  {step.title}
                </h2>
                <p
                  id={bodyId}
                  className="mt-2 text-sm leading-relaxed text-muted-foreground"
                >
                  {step.body}
                </p>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <Button variant="ghost" size="sm" onClick={finish}>
                    Skip
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={back}
                      disabled={index === 0}
                    >
                      Back
                    </Button>
                    <Button size="sm" onClick={isLast ? finish : next}>
                      {isLast ? "Done" : "Next"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </TourContext.Provider>
  );
}
