import type {
  AnalyticsProblemInput,
  AnalyticsSessionInput,
  AnalyticsTopicInput,
} from "./types.js";
import type { SessionSnapshot, TopicDifficulty, TopicState, TopicStatus } from "../types.js";

const DIFFICULTIES: TopicDifficulty[] = ["Easy", "Medium", "Hard"];
const STATUSES: TopicStatus[] = ["Not started", "In progress", "Mastered"];

function asDifficulty(value: string | null | undefined): TopicDifficulty {
  if (value && DIFFICULTIES.includes(value as TopicDifficulty)) {
    return value as TopicDifficulty;
  }
  return "Medium";
}

function asStatus(value: string | null | undefined): TopicStatus {
  if (value && STATUSES.includes(value as TopicStatus)) {
    return value as TopicStatus;
  }
  return "Not started";
}

function parsePrerequisites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function buildTopicStatesFromData(
  topicRows: AnalyticsTopicInput[],
  problemRows: AnalyticsProblemInput[],
  sessionRows: AnalyticsSessionInput[],
): TopicState[] {
  const problemsByTopic = groupBy(problemRows, (p) => p.topicId);
  const sessionsByTopic = groupBy(sessionRows, (s) => s.topicId);

  return topicRows.map((topic) => {
    const topicProblems = problemsByTopic.get(topic.id) ?? [];
    const topicSessions = sessionsByTopic.get(topic.id) ?? [];

    const solved = topicProblems.filter((p) => p.status === "Solved");
    const totalAttempts = topicProblems.reduce((sum, p) => sum + (p.attempts ?? 0), 0);
    const times = topicProblems
      .map((p) => p.timeTaken)
      .filter((t): t is number => t != null && t > 0);
    const averageTimeTaken =
      times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

    const recentSessions: SessionSnapshot[] = [...topicSessions]
      .sort((a, b) => b.date - a.date)
      .slice(0, 8)
      .map((s) => ({
        date: new Date(s.date),
        problemsSolved: s.problemsSolved ?? 0,
        productivityScore: s.productivityScore ?? 0,
        duration: s.studyDuration ?? 0,
      }));

    return {
      id: topic.id,
      name: topic.name,
      difficulty: asDifficulty(topic.difficulty),
      status: asStatus(topic.status),
      confidence: topic.confidence ?? 0,
      revisionCount: topic.revisionCount ?? 0,
      lastRevised: topic.lastRevised ? new Date(topic.lastRevised) : null,
      nextRevisionAt: topic.nextRevisionAt ? new Date(topic.nextRevisionAt) : null,
      isWeakArea: Boolean(topic.isWeakArea),
      problemsSolved: solved.length,
      totalAttempts,
      averageTimeTaken,
      prerequisites: parsePrerequisites(topic.prerequisites),
      recentSessions,
    };
  });
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string | null | undefined,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
