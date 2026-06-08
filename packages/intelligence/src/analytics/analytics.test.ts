import { describe, expect, it } from "vitest";
import { createAnalyticsEngine } from "./AnalyticsEngine.js";
import type {
  AnalyticsProblemInput,
  AnalyticsSessionInput,
  AnalyticsTopicInput,
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
    status: "Unsolved",
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
