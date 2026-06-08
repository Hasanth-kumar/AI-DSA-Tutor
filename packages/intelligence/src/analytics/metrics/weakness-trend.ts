import type { WeaknessEngine } from "../../weakness-engine/WeaknessEngine.js";
import { buildTopicStatesFromData } from "../build-topic-snapshot.js";
import type {
  AnalyticsProblemInput,
  AnalyticsSessionInput,
  AnalyticsTopicInput,
  WeaknessTrendPoint,
} from "../types.js";

const MS_PER_DAY = 86_400_000;

export function computeWeaknessTrend(
  topics: AnalyticsTopicInput[],
  problems: AnalyticsProblemInput[],
  sessions: AnalyticsSessionInput[],
  weaknessEngine: WeaknessEngine,
  weeks = 8,
  now = new Date(),
): WeaknessTrendPoint[] {
  const points: WeaknessTrendPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const { weekStart, weekEnd } = weekBounds(now, i);
    const sessionsUpTo = sessions.filter((s) => s.date <= weekEnd.getTime());
    const topicStates = buildTopicStatesFromData(topics, problems, sessionsUpTo);
    const report = weaknessEngine.detectAllWeaknesses(topicStates);

    const weakTopics = report.weakTopics;
    const averageWeaknessScore =
      weakTopics.length > 0
        ? Math.round(
            (weakTopics.reduce((sum, w) => sum + w.score, 0) / weakTopics.length) *
              100,
          ) / 100
        : 0;

    points.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      weakTopicCount: weakTopics.length,
      averageWeaknessScore,
      topWeakTopics: weakTopics
        .slice(0, 3)
        .map((w) => {
          const topic = topics.find((t) => t.id === w.topicId);
          return {
            topicId: w.topicId,
            name: topic?.name ?? w.topicId,
            score: Math.round(w.score * 100) / 100,
          };
        }),
    });
  }

  return points;
}

function weekBounds(now: Date, weeksAgo: number): { weekStart: Date; weekEnd: Date } {
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  weekEnd.setDate(weekEnd.getDate() - weeksAgo * 7);

  const weekStart = new Date(weekEnd.getTime() - 6 * MS_PER_DAY);
  weekStart.setHours(0, 0, 0, 0);

  return { weekStart, weekEnd };
}
