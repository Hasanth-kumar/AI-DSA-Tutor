import type { IntelligenceOrchestrator, SessionSnapshot, SM2State } from "@dsa/intelligence";
import {
  deriveProductivityFromDuration,
  deriveTopicDifficultyFromConfidence,
  deriveTopicStatusAfterSession,
} from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import { parseMistakeTags, type AttemptRepository } from "../repositories/AttemptRepository.js";
import type { ProblemReviewService } from "./ProblemReviewService.js";
import type { ProblemRepository, ProblemRow } from "../repositories/ProblemRepository.js";
import type {
  CreateSessionInput,
  SessionRepository,
  SessionRow,
  UpdateSessionInput,
} from "../repositories/SessionRepository.js";
import type { SyncMetaRepository } from "../repositories/SyncMetaRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { NotionSyncService, TopicSyncSnapshot } from "./NotionSyncService.js";
import type { PlanService } from "./PlanService.js";
import {
  clearWarmupSrsFlag,
  markWarmupSrsApplied,
  wasWarmupSrsAppliedToday,
} from "./warmupSrs.js";

export interface CompleteSessionInput extends CreateSessionInput {
  pushToNotion?: boolean;
  problemId?: string;
  /** One-tap mistake taxonomy tag captured with (or after) the log. */
  mistakeTag?: string | null;
  /**
   * When true, warm-up already drove SRS for this topic today — session logging
   * must not reschedule (confidence / weakness still update).
   */
  warmupGraded?: boolean;
  /**
   * When false, mark the problem Solved immediately (WhatsApp / inline mistakeTag).
   * Default: defer until POST /attempts/:id/mistake when attemptRepo is wired.
   */
  deferProblemStatus?: boolean;
}

export interface SessionResult {
  session: SessionRow;
  topicId: string;
  problemId?: string;
  /** Attempt record id — target for the post-log mistake-capture PATCH. */
  attemptId?: string;
  /** Auto-captured coach usage (D2) — pre-checks the capture-step toggle. */
  usedCoach?: boolean;
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
    private readonly syncMetaRepo: SyncMetaRepository,
    private readonly attemptRepo?: AttemptRepository,
    /** Coach interactions per problemId (D2) — read + cleared when the attempt is stamped. */
    private readonly coachUsage?: Map<string, number>,
    /** Re-solve pool hooks (re-solve design §9): admission re-eval + leech unsuspend. */
    private readonly problemReviews?: ProblemReviewService,
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

    const problem = input.problemId ? this.problemRepo.findById(input.problemId) : null;
    if (input.problemId && !problem) {
      throw new Error(`Problem not found: ${input.problemId}`);
    }
    if (problem?.topicId && problem.topicId !== input.topicId) {
      throw new Error(`Problem ${input.problemId} does not belong to topic ${input.topicId}`);
    }

    const studyDuration = Math.max(1, Math.round(input.studyDuration));
    const productivityScore = deriveProductivityFromDuration(studyDuration);

    const sessionRow = this.sessionRepo.create({
      ...input,
      studyDuration,
      productivityScore,
    });
    const sessionSnapshot: SessionSnapshot = {
      date: new Date(sessionRow.date),
      problemsSolved: sessionRow.problemsSolved ?? 0,
      productivityScore: sessionRow.productivityScore ?? 0,
      duration: sessionRow.studyDuration ?? 0,
    };

    const skipScheduling =
      input.warmupGraded === true ||
      wasWarmupSrsAppliedToday(this.syncMetaRepo, input.topicId);

    // Branch explicitly so the SM-2 result is only typed/available on the
    // schedule-owning path (warm-up skipped). The execution-only path returns
    // weakness signals without `sm2`.
    const fullUpdate = skipScheduling
      ? null
      : this.intelligence.updateAfterSession(topic, sessionSnapshot);
    const weaknessUpdate = fullUpdate
      ? fullUpdate.weaknessUpdate
      : this.intelligence.updateExecutionAfterSession(topic, sessionSnapshot)
          .weaknessUpdate;

    const confidenceBoost = Math.min(
      100,
      topic.confidence + Math.round((sessionSnapshot.productivityScore - 50) / 10),
    );

    const nextStatus = deriveTopicStatusAfterSession(
      topic.status,
      confidenceBoost,
      weaknessUpdate.isWeak,
    );
    const nextDifficulty = deriveTopicDifficultyFromConfidence(confidenceBoost);

    const nextRevisionAt = fullUpdate
      ? fullUpdate.sm2.nextRevisionAt
      : topic.nextRevisionAt;
    const nextRevisionCount = skipScheduling
      ? topic.revisionCount
      : topic.revisionCount + 1;

    const topicSnapshot: TopicSyncSnapshot = {
      confidence: confidenceBoost,
      revisionCount: nextRevisionCount,
      lastRevised: sessionSnapshot.date,
      nextRevisionAt,
      isWeakArea: weaknessUpdate.isWeak,
      status: nextStatus,
      difficulty: nextDifficulty,
    };

    this.topicRepo.update(input.topicId, {
      confidence: topicSnapshot.confidence,
      revisionCount: topicSnapshot.revisionCount,
      lastRevised: topicSnapshot.lastRevised,
      nextRevisionAt: topicSnapshot.nextRevisionAt,
      ...(fullUpdate ? sm2TopicPatch(fullUpdate.sm2) : {}),
      isWeakArea: topicSnapshot.isWeakArea,
      priorityScore: weaknessUpdate.score,
      status: topicSnapshot.status,
      difficulty: topicSnapshot.difficulty,
    });

    if (skipScheduling) {
      clearWarmupSrsFlag(this.syncMetaRepo, input.topicId);
    }

    this.notionSync.markTopicDirty(input.topicId, topicSnapshot);

    let solvedProblem = problem;
    let attemptId: string | undefined;
    let usedCoach: boolean | undefined;
    if (input.problemId && problem) {
      solvedProblem = this.problemRepo.recordAttempt(
        input.problemId,
        input.studyDuration,
      );
      const deferStatus =
        input.deferProblemStatus ??
        Boolean(this.attemptRepo && input.mistakeTag == null);

      if (solvedProblem && !deferStatus) {
        const tags = parseMistakeTags(input.mistakeTag ?? null);
        solvedProblem = this.applyProblemStatus(input.problemId, tags, solvedProblem);
      } else if (solvedProblem) {
        this.notionSync.markProblemDirty(input.problemId, solvedProblem);
      }

      const hintCount = this.coachUsage?.get(input.problemId) ?? 0;
      usedCoach = hintCount > 0;
      this.coachUsage?.delete(input.problemId);
      attemptId = this.attemptRepo?.create({
        problemId: input.problemId,
        topicId: input.topicId,
        sessionId: sessionRow.id,
        solvedAt: sessionSnapshot.date,
        timeTaken: input.studyDuration,
        mistakeTag: input.mistakeTag ?? null,
        usedCoach,
        hintCount,
      }).id;
      // Admission re-eval after every attempt (re-solve design §4).
      this.problemReviews?.evaluateAdmission(input.problemId);
    }
    // A completed session on the topic lifts its leech suspensions (§5).
    this.problemReviews?.onTopicRevised(input.topicId);

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
      usedCoach,
      nextRevisionAt: topicSnapshot.nextRevisionAt?.toISOString() ?? null,
      confidence: topicSnapshot.confidence,
      isWeakArea: topicSnapshot.isWeakArea,
      summary: `Session logged. Next review: ${
        topicSnapshot.nextRevisionAt?.toISOString().slice(0, 10) ?? "not scheduled"
      }.${notionWarning ? ` (Notion push failed — queued for next sync: ${notionWarning})` : ""}`,
    };
  }

  /**
   * Finalize problem status after mistake capture (1.4): tags → Revision needed,
   * smooth solve → Solved.
   */
  async finalizeProblemAfterMistake(problemId: string, tags: string[]): Promise<void> {
    const problem = this.problemRepo.findById(problemId);
    if (!problem) return;
    this.applyProblemStatus(problemId, tags, problem);
    // Tags recorded after the attempt can flip the admission decision (§4).
    this.problemReviews?.evaluateAdmission(problemId);
    await this.planService.invalidateTodaysPlan();
  }

  /**
   * One-time repair: problems tagged with mistakes on their latest attempt
   * should not stay Solved.
   */
  async repairProblemStatusesFromAttempts(): Promise<number> {
    const REPAIR_KEY = "problem_status_mistake_repair_v1";
    if (this.syncMetaRepo.get(REPAIR_KEY)) return 0;
    if (!this.attemptRepo) return 0;

    let repaired = 0;
    for (const problem of this.problemRepo.findAll()) {
      const [latest] = this.attemptRepo.findByProblemId(problem.id, 1);
      if (!latest) continue;
      const tags = parseMistakeTags(latest.mistakeTag);
      if (tags.length > 0 && problem.status !== "Revision needed") {
        this.applyProblemStatus(problem.id, tags, problem);
        repaired++;
      }
    }
    this.syncMetaRepo.set(REPAIR_KEY, "1");
    if (repaired > 0) {
      await this.planService.invalidateTodaysPlan();
    }
    return repaired;
  }

  private applyProblemStatus(
    problemId: string,
    tags: string[],
    current: ProblemRow,
  ): ProblemRow {
    const status = tags.length > 0 ? "Revision needed" : "Solved";
    const updated = this.problemRepo.update(problemId, { status });
    const row = updated ?? { ...current, status, updatedAt: Date.now() };
    this.notionSync.markProblemDirty(problemId, row);
    return row;
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
      ...sm2TopicPatch(sm2),
    });
    markWarmupSrsApplied(this.syncMetaRepo, topicId);
    this.notionSync.markTopicDirty(topicId);

    return {
      topicId,
      quality: clamped,
      nextRevisionAt: sm2.nextRevisionAt.toISOString(),
      intervalDays: sm2.interval,
    };
  }

  update(id: string, patch: UpdateSessionInput): SessionRow | null {
    const existing = this.sessionRepo.findById(id);
    if (!existing) return null;

    const studyDuration = patch.studyDuration ?? existing.studyDuration ?? 1;
    return this.sessionRepo.update(id, {
      ...patch,
      studyDuration,
      productivityScore: deriveProductivityFromDuration(studyDuration),
    });
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

function sm2TopicPatch(sm2: SM2State) {
  return {
    sm2Interval: sm2.interval,
    sm2Repetition: sm2.repetition,
    sm2Efactor: sm2.efactor,
    nextRevisionAt: sm2.nextRevisionAt,
  };
}
