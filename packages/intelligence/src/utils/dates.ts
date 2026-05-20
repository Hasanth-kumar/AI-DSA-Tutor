const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `earlier` to `later` (non-negative if later >= earlier). */
export function differenceInDays(later: Date, earlier: Date): number {
  const start = startOfDay(later).getTime();
  const end = startOfDay(earlier).getTime();
  return Math.round((start - end) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
