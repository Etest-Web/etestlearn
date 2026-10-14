import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  DRIP_CADENCE,
  daysBetween,
  dripDueAt,
  nextDripStep,
  shouldSendDrip,
  type DripStep,
  type DripStepId,
  type EnrollmentDripFacts,
} from "./drip";

const HOUR = 3_600_000;

/**
 * A fixed clock, because the whole module is a function of `now` and a test
 * that reads the wall clock is a test that fails on a Tuesday.
 * 2026-06-01T12:00:00Z.
 */
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

const ENROLLED_AT = NOW - 30 * DAY_MS;

/** A learner mid-course, ten days quiet, enrolled long enough for every step. */
const BASE: EnrollmentDripFacts = {
  enrolledAt: ENROLLED_AT,
  lastActivityAt: NOW - 10 * DAY_MS,
  progressPercent: 40,
  completedLessons: 4,
  totalLessons: 10,
  hasCertificate: false,
  now: NOW,
};

/** Sensible defaults, one field overridden at a time. */
function facts(overrides: Partial<EnrollmentDripFacts> = {}): EnrollmentDripFacts {
  return { ...BASE, ...overrides };
}

/** Looks a step up by id, failing loudly rather than silently testing nothing. */
function step(id: DripStepId): DripStep {
  const found = DRIP_CADENCE.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no step ${id} in DRIP_CADENCE`);
  return found;
}

/**
 * The learner each step was written for: how far along they are and how long
 * they have been quiet. Stated as silence in days rather than a timestamp so a
 * test can place the clock anywhere (an early fire, a late one) and keep the
 * relationship between the two intact.
 */
type StepCase = {
  title: DripStepId;
  progressPercent: number;
  completedLessons: number;
  silentDays: number;
};

const FIRES: StepCase[] = [
  { title: "courseNotStarted", progressPercent: 0, completedLessons: 0, silentDays: 3 },
  { title: "courseStalled", progressPercent: 40, completedLessons: 4, silentDays: 10 },
  { title: "courseAlmostDone", progressPercent: 80, completedLessons: 8, silentDays: 8 },
  { title: "courseStalledFinal", progressPercent: 50, completedLessons: 5, silentDays: 15 },
];

/** That learner's facts, as of an arbitrary clock reading. */
function at(
  entry: StepCase,
  now: number,
  overrides: Partial<EnrollmentDripFacts> = {},
): EnrollmentDripFacts {
  return facts({
    now,
    progressPercent: entry.progressPercent,
    completedLessons: entry.completedLessons,
    lastActivityAt: now - entry.silentDays * DAY_MS,
    ...overrides,
  });
}

function caseFor(id: DripStepId): StepCase {
  const found = FIRES.find((entry) => entry.title === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
}

/** The gates that mean "send nothing", applied on top of the firing facts. */
const HARD_GATES = [
  { title: "the learner already holds a certificate", overrides: { hasCertificate: true } },
  { title: "progress has reached 100", overrides: { progressPercent: 100 } },
  { title: "the course has no lessons", overrides: { totalLessons: 0 } },
  { title: "the learner was active in the last 24 hours", overrides: { lastActivityAt: NOW - 23 * HOUR } },
];

/** How quiet each step requires, with facts that satisfy everything else. */
const SILENCE = [
  { title: "courseStalled", minDays: 5 },
  { title: "courseAlmostDone", minDays: 4 },
  { title: "courseStalledFinal", minDays: 7 },
] as const;

describe("DRIP_CADENCE", () => {
  it("is the four steps, in order", () => {
    expect(DRIP_CADENCE.map((entry) => entry.id)).toEqual([
      "courseNotStarted",
      "courseStalled",
      "courseAlmostDone",
      "courseStalledFinal",
    ]);
  });

  it("gives every step a positive whole-number day offset", () => {
    for (const entry of DRIP_CADENCE) {
      expect(Number.isInteger(entry.dayOffset)).toBe(true);
      expect(entry.dayOffset).toBeGreaterThan(0);
    }
  });

  it("spaces the offsets so the steps read as a sequence, not a pile-up", () => {
    expect(DRIP_CADENCE.map((entry) => entry.dayOffset)).toEqual([2, 7, 12, 21]);
  });

  it("gives every step a purpose worth reading", () => {
    for (const entry of DRIP_CADENCE) {
      expect(entry.purpose.length).toBeGreaterThan(0);
    }
  });

  it("stops at day 21 — nothing in the drip fires after the last step", () => {
    const offsets = DRIP_CADENCE.map((entry) => entry.dayOffset);
    expect(Math.max(...offsets)).toBe(21);
    expect(step("courseStalledFinal")).toBe(DRIP_CADENCE[DRIP_CADENCE.length - 1]);
  });
});

describe("dripDueAt", () => {
  it("adds the offset in whole days to the enrollment", () => {
    expect(dripDueAt(step("courseNotStarted"), ENROLLED_AT)).toBe(ENROLLED_AT + 2 * DAY_MS);
    expect(dripDueAt(step("courseStalledFinal"), ENROLLED_AT)).toBe(ENROLLED_AT + 21 * DAY_MS);
  });
});

describe("daysBetween", () => {
  it("counts whole days and floors the remainder", () => {
    expect(daysBetween(0, DAY_MS)).toBe(1);
    expect(daysBetween(0, DAY_MS - 1)).toBe(0);
    expect(daysBetween(0, DAY_MS + 1)).toBe(1);
    expect(daysBetween(0, 2 * DAY_MS)).toBe(2);
    expect(daysBetween(0, 9 * DAY_MS + 23 * HOUR)).toBe(9);
  });

  it("is 0 for the same instant", () => {
    expect(daysBetween(NOW, NOW)).toBe(0);
  });

  it("is 0, not a negative number, when the clock runs backwards", () => {
    // Clock skew can put lastActivityAt a hair ahead of now. That learner was
    // just here, so 0 days quiet is right — and a negative would otherwise
    // satisfy every silence threshold.
    expect(daysBetween(DAY_MS, 0)).toBe(0);
    expect(daysBetween(NOW, NOW - 5 * DAY_MS)).toBe(0);
  });

  it("is 0 for a non-finite timestamp", () => {
    expect(daysBetween(Number.NaN, NOW)).toBe(0);
    expect(daysBetween(0, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("nextDripStep", () => {
  it("is the first step of the cadence by default", () => {
    expect(nextDripStep()?.id).toBe("courseNotStarted");
    expect(nextDripStep()?.dayOffset).toBe(2);
  });

  it("takes the first of a remaining cadence, or undefined when it is spent", () => {
    // The caller drops the steps it has already fired; an empty remainder
    // means there is nothing left to drip.
    const remaining = DRIP_CADENCE.slice(2);
    expect(nextDripStep(remaining)?.id).toBe("courseAlmostDone");
    expect(nextDripStep([])).toBeUndefined();
  });
});

describe("shouldSendDrip: the day-offset gate", () => {
  for (const entry of FIRES) {
    const dueAt = dripDueAt(step(entry.title), ENROLLED_AT);

    it(`holds ${entry.title} back an hour before its offset`, () => {
      expect(shouldSendDrip(step(entry.title), at(entry, dueAt - HOUR))).toBe(false);
    });

    it(`sends ${entry.title} exactly at its offset`, () => {
      expect(shouldSendDrip(step(entry.title), at(entry, dueAt))).toBe(true);
    });

    it(`still sends ${entry.title} a day late, because a late send beats none`, () => {
      expect(shouldSendDrip(step(entry.title), at(entry, dueAt + DAY_MS))).toBe(true);
    });
  }
});

describe("shouldSendDrip: happy paths", () => {
  for (const entry of FIRES) {
    it(`sends ${entry.title} when every condition is satisfied`, () => {
      expect(shouldSendDrip(step(entry.title), at(entry, NOW))).toBe(true);
    });
  }
});

describe("shouldSendDrip: hard gates", () => {
  for (const entry of FIRES) {
    for (const gate of HARD_GATES) {
      it(`suppresses ${entry.title} when ${gate.title}`, () => {
        expect(shouldSendDrip(step(entry.title), at(entry, NOW, gate.overrides))).toBe(false);
      });
    }
  }

  it("sends courseNotStarted when the activity was exactly 24 hours ago", () => {
    // The gate is "under 24 hours". On the boundary the learner was here
    // yesterday, which is not "away".
    const onBoundary = facts({ progressPercent: 0, completedLessons: 0, lastActivityAt: NOW - DAY_MS });
    expect(shouldSendDrip(step("courseNotStarted"), onBoundary)).toBe(true);
  });
});

describe("shouldSendDrip: courseNotStarted", () => {
  it("is suppressed by a single completed lesson, even with progress still 0", () => {
    // Progress is derived upstream and can lag a completion. The lesson count
    // is the harder evidence that they have started.
    const started = facts({ progressPercent: 0, completedLessons: 1, lastActivityAt: NOW - 3 * DAY_MS });
    expect(shouldSendDrip(step("courseNotStarted"), started)).toBe(false);
  });

  it("is suppressed by a non-zero progress with nothing completed", () => {
    // The mirror case: a quiz passed and no lesson ticked off.
    const quizOnly = facts({ progressPercent: 25, completedLessons: 0, lastActivityAt: NOW - 3 * DAY_MS });
    expect(shouldSendDrip(step("courseNotStarted"), quizOnly)).toBe(false);
  });
});

describe("shouldSendDrip: silence thresholds", () => {
  for (const { title, minDays } of SILENCE) {
    const entry = caseFor(title);

    it(`suppresses ${title} one day short of ${minDays} quiet days`, () => {
      const almostSilent = at(entry, NOW, { lastActivityAt: NOW - (minDays - 1) * DAY_MS });
      expect(shouldSendDrip(step(title), almostSilent)).toBe(false);
    });

    it(`sends ${title} on exactly ${minDays} quiet days`, () => {
      const silentEnough = at(entry, NOW, { lastActivityAt: NOW - minDays * DAY_MS });
      expect(shouldSendDrip(step(title), silentEnough)).toBe(true);
    });

    it(`counts ${title} in whole days, not in hours`, () => {
      // Four days and 23 hours is four days quiet, not five, so the step that
      // needs five still waits.
      const nearlyThere = at(entry, NOW, { lastActivityAt: NOW - (minDays - 1) * DAY_MS - 23 * HOUR });
      expect(daysBetween(nearlyThere.lastActivityAt, nearlyThere.now)).toBe(minDays - 1);
      expect(shouldSendDrip(step(title), nearlyThere)).toBe(false);
    });
  }
});

describe("shouldSendDrip: the courseStalled / courseAlmostDone handover", () => {
  it("hands over at exactly 70 percent", () => {
    const atHandover = facts({ progressPercent: 70, completedLessons: 7, lastActivityAt: NOW - 10 * DAY_MS });
    expect(shouldSendDrip(step("courseStalled"), atHandover)).toBe(false);
    expect(shouldSendDrip(step("courseAlmostDone"), atHandover)).toBe(true);
  });

  it("leaves courseStalled alone above the handover point too", () => {
    for (const progress of [85, 99]) {
      const farAlong = facts({ progressPercent: progress, lastActivityAt: NOW - 10 * DAY_MS });
      expect(shouldSendDrip(step("courseStalled"), farAlong)).toBe(false);
    }
  });
});

describe("shouldSendDrip: courseStalledFinal", () => {
  it("does not fire on a course that was never started", () => {
    // Nothing was lost here, so there is no abandonment to speak of — the
    // day-2 message is the right one and it has long since gone out.
    const neverStarted = facts({ progressPercent: 0, completedLessons: 0, lastActivityAt: NOW - 20 * DAY_MS });
    expect(shouldSendDrip(step("courseStalledFinal"), neverStarted)).toBe(false);
  });
});

describe("shouldSendDrip: progress clamping", () => {
  it("reads an over-reported 140 as finished rather than throwing", () => {
    const over = facts({ progressPercent: 140, lastActivityAt: NOW - 10 * DAY_MS });
    expect(() => shouldSendDrip(step("courseStalled"), over)).not.toThrow();
    expect(shouldSendDrip(step("courseStalled"), over)).toBe(
      shouldSendDrip(step("courseStalled"), facts({ progressPercent: 100 })),
    );
    expect(shouldSendDrip(step("courseStalled"), over)).toBe(false);
  });

  it("reads an under-reported -10 as not started rather than throwing", () => {
    const under = facts({ progressPercent: -10, completedLessons: 0, lastActivityAt: NOW - 3 * DAY_MS });
    expect(() => shouldSendDrip(step("courseNotStarted"), under)).not.toThrow();
    expect(shouldSendDrip(step("courseNotStarted"), under)).toBe(
      shouldSendDrip(step("courseNotStarted"), facts({ progressPercent: 0, completedLessons: 0 })),
    );
    expect(shouldSendDrip(step("courseNotStarted"), under)).toBe(true);
  });

  it("reads a NaN progress as no progress, so a reminder still goes out", () => {
    // Junk upstream data must not silently mute the drip: no usable progress
    // means we treat it as none, which still leaves the not-started message.
    const broken = facts({ progressPercent: Number.NaN, completedLessons: 0, lastActivityAt: NOW - 3 * DAY_MS });
    expect(shouldSendDrip(step("courseNotStarted"), broken)).toBe(true);
  });
});

describe("shouldSendDrip: a brand new enrollment", () => {
  it("fires nothing at all six hours in", () => {
    const fresh = facts({ enrolledAt: NOW - 6 * HOUR });
    for (const entry of DRIP_CADENCE) {
      expect(shouldSendDrip(entry, fresh)).toBe(false);
    }
  });

  it("fires nothing at the moment of enrollment", () => {
    const fresh = facts({ enrolledAt: NOW });
    for (const entry of DRIP_CADENCE) {
      expect(shouldSendDrip(entry, fresh)).toBe(false);
    }
  });
});

describe("shouldSendDrip: steps skip rather than block", () => {
  it("lets a later step fire when an earlier one's condition fails", () => {
    // Day 12, 80% done, quiet for a week: courseStalled was due on day 7 and
    // is skipped because the learner is past the handover point, which must
    // not stop courseAlmostDone from being sent.
    const learner = facts({
      enrolledAt: NOW - 12 * DAY_MS,
      progressPercent: 80,
      completedLessons: 8,
      lastActivityAt: NOW - 7 * DAY_MS,
    });

    expect(shouldSendDrip(step("courseStalled"), learner)).toBe(false);
    expect(shouldSendDrip(step("courseAlmostDone"), learner)).toBe(true);
  });

  it("sends only the not-started message for a learner who never opened it", () => {
    const learner = facts({
      enrolledAt: NOW - 25 * DAY_MS,
      progressPercent: 0,
      completedLessons: 0,
      lastActivityAt: NOW - 25 * DAY_MS,
    });

    const sent = DRIP_CADENCE.filter((entry) => shouldSendDrip(entry, learner)).map((entry) => entry.id);
    expect(sent).toEqual(["courseNotStarted"]);
  });
});