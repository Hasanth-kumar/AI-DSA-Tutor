import { describe, expect, it } from "vitest";
import { WeaknessEngine } from "../weakness-engine/WeaknessEngine.js";
import { createAnalyticsEngine } from "./AnalyticsEngine.js";
import { buildTopicStatesFromData } from "./build-topic-snapshot.js";
import { computeWeaknessTrend } from "./metrics/weakness-trend.js";
import type {
  AnalyticsProblemInput,
  AnalyticsSessionInput,
  AnalyticsTopicInput,
  WeaknessTrendPoint,
} from "./types.js";

const NOW = new Date("2026-06-08T12:00:00.000Z");

const topics: AnalyticsTopicInput[] = [
  {
    id: "t1",
    name: "Arrays",
    difficulty: "Easy",
    status: "In progress",
    confidence: 45,
    revisionCount: 2,
    lastRevised: Date.parse("2026-06-01"),
    nextRevisionAt: Date.parse("2026-06-10"),
    isWeakArea: 1,
    prerequisites: null,
  },
  {
    id: "t2",
    name: "Graphs",
    difficulty: "Hard",
    status: "In progress",
    confidence: 70,
    revisionCount: 1,
    lastRevised: Date.parse("2026-06-05"),
    nextRevisionAt: Date.parse("2026-06-12"),
    isWeakArea: 0,
    prerequisites: null,
  },
];

const problems: AnalyticsProblemInput[] = [
  {
    topicId: "t1",
    difficulty: "Easy",
    status: "Solved",
    attempts: 2,
    timeTaken: 25,
  },
  {
    topicId: "t1",
    difficulty: "Medium",
    status: "Not started",
    attempts: 1,
    timeTaken: null,
  },
  {
    topicId: "t2",
    difficulty: "Hard",
    status: "Solved",
    attempts: 3,
    timeTaken: 45,
  },
];

function session(
  day: string,
  topicId: string,
  problemsSolved: number,
  studyDuration: number,
  productivityScore: number,
): AnalyticsSessionInput {
  return {
    date: Date.parse(`${day}T10:00:00.000Z`),
    topicId,
    problemsSolved,
    studyDuration,
    productivityScore,
  };
}

describe("AnalyticsEngine", () => {
  const engine = createAnalyticsEngine();

  it("computes streak from consecutive session days", () => {
    const sessions = [
      session("2026-06-08", "t1", 2, 60, 80),
      session("2026-06-07", "t1", 1, 45, 75),
      session("2026-06-06", "t2", 1, 50, 70),
      session("2026-06-04", "t1", 1, 30, 65),
    ];

    const streak = engine.getStreakInfo(sessions, NOW);
    expect(streak.currentStreakDays).toBe(3);
    expect(streak.longestStreakDays).toBe(3);
    expect(streak.lastSessionDate).toBe("2026-06-08");
  });

  it("computes weekly mastery velocity", () => {
    const sessions = [
      session("2026-06-08", "t1", 2, 60, 80),
      session("2026-06-07", "t1", 1, 30, 75),
      session("2026-06-01", "t2", 1, 45, 70),
    ];

    const velocity = engine.getMasteryVelocity(sessions, 4, NOW);
    expect(velocity).toHaveLength(4);
    const currentWeek = velocity[velocity.length - 1]!;
    expect(currentWeek.problemsSolved).toBe(3);
    expect(currentWeek.sessionsCount).toBe(2);
    expect(currentWeek.problemsPerHour).toBeGreaterThan(0);
  });

  it("tracks weakness trend over weeks", () => {
    const sessions = [
      session("2026-06-08", "t1", 1, 60, 40),
      session("2026-06-07", "t1", 1, 60, 35),
      session("2026-05-20", "t2", 2, 90, 85),
    ];

    const trend = engine.getWeaknessTrend(topics, problems, sessions, 4, NOW);
    expect(trend).toHaveLength(4);
    expect(trend.every((p) => p.weakTopicCount >= 0)).toBe(true);
  });

  it("weakness trend matches the per-week full-rebuild reference", () => {
    // Unsorted input with same-date ties across topics to exercise the
    // moving-cutoff path's ordering guarantees.
    const sessions = [
      session("2026-06-08", "t1", 1, 60, 40),
      session("2026-05-20", "t2", 2, 90, 85),
      session("2026-06-08", "t2", 1, 45, 55),
      session("2026-04-15", "t1", 1, 30, 30),
      session("2026-06-08", "t1", 2, 50, 45),
      session("2026-05-20", "t1", 1, 60, 35),
      session("2026-06-01", "t2", 1, 40, 90),
      session("2026-05-31", "t1", 1, 55, 25),
    ];

    // Reference: rebuild states from a full filter for every week (the
    // pre-optimization implementation).
    const weaknessEngine = new WeaknessEngine();
    const reference: WeaknessTrendPoint[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekEnd = new Date(NOW);
      weekEnd.setHours(23, 59, 59, 999);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd.getTime() - 6 * 86_400_000);
      weekStart.setHours(0, 0, 0, 0);
      const sessionsUpTo = sessions.filter((s) => s.date <= weekEnd.getTime());
      const states = buildTopicStatesFromData(topics, problems, sessionsUpTo);
      const report = weaknessEngine.detectAllWeaknesses(states);
      const weak = report.weakTopics;
      reference.push({
        weekStart: weekStart.toISOString().slice(0, 10),
        weekEnd: weekEnd.toISOString().slice(0, 10),
        weakTopicCount: weak.length,
        averageWeaknessScore:
          weak.length > 0
            ? Math.round(
                (weak.reduce((sum, w) => sum + w.score, 0) / weak.length) * 100,
              ) / 100
            : 0,
        topWeakTopics: weak.slice(0, 3).map((w) => ({
          topicId: w.topicId,
          name: topics.find((t) => t.id === w.topicId)?.name ?? w.topicId,
          score: Math.round(w.score * 100) / 100,
        })),
      });
    }

    const trend = computeWeaknessTrend(
      topics,
      problems,
      sessions,
      weaknessEngine,
      4,
      NOW,
    );
    expect(trend).toStrictEqual(reference);
  });

  it("compares difficulty solve rates", () => {
    const sessions = [session("2026-06-08", "t1", 2, 60, 80)];
    const analysis = engine.getDifficultyAnalysis(topics, problems, sessions);

    expect(analysis.byDifficulty).toHaveLength(3);
    const easy = analysis.byDifficulty.find((b) => b.difficulty === "Easy");
    expect(easy?.solveRate).toBe(100);
    expect(analysis.summary.length).toBeGreaterThan(0);
  });

  it("builds a full analytics report", () => {
    const sessions = [
      session("2026-06-08", "t1", 2, 60, 80),
      session("2026-06-07", "t1", 1, 30, 75),
    ];

    const report = engine.buildReport(topics, problems, sessions, 4, NOW);
    expect(report.streak.currentStreakDays).toBe(2);
    expect(report.masteryVelocity).toHaveLength(4);
    expect(report.weaknessTrend).toHaveLength(4);
    expect(report.difficultyAnalysis.byDifficulty).toHaveLength(3);
    expect(report.topics).toHaveLength(2);
  });
});
