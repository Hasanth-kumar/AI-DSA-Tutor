import type { IntelligenceOrchestrator, SessionSnapshot } from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import type { AttemptRepository } from "../repositories/AttemptRepository.js";
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
  /** One-tap mistake taxonomy tag captured with (or after) the log. */
  mistakeTag?: string | null;
}

export interface SessionResult {
  session: SessionRow;
  topicId: string;
  problemId?: string;
  /** Attempt record id — target for the post-log mistake-capture PATCH. */
  attemptId?: string;
  nextRevisionAt: string | null;
  confidence: number;
  isWeakArea: boolean;
  summary: string;
}

export interface RecallResult {
  topicId: string;
  quality: number;
  nextRevisionAt: string | null;
  intervalDays: number;
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
    private readonly attemptRepo?: AttemptRepository,
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
    let attemptId: string | undefined;
    if (input.problemId && problem) {
      solvedProblem = this.problemRepo.recordSolve(
        input.problemId,
        input.studyDuration,
      );
      if (solvedProblem) {
        this.notionSync.markProblemDirty(input.problemId, solvedProblem);
      }
      attemptId = this.attemptRepo?.create({
        problemId: input.problemId,
        topicId: input.topicId,
        sessionId: sessionRow.id,
        solvedAt: sessionSnapshot.date,
        timeTaken: input.studyDuration,
        mistakeTag: input.mistakeTag ?? null,
      }).id;
    }

    // Notion push is best-effort: the records are already marked dirty above,
    // so a failed push (offline, schema drift) replays on the next sync rather
    // than failing the one-tap logging loop.
    let notionWarning: string | null = null;
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
      try {
        await Promise.all(pushes);
      } catch (err) {
        notionWarning =
          err instanceof Error ? err.message : "Notion push failed";
      }
    }

    await this.planService.invalidateTodaysPlan();

    return {
      session: sessionRow,
      topicId: input.topicId,
      problemId: input.problemId,
      attemptId,
      nextRevisionAt: topicSnapshot.nextRevisionAt?.toISOString() ?? null,
      confidence: topicSnapshot.confidence,
      isWeakArea: topicSnapshot.isWeakArea,
      summary: `Session logged. Next review: ${
        topicSnapshot.nextRevisionAt?.toISOString().slice(0, 10) ?? "not scheduled"
      }.${notionWarning ? ` (Notion push failed — queued for next sync: ${notionWarning})` : ""}`,
    };
  }

  /**
   * Active-recall warm-up grade (3.1): feed an explicit SM-2 quality (0–5)
   * for a topic — a cleaner scheduling signal than productivity inference.
   */
  applyRecallQuality(topicId: string, quality: number): RecallResult {
    const topic = this.topicRepo.findById(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    const clamped = Math.max(0, Math.min(5, Math.round(quality)));
    const sm2 = this.intelligence.applyRecallQuality(topic, clamped);
    const now = new Date();

    this.topicRepo.update(topicId, {
      revisionCount: topic.revisionCount + 1,
      lastRevised: now,
      nextRevisionAt: sm2.nextRevisionAt,
    });
    this.notionSync.markTopicDirty(topicId);

    return {
      topicId,
      quality: clamped,
      nextRevisionAt: sm2.nextRevisionAt.toISOString(),
      intervalDays: sm2.interval,
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
