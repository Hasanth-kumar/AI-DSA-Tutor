import type {
  AnalyticsSessionInput,
  MasteryVelocityPoint,
  TopicVelocity,
} from "../types.js";

const MS_PER_DAY = 86_400_000;

export function computeMasteryVelocity(
  sessions: AnalyticsSessionInput[],
  weeks = 8,
  now = new Date(),
): MasteryVelocityPoint[] {
  const points: MasteryVelocityPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const { weekStart, weekEnd } = weekBounds(now, i);
    const weekSessions = sessions.filter(
      (s) => s.date >= weekStart.getTime() && s.date <= weekEnd.getTime(),
    );

    const problemsSolved = weekSessions.reduce(
      (sum, s) => sum + (s.problemsSolved ?? 0),
      0,
    );
    const studyMinutes = weekSessions.reduce(
      (sum, s) => sum + (s.studyDuration ?? 0),
      0,
    );
    const topicsTouched = new Set(
      weekSessions.map((s) => s.topicId).filter(Boolean),
    ).size;

    points.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      problemsSolved,
      studyMinutes,
      problemsPerHour:
        studyMinutes > 0
          ? Math.round((problemsSolved / studyMinutes) * 60 * 10) / 10
          : 0,
      sessionsCount: weekSessions.length,
      topicsTouched,
    });
  }

  return points;
}

export function computeTopicVelocity(
  sessions: AnalyticsSessionInput[],
  topicNames: Map<string, string>,
  weeks = 8,
  now = new Date(),
): TopicVelocity[] {
  const weekStarts: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const { weekStart } = weekBounds(now, i);
    weekStarts.push(weekStart.toISOString().slice(0, 10));
  }

  const byTopic = new Map<string, Map<string, number>>();

  for (let i = weeks - 1; i >= 0; i--) {
    const { weekStart, weekEnd } = weekBounds(now, i);
    const weekKey = weekStart.toISOString().slice(0, 10);
    const weekSessions = sessions.filter(
      (s) => s.date >= weekStart.getTime() && s.date <= weekEnd.getTime(),
    );

    for (const session of weekSessions) {
      if (!session.topicId) continue;
      const topicMap = byTopic.get(session.topicId) ?? new Map<string, number>();
      topicMap.set(weekKey, (topicMap.get(weekKey) ?? 0) + (session.problemsSolved ?? 0));
      byTopic.set(session.topicId, topicMap);
    }
  }

  const result: TopicVelocity[] = [];

  for (const [topicId, weekMap] of byTopic) {
    const weeklyProblems = weekStarts.map((weekStart) => ({
      weekStart,
      count: weekMap.get(weekStart) ?? 0,
    }));

    const counts = weeklyProblems.map((w) => w.count);
    const recent = counts.slice(-2);
    let trend: TopicVelocity["trend"] = "stable";
    if (recent.length === 2) {
      if (recent[1]! > recent[0]!) trend = "up";
      else if (recent[1]! < recent[0]! && recent[0]! > 0) trend = "down";
    }

    result.push({
      topicId,
      topicName: topicNames.get(topicId) ?? topicId,
      weeklyProblems,
      trend,
    });
  }

  return result.sort((a, b) => {
    const aTotal = a.weeklyProblems.reduce((s, w) => s + w.count, 0);
    const bTotal = b.weeklyProblems.reduce((s, w) => s + w.count, 0);
    return bTotal - aTotal;
  });
}

function weekBounds(now: Date, weeksAgo: number): { weekStart: Date; weekEnd: Date } {
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  weekEnd.setDate(weekEnd.getDate() - weeksAgo * 7);

  const weekStart = new Date(weekEnd.getTime() - 6 * MS_PER_DAY);
  weekStart.setHours(0, 0, 0, 0);

  return { weekStart, weekEnd };
}
