import {
  computeCardAnalytics,
  createAnalyticsEngine,
  type AnalyticsEngine,
  type AnalyticsProblemInput,
  type AnalyticsSessionInput,
  type AnalyticsTopicInput,
  type CardAnalyticsOptions,
  type CardAnalyticsReport,
  type CardEventRecord,
  type DifficultyAnalysis,
  type IntelligenceOrchestrator,
  type MasteryVelocityPoint,
  type StreakInfo,
  type TopicState,
  type TopicVelocity,
  type WeaknessTrendPoint,
  computePriorityScore,
} from "@dsa/intelligence";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type { SessionRepository } from "../repositories/SessionRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  sessionsCount: number;
  /** De-emphasized-streak replacement metric (1.5). */
  sessionsThisMonth: number;
  problemsSolved: number;
  totalStudyMinutes: number;
  averageProductivity: number;
  currentStreakDays: number;
  longestStreakDays: number;
  weakTopics: { id: string; name: string; score: number }[];
  /** Recall-strong / execution-weak topics that SM-2 would not surface soon. */
  divergentTopics: { id: string; name: string }[];
  masteredTopics: number;
  inProgressTopics: number;
  intelligenceSummary: string;
  velocityTrend: "up" | "down" | "stable";
  problemsPerHour: number;
  weaknessTrendDirection: "improving" | "worsening" | "stable";
  difficultyInsight: string;
}

export interface AnalyticsDashboard {
  summary: WeeklySummary;
  velocity: {
    weekly: MasteryVelocityPoint[];
    topics: TopicVelocity[];
  };
  weaknessTrend: WeaknessTrendPoint[];
  difficulty: DifficultyAnalysis;
}

const MS_PER_DAY = 86_400_000;
const DASHBOARD_CACHE_TTL_MS = 45_000;

interface MirrorInputs {
  sessions: AnalyticsSessionInput[];
  topics: AnalyticsTopicInput[];
  problems: AnalyticsProblemInput[];
  topicStates: TopicState[];
}

/**
 * Read side of the append-only card event log (§9). Kept as a tiny interface so
 * AnalyticsService never depends on the Drizzle CardRepository concretely and
 * stays unit-testable with a stub.
 */
export interface CardEventSource {
  listEvents(sinceMs?: number): CardEventRecord[];
}

export class AnalyticsService {
  private readonly engine: AnalyticsEngine;
  private dashboardCache: {
    key: string;
    expiresAt: number;
    value: AnalyticsDashboard;
  } | null = null;

  constructor(
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly topicRepo: TopicRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly problemRepo: ProblemRepository,
    engine?: AnalyticsEngine,
    private readonly cardEvents?: CardEventSource,
  ) {
    this.engine = engine ?? createAnalyticsEngine();
  }

  /**
   * On-demand flashcard analytics computed purely from the append-only event
   * log (§9): coverage/retention trends, per-card quality, auto-retire
   * candidates. No extra stored columns, no history backfill — a fresh read of
   * the log reproduces every number. Degrades to an empty-but-valid report when
   * no event source is wired.
   */
  getCardAnalytics(options: CardAnalyticsOptions = {}): CardAnalyticsReport {
    const events = this.cardEvents?.listEvents() ?? [];
    return computeCardAnalytics(events, options);
  }

  getStreak(now = new Date()): StreakInfo {
    return this.engine.getStreakInfo(this.loadSessions(), now);
  }

  getMasteryVelocity(weeks = 8, now = new Date()): {
    weekly: MasteryVelocityPoint[];
    topics: TopicVelocity[];
  } {
    const { sessions, topics } = this.loadMirror();
    return {
      weekly: this.engine.getMasteryVelocity(sessions, weeks, now),
      topics: this.engine.getTopicVelocity(sessions, topics, weeks, now),
    };
  }

  getWeaknessTrend(weeks = 8, now = new Date()): WeaknessTrendPoint[] {
    const { sessions, topics, problems } = this.loadMirror();
    return this.engine.getWeaknessTrend(topics, problems, sessions, weeks, now);
  }

  getDifficultyAnalysis(): DifficultyAnalysis {
    const { sessions, topics, problems } = this.loadMirror();
    return this.engine.getDifficultyAnalysis(topics, problems, sessions);
  }

  getWeeklySummary(now = new Date()): WeeklySummary {
    const mirror = this.loadMirror();
    return this.buildWeeklySummary(mirror, now);
  }

  getDashboard(weeks = 8, now = new Date()): AnalyticsDashboard {
    const cacheKey = `dashboard:${weeks}`;
    if (
      this.dashboardCache?.key === cacheKey &&
      this.dashboardCache.expiresAt > Date.now()
    ) {
      return this.dashboardCache.value;
    }

    const value = this.buildDashboard(weeks, now);
    this.dashboardCache = {
      key: cacheKey,
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
      value,
    };
    return value;
  }

  invalidateDashboard(): void {
    this.dashboardCache = null;
  }

  private buildDashboard(weeks: number, now: Date): AnalyticsDashboard {
    const mirror = this.loadMirror();
    const { sessions, topics, problems } = mirror;

    const weeklyVelocity = this.engine.getMasteryVelocity(sessions, weeks, now);
    const topicsVelocity = this.engine.getTopicVelocity(sessions, topics, weeks, now);
    const weaknessTrend = this.engine.getWeaknessTrend(
      topics,
      problems,
      sessions,
      weeks,
      now,
    );
    const difficulty = this.engine.getDifficultyAnalysis(topics, problems, sessions);

    return {
      summary: this.buildWeeklySummary(mirror, now, {
        weeklyVelocity,
        weaknessTrend,
        difficulty,
      }),
      velocity: { weekly: weeklyVelocity, topics: topicsVelocity },
      weaknessTrend,
      difficulty,
    };
  }

  private buildWeeklySummary(
    mirror: MirrorInputs,
    now: Date,
    engines?: {
      weeklyVelocity: MasteryVelocityPoint[];
      weaknessTrend: WeaknessTrendPoint[];
      difficulty: DifficultyAnalysis;
    },
  ): WeeklySummary {
    const { sessions, topics, problems, topicStates } = mirror;

    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd.getTime() - 6 * MS_PER_DAY);
    weekStart.setHours(0, 0, 0, 0);

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

    const weaknessReport = this.intelligence.getWeaknessReport(topicStates);
    const weakTopics = weaknessReport.weakTopics.slice(0, 5).map((w) => {
      const topic = topicStates.find((t) => t.id === w.topicId);
      return { id: w.topicId, name: topic?.name ?? w.topicId, score: w.score };
    });

    const topicsMap = new Map(topicStates.map((t) => [t.id, t]));
    const divergentTopics = topicStates
      .map((t) => ({ topic: t, score: computePriorityScore(t, topicsMap) }))
      .filter((s) => s.score.memoryExecutionDivergence)
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, 5)
      .map((s) => ({ id: s.topic.id, name: s.topic.name }));

    const streak = this.engine.getStreakInfo(sessions, now);
    const velocity = engines
      ? engines.weeklyVelocity.slice(-2)
      : this.engine.getMasteryVelocity(sessions, 2, now);
    const weaknessTrend = engines
      ? engines.weaknessTrend.slice(-2)
      : this.engine.getWeaknessTrend(topics, problems, sessions, 2, now);
    const difficulty =
      engines?.difficulty ??
      this.engine.getDifficultyAnalysis(topics, problems, sessions);

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

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sessionsThisMonth = sessions.filter((s) => s.date >= monthStart).length;

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      sessionsCount: weekSessions.length,
      sessionsThisMonth,
      problemsSolved,
      totalStudyMinutes,
      averageProductivity: Math.round(averageProductivity),
      currentStreakDays: streak.currentStreakDays,
      longestStreakDays: streak.longestStreakDays,
      weakTopics,
      divergentTopics,
      masteredTopics: topicStates.filter((t) => t.status === "Mastered").length,
      inProgressTopics: topicStates.filter((t) => t.status === "In progress")
        .length,
      intelligenceSummary: weaknessReport.summary,
      velocityTrend,
      problemsPerHour: currentVelocity?.problemsPerHour ?? 0,
      weaknessTrendDirection,
      difficultyInsight: difficulty.summary,
    };
  }

  private loadMirror(): MirrorInputs {
    const topicStates = this.topicRepo.findAll();
    return {
      sessions: this.loadSessions(),
      topics: topicStates.map(topicToInput),
      problems: this.loadProblems(),
      topicStates,
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
    sm2Interval: topic.sm2Interval,
    sm2Repetition: topic.sm2Repetition,
    sm2Efactor: topic.sm2Efactor,
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
