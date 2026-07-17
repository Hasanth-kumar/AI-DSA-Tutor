/** Pure helpers for the Today page: problem-start persistence + month stats. */
import type { Session } from "../types/api.js";

const STARTS_STORAGE_KEY = "dsa-problem-starts";

/** Midnight local time — abandoned problem starts from prior days don't count. */
function startOfLocalDayMs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function loadStarts(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STARTS_STORAGE_KEY) ?? "{}") as Record<
      string,
      number
    >;
    const cutoff = startOfLocalDayMs();
    const fresh: Record<string, number> = {};
    for (const [id, startedAt] of Object.entries(raw)) {
      if (typeof startedAt === "number" && startedAt >= cutoff) {
        fresh[id] = startedAt;
      }
    }
    // Drop yesterday's abandoned starts so a Mac-app relaunch doesn't show FOCUS forever.
    if (Object.keys(fresh).length !== Object.keys(raw).length) {
      saveStarts(fresh);
    }
    return fresh;
  } catch {
    return {};
  }
}

export function saveStarts(starts: Record<string, number>): void {
  localStorage.setItem(STARTS_STORAGE_KEY, JSON.stringify(starts));
}

function isCurrentMonth(dateMs: number, now = new Date()): boolean {
  const d = new Date(dateMs);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function sessionsThisMonth(sessions: Session[]): number {
  const now = new Date();
  return sessions.filter((s) => isCurrentMonth(s.date, now)).length;
}

export function studyHoursThisMonth(sessions: Session[]): number {
  const now = new Date();
  const mins = sessions
    .filter((s) => isCurrentMonth(s.date, now))
    .reduce((sum, s) => sum + (s.studyDuration ?? 0), 0);
  return Math.round((mins / 60) * 10) / 10;
}
