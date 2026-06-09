import {
  createNotionClient,
  syncNotionToSqlite,
  type NotionClient,
  type SyncResult,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type { SyncMetaRepository } from "../repositories/SyncMetaRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { MirrorCache } from "./MirrorCache.js";
import type { TopicDifficulty, TopicState, TopicStatus } from "@dsa/intelligence";
import type { ProblemRow } from "../repositories/ProblemRepository.js";

export interface TopicSyncSnapshot {
  confidence: number;
  revisionCount: number;
  lastRevised: Date | null;
  nextRevisionAt: Date | null;
  isWeakArea: boolean;
  status: TopicStatus;
  difficulty: TopicDifficulty;
}

export interface SyncStatus extends SyncResult {
  syncedAt: string;
  direction: "pull" | "push" | "bidirectional";
  replayedTopics: number;
  replayedProblems: number;
}

export class NotionSyncService {
  private notion: NotionClient | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly topicRepo: TopicRepository,
    private readonly problemRepo: ProblemRepository,
    private readonly syncMeta: SyncMetaRepository,
    private readonly mirrorCache: MirrorCache,
  ) {}

  isConfigured(): boolean {
    const { token, topicsDbId, problemsDbId, sessionsDbId } = this.config.notion;
    return Boolean(token && topicsDbId && problemsDbId && sessionsDbId);
  }

  getClient(): NotionClient {
    if (!this.notion) {
      const { token, topicsDbId, problemsDbId, sessionsDbId } = this.config.notion;
      this.notion = createNotionClient({
        token,
        topicsDbId,
        problemsDbId,
        sessionsDbId,
      });
    }
    return this.notion;
  }

  /** Pull Notion → SQLite, then replay pending local mutations. */
  async pullFromNotion(): Promise<SyncStatus> {
    if (!this.isConfigured()) {
      throw new Error("Notion is not configured");
    }

    const pendingTopics = this.syncMeta.getPendingTopics();
    const pendingProblems = this.syncMeta.getPendingProblems();

    const result = await syncNotionToSqlite(
      this.getClient(),
      this.config.sqlite.path,
    );

    let replayedTopics = 0;
    let replayedProblems = 0;

    await this.mirrorCache.batchAsync(async () => {
      for (const pending of pendingTopics) {
        this.topicRepo.applyPendingFields(pending.id, pending.fields);
        try {
          await this.pushTopicToNotion(pending.id);
          replayedTopics += 1;
        } catch {
          continue;
        }
        this.syncMeta.clearTopic(pending.id);
      }

      for (const pending of pendingProblems) {
        this.problemRepo.update(pending.id, pending.fields);
        try {
          await this.pushProblemToNotion(pending.id);
          replayedProblems += 1;
        } catch {
          continue;
        }
        this.syncMeta.clearProblem(pending.id);
      }
    });

    this.mirrorCache.invalidate();

    return {
      ...result,
      syncedAt: new Date().toISOString(),
      direction: "pull",
      replayedTopics,
      replayedProblems,
    };
  }

  /** Push a single topic's intelligence fields to Notion after local update. */
  async pushTopicToNotion(
    topicId: string,
    snapshot?: TopicSyncSnapshot | TopicState,
  ): Promise<void> {
    if (!this.isConfigured()) return;

    const topic = snapshot ?? this.topicRepo.findById(topicId);
    if (!topic) throw new Error(`Topic not found: ${topicId}`);

    await this.getClient().updateTopic(topicId, {
      confidence: topic.confidence,
      revisionCount: topic.revisionCount,
      lastRevised: topic.lastRevised ?? undefined,
      isWeakArea: topic.isWeakArea,
      status: topic.status,
      difficulty: topic.difficulty,
    });
  }

  async pushProblemToNotion(
    problemId: string,
    snapshot?: ProblemRow,
  ): Promise<void> {
    if (!this.isConfigured()) return;

    const problem = snapshot ?? this.problemRepo.findById(problemId);
    if (!problem) throw new Error(`Problem not found: ${problemId}`);

    await this.getClient().updateProblem(problemId, {
      status: (problem.status as "Unsolved" | "Solved" | "Attempted") ?? "Unsolved",
      attempts: problem.attempts ?? 0,
      timeTaken: problem.timeTaken ?? undefined,
    });
  }

  markTopicDirty(topicId: string, snapshot?: TopicSyncSnapshot | TopicState): void {
    const topic = snapshot ?? this.topicRepo.findById(topicId);
    if (!topic) return;

    this.syncMeta.markTopicPending(topicId, {
      confidence: topic.confidence,
      revisionCount: topic.revisionCount,
      lastRevised: topic.lastRevised?.getTime() ?? null,
      nextRevisionAt: topic.nextRevisionAt?.getTime() ?? null,
      isWeakArea: topic.isWeakArea ? 1 : 0,
      status: topic.status,
    });
  }

  markProblemDirty(problemId: string, snapshot?: ProblemRow): void {
    const problem = snapshot ?? this.problemRepo.findById(problemId);
    if (!problem) return;

    this.syncMeta.markProblemPending(problemId, {
      status: problem.status ?? "Unsolved",
      attempts: problem.attempts ?? 0,
      timeTaken: problem.timeTaken ?? null,
    });
  }

  /** Bidirectional sync: pull from Notion, replay pending local changes, push to Notion. */
  async sync(): Promise<SyncStatus> {
    const result = await this.pullFromNotion();
    return { ...result, direction: "bidirectional" };
  }
}
