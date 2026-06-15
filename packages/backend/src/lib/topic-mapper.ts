import type { topics, problems, sessions } from "@dsa/database/schema";
import type {
  TopicDifficulty,
  TopicState,
  TopicStatus,
  SessionSnapshot,
} from "@dsa/intelligence";

type TopicRow = typeof topics.$inferSelect;
type ProblemRow = typeof problems.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

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

export interface TopicSignalExtras {
  /** Mistake-tag counts from recent problem attempts for this topic. */
  mistakeTagCounts?: Record<string, number>;
  /** Problem ids that have a matched Obsidian note. */
  notedProblemIds?: Set<string>;
}

export function buildTopicState(
  topic: TopicRow,
  topicProblems: ProblemRow[],
  topicSessions: SessionRow[],
  extras: TopicSignalExtras = {},
): TopicState {
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
    sm2Interval: topic.sm2Interval ?? 1,
    sm2Repetition: topic.sm2Repetition ?? 0,
    sm2Efactor: topic.sm2Efactor ?? 2.5,
    isWeakArea: Boolean(topic.isWeakArea),
    problemsSolved: solved.length,
    totalAttempts,
    averageTimeTaken,
    prerequisites: parsePrerequisites(topic.prerequisites),
    recentSessions,
    mistakeTagCounts: extras.mistakeTagCounts ?? {},
    noteCoverage: {
      solved: solved.length,
      withNotes: extras.notedProblemIds
        ? solved.filter((p) => extras.notedProblemIds!.has(p.id)).length
        : 0,
    },
  };
}
