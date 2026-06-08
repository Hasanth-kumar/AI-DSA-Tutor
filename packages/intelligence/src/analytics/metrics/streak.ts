import type { StreakInfo } from "../types.js";

const MS_PER_DAY = 86_400_000;

export function computeStreakInfo(
  sessions: { date: number }[],
  now = new Date(),
): StreakInfo {
  if (sessions.length === 0) {
    return {
      currentStreakDays: 0,
      longestStreakDays: 0,
      activeDays: [],
      lastSessionDate: null,
    };
  }

  const days = [...new Set(sessions.map((s) => dayKey(s.date)))].sort();
  const sortedDesc = [...days].sort().reverse();
  const lastSessionDate = sortedDesc[0] ?? null;

  return {
    currentStreakDays: computeCurrentStreak(sortedDesc, now),
    longestStreakDays: computeLongestStreak(days),
    activeDays: sortedDesc.slice(0, 30),
    lastSessionDate,
  };
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function computeCurrentStreak(sortedDesc: string[], now: Date): number {
  if (sortedDesc.length === 0) return 0;

  let streak = 0;
  const today = now.toISOString().slice(0, 10);
  let cursor = today;

  for (const day of sortedDesc) {
    if (day > cursor) continue;
    if (day === cursor) {
      streak += 1;
      cursor = previousDay(cursor);
    } else if (streak === 0 && day === sortedDesc[0]) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = yesterday.toISOString().slice(0, 10);
      if (day === yKey) {
        streak = 1;
        cursor = previousDay(yKey);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return streak;
}

function computeLongestStreak(sortedAsc: string[]): number {
  if (sortedAsc.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedAsc.length; i++) {
    const prev = new Date(sortedAsc[i - 1]!);
    const curr = new Date(sortedAsc[i]!);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / MS_PER_DAY);

    if (diffDays === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (diffDays > 1) {
      current = 1;
    }
  }

  return longest;
}

function previousDay(day: string): string {
  const prev = new Date(day);
  prev.setDate(prev.getDate() - 1);
  return prev.toISOString().slice(0, 10);
}
