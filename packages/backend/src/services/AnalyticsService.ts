import type { IntelligenceOrchestrator } from "@dsa/intelligence";
import type { SessionRepository } from "../repositories/SessionRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  sessionsCount: number;
  problemsSolved: number;
  totalStudyMinutes: number;
  averageProductivity: number;
  currentStreakDays: number;
  weakTopics: { id: string; name: string; score: number }[];
  masteredTopics: number;
  inProgressTopics: number;
  intelligenceSummary: string;
}

const MS_PER_DAY = 86_400_000;

export class AnalyticsService {
  constructor(
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly topicRepo: TopicRepository,
    private readonly sessionRepo: SessionRepository,
  ) {}

  getWeeklySummary(now = new Date()): WeeklySummary {
    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd.getTime() - 6 * MS_PER_DAY);
    weekStart.setHours(0, 0, 0, 0);

    const sessions = this.sessionRepo
      .findAll(500)
      .filter((s) => s.date >= weekStart.getTime() && s.date <= weekEnd.getTime());

    const problemsSolved = sessions.reduce((sum, s) => sum + (s.problemsSolved ?? 0), 0);
    const totalStudyMinutes = sessions.reduce(
      (sum, s) => sum + (s.studyDuration ?? 0),
      0,
    );
    const averageProductivity =
      sessions.length > 0
        ? sessions.reduce((sum, s) => sum + (s.productivityScore ?? 0), 0) /
          sessions.length
        : 0;

    const topics = this.topicRepo.findAll();
    const snapshot = this.intelligence.buildSnapshot(topics);
    const weakTopics = snapshot.weaknessReport.weakTopics.slice(0, 5).map((w) => {
      const topic = topics.find((t) => t.id === w.topicId);
      return { id: w.topicId, name: topic?.name ?? w.topicId, score: w.score };
    });

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      sessionsCount: sessions.length,
      problemsSolved,
      totalStudyMinutes,
      averageProductivity: Math.round(averageProductivity),
      currentStreakDays: computeStreak(this.sessionRepo.findAll(365)),
      weakTopics,
      masteredTopics: topics.filter((t) => t.status === "Mastered").length,
      inProgressTopics: topics.filter((t) => t.status === "In progress").length,
      intelligenceSummary: snapshot.summary,
    };
  }
}

function computeStreak(sessionRows: { date: number }[]): number {
  if (sessionRows.length === 0) return 0;

  const days = new Set(
    sessionRows.map((s) => new Date(s.date).toISOString().slice(0, 10)),
  );
  const sorted = [...days].sort().reverse();

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let cursor = today;

  for (const day of sorted) {
    if (day > cursor) continue;
    if (day === cursor) {
      streak += 1;
      const prev = new Date(cursor);
      prev.setDate(prev.getDate() - 1);
      cursor = prev.toISOString().slice(0, 10);
    } else if (streak === 0 && day === sorted[0]) {
      // Allow streak starting yesterday if no session today yet
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = yesterday.toISOString().slice(0, 10);
      if (day === yKey) {
        streak = 1;
        cursor = yKey;
        const prev = new Date(cursor);
        prev.setDate(prev.getDate() - 1);
        cursor = prev.toISOString().slice(0, 10);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return streak;
}
