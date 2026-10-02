/**
 * Pure logic for course completion certificates. Kept out of Convex so it can
 * be unit tested and reused from the client (the UI needs the same eligibility
 * rules to decide whether to show the "Get certificate" button).
 */

/** Prefix every certificate serial carries, e.g. `GL-2026-3F9A1C77`. */
export const CERTIFICATE_SERIAL_PREFIX = "GL";

/**
 * A certificate is the credential an employer checks, so it is only issued when
 * the learner finished every lesson *and* passed every quiz. This is the single
 * definition of "completed" — analytics, issuance, and the UI all read from it.
 */
export interface CertificateCompletionInput {
  /** Every lesson id attached to the course. */
  lessonIds: string[];
  /** Lesson ids the learner has completed. */
  completedLessonIds: string[];
  /** Ids of every quiz attached to the course's lessons. */
  quizIds: string[];
  /** Ids of quizzes the learner has passed at least once. */
  passedQuizIds: string[];
}

export interface CertificateCompletion {
  eligible: boolean;
  /** Human-readable reasons the certificate is not yet available. */
  blockers: string[];
  lessonsTotal: number;
  lessonsDone: number;
  quizzesTotal: number;
  quizzesPassed: number;
  progressPercent: number;
}

export function evaluateCertificateCompletion(
  input: CertificateCompletionInput,
): CertificateCompletion {
  const lessonsTotal = input.lessonIds.length;
  const completed = new Set(input.completedLessonIds);
  // Only count completions for lessons that still belong to the course, so a
  // lesson deleted after the learner finished it cannot permanently block a
  // certificate.
  const lessonsDone = input.lessonIds.filter((id) => completed.has(id)).length;
  const lessonsMet = lessonsTotal > 0 && lessonsDone === lessonsTotal;

  const quizzesTotal = input.quizIds.length;
  const passed = new Set(input.passedQuizIds);
  const quizzesPassed = input.quizIds.filter((id) => passed.has(id)).length;
  const quizzesMet = quizzesPassed === quizzesTotal;

  const blockers: string[] = [];
  if (lessonsTotal === 0) {
    blockers.push("This course has no lessons yet.");
  } else if (!lessonsMet) {
    blockers.push(
      `Complete all ${lessonsTotal} lessons (${lessonsDone} of ${lessonsTotal} done).`,
    );
  }
  if (!quizzesMet) {
    blockers.push(
      `Pass all ${quizzesTotal} quizzes (${quizzesPassed} of ${quizzesTotal} passed).`,
    );
  }

  const progressPercent =
    lessonsTotal === 0 ? 0 : Math.round((lessonsDone / lessonsTotal) * 100);

  return {
    eligible: blockers.length === 0,
    blockers,
    lessonsTotal,
    lessonsDone,
    quizzesTotal,
    quizzesPassed,
    progressPercent,
  };
}

/**
 * Builds a human-readable serial: `GL-2026-3F9A1C77`.
 *
 * `entropy` is hex-ish text supplied by the caller (Convex passes a UUID with
 * the dashes stripped) so this stays pure and deterministic under test.
 */
export function generateCertificateSerial(issuedAt: number, entropy: string): string {
  const year = new Date(issuedAt).getUTCFullYear();
  const cleaned = entropy.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  // Pad by repeating the entropy so short input still yields a full-width code,
  // and slice to a fixed length so serials stay comparable by eye.
  const body = cleaned.length >= 8 ? cleaned.slice(0, 8) : cleaned.repeat(8).slice(0, 8);
  return `${CERTIFICATE_SERIAL_PREFIX}-${year}-${body}`;
}

/** Crockford-ish alphabet with no look-alike characters (no I, L, O, U). */
const SERIAL_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Fallback serial generator for contexts without crypto entropy. Not used in
 * production paths — `generateCertificateSerial` with UUID entropy is — but it
 * keeps the issuer able to produce a serial even if entropy is unavailable.
 */
export function randomSerialEntropy(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += SERIAL_ALPHABET[Math.floor(Math.random() * SERIAL_ALPHABET.length)];
  }
  return out;
}

/** A certificate is revoked when it carries a revocation timestamp. */
export function isCertificateRevoked(
  certificate: { revokedAt?: number | null } | null | undefined,
): boolean {
  return typeof certificate?.revokedAt === "number";
}

/** Formats an issue timestamp the way the certificate, PDF and emails do. */
export function formatCertificateDate(issuedAt: number): string {
  return new Date(issuedAt).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}