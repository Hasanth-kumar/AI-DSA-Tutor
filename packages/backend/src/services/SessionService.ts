import type { IntelligenceOrchestrator, SessionSnapshot } from "@dsa/intelligence";
import { createNotionClient } from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type {
  CreateSessionInput,
  SessionRepository,
  SessionRow,
  UpdateSessionInput,
} from "../repositories/SessionRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { NotionSyncService } from "./NotionSyncService.js";
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

  getById(id: string): SessionRow | null {
    return this.sessionRepo.findById(id);
  }

  async completeSession(input: CompleteSessionInput): Promise<SessionResult> {
    const topic = this.topicRepo.findById(input.topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${input.topicId}`);
    }

    if (input.problemId) {
      const problem = this.problemRepo.findById(input.problemId);
      if (!problem) {
        throw new Error(`Problem not found: ${input.problemId}`);
      }
      if (problem.topicId && problem.topicId !== input.topicId) {
        throw new Error(`Problem ${input.problemId} does not belong to topic ${input.topicId}`);
      }
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

    this.topicRepo.update(input.topicId, {
      confidence: confidenceBoost,
      revisionCount: topic.revisionCount + 1,
      lastRevised: sessionSnapshot.date,
      nextRevisionAt: update.sm2.nextRevisionAt,
      isWeakArea: update.weaknessUpdate.isWeak,
      priorityScore: update.weaknessUpdate.score,
    });

    this.notionSync.markTopicDirty(input.topicId);

    if (input.problemId) {
      this.problemRepo.recordSolve(input.problemId, input.studyDuration);
      this.notionSync.markProblemDirty(input.problemId);
    }

    if (input.pushToNotion !== false && this.notionSync.isConfigured()) {
      await this.notionSync.pushTopicToNotion(input.topicId);
      if (input.problemId) {
        await this.notionSync.pushProblemToNotion(input.problemId);
      }
      await this.pushSessionToNotion(sessionRow);
    }

    await this.planService.invalidateTodaysPlan();

    const updated = this.topicRepo.findById(input.topicId)!;

    return {
      session: sessionRow,
      topicId: input.topicId,
      problemId: input.problemId,
      nextRevisionAt: updated.nextRevisionAt?.toISOString() ?? null,
      confidence: updated.confidence,
      isWeakArea: updated.isWeakArea,
      summary: `Session logged. Next review: ${
        updated.nextRevisionAt?.toISOString().slice(0, 10) ?? "not scheduled"
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
    if (!session.topicId) return;
    const { token, topicsDbId, problemsDbId, sessionsDbId } = this.config.notion;
    if (!token || !sessionsDbId) return;

    const notion = createNotionClient({
      token,
      topicsDbId,
      problemsDbId,
      sessionsDbId,
    });

    await notion.createSession(sessionsDbId, {
      date: new Date(session.date),
      topicId: session.topicId,
      problemsSolved: session.problemsSolved ?? 0,
      studyDuration: session.studyDuration ?? 0,
      productivityScore: session.productivityScore ?? 0,
    });
  }
}
