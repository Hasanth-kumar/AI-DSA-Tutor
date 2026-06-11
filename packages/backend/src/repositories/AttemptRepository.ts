import { desc, eq, gte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { problemAttempts } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";
import type { MirrorCache } from "../services/MirrorCache.js";

export type AttemptRow = typeof problemAttempts.$inferSelect;

export interface CreateAttemptInput {
  problemId: string;
  topicId?: string | null;
  sessionId?: string | null;
  solvedAt?: Date;
  timeTaken?: number | null;
  mistakeTag?: string | null;
}

const MISTAKE_WINDOW_DAYS = 90;

export class AttemptRepository {
  constructor(
    private readonly db: SqliteDb,
    private readonly mirrorCache: MirrorCache,
  ) {}

  create(input: CreateAttemptInput): AttemptRow {
    const id = randomUUID();
    const now = Date.now();
    this.db
      .insert(problemAttempts)
      .values({
        id,
        problemId: input.problemId,
        topicId: input.topicId ?? null,
        sessionId: input.sessionId ?? null,
        solvedAt: (input.solvedAt ?? new Date()).getTime(),
        timeTaken: input.timeTaken ?? null,
        mistakeTag: input.mistakeTag ?? null,
        createdAt: now,
      })
      .run();
    this.mirrorCache.invalidate();
    return this.findById(id)!;
  }

  findById(id: string): AttemptRow | null {
    return (
      this.db
        .select()
        .from(problemAttempts)
        .where(eq(problemAttempts.id, id))
        .get() ?? null
    );
  }

  findByProblemId(problemId: string, limit = 10): AttemptRow[] {
    return this.db
      .select()
      .from(problemAttempts)
      .where(eq(problemAttempts.problemId, problemId))
      .orderBy(desc(problemAttempts.solvedAt))
      .limit(limit)
      .all();
  }

  findRecent(limit = 50): AttemptRow[] {
    return this.db
      .select()
      .from(problemAttempts)
      .orderBy(desc(problemAttempts.solvedAt))
      .limit(limit)
      .all();
  }

  setMistakeTag(id: string, mistakeTag: string | null): AttemptRow | null {
    const existing = this.findById(id);
    if (!existing) return null;
    this.db
      .update(problemAttempts)
      .set({ mistakeTag })
      .where(eq(problemAttempts.id, id))
      .run();
    this.mirrorCache.invalidate();
    return this.findById(id);
  }

  /** Mistake-tag counts per topic over the recent window — weakness-engine input. */
  mistakeTagCountsByTopic(windowDays = MISTAKE_WINDOW_DAYS): Map<string, Record<string, number>> {
    const since = Date.now() - windowDays * 86_400_000;
    const rows = this.db
      .select({
        topicId: problemAttempts.topicId,
        mistakeTag: problemAttempts.mistakeTag,
        count: sql<number>`count(*)`,
      })
      .from(problemAttempts)
      .where(gte(problemAttempts.solvedAt, since))
      .groupBy(problemAttempts.topicId, problemAttempts.mistakeTag)
      .all();

    const byTopic = new Map<string, Record<string, number>>();
    for (const row of rows) {
      if (!row.topicId || !row.mistakeTag) continue;
      const counts = byTopic.get(row.topicId) ?? {};
      counts[row.mistakeTag] = row.count;
      byTopic.set(row.topicId, counts);
    }
    return byTopic;
  }

  /** Mistake-tag counts for one topic (e.g. coach context for an anchored problem). */
  mistakeTagCountsForTopic(topicId: string, windowDays = MISTAKE_WINDOW_DAYS): Record<string, number> {
    return this.mistakeTagCountsByTopic(windowDays).get(topicId) ?? {};
  }
}
