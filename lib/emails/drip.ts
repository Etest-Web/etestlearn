/**
 * Drip timing for the course reminder emails.
 *
 * The problem: most learners enroll and never finish. A single "you have not
 * started" email on day 2 catches nobody, and a daily stream is the fastest way
 * to be marked as spam. So the drip is four reminders at fixed points on the
 * enrollment timeline, each one written for a different reason the learner
 * stopped.
 *
 * The shape of the thing matters more than the exact numbers. Convex's
 * scheduler fires an action at a *wall clock time* and takes no interest in
 * whether the reminder is still relevant, so the send decision cannot live in
 * the schedule. It has to be made at fire time, from what we know about the
 * enrollment *then*: the learner may have finished the course, or started it
 * this morning, or gone quiet since. That is why `shouldSendDrip` takes the
 * facts rather than the schedule — the schedule says when we wake up, the
 * facts decide whether we say anything.
 *
 * Two deliberate choices worth knowing before editing this file:
 *
 * - **No jitter.** The offsets are exact and identical for every enrollment.
 *   A "clever" ±1 day randomisation makes the schedule impossible to reason
 *   about in a test, impossible to explain to support, and buys nothing —
 *   these are not campaign sends.
 * - **Clamp, never throw.** `progressPercent` arrives from upstream
 *   aggregation over rows this file cannot see, so it can arrive as 140, as
 *   -10, or as NaN. Bad data must not stop a reminder that would otherwise be
 *   correct, so out-of-range values are pulled into 0..100 and the decision
 *   continues.
 *
 * This module is pure: no Convex import, no env read, no I/O, and no clock of
 * its own — the caller passes `now`. The Convex action that schedules the
 * sends is the only thing that knows about time or the database.
 */

/** A day in milliseconds. Fixed 24h, matching how Convex measures a "day". */
export const DAY_MS = 86_400_000;

export type DripStepId =
  | "courseNotStarted"
  | "courseStalled"
  | "courseAlmostDone"
  | "courseStalledFinal";

export type DripStep = {
  id: DripStepId;
  /** Days after the enrollment was created at which this step fires. */
  dayOffset: number;
  /** One line: what this step is for. */
  purpose: string;
};

/**
 * The whole schedule. Order is the reading order of a drip campaign and also
 * its authority: each step is about a different failure, they do not compete,
 * and nothing fires after the last entry.
 *
 * The two "stalled" steps share a condition on purpose. `courseStalled` (day 7)
 * catches someone who drifted; `courseStalledFinal` (day 21) is the last word
 * before we go quiet for good. They differ in how long the learner must have
 * been away (5 days vs 7) and in position in the sequence, not in what counts
 * as a stall — that way a learner who resurfaces between them gets the nearer
 * message, not two of the same one.
 */
export const DRIP_CADENCE: readonly DripStep[] = Object.freeze([
  {
    id: "courseNotStarted",
    dayOffset: 2,
    purpose: "Enrolled two days ago and never opened it — the cheapest win there is.",
  },
  {
    id: "courseStalled",
    dayOffset: 7,
    purpose: "Made a start, then went quiet mid-course while progress was still fresh.",
  },
  {
    id: "courseAlmostDone",
    dayOffset: 12,
    purpose: "Most of the way through and stopped — finishing is now a small ask.",
  },
  {
    id: "courseStalledFinal",
    dayOffset: 21,
    purpose: "Last reminder before we stop nudging, for anyone still part-way.",
  },
]);

/** Everything the send decision is allowed to know. Assembled by the caller. */
export type EnrollmentDripFacts = {
  enrolledAt: number;
  /** Last time the learner did anything in this course: lesson completed, quiz passed, enrollment patched. */
  lastActivityAt: number;
  /** 0..100. */
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  hasCertificate: boolean;
  /** Current wall clock, passed in so predicates stay pure. */
  now: number;
};

/**
 * Absolute timestamp this step fires for a given enrollment. Callers schedule
 * Convex against this value; `shouldSendDrip` checks `now` against it again at
 * fire time, because a scheduler that runs late must not have its send revoked.
 */
export function dripDueAt(step: DripStep, enrolledAt: number): number {
  return enrolledAt + step.dayOffset * DAY_MS;
}

/**
 * Whole days between two timestamps, floored, never negative.
 *
 * Flooring is what makes "at least 5 days quiet" mean 5 full days. Negative
 * never happens: clock skew can put `lastActivityAt` a few seconds ahead of
 * `now`, and that learner was just here, so they read as 0 days quiet rather
 * than as a large negative number that would satisfy every silence threshold.
 */
export function daysBetween(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  if (to <= from) return 0;
  return Math.floor((to - from) / DAY_MS);
}

/**
 * The next step of the drip — the first entry of the cadence.
 *
 * This is the "what is still ahead of me" lookup, not the "should I send"
 * decision, which is `shouldSendDrip`'s job. A caller that tracks which steps
 * have already fired passes the remainder as `cadence`; an empty remainder
 * (everything sent, or nothing configured) yields `undefined` rather than a
 * throw.
 */
export function nextDripStep(cadence: readonly DripStep[] = DRIP_CADENCE): DripStep | undefined {
  return cadence.length > 0 ? cadence[0] : undefined;
}

/**
 * Pulls an upstream progress number into 0..100.
 *
 * Out-of-range is treated as the nearest edge rather than discarded, so a
 * learner reported at 140 still reads as finished (and is left alone) while one
 * reported at -10 still reads as not started (and can be nudged). A non-finite
 * value is the same case as -10: we have no usable progress, so we assume none.
 * Nothing here throws — a corrupt percentage is not a reason to silently drop a
 * reminder.
 */
function clampedProgress(progressPercent: number): number {
  if (!Number.isFinite(progressPercent)) return 0;
  return Math.min(100, Math.max(0, progressPercent));
}

/**
 * The single deciding predicate. `true` means send this step now.
 *
 * Read the two halves as separate questions. The hard gates below are
 * "there is nothing to say", and they apply to every step. The switch after
 * them is "there is something to say *about this step*", and a step that fails
 * it is skipped rather than blocking the others — a learner who never started
 * and a learner at 90% are both handled, just by different steps, and neither
 * one suppresses the other.
 */
export function shouldSendDrip(step: DripStep, facts: EnrollmentDripFacts): boolean {
  const progress = clampedProgress(facts.progressPercent);

  // ---- Hard gates. Any one of these means send nothing at all. ----

  // They finished. Congratulating someone on the course they are still
  // struggling with is worse than staying quiet.
  if (facts.hasCertificate) return false;

  // Same reason, checked before the certificate row exists: completion and
  // issuance are separate events, and the learner should hear from us in the
  // good news, not a nudge, in the window between them.
  if (progress >= 100) return false;

  // A course with no lessons cannot be completed and cannot be stalled — there
  // is no progress to protect and no "you are away" claim that is true.
  if (facts.totalLessons <= 0) return false;

  // Never early, not even by an hour. This is the rule that keeps the schedule
  // honest: the caller may wake us up early (a re-scheduled job, a retry, a
  // clock change), and a reminder that arrives ahead of its own cadence is
  // worse than one that arrives late.
  if (facts.now < dripDueAt(step, facts.enrolledAt)) return false;

  // They were here in the last 24 hours. Telling a learner who logged in this
  // morning that they have been away is simply wrong, so this gate outranks
  // every step's own idea of how quiet is quiet enough.
  if (facts.now - facts.lastActivityAt < DAY_MS) return false;

  // ---- Per-step. Failing here skips this step only. ----

  const silentDays = daysBetween(facts.lastActivityAt, facts.now);

  switch (step.id) {
    case "courseNotStarted":
      // Both halves, because either can be true alone and both mean "has not
      // started": a lesson completion with progress still reported as 0 is a
      // learner who began, and progress with nothing completed is usually a
      // quiz. Asking them "have you started?" after they have is a small
      // credibility cost we do not need to pay.
      return progress === 0 && facts.completedLessons === 0;

    case "courseStalled":
      // Real progress to protect (they started), and not so far along that
      // courseAlmostDone is the better message.
      return progress > 0 && progress < 70 && silentDays >= 5;

    case "courseAlmostDone":
      // The handover point with courseStalled: at 70% the message is about
      // finishing, not about falling behind.
      return progress >= 70 && silentDays >= 4;

    case "courseStalledFinal":
      // The last step in the cadence, so it also states the floor: incomplete
      // (the < 100 half is already a hard gate, restated so the intent survives
      // a future reordering) and properly quiet.
      return progress > 0 && progress < 100 && silentDays >= 7;

    default:
      // An unknown id is not a reason to send.
      return false;
  }
}