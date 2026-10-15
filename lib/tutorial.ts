/**
 * The guided product tour: what it points at, in what order, and for whom.
 *
 * Data and arithmetic only — no React, no DOM — so `lib/tutorial.test.ts` can
 * pin the things that silently rot: a step nobody can ever see, two steps
 * sharing an id, a role whose starting route has no steps on it, a card that
 * gets positioned off the edge of the screen. The component that renders it
 * (`components/product-tour.tsx`) is deliberately left holding just the parts
 * that need a browser.
 *
 * ## Why targets are `[data-tour="…"]`
 *
 * A tour is a set of promises about elements that live in other people's
 * components. When the promise is a class name or an nth-child, moving a div
 * breaks it silently — the tour just stops pointing at the thing it describes.
 * An explicit `data-tour` attribute lives *at* the anchor, so `grep data-tour`
 * lists every node the tour depends on and deleting one is a visible act rather
 * than an accident. The handful of selectors that aren't `data-tour` are stable
 * `href`s owned by `components/dashboard-nav.ts`.
 *
 * ## Why the tour never navigates
 *
 * Steps carry a `route` and the runner keeps only the ones matching the current
 * page. A tour that pushes the router around is the kind that strands somebody
 * mid-flow on a slow connection, and it can only ever describe pages it guesses
 * exist. Same-page steps cannot be wrong about where they are, and skipping the
 * navigation also means the welcome step's "here is your dashboard" is about
 * the dashboard actually on screen.
 */

/** Roles the tour knows. `admin` is a superset of `instructor` in the console. */
export type TourRole = "student" | "instructor" | "admin";

/** Preferred side of the anchor for the card; the runner flips it to fit. */
export type TourPlacement = "top" | "right" | "bottom" | "left";

export interface TourStep {
  /** Stable id — the React key, and what the tests assert on. */
  id: string;
  /**
   * Dashboard route the step belongs to. The runner shows only the steps whose
   * route matches the current path, so a step may assume its target is mounted.
   */
  route: string;
  /**
   * CSS selector for the element to spotlight, or omitted for a centred card
   * with no spotlight. The welcome and closing beats use that: they are about
   * the product as a whole rather than one control.
   */
  target?: string;
  placement: TourPlacement;
  title: string;
  body: string;
  /** Roles that see this step. */
  roles: readonly TourRole[];
}

const LEARNER_ROUTE = "/dashboard";
const TEACHING_ROUTE = "/dashboard/instructor";
const ALL_ROLES: readonly TourRole[] = ["student", "instructor", "admin"];
const STAFF_ROLES: readonly TourRole[] = ["instructor", "admin"];

/**
 * Where a role's tour begins.
 *
 * A student starts on the learner dashboard, staff on the teaching console —
 * the page that puts the money and the courses they own in front of them.
 * `lib/tutorial.test.ts` asserts each of these routes actually has steps for
 * the role, so this table cannot drift away from the steps below.
 */
export const START_ROUTE: Record<TourRole, string> = {
  student: LEARNER_ROUTE,
  instructor: TEACHING_ROUTE,
  admin: TEACHING_ROUTE,
};

/**
 * Every step, in order.
 *
 * Ordering within a route is the running order. Learner steps come first
 * because `/dashboard` is the page an unannounced account lands on; the
 * teaching steps only ever run for staff, who arrive on their own route.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  // ── Learner dashboard (/dashboard) ────────────────────────────────────────
  {
    id: "welcome",
    route: LEARNER_ROUTE,
    placement: "bottom",
    title: "Welcome — this is your dashboard",
    body: "Courses you are taking, what comes next, and anything that needs your attention all land here. The next few cards point out where the rest of it lives.",
    roles: ALL_ROLES,
  },
  {
    id: "header-actions",
    route: LEARNER_ROUTE,
    target: '[data-tour="header-actions"]',
    placement: "bottom",
    title: "Messages and notifications",
    body: "Replies to your discussions and notices from the platform collect in the inbox. The badges count what you have not read yet.",
    roles: ALL_ROLES,
  },
  {
    id: "search",
    route: LEARNER_ROUTE,
    target: '[data-tour="search"]',
    placement: "bottom",
    title: "Search across everything",
    body: "Find a course, a lesson or a discussion without working out which page it was on.",
    roles: ALL_ROLES,
  },
  {
    id: "sidebar",
    route: LEARNER_ROUTE,
    target: '[data-tour="sidebar-nav"]',
    placement: "right",
    title: "The sidebar is the map",
    body: "Every page you can reach is grouped here, and the groups change to match the console you are in. It follows you from one page to the next.",
    roles: ALL_ROLES,
  },
  {
    id: "settings",
    route: LEARNER_ROUTE,
    target: 'a[href="/dashboard/settings"]',
    placement: "right",
    title: "Make it yours",
    body: "Your profile, appearance, and accessibility and notification preferences are all under Settings. You can replay this tour from there.",
    roles: ALL_ROLES,
  },

  // ── Teaching console (/dashboard/instructor) ─────────────────────────────
  {
    id: "teach-welcome",
    route: TEACHING_ROUTE,
    placement: "bottom",
    title: "Welcome — this is your teaching console",
    body: "What you have earned, how your learners are doing, and what needs fixing today all land here. Here is where the rest lives.",
    roles: STAFF_ROLES,
  },
  {
    id: "teach-create-course",
    route: TEACHING_ROUTE,
    target: '[data-tour="create-course"]',
    placement: "bottom",
    title: "Start a course",
    body: "Author a course here: outline the lessons, add quizzes, and publish it when — and only when — you are ready.",
    roles: STAFF_ROLES,
  },
  {
    id: "teach-earnings",
    route: TEACHING_ROUTE,
    target: '[data-tour="earnings"]',
    placement: "bottom",
    title: "Follow the money",
    body: "Earnings shows every settled sale, your share after refunds, and the payout account your money is sent to.",
    roles: STAFF_ROLES,
  },
  {
    id: "teach-console",
    route: TEACHING_ROUTE,
    target: '[data-tour="mode-switcher"]',
    placement: "bottom",
    title: "Learn and teach from one account",
    body: "You can be a learner and an instructor at once. This switch changes which console the sidebar shows — it never changes what you can access.",
    roles: STAFF_ROLES,
  },
  {
    id: "teach-sidebar",
    route: TEACHING_ROUTE,
    target: '[data-tour="sidebar-nav"]',
    placement: "right",
    title: "Your teaching tools",
    body: "Your courses, learner progress, assignments to grade, and discussions — grouped in the sidebar, which changes with the console you are in.",
    roles: STAFF_ROLES,
  },
];

/**
 * `true` when `pathname` is the route a step declares.
 *
 * Exact after trimming a trailing slash, and deliberately not a prefix match:
 * a step for `/dashboard` must not run on `/dashboard/courses`, where its
 * targets may or may not exist, and a prefix match would also make the teaching
 * steps fire on every one of their sub-pages.
 */
export function matchesRoute(pathname: string, route: string): boolean {
  const trim = (value: string) =>
    value.length > 1 ? value.replace(/\/+$/, "") : value;
  return trim(pathname) === trim(route);
}

/** The steps to run for `role` on `pathname`, in order. Empty means "not here". */
export function stepsForRole(
  role: TourRole,
  pathname: string,
): TourStep[] {
  return TOUR_STEPS.filter(
    (step) => step.roles.includes(role) && matchesRoute(pathname, step.route),
  );
}

/** Axis-aligned box in viewport coordinates. */
export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface CardPosition {
  top: number;
  left: number;
  /** The side actually used once the preferred side was checked for room. */
  placement: TourPlacement;
}

/** Breathing room between the card and the anchor it points at. */
export const CARD_GAP = 12;
/** How close to the viewport edge a card is allowed to sit. */
export const CARD_MARGIN = 16;

function clamp(value: number, min: number, max: number): number {
  // `Math.max(min, max)` guards the case where the card is wider than the
  // space it has: without it, min > max and clamp returns the smaller bound,
  // parking the card off the left edge instead of flushing against it.
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Top-left for the card, given the anchor and the room around it.
 *
 * Tries the step's preferred side first, then the others in a fixed order, then
 * falls back to the preferred side with the result clamped into the viewport.
 * That ordering matters more than it looks: a step anchored to the sidebar
 * wants to sit to its *right*, and a naive "always below" would cover the very
 * nav it is describing on a short window.
 *
 * A `null` anchor centres the card — the welcome and closing beats.
 */
export function positionCard(
  anchor: Box | null,
  placement: TourPlacement,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  gap: number = CARD_GAP,
  margin: number = CARD_MARGIN,
): CardPosition {
  const maxLeft = viewport.width - card.width - margin;
  const maxTop = viewport.height - card.height - margin;

  if (!anchor) {
    return {
      placement,
      top: clamp((viewport.height - card.height) / 2, margin, maxTop),
      left: clamp((viewport.width - card.width) / 2, margin, maxLeft),
    };
  }

  const centreLeft = anchor.left + anchor.width / 2 - card.width / 2;
  const centreTop = anchor.top + anchor.height / 2 - card.height / 2;

  const candidates: Record<TourPlacement, { top: number; left: number }> = {
    top: { top: anchor.top - gap - card.height, left: centreLeft },
    bottom: { top: anchor.top + anchor.height + gap, left: centreLeft },
    left: { top: centreTop, left: anchor.left - gap - card.width },
    right: { top: centreTop, left: anchor.left + anchor.width + gap },
  };

  const fits: Record<TourPlacement, boolean> = {
    top: candidates.top.top >= margin,
    bottom: candidates.bottom.top + card.height <= viewport.height - margin,
    left: candidates.left.left >= margin,
    right: candidates.right.left + card.width <= viewport.width - margin,
  };

  const preference: Record<TourPlacement, readonly TourPlacement[]> = {
    top: ["top", "bottom", "right", "left"],
    bottom: ["bottom", "top", "right", "left"],
    left: ["left", "right", "bottom", "top"],
    right: ["right", "left", "bottom", "top"],
  };

  const chosen =
    preference[placement].find((side) => fits[side]) ?? placement;
  const { top, left } = candidates[chosen];

  return {
    placement: chosen,
    top: clamp(top, margin, maxTop),
    left: clamp(left, margin, maxLeft),
  };
}
