import { describe, expect, test } from "vitest";
import {
  CARD_GAP,
  CARD_MARGIN,
  positionCard,
  START_ROUTE,
  stepsForRole,
  TOUR_STEPS,
  type TourPlacement,
  type TourRole,
} from "./tutorial";

const ROLES: TourRole[] = ["student", "instructor", "admin"];

describe("the step list", () => {
  test("ids are unique", () => {
    // A duplicate id is a React key collision and, worse, an ambiguous anchor
    // for any future "resume where you left off" feature.
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every step has copy and a route", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.trim(), step.id).not.toBe("");
      expect(step.body.trim(), step.id).not.toBe("");
      expect(step.route, step.id).toMatch(/^\/dashboard/);
      expect(step.roles.length, step.id).toBeGreaterThan(0);
    }
  });

  test("every role gets steps on its documented starting route", () => {
    // This is the load-bearing one: `START_ROUTE` is what the Settings
    // "replay" button navigates to, so a route with no steps would send the
    // user somewhere and do nothing.
    for (const role of ROLES) {
      expect(stepsForRole(role, START_ROUTE[role]).length, role).toBeGreaterThan(0);
    }
  });

  test("no step is unreachable — every (step, role) pair resolves somewhere", () => {
    for (const step of TOUR_STEPS) {
      for (const role of step.roles) {
        expect(stepsForRole(role, step.route), `${step.id}/${role}`).toContain(step);
      }
    }
  });
});

describe("stepsForRole", () => {
  test("a student never sees the teaching steps", () => {
    const ids = stepsForRole("student", "/dashboard/instructor").map((s) => s.id);
    expect(ids).toEqual([]);
  });

  test("staff see the teaching steps on the teaching console", () => {
    for (const role of ["instructor", "admin"] as const) {
      const ids = stepsForRole(role, "/dashboard/instructor").map((s) => s.id);
      expect(ids.length, role).toBeGreaterThan(0);
      expect(ids).toContain("teach-create-course");
    }
  });

  test("everyone sees the learner steps on the learner dashboard", () => {
    for (const role of ROLES) {
      const ids = stepsForRole(role, "/dashboard").map((s) => s.id);
      expect(ids, role).toContain("welcome");
      expect(ids, role).toContain("sidebar");
    }
  });

  test("a trailing slash is the same route", () => {
    expect(stepsForRole("student", "/dashboard/")).toEqual(
      stepsForRole("student", "/dashboard"),
    );
  });

  test("a sub-route is not the route", () => {
    // The tour must not claim a page it has no anchors on. `/dashboard` steps
    // do not run on `/dashboard/courses/<id>`.
    expect(stepsForRole("student", "/dashboard/courses/abc")).toEqual([]);
    expect(stepsForRole("instructor", "/dashboard/instructor/courses/new")).toEqual(
      [],
    );
  });
});

describe("positionCard", () => {
  const card = { width: 320, height: 160 };
  const viewport = { width: 1280, height: 800 };

  test("with no anchor it centres", () => {
    const position = positionCard(null, "bottom", card, viewport);
    expect(position.left).toBe((1280 - 320) / 2);
    expect(position.top).toBe((800 - 160) / 2);
  });

  test("an anchor low on the screen flips the card above it", () => {
    // Near the bottom there is no room below, so "bottom" must become "top"
    // or the card lands off-screen.
    const anchor = { top: 740, left: 100, width: 200, height: 40 };
    const position = positionCard(anchor, "bottom", card, viewport);
    expect(position.placement).toBe("top");
    expect(position.top + card.height).toBeLessThanOrEqual(800);
  });

  test("an anchor near the right edge keeps the card inside the viewport", () => {
    const anchor = { top: 100, left: 1200, width: 60, height: 40 };
    const position = positionCard(anchor, "bottom", card, viewport);
    expect(position.left + card.width).toBeLessThanOrEqual(1280);
    expect(position.left).toBeGreaterThanOrEqual(CARD_MARGIN);
  });

  test("the preferred side is used when it fits", () => {
    const anchor = { top: 300, left: 400, width: 200, height: 40 };
    const right = positionCard(anchor, "right", card, viewport);
    expect(right.placement).toBe("right");
    expect(right.left).toBe(anchor.left + anchor.width + CARD_GAP);
  });

  test("a card wider than the viewport still flushes to the left margin", () => {
    // Degenerate but reachable on a narrow phone: the clamp must not invert
    // and throw the card negative.
    const position = positionCard(
      null,
      "bottom",
      { width: 500, height: 160 },
      { width: 360, height: 640 },
    );
    expect(position.left).toBe(CARD_MARGIN);
    expect(position.top).toBeGreaterThanOrEqual(CARD_MARGIN);
  });

  test.each(["top", "right", "bottom", "left"] as TourPlacement[])(
    "the result is always inside the viewport for %s",
    (placement) => {
      const anchors = [
        { top: 0, left: 0, width: 40, height: 40 },
        { top: 780, left: 1240, width: 40, height: 40 },
        { top: 400, left: 640, width: 100, height: 100 },
      ];
      for (const anchor of anchors) {
        const position = positionCard(anchor, placement, card, viewport);
        expect(position.left).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(position.top).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(position.left + card.width).toBeLessThanOrEqual(
          viewport.width - CARD_MARGIN + 0.001,
        );
        expect(position.top + card.height).toBeLessThanOrEqual(
          viewport.height - CARD_MARGIN + 0.001,
        );
      }
    },
  );
});
