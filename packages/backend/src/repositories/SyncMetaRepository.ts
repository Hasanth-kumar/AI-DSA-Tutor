import { eq } from "drizzle-orm";
import { syncMeta } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";

const PENDING_TOPICS_KEY = "pending_topic_pushes";
const PENDING_PROBLEMS_KEY = "pending_problem_pushes";

export interface PendingTopicFields {
  confidence?: number;
  revisionCount?: number;
  lastRevised?: number | null;
  nextRevisionAt?: number | null;
  isWeakArea?: number;
  status?: string;
  priorityScore?: number | null;
}

export interface PendingProblemFields {
  status?: string;
  attempts?: number;
  timeTaken?: number | null;
}

export interface PendingTopicPush {
  id: string;
  fields: PendingTopicFields;
}

export interface PendingProblemPush {
  id: string;
  fields: PendingProblemFields;
}

export class SyncMetaRepository {
  constructor(private readonly db: SqliteDb) {}

  getPendingTopics(): PendingTopicPush[] {
    return this.readJson(PENDING_TOPICS_KEY, []);
  }

  getPendingProblems(): PendingProblemPush[] {
    return this.readJson(PENDING_PROBLEMS_KEY, []);
  }

  markTopicPending(id: string, fields: PendingTopicFields): void {
    const pending = this.getPendingTopics().filter((p) => p.id !== id);
    pending.push({ id, fields: { ...fields } });
    this.writeJson(PENDING_TOPICS_KEY, pending);
  }

  markProblemPending(id: string, fields: PendingProblemFields): void {
    const pending = this.getPendingProblems().filter((p) => p.id !== id);
    pending.push({ id, fields: { ...fields } });
    this.writeJson(PENDING_PROBLEMS_KEY, pending);
  }

  clearPending(): void {
    this.writeJson(PENDING_TOPICS_KEY, []);
    this.writeJson(PENDING_PROBLEMS_KEY, []);
  }

  clearTopic(id: string): void {
    this.writeJson(
      PENDING_TOPICS_KEY,
      this.getPendingTopics().filter((p) => p.id !== id),
    );
  }

  clearProblem(id: string): void {
    this.writeJson(
      PENDING_PROBLEMS_KEY,
      this.getPendingProblems().filter((p) => p.id !== id),
    );
  }

  private readJson<T>(key: string, fallback: T): T {
    const row = this.db.select().from(syncMeta).where(eq(syncMeta.key, key)).get();
    if (!row?.value) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(key: string, value: unknown): void {
    const serialized = JSON.stringify(value);
    const existing = this.db.select().from(syncMeta).where(eq(syncMeta.key, key)).get();
    if (existing) {
      this.db.update(syncMeta).set({ value: serialized }).where(eq(syncMeta.key, key)).run();
    } else {
      this.db.insert(syncMeta).values({ key, value: serialized }).run();
    }
  }
}
