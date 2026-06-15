import type { TopicState } from "../types.js";
import { addDays } from "../utils/dates.js";

const now = new Date("2025-01-15T12:00:00Z");

export function makeTopic(
  overrides: Partial<TopicState> & Pick<TopicState, "id" | "name">,
): TopicState {
  const merged = {
    difficulty: "Medium" as const,
    status: "In progress" as const,
    confidence: 50,
    revisionCount: 1,
    lastRevised: addDays(now, -7),
    nextRevisionAt: addDays(now, -2),
    isWeakArea: false,
    problemsSolved: 5,
    totalAttempts: 8,
    averageTimeTaken: 35,
    prerequisites: [] as string[],
    recentSessions: [
      {
        date: addDays(now, -7),
        problemsSolved: 2,
        productivityScore: 70,
        duration: 60,
      },
    ],
    ...overrides,
  };
  const revisionCount = merged.revisionCount;
  return {
    ...merged,
    sm2Interval: merged.sm2Interval ?? (revisionCount >= 2 ? 6 : 1),
    sm2Repetition: merged.sm2Repetition ?? revisionCount,
    sm2Efactor: merged.sm2Efactor ?? 2.5,
  };
}

/** Sample curriculum for engine integration tests. */
export function sampleTopics(): TopicState[] {
  return [
    makeTopic({
      id: "arrays",
      name: "Arrays",
      status: "Mastered",
      confidence: 90,
      nextRevisionAt: addDays(now, 5),
      lastRevised: addDays(now, -3),
    }),
    makeTopic({
      id: "two-pointers",
      name: "Two Pointers",
      prerequisites: ["arrays"],
      confidence: 45,
      isWeakArea: true,
      nextRevisionAt: addDays(now, -5),
      status: "In progress",
    }),
    makeTopic({
      id: "sliding-window",
      name: "Sliding Window",
      prerequisites: ["arrays"],
      status: "Not started",
      confidence: 0,
      lastRevised: null,
      nextRevisionAt: null,
      recentSessions: [],
    }),
    makeTopic({
      id: "dp",
      name: "Dynamic Programming",
      prerequisites: ["recursion"],
      status: "In progress",
      confidence: 35,
      isWeakArea: true,
      averageTimeTaken: 55,
      totalAttempts: 12,
      problemsSolved: 3,
      nextRevisionAt: addDays(now, -1),
    }),
    makeTopic({
      id: "recursion",
      name: "Recursion",
      status: "Mastered",
      confidence: 85,
      nextRevisionAt: addDays(now, 10),
    }),
  ];
}

export const FIXED_NOW = now;
