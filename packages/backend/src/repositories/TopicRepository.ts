import { eq, isNotNull } from "drizzle-orm";
import { problems, topics } from "@dsa/database/schema";
import type { TopicState } from "@dsa/intelligence";
import type { SqliteDb } from "@dsa/integrations";
import type { MirrorCache } from "../services/MirrorCache.js";

export interface TopicUpdate {
  confidence?: number;
  revisionCount?: number;
  lastRevised?: Date | null;
  nextRevisionAt?: Date | null;
  sm2Interval?: number;
  sm2Repetition?: number;
  sm2Efactor?: number;
  isWeakArea?: boolean;
  status?: string;
  difficulty?: string;
  priorityScore?: number;
}

export class TopicRepository {
  constructor(
    private readonly db: SqliteDb,
    private readonly mirrorCache: MirrorCache,
  ) {}

  findAll(): TopicState[] {
    return this.mirrorCache.getTopicStates();
  }

  findById(id: string): TopicState | null {
    return this.mirrorCache.getTopicById(id);
  }

  /** Topics with no problems attached (E) — the plan degrades silently on these. */
  findOrphans(): TopicState[] {
    const withProblems = new Set(
      this.db
        .selectDistinct({ topicId: problems.topicId })
        .from(problems)
        .where(isNotNull(problems.topicId))
        .all()
        .map((r) => r.topicId),
    );
    return this.findAll().filter((t) => !withProblems.has(t.id));
  }

  update(id: string, patch: TopicUpdate): void {
    const now = Date.now();
    this.db
      .update(topics)
      .set({
        ...(patch.confidence != null ? { confidence: patch.confidence } : {}),
        ...(patch.revisionCount != null
          ? { revisionCount: patch.revisionCount }
          : {}),
        ...(patch.lastRevised !== undefined
          ? { lastRevised: patch.lastRevised ? patch.lastRevised.getTime() : null }
          : {}),
        ...(patch.nextRevisionAt !== undefined
          ? {
              nextRevisionAt: patch.nextRevisionAt
                ? patch.nextRevisionAt.getTime()
                : null,
            }
          : {}),
        ...(patch.sm2Interval != null ? { sm2Interval: patch.sm2Interval } : {}),
        ...(patch.sm2Repetition != null ? { sm2Repetition: patch.sm2Repetition } : {}),
        ...(patch.sm2Efactor != null ? { sm2Efactor: patch.sm2Efactor } : {}),
        ...(patch.isWeakArea != null ? { isWeakArea: patch.isWeakArea ? 1 : 0 } : {}),
        ...(patch.status != null ? { status: patch.status } : {}),
        ...(patch.difficulty != null ? { difficulty: patch.difficulty } : {}),
        ...(patch.priorityScore != null ? { priorityScore: patch.priorityScore } : {}),
        updatedAt: now,
      })
      .where(eq(topics.id, id))
      .run();
    this.mirrorCache.invalidate();
  }

  /** Apply many updates with a single mirror invalidation at the end. */
  bulkUpdate(updates: { id: string; patch: TopicUpdate }[]): void {
    this.mirrorCache.batch(() => {
      for (const { id, patch } of updates) this.update(id, patch);
    });
  }

  applyPendingFields(
    id: string,
    fields: {
      confidence?: number;
      revisionCount?: number;
      lastRevised?: number | null;
      nextRevisionAt?: number | null;
      sm2Interval?: number;
      sm2Repetition?: number;
      sm2Efactor?: number;
      isWeakArea?: number;
      status?: string;
      difficulty?: string;
      priorityScore?: number | null;
    },
  ): void {
    const now = Date.now();
    this.db
      .update(topics)
      .set({
        ...(fields.confidence != null ? { confidence: fields.confidence } : {}),
        ...(fields.revisionCount != null ? { revisionCount: fields.revisionCount } : {}),
        ...(fields.lastRevised !== undefined ? { lastRevised: fields.lastRevised } : {}),
        ...(fields.nextRevisionAt !== undefined
          ? { nextRevisionAt: fields.nextRevisionAt }
          : {}),
        ...(fields.sm2Interval != null ? { sm2Interval: fields.sm2Interval } : {}),
        ...(fields.sm2Repetition != null ? { sm2Repetition: fields.sm2Repetition } : {}),
        ...(fields.sm2Efactor != null ? { sm2Efactor: fields.sm2Efactor } : {}),
        ...(fields.isWeakArea != null ? { isWeakArea: fields.isWeakArea } : {}),
        ...(fields.status != null ? { status: fields.status } : {}),
        ...(fields.difficulty != null ? { difficulty: fields.difficulty } : {}),
        ...(fields.priorityScore !== undefined
          ? { priorityScore: fields.priorityScore }
          : {}),
        updatedAt: now,
      })
      .where(eq(topics.id, id))
      .run();
    this.mirrorCache.invalidate();
  }
}
