import {
  createAnalyticsEngine,
  type AnalyticsEngine,
  type AnalyticsProblemInput,
  type AnalyticsSessionInput,
  type AnalyticsTopicInput,
  type DifficultyAnalysis,
  type IntelligenceOrchestrator,
  type MasteryVelocityPoint,
  type StreakInfo,
  type TopicState,
  type TopicVelocity,
  type WeaknessTrendPoint,
} from "@dsa/intelligence";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
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
  longestStreakDays: number;
  weakTopics: { id: string; name: string; score: number }[];
  masteredTopics: number;
  inProgressTopics: number;
  intelligenceSummary: string;
  velocityTrend: "up" | "down" | "stable";
  problemsPerHour: number;
  weaknessTrendDirection: "improving" | "worsening" | "stable";
  difficultyInsight: string;
}

const MS_PER_DAY = 86_400_000;

export class AnalyticsService {
  private readonly engine: AnalyticsEngine;

  constructor(
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly topicRepo: TopicRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly problemRepo: ProblemRepository,
    engine?: AnalyticsEngine,
  ) {
    this.engine = engine ?? createAnalyticsEngine();
  }

  getStreak(now = new Date()): StreakInfo {
    return this.engine.getStreakInfo(this.loadSessions(), now);
  }

  getMasteryVelocity(weeks = 8, now = new Date()): {
    weekly: MasteryVelocityPoint[];
    topics: TopicVelocity[];
  } {
    const sessions = this.loadSessions();
    const topics = this.loadTopics();
    return {
      weekly: this.engine.getMasteryVelocity(sessions, weeks, now),
      topics: this.engine.getTopicVelocity(sessions, topics, weeks, now),
    };
  }

  getWeaknessTrend(weeks = 8, now = new Date()): WeaknessTrendPoint[] {
    return this.engine.getWeaknessTrend(
      this.loadTopics(),
      this.loadProblems(),
      this.loadSessions(),
      weeks,
      now,
    );
  }

  getDifficultyAnalysis(): DifficultyAnalysis {
    return this.engine.getDifficultyAnalysis(
      this.loadTopics(),
      this.loadProblems(),
      this.loadSessions(),
    );
  }

  getWeeklySummary(now = new Date()): WeeklySummary {
    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd.getTime() - 6 * MS_PER_DAY);
    weekStart.setHours(0, 0, 0, 0);

    const sessions = this.loadSessions();
    const weekSessions = sessions.filter(
      (s) => s.date >= weekStart.getTime() && s.date <= weekEnd.getTime(),
    );

    const problemsSolved = weekSessions.reduce(
      (sum, s) => sum + (s.problemsSolved ?? 0),
      0,
    );
    const totalStudyMinutes = weekSessions.reduce(
      (sum, s) => sum + (s.studyDuration ?? 0),
      0,
    );
    const averageProductivity =
      weekSessions.length > 0
        ? weekSessions.reduce((sum, s) => sum + (s.productivityScore ?? 0), 0) /
          weekSessions.length
        : 0;

    const topics = this.topicRepo.findAll();
    const snapshot = this.intelligence.buildSnapshot(topics);
    const weakTopics = snapshot.weaknessReport.weakTopics.slice(0, 5).map((w) => {
      const topic = topics.find((t) => t.id === w.topicId);
      return { id: w.topicId, name: topic?.name ?? w.topicId, score: w.score };
    });

    const streak = this.engine.getStreakInfo(sessions, now);
    const velocity = this.engine.getMasteryVelocity(sessions, 2, now);
    const weaknessTrend = this.engine.getWeaknessTrend(
      this.loadTopics(),
      this.loadProblems(),
      sessions,
      2,
      now,
    );
    const difficulty = this.engine.getDifficultyAnalysis(
      this.loadTopics(),
      this.loadProblems(),
      sessions,
    );

    const currentVelocity = velocity[velocity.length - 1];
    const previousVelocity = velocity[velocity.length - 2];
    const velocityTrend = compareTrend(
      currentVelocity?.problemsPerHour ?? 0,
      previousVelocity?.problemsPerHour ?? 0,
    );

    const currentWeak = weaknessTrend[weaknessTrend.length - 1];
    const previousWeak = weaknessTrend[weaknessTrend.length - 2];
    const weaknessTrendDirection = compareWeaknessTrend(
      currentWeak?.weakTopicCount ?? 0,
      previousWeak?.weakTopicCount ?? 0,
    );

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      sessionsCount: weekSessions.length,
      problemsSolved,
      totalStudyMinutes,
      averageProductivity: Math.round(averageProductivity),
      currentStreakDays: streak.currentStreakDays,
      longestStreakDays: streak.longestStreakDays,
      weakTopics,
      masteredTopics: topics.filter((t) => t.status === "Mastered").length,
      inProgressTopics: topics.filter((t) => t.status === "In progress").length,
      intelligenceSummary: snapshot.summary,
      velocityTrend,
      problemsPerHour: currentVelocity?.problemsPerHour ?? 0,
      weaknessTrendDirection,
      difficultyInsight: difficulty.summary,
    };
  }

  private loadSessions(limit = 500): AnalyticsSessionInput[] {
    return this.sessionRepo.findAll(limit).map((s) => ({
      date: s.date,
      topicId: s.topicId,
      problemsSolved: s.problemsSolved ?? 0,
      studyDuration: s.studyDuration ?? 0,
      productivityScore: s.productivityScore ?? 0,
    }));
  }

  private loadProblems(): AnalyticsProblemInput[] {
    return this.problemRepo.findAll().map((p) => ({
      topicId: p.topicId,
      difficulty: p.difficulty,
      status: p.status,
      attempts: p.attempts ?? 0,
      timeTaken: p.timeTaken,
    }));
  }

  private loadTopics(): AnalyticsTopicInput[] {
    return this.topicRepo.findAll().map(topicToInput);
  }
}

function topicToInput(topic: TopicState): AnalyticsTopicInput {
  return {
    id: topic.id,
    name: topic.name,
    difficulty: topic.difficulty,
    status: topic.status,
    confidence: topic.confidence,
    revisionCount: topic.revisionCount,
    lastRevised: topic.lastRevised?.getTime() ?? null,
    nextRevisionAt: topic.nextRevisionAt?.getTime() ?? null,
    isWeakArea: topic.isWeakArea ? 1 : 0,
    prerequisites:
      topic.prerequisites.length > 0 ? JSON.stringify(topic.prerequisites) : null,
  };
}

function compareTrend(
  current: number,
  previous: number,
): "up" | "down" | "stable" {
  if (current > previous) return "up";
  if (current < previous && previous > 0) return "down";
  return "stable";
}

function compareWeaknessTrend(
  currentWeakCount: number,
  previousWeakCount: number,
): "improving" | "worsening" | "stable" {
  if (currentWeakCount < previousWeakCount) return "improving";
  if (currentWeakCount > previousWeakCount) return "worsening";
  return "stable";
}
