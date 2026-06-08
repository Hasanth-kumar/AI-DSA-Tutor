import { DifficultyEngine } from "../difficulty-engine/DifficultyEngine.js";
import { WeaknessEngine } from "../weakness-engine/WeaknessEngine.js";
import { buildTopicStatesFromData } from "./build-topic-snapshot.js";
import { computeDifficultyAnalysis } from "./metrics/difficulty-analysis.js";
import { computeStreakInfo } from "./metrics/streak.js";
import { computeMasteryVelocity, computeTopicVelocity } from "./metrics/velocity.js";
import { computeWeaknessTrend } from "./metrics/weakness-trend.js";
import type {
  AnalyticsProblemInput,
  AnalyticsReport,
  AnalyticsSessionInput,
  AnalyticsTopicInput,
  DifficultyAnalysis,
  MasteryVelocityPoint,
  StreakInfo,
  TopicVelocity,
  WeaknessTrendPoint,
} from "./types.js";

export class AnalyticsEngine {
  constructor(
    private readonly weakness = new WeaknessEngine(),
    private readonly difficulty = new DifficultyEngine(),
  ) {}

  getStreakInfo(sessions: AnalyticsSessionInput[], now = new Date()): StreakInfo {
    return computeStreakInfo(sessions, now);
  }

  getMasteryVelocity(
    sessions: AnalyticsSessionInput[],
    weeks = 8,
    now = new Date(),
  ): MasteryVelocityPoint[] {
    return computeMasteryVelocity(sessions, weeks, now);
  }

  getTopicVelocity(
    sessions: AnalyticsSessionInput[],
    topics: AnalyticsTopicInput[],
    weeks = 8,
    now = new Date(),
  ): TopicVelocity[] {
    const topicNames = new Map(topics.map((t) => [t.id, t.name]));
    return computeTopicVelocity(sessions, topicNames, weeks, now);
  }

  getWeaknessTrend(
    topics: AnalyticsTopicInput[],
    problems: AnalyticsProblemInput[],
    sessions: AnalyticsSessionInput[],
    weeks = 8,
    now = new Date(),
  ): WeaknessTrendPoint[] {
    return computeWeaknessTrend(
      topics,
      problems,
      sessions,
      this.weakness,
      weeks,
      now,
    );
  }

  getDifficultyAnalysis(
    topics: AnalyticsTopicInput[],
    problems: AnalyticsProblemInput[],
    sessions: AnalyticsSessionInput[],
  ): DifficultyAnalysis {
    const topicStates = buildTopicStatesFromData(topics, problems, sessions);
    return computeDifficultyAnalysis(topicStates, problems, this.difficulty);
  }

  buildReport(
    topics: AnalyticsTopicInput[],
    problems: AnalyticsProblemInput[],
    sessions: AnalyticsSessionInput[],
    weeks = 8,
    now = new Date(),
  ): AnalyticsReport {
    const topicStates = buildTopicStatesFromData(topics, problems, sessions);

    return {
      streak: this.getStreakInfo(sessions, now),
      masteryVelocity: this.getMasteryVelocity(sessions, weeks, now),
      topicVelocity: this.getTopicVelocity(sessions, topics, weeks, now),
      weaknessTrend: this.getWeaknessTrend(topics, problems, sessions, weeks, now),
      difficultyAnalysis: computeDifficultyAnalysis(
        topicStates,
        problems,
        this.difficulty,
      ),
      topics: topicStates,
    };
  }
}

export function createAnalyticsEngine(): AnalyticsEngine {
  return new AnalyticsEngine();
}
