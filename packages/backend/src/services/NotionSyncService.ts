import {
  createNotionClient,
  syncNotionToSqlite,
  type NotionClient,
  type SyncResult,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { ConflictRepository } from "../repositories/ConflictRepository.js";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type { SyncMetaRepository } from "../repositories/SyncMetaRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { MirrorCache } from "./MirrorCache.js";
import type { TopicDifficulty, TopicState, TopicStatus } from "@dsa/intelligence";
import type { ProblemRow } from "../repositories/ProblemRepository.js";

const LAST_SYNC_KEY = "last_sync_at";

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
    private readonly conflictRepo?: ConflictRepository,
  ) {}

  /** Sync health for /health (5.2). */
  getSyncHealth(): {
    lastSyncAt: string | null;
    pendingTopics: number;
    pendingProblems: number;
    unresolvedConflicts: number;
  } {
    return {
      lastSyncAt: this.syncMeta.get(LAST_SYNC_KEY),
      pendingTopics: this.syncMeta.getPendingTopics().length,
      pendingProblems: this.syncMeta.getPendingProblems().length,
      unresolvedConflicts: this.conflictRepo?.unresolvedCount() ?? 0,
    };
  }

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
    this.mirrorCache.invalidate();

    // Conflict detection (5.2): the pull just replaced local rows with Notion's
    // version. Where a pending (locally-edited) record's fields disagree with
    // what Notion held, record both versions instead of silently letting the
    // replay below win.
    this.detectConflicts(pendingTopics, pendingProblems);

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

    const syncedAt = new Date().toISOString();
    this.syncMeta.set(LAST_SYNC_KEY, syncedAt);

    return {
      ...result,
      syncedAt,
      direction: "pull",
      replayedTopics,
      replayedProblems,
    };
  }

  private detectConflicts(
    pendingTopics: ReturnType<SyncMetaRepository["getPendingTopics"]>,
    pendingProblems: ReturnType<SyncMetaRepository["getPendingProblems"]>,
  ): void {
    if (!this.conflictRepo) return;

    for (const pending of pendingTopics) {
      const remote = this.topicRepo.findById(pending.id);
      if (!remote) continue;
      const remoteFields = {
        confidence: remote.confidence,
        revisionCount: remote.revisionCount,
        lastRevised: remote.lastRevised?.getTime() ?? null,
        nextRevisionAt: remote.nextRevisionAt?.getTime() ?? null,
        isWeakArea: remote.isWeakArea ? 1 : 0,
        status: remote.status,
      };
      if (fieldsDiffer(pending.fields, remoteFields)) {
        this.conflictRepo.log({
          entityType: "topic",
          entityId: pending.id,
          entityName: remote.name,
          localValue: pending.fields as Record<string, unknown>,
          remoteValue: remoteFields,
        });
      }
    }

    for (const pending of pendingProblems) {
      const remote = this.problemRepo.findById(pending.id);
      if (!remote) continue;
      const remoteFields = {
        status: remote.status ?? "Unsolved",
        attempts: remote.attempts ?? 0,
        timeTaken: remote.timeTaken ?? null,
      };
      if (fieldsDiffer(pending.fields, remoteFields)) {
        this.conflictRepo.log({
          entityType: "problem",
          entityId: pending.id,
          entityName: remote.name,
          localValue: pending.fields as Record<string, unknown>,
          remoteValue: remoteFields,
        });
      }
    }
  }

  /** Resolve a logged conflict by re-applying the chosen side (5.2). */
  async resolveConflict(
    conflictId: string,
    winner: "local" | "remote",
  ): Promise<boolean> {
    if (!this.conflictRepo) return false;
    const conflict = this.conflictRepo.findById(conflictId);
    if (!conflict || conflict.resolvedAt) return false;

    // The replay path already applied + pushed the local version, so picking
    // "local" only marks the conflict resolved. Picking "remote" re-applies
    // Notion's version locally and pushes it back up.
    if (winner === "remote") {
      const remoteFields = JSON.parse(conflict.remoteValue) as Parameters<
        TopicRepository["applyPendingFields"]
      >[1] &
        Parameters<ProblemRepository["update"]>[1];
      if (conflict.entityType === "topic") {
        this.topicRepo.applyPendingFields(conflict.entityId, remoteFields);
        this.syncMeta.clearTopic(conflict.entityId);
        try {
          await this.pushTopicToNotion(conflict.entityId);
        } catch {
          // Notion may be briefly unreachable; the local row already matches remote.
        }
      } else {
        this.problemRepo.update(conflict.entityId, remoteFields);
        this.syncMeta.clearProblem(conflict.entityId);
        try {
          await this.pushProblemToNotion(conflict.entityId);
        } catch {
          // same as above
        }
      }
    }

    this.conflictRepo.resolve(conflictId, winner);
    return true;
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

function fieldsDiffer(localInput: object, remoteInput: object): boolean {
  const local = localInput as Record<string, unknown>;
  const remote = remoteInput as Record<string, unknown>;
  return Object.keys(local).some((key) => {
    if (!(key in remote)) return false;
    return normalize(local[key]) !== normalize(remote[key]);
  });
}

function normalize(value: unknown): string {
  if (value == null) return "";
  return String(value);
}
