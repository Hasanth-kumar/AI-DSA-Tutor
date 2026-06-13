/**
 * Derive session productivity (0–100) from study duration in minutes.
 *
 * - ≤30 min: 100 → 90 (shorter sessions score higher)
 * - 60 min: 75
 * - >60 min: decreases by 1 point per 15 extra minutes (floor 40)
 */
export function deriveProductivityFromDuration(studyDurationMinutes: number): number {
  const minutes = Math.max(1, Math.round(studyDurationMinutes));

  if (minutes <= 30) {
    return Math.round(100 - (minutes / 30) * 10);
  }
  if (minutes <= 60) {
    return Math.round(90 - ((minutes - 30) / 30) * 15);
  }
  return Math.max(40, Math.round(75 - (minutes - 60) / 15));
}
