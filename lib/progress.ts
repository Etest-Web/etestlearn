/** Progress is the share of lessons completed, clamped to 0–100. */
export function computeProgress(
  completedCount: number,
  totalLessons: number,
): number {
  if (totalLessons <= 0 || completedCount <= 0) return 0;
  return Math.min(100, Math.round((completedCount / totalLessons) * 100));
}
