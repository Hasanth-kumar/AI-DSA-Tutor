import { eq } from "drizzle-orm";
import { topics } from "@dsa/database/schema";
import type { TopicState } from "@dsa/intelligence";
import type { SqliteDb } from "@dsa/integrations";
import type { MirrorCache } from "../services/MirrorCache.js";

export interface TopicUpdate {
  confidence?: number;
  revisionCount?: number;
  lastRevised?: Date | null;
  nextRevisionAt?: Date | null;
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

  applyPendingFields(
    id: string,
    fields: {
      confidence?: number;
      revisionCount?: number;
      lastRevised?: number | null;
      nextRevisionAt?: number | null;
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
