import {
  createNotionClient,
  syncNotionToSqlite,
  type NotionClient,
  type SyncResult,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import type { TopicRepository } from "../repositories/TopicRepository.js";

export interface SyncStatus extends SyncResult {
  syncedAt: string;
  direction: "pull" | "push" | "bidirectional";
}

export class NotionSyncService {
  private notion: NotionClient | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly topicRepo: TopicRepository,
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

  /** Pull Notion → SQLite (Notion wins on conflict during bulk sync). */
  async pullFromNotion(): Promise<SyncStatus> {
    if (!this.isConfigured()) {
      throw new Error("Notion is not configured");
    }
    const result = await syncNotionToSqlite(
      this.getClient(),
      this.config.sqlite.path,
    );
    return {
      ...result,
      syncedAt: new Date().toISOString(),
      direction: "pull",
    };
  }

  /** Push a single topic's intelligence fields to Notion after local update. */
  async pushTopicToNotion(topicId: string): Promise<void> {
    if (!this.isConfigured()) return;

    const topic = this.topicRepo.findById(topicId);
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

  /**
   * Bidirectional sync: pull latest from Notion, then push topics updated locally
   * since the last pull (SQLite updatedAt > pull start would need tracking;
   * for now: pull then callers push explicitly on mutations).
   */
  async sync(): Promise<SyncStatus> {
    const pullResult = await this.pullFromNotion();
    return { ...pullResult, direction: "bidirectional" };
  }
}
