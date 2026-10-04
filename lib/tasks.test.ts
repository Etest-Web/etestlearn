import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  DUE_SOON_WINDOW_MS,
  WEEK_MS,
  aggregateGradingCounts,
  assertAssignmentStatusTransition,
  assertDueDateInFuture,
  assertOpenable,
  assertScoreWithinMaxPoints,
  canTransitionAssignmentStatus,
  countSubmissionStatuses,
  daysUntil,
  deriveDueState,
  dueLabel,
  isLateSubmission,
  matchesStudyTaskFilter,
  matchesStudentAssignmentFilter,
  normalizeOptionalText,
  normalizeSubmissionContent,
  normalizeTitle,
  nextAssignmentStatus,
  scorePercent,
  studyTaskStats,
  type AssignmentStatus,
  type SubmissionStatus,
} from "./tasks";

const NOW = Date.UTC(2026, 2, 10, 12, 0, 0); // 10 Mar 2026, midday

describe("deriveDueState", () => {
  it("reports nothing for a record with no due date", () => {
    expect(deriveDueState({ now: NOW })).toEqual({
      hasDueDate: false,
      overdue: false,
      dueSoon: false,
      daysRemaining: null,
    });
    expect(deriveDueState({ dueAt: null, now: NOW }).hasDueDate).toBe(false);
    expect(deriveDueState({ dueAt: Number.NaN, now: NOW }).hasDueDate).toBe(false);
  });

  it("is not overdue when the deadline has not passed", () => {
    const state = deriveDueState({ dueAt: NOW + 2 * DAY_MS, now: NOW });
    expect(state.overdue).toBe(false);
    expect(state.daysRemaining).toBe(2);
  });

  it("is overdue once the deadline has passed", () => {
    const state = deriveDueState({ dueAt: NOW - 1, now: NOW });
    expect(state.overdue).toBe(true);
    // A minute late is still "today", not "1 day late".
    expect(state.daysRemaining).toBe(0);
    expect(deriveDueState({ dueAt: NOW - DAY_MS - 1, now: NOW }).daysRemaining).toBe(-1);
  });

  it("never marks a completed task overdue or due soon", () => {
    const state = deriveDueState({ dueAt: NOW - 5 * DAY_MS, now: NOW, completed: true });
    expect(state.overdue).toBe(false);
    expect(state.dueSoon).toBe(false);
  });

  it("warns inside the due-soon window and not outside it", () => {
    expect(deriveDueState({ dueAt: NOW + 60_000, now: NOW }).dueSoon).toBe(true);
    expect(
      deriveDueState({ dueAt: NOW + DUE_SOON_WINDOW_MS, now: NOW }).dueSoon,
    ).toBe(true);
    expect(
      deriveDueState({ dueAt: NOW + DUE_SOON_WINDOW_MS + 1, now: NOW }).dueSoon,
    ).toBe(false);
  });

  it("honours a custom due-soon window", () => {
    const dueAt = NOW + 5 * DAY_MS;
    expect(deriveDueState({ dueAt, now: NOW }).dueSoon).toBe(false);
    expect(deriveDueState({ dueAt, now: NOW, dueSoonWindowMs: 7 * DAY_MS }).dueSoon).toBe(
      true,
    );
  });

  it("treats the last second of the due date as on time", () => {
    // 23:59 on the deadline is still "due today", not late.
    const endOfDay = Date.UTC(2026, 2, 10, 23, 59, 59);
    expect(deriveDueState({ dueAt: endOfDay, now: NOW }).overdue).toBe(false);
  });
});

describe("daysUntil", () => {
  it("rounds toward the deadline in both directions", () => {
    expect(daysUntil(NOW - 60_000, NOW)).toBe(0);
    expect(daysUntil(NOW + 60_000, NOW)).toBe(0);
    expect(daysUntil(NOW + DAY_MS * 2.5, NOW)).toBe(2);
    expect(daysUntil(NOW - DAY_MS * 2.5, NOW)).toBe(-2);
    expect(daysUntil(NOW + DAY_MS, NOW)).toBe(1);
    expect(daysUntil(NOW - DAY_MS, NOW)).toBe(-1);
  });
});

describe("dueLabel", () => {
  it("says so when there is no deadline", () => {
    expect(dueLabel(undefined, NOW)).toBe("No due date");
  });

  it("spells out urgency rather than leaving it to colour", () => {
    expect(dueLabel(NOW - 3 * DAY_MS, NOW)).toBe("Overdue by 3 days");
    expect(dueLabel(NOW - DAY_MS, NOW)).toBe("Overdue by 1 day");
    // Judged in milliseconds, so a minute late is not reported as a day.
    expect(dueLabel(NOW - 60_000, NOW)).toBe("Overdue · today");
    expect(dueLabel(NOW - DAY_MS * 2.4, NOW)).toBe("Overdue by 2 days");
  });

  it("counts forward for imminent deadlines", () => {
    expect(dueLabel(NOW, NOW)).toBe("Due today");
    expect(dueLabel(NOW + DAY_MS, NOW)).toBe("Due tomorrow");
    expect(dueLabel(NOW + 3 * DAY_MS, NOW)).toBe("Due in 3 days");
    expect(dueLabel(NOW + 7 * DAY_MS, NOW)).toBe("Due in 7 days");
  });

  it("switches to a calendar date beyond a week", () => {
    expect(dueLabel(Date.UTC(2026, 8, 4, 9, 0, 0), NOW)).toBe("Due 4 Sep");
  });

  it("includes the year when the deadline is in another one", () => {
    expect(dueLabel(Date.UTC(2027, 0, 15, 9, 0, 0), NOW)).toBe("Due 15 Jan 2027");
  });

  it("reports a finished task as done rather than late", () => {
    expect(dueLabel(NOW - 10 * DAY_MS, NOW, true)).toBe("Done · was due 28 Feb");
  });
});

describe("isLateSubmission", () => {
  it("needs both timestamps", () => {
    expect(isLateSubmission(undefined, NOW)).toBe(false);
    expect(isLateSubmission(NOW, undefined)).toBe(false);
    expect(isLateSubmission(null, NOW)).toBe(false);
  });

  it("is true only strictly after the deadline", () => {
    expect(isLateSubmission(NOW - 1, NOW)).toBe(false);
    expect(isLateSubmission(NOW + 1, NOW)).toBe(true);
  });
});

describe("countSubmissionStatuses", () => {
  it("counts nothing for no submissions", () => {
    expect(countSubmissionStatuses([])).toEqual({
      total: 0,
      drafts: 0,
      submitted: 0,
      ungraded: 0,
      graded: 0,
    });
  });

  it("keeps ungraded + graded === submitted", () => {
    const statuses: SubmissionStatus[] = [
      "draft",
      "submitted",
      "submitted",
      "graded",
    ];
    const counts = countSubmissionStatuses(statuses);
    expect(counts).toEqual({
      total: 4,
      drafts: 1,
      submitted: 3,
      ungraded: 2,
      graded: 1,
    });
    expect(counts.ungraded + counts.graded).toBe(counts.submitted);
    expect(counts.drafts + counts.submitted).toBe(counts.total);
  });
});

describe("aggregateGradingCounts", () => {
  it("sums per-assignment counts", () => {
    const a = countSubmissionStatuses(["submitted", "graded"]);
    const b = countSubmissionStatuses(["draft", "submitted", "submitted", "graded"]);
    const total = aggregateGradingCounts([a, b]);
    expect(total.total).toBe(a.total + b.total);
    expect(total.ungraded).toBe(a.ungraded + b.ungraded);
    expect(total.graded).toBe(a.graded + b.graded);
  });

  it("is all zeroes for no assignments", () => {
    expect(aggregateGradingCounts([])).toEqual({
      total: 0,
      drafts: 0,
      submitted: 0,
      ungraded: 0,
      graded: 0,
    });
  });
});

describe("scorePercent", () => {
  it("scales against the assignment maximum", () => {
    expect(scorePercent(5, 10)).toBe(50);
    expect(scorePercent(10, 10)).toBe(100);
    expect(scorePercent(0, 10)).toBe(0);
    expect(scorePercent(1, 3)).toBe(33);
  });

  it("is null with no maximum or no score, rather than guessing", () => {
    expect(scorePercent(5, undefined)).toBeNull();
    expect(scorePercent(5, 0)).toBeNull();
    expect(scorePercent(undefined, 10)).toBeNull();
  });

  it("clamps nonsense rather than rendering 4000%", () => {
    expect(scorePercent(-5, 10)).toBe(0);
    expect(scorePercent(400, 10)).toBe(100);
  });
});

describe("assertScoreWithinMaxPoints", () => {
  it("accepts a score at either end of the range", () => {
    expect(() => assertScoreWithinMaxPoints(0, 10)).not.toThrow();
    expect(() => assertScoreWithinMaxPoints(10, 10)).not.toThrow();
  });

  it("rejects a score above the maximum", () => {
    expect(() => assertScoreWithinMaxPoints(11, 10)).toThrow(/higher than the maximum of 10/);
  });

  it("rejects a negative score", () => {
    expect(() => assertScoreWithinMaxPoints(-1, 10)).toThrow(/below zero/);
  });

  it("refuses to grade an assignment that has no maximum", () => {
    expect(() => assertScoreWithinMaxPoints(5, undefined)).toThrow(
      /maximum points value/i,
    );
  });

  it("rejects a non-finite score", () => {
    expect(() => assertScoreWithinMaxPoints(Number.NaN, 10)).toThrow(/must be a number/);
  });
});

describe("assignment status machine", () => {
  it("publishes a draft and closes an open one", () => {
    expect(canTransitionAssignmentStatus("draft", "open")).toBe(true);
    expect(canTransitionAssignmentStatus("open", "closed")).toBe(true);
  });

  it("allows unpublishing and reopening", () => {
    expect(canTransitionAssignmentStatus("open", "draft")).toBe(true);
    expect(canTransitionAssignmentStatus("closed", "open")).toBe(true);
    expect(canTransitionAssignmentStatus("closed", "draft")).toBe(true);
  });

  it("will not close a draft that was never visible", () => {
    expect(canTransitionAssignmentStatus("draft", "closed")).toBe(false);
    expect(() => assertAssignmentStatusTransition("draft", "closed")).toThrow(
      /cannot move from draft to closed/,
    );
  });

  it("rejects a no-op transition", () => {
    expect(canTransitionAssignmentStatus("open", "open")).toBe(false);
    expect(() => assertAssignmentStatusTransition("closed", "closed")).toThrow();
  });

  it("exposes the forward step", () => {
    const forward: Array<[AssignmentStatus, AssignmentStatus]> = [
      ["draft", "open"],
      ["open", "closed"],
      ["closed", "open"],
    ];
    for (const [from, to] of forward) {
      expect(nextAssignmentStatus(from)).toBe(to);
      expect(() => assertAssignmentStatusTransition(from, to)).not.toThrow();
    }
  });
});

describe("assertOpenable", () => {
  it("requires instructions before publishing", () => {
    expect(() => assertOpenable(undefined)).toThrow(/Add instructions/);
    expect(() => assertOpenable("")).toThrow(/Add instructions/);
    expect(() => assertOpenable("   \n ")).toThrow(/Add instructions/);
  });

  it("accepts instructions", () => {
    expect(() => assertOpenable("Write 500 words.")).not.toThrow();
  });
});

describe("matchesStudentAssignmentFilter", () => {
  const base = { status: "open" as const, isOverdue: false, submission: null };

  it("keeps everything under all", () => {
    expect(matchesStudentAssignmentFilter(base, "all")).toBe(true);
    expect(
      matchesStudentAssignmentFilter(
        { ...base, submission: { status: "graded" } },
        "all",
      ),
    ).toBe(true);
  });

  it("treats not-started, draft and awaiting-grade as pending", () => {
    for (const submission of [null, { status: "draft" as const }, { status: "submitted" as const }]) {
      expect(matchesStudentAssignmentFilter({ ...base, submission }, "pending")).toBe(true);
    }
    expect(
      matchesStudentAssignmentFilter({ ...base, submission: { status: "graded" } }, "pending"),
    ).toBe(false);
  });

  it("only offers overdue work that is not already marked", () => {
    expect(matchesStudentAssignmentFilter({ ...base, isOverdue: true }, "overdue")).toBe(true);
    expect(
      matchesStudentAssignmentFilter(
        { ...base, isOverdue: true, submission: { status: "graded" } },
        "overdue",
      ),
    ).toBe(false);
    expect(matchesStudentAssignmentFilter(base, "overdue")).toBe(false);
  });

  it("separates handed-in work from marked work", () => {
    expect(
      matchesStudentAssignmentFilter({ ...base, submission: { status: "submitted" } }, "submitted"),
    ).toBe(true);
    expect(
      matchesStudentAssignmentFilter({ ...base, submission: { status: "graded" } }, "submitted"),
    ).toBe(true);
    expect(
      matchesStudentAssignmentFilter({ ...base, submission: { status: "graded" } }, "graded"),
    ).toBe(true);
    expect(
      matchesStudentAssignmentFilter({ ...base, submission: { status: "submitted" } }, "graded"),
    ).toBe(false);
    expect(matchesStudentAssignmentFilter(base, "submitted")).toBe(false);
  });
});

describe("studyTaskStats", () => {
  it("is all zeroes with no tasks", () => {
    expect(studyTaskStats([], NOW)).toEqual({
      outstanding: 0,
      completed: 0,
      overdue: 0,
      dueThisWeek: 0,
    });
  });

  it("counts overdue tasks inside the week figure", () => {
    const stats = studyTaskStats(
      [
        { dueAt: NOW - DAY_MS, completedAt: undefined },
        { dueAt: NOW + 2 * DAY_MS, completedAt: undefined },
        { dueAt: NOW + 30 * DAY_MS, completedAt: undefined },
        { dueAt: NOW + DAY_MS, completedAt: NOW },
        { completedAt: undefined },
      ],
      NOW,
    );
    expect(stats).toEqual({ outstanding: 4, completed: 1, overdue: 1, dueThisWeek: 2 });
  });

  it("does not count completed work as overdue", () => {
    const stats = studyTaskStats([{ dueAt: NOW - 9 * DAY_MS, completedAt: NOW }], NOW);
    expect(stats.overdue).toBe(0);
    expect(stats.outstanding).toBe(0);
    expect(stats.completed).toBe(1);
  });

  it("treats exactly seven days out as this week", () => {
    const stats = studyTaskStats([{ dueAt: NOW + WEEK_MS, completedAt: undefined }], NOW);
    expect(stats.dueThisWeek).toBe(1);
  });
});

describe("matchesStudyTaskFilter", () => {
  const task = { completed: false, priority: "high" as const };

  it("keeps everything when both filters are all", () => {
    expect(matchesStudyTaskFilter(task, { status: "all", priority: "all" })).toBe(true);
  });

  it("splits outstanding from completed", () => {
    expect(matchesStudyTaskFilter(task, { status: "outstanding", priority: "all" })).toBe(true);
    expect(matchesStudyTaskFilter(task, { status: "completed", priority: "all" })).toBe(false);
    expect(
      matchesStudyTaskFilter({ ...task, completed: true }, { status: "completed", priority: "all" }),
    ).toBe(true);
  });

  it("applies status and priority together", () => {
    expect(matchesStudyTaskFilter(task, { status: "outstanding", priority: "high" })).toBe(true);
    expect(matchesStudyTaskFilter(task, { status: "outstanding", priority: "low" })).toBe(false);
  });
});

describe("field validation", () => {
  it("trims and requires a title", () => {
    expect(normalizeTitle("  Essay  ")).toBe("Essay");
    expect(() => normalizeTitle("   ")).toThrow(/Title is required/);
    expect(() => normalizeTitle("x".repeat(200))).toThrow(/160 characters or fewer/);
  });

  it("treats blank optional text as absent", () => {
    expect(normalizeOptionalText("   ", "Notes", 100)).toBeUndefined();
    expect(normalizeOptionalText(undefined, "Notes", 100)).toBeUndefined();
    expect(normalizeOptionalText(" hello ", "Notes", 100)).toBe("hello");
    expect(() => normalizeOptionalText("x".repeat(101), "Notes", 100)).toThrow(
      /Notes must be 100 characters or fewer/,
    );
  });

  it("refuses an empty submission", () => {
    expect(() => normalizeSubmissionContent("")).toThrow(/Your answer is required/);
    expect(() => normalizeSubmissionContent("  \n ")).toThrow(/Your answer is required/);
    expect(normalizeSubmissionContent(" my answer ")).toBe("my answer");
    expect(() => normalizeSubmissionContent("x".repeat(20_001))).toThrow(
      /20,?000 characters or fewer/,
    );
  });

  it("rejects a due date in the past", () => {
    expect(() => assertDueDateInFuture(NOW + DAY_MS, NOW)).not.toThrow();
    expect(() => assertDueDateInFuture(undefined, NOW)).not.toThrow();
    expect(() => assertDueDateInFuture(NOW - 1, NOW)).toThrow(/cannot be in the past/);
    expect(() => assertDueDateInFuture(Number.NaN, NOW)).toThrow(/valid date/);
  });
});