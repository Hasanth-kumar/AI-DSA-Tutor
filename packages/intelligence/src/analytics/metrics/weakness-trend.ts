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

  // Sort once and advance a cutoff pointer per week instead of re-filtering
  // the full session list for every window. Stable sort keeps same-date
  // sessions in input order, so per-topic ordering matches the old filter.
  const byDate = [...sessions].sort((a, b) => a.date - b.date);
  const included: AnalyticsSessionInput[] = [];
  let next = 0;

  for (let i = weeks - 1; i >= 0; i--) {
    const { weekStart, weekEnd } = weekBounds(now, i);
    const cutoff = weekEnd.getTime();
    while (next < byDate.length && byDate[next]!.date <= cutoff) {
      included.push(byDate[next]!);
      next += 1;
    }
    const topicStates = buildTopicStatesFromData(topics, problems, included);
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
