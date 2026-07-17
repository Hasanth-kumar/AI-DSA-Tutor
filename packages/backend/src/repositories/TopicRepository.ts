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

/** Raw column shape of {@link TopicUpdate}: epoch-ms timestamps, 0/1 flags. */
export interface TopicFieldPatch {
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
    const { lastRevised, nextRevisionAt, isWeakArea, priorityScore, ...rest } = patch;
    this.applyPendingFields(id, {
      ...rest,
      ...(lastRevised !== undefined ? { lastRevised: lastRevised?.getTime() ?? null } : {}),
      ...(nextRevisionAt !== undefined
        ? { nextRevisionAt: nextRevisionAt?.getTime() ?? null }
        : {}),
      ...(isWeakArea != null ? { isWeakArea: isWeakArea ? 1 : 0 } : {}),
      // `update` never writes null scores; only pending-edit replay may.
      ...(priorityScore != null ? { priorityScore } : {}),
    });
  }

  /** Apply many updates with a single mirror invalidation at the end. */
  bulkUpdate(updates: { id: string; patch: TopicUpdate }[]): void {
    this.mirrorCache.batch(() => {
      for (const { id, patch } of updates) this.update(id, patch);
    });
  }

  /** Raw-field variant of {@link update} (epoch-ms timestamps, 0/1 flags) used by sync replay. */
  applyPendingFields(id: string, fields: TopicFieldPatch): void {
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
        updatedAt: Date.now(),
      })
      .where(eq(topics.id, id))
      .run();
    this.mirrorCache.invalidate();
  }
}
