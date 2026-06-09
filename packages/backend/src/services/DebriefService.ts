import type { DebriefContext, LLMService } from "@dsa/integrations";
import type { IntelligenceOrchestrator } from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import { createAppLLMService } from "../llm.factory.js";
import type { AnalyticsService } from "./AnalyticsService.js";
import type { SessionRepository } from "../repositories/SessionRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";

export interface DebriefResult {
  sessionId: string;
  topicId: string;
  topicName: string;
  problemName?: string;
  debrief: string;
  generatedAt: string;
}

export class DebriefService {
  private readonly llm: LLMService;

  constructor(
    config: AppConfig,
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly sessionRepo: SessionRepository,
    private readonly topicRepo: TopicRepository,
    private readonly analyticsService: AnalyticsService,
    llm?: LLMService,
  ) {
    this.llm = llm ?? createAppLLMService(config);
  }

  async generateLatest(): Promise<DebriefResult> {
    const sessions = this.sessionRepo.findAll(1);
    const latest = sessions[0];
    if (!latest) {
      throw new Error("No sessions found");
    }
    return this.generateForSession(latest.id);
  }

  async generateForSession(
    sessionId: string,
    options: { problemName?: string } = {},
  ): Promise<DebriefResult> {
    const session = this.sessionRepo.findById(sessionId);
    if (!session?.topicId) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const topic = this.topicRepo.findById(session.topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${session.topicId}`);
    }

    const ctx = this.buildContext(session, topic, options.problemName);
    const debrief = await this.llm.generateDebrief(ctx);

    return {
      sessionId: session.id,
      topicId: topic.id,
      topicName: topic.name,
      problemName: ctx.problemName,
      debrief,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildContext(
    session: {
      id: string;
      topicId: string | null;
      date: number;
      problemsSolved: number | null;
      studyDuration: number | null;
      productivityScore: number | null;
    },
    topic: NonNullable<ReturnType<TopicRepository["findById"]>>,
    problemName?: string,
  ): DebriefContext {
    const weekStart = new Date(session.date);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const topicSessions = this.sessionRepo
      .findByTopicId(session.topicId!, 50)
      .filter((s) => s.date >= weekStart.getTime());

    const weakness = this.intelligence
      .getWeaknessReport([topic])
      .weakTopics.find((w) => w.topicId === topic.id);

    const streak = this.analyticsService.getStreak();

    return {
      topicName: topic.name,
      problemName,
      problemsSolved: session.problemsSolved ?? 0,
      studyDuration: session.studyDuration ?? 0,
      productivityScore: session.productivityScore ?? 0,
      confidence: topic.confidence,
      isWeakArea: topic.isWeakArea,
      weaknessScore: weakness?.score ?? 0,
      weaknessSignals: (weakness?.signals ?? []).map((s) => s.name),
      sessionsThisWeekOnTopic: topicSessions.length,
      averageProductivityThisWeek:
        topicSessions.length > 0
          ? Math.round(
              topicSessions.reduce((sum, s) => sum + (s.productivityScore ?? 0), 0) /
                topicSessions.length,
            )
          : session.productivityScore ?? 0,
      streakDays: streak.currentStreakDays,
      recommendation: weakness?.recommendation ?? "Continue current pace.",
    };
  }
}
