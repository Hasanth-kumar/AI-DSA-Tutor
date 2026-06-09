import type { IntelligenceOrchestrator, SessionSnapshot } from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type {
  CreateSessionInput,
  SessionRepository,
  SessionRow,
  UpdateSessionInput,
} from "../repositories/SessionRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { NotionSyncService, TopicSyncSnapshot } from "./NotionSyncService.js";
import type { PlanService } from "./PlanService.js";

export interface CompleteSessionInput extends CreateSessionInput {
  pushToNotion?: boolean;
  problemId?: string;
}

export interface SessionResult {
  session: SessionRow;
  topicId: string;
  problemId?: string;
  nextRevisionAt: string | null;
  confidence: number;
  isWeakArea: boolean;
  summary: string;
}

export class SessionService {
  constructor(
    private readonly config: AppConfig,
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly sessionRepo: SessionRepository,
    private readonly topicRepo: TopicRepository,
    private readonly problemRepo: ProblemRepository,
    private readonly planService: PlanService,
    private readonly notionSync: NotionSyncService,
  ) {}

  list(limit = 50): SessionRow[] {
    return this.sessionRepo.findAll(limit);
  }

  getActivityDailyCounts(days = 182): Record<string, number> {
    const sinceMs = Date.now() - days * 86_400_000;
    return this.sessionRepo.getDailyProblemCounts(sinceMs);
  }

  getById(id: string): SessionRow | null {
    return this.sessionRepo.findById(id);
  }

  async completeSession(input: CompleteSessionInput): Promise<SessionResult> {
    const topic = this.topicRepo.findById(input.topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${input.topicId}`);
    }

    let problem = input.problemId ? this.problemRepo.findById(input.problemId) : null;
    if (input.problemId && !problem) {
      throw new Error(`Problem not found: ${input.problemId}`);
    }
    if (problem?.topicId && problem.topicId !== input.topicId) {
      throw new Error(`Problem ${input.problemId} does not belong to topic ${input.topicId}`);
    }

    const sessionRow = this.sessionRepo.create(input);
    const sessionSnapshot: SessionSnapshot = {
      date: new Date(sessionRow.date),
      problemsSolved: sessionRow.problemsSolved ?? 0,
      productivityScore: sessionRow.productivityScore ?? 0,
      duration: sessionRow.studyDuration ?? 0,
    };

    const update = this.intelligence.updateAfterSession(topic, sessionSnapshot);

    const confidenceBoost = Math.min(
      100,
      topic.confidence + Math.round((sessionSnapshot.productivityScore - 50) / 10),
    );

    const topicSnapshot: TopicSyncSnapshot = {
      confidence: confidenceBoost,
      revisionCount: topic.revisionCount + 1,
      lastRevised: sessionSnapshot.date,
      nextRevisionAt: update.sm2.nextRevisionAt,
      isWeakArea: update.weaknessUpdate.isWeak,
      status: topic.status,
      difficulty: topic.difficulty,
    };

    this.topicRepo.update(input.topicId, {
      confidence: topicSnapshot.confidence,
      revisionCount: topicSnapshot.revisionCount,
      lastRevised: topicSnapshot.lastRevised,
      nextRevisionAt: topicSnapshot.nextRevisionAt,
      isWeakArea: topicSnapshot.isWeakArea,
      priorityScore: update.weaknessUpdate.score,
    });

    this.notionSync.markTopicDirty(input.topicId, topicSnapshot);

    let solvedProblem = problem;
    if (input.problemId && problem) {
      solvedProblem = this.problemRepo.recordSolve(
        input.problemId,
        input.studyDuration,
      );
      if (solvedProblem) {
        this.notionSync.markProblemDirty(input.problemId, solvedProblem);
      }
    }

    if (input.pushToNotion !== false && this.notionSync.isConfigured()) {
      const pushes: Promise<void>[] = [
        this.notionSync.pushTopicToNotion(input.topicId, topicSnapshot),
      ];
      if (input.problemId && solvedProblem) {
        pushes.push(
          this.notionSync.pushProblemToNotion(input.problemId, solvedProblem),
        );
      }
      pushes.push(this.pushSessionToNotion(sessionRow));
      await Promise.all(pushes);
    }

    await this.planService.invalidateTodaysPlan();

    return {
      session: sessionRow,
      topicId: input.topicId,
      problemId: input.problemId,
      nextRevisionAt: topicSnapshot.nextRevisionAt?.toISOString() ?? null,
      confidence: topicSnapshot.confidence,
      isWeakArea: topicSnapshot.isWeakArea,
      summary: `Session logged. Next review: ${
        topicSnapshot.nextRevisionAt?.toISOString().slice(0, 10) ?? "not scheduled"
      }.`,
    };
  }

  update(id: string, patch: UpdateSessionInput): SessionRow | null {
    return this.sessionRepo.update(id, patch);
  }

  delete(id: string): boolean {
    return this.sessionRepo.delete(id);
  }

  private async pushSessionToNotion(session: SessionRow): Promise<void> {
    if (!session.topicId || !this.notionSync.isConfigured()) return;
    const { sessionsDbId } = this.config.notion;
    if (!sessionsDbId) return;

    await this.notionSync.getClient().createSession(sessionsDbId, {
      date: new Date(session.date),
      topicId: session.topicId,
      problemsSolved: session.problemsSolved ?? 0,
      studyDuration: session.studyDuration ?? 0,
      productivityScore: session.productivityScore ?? 0,
    });
  }
}
