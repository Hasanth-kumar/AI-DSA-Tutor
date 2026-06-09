import { desc, eq, gte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { sessions } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";
import type { MirrorCache } from "../services/MirrorCache.js";

export type SessionRow = typeof sessions.$inferSelect;

export interface CreateSessionInput {
  topicId: string;
  date?: Date;
  problemsSolved: number;
  studyDuration: number;
  productivityScore: number;
}

export interface UpdateSessionInput {
  problemsSolved?: number;
  studyDuration?: number;
  productivityScore?: number;
  date?: Date;
}

export class SessionRepository {
  constructor(
    private readonly db: SqliteDb,
    private readonly mirrorCache: MirrorCache,
  ) {}

  findAll(limit = 100): SessionRow[] {
    return this.mirrorCache.getSessionRows(limit);
  }

  findById(id: string): SessionRow | null {
    return this.db.select().from(sessions).where(eq(sessions.id, id)).get() ?? null;
  }

  findByTopicId(topicId: string, limit = 20): SessionRow[] {
    return this.db
      .select()
      .from(sessions)
      .where(eq(sessions.topicId, topicId))
      .orderBy(desc(sessions.date))
      .limit(limit)
      .all();
  }

  /** Aggregated daily problem counts for activity heatmap — bypasses mirror cache. */
  getDailyProblemCounts(sinceMs: number): Record<string, number> {
    const rows = this.db
      .select({
        day: sql<string>`date(${sessions.date} / 1000, 'unixepoch')`,
        total: sql<number>`coalesce(sum(${sessions.problemsSolved}), 0)`,
      })
      .from(sessions)
      .where(gte(sessions.date, sinceMs))
      .groupBy(sql`date(${sessions.date} / 1000, 'unixepoch')`)
      .all();

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.day] = row.total;
    }
    return counts;
  }

  create(input: CreateSessionInput): SessionRow {
    const id = randomUUID();
    const now = Date.now();
    const date = input.date ?? new Date();

    this.db
      .insert(sessions)
      .values({
        id,
        date: date.getTime(),
        topicId: input.topicId,
        problemsSolved: input.problemsSolved,
        studyDuration: input.studyDuration,
        productivityScore: input.productivityScore,
        updatedAt: now,
      })
      .run();

    this.mirrorCache.invalidate();
    return this.findById(id)!;
  }

  update(id: string, patch: UpdateSessionInput): SessionRow | null {
    const existing = this.findById(id);
    if (!existing) return null;

    this.db
      .update(sessions)
      .set({
        ...(patch.problemsSolved != null ? { problemsSolved: patch.problemsSolved } : {}),
        ...(patch.studyDuration != null ? { studyDuration: patch.studyDuration } : {}),
        ...(patch.productivityScore != null
          ? { productivityScore: patch.productivityScore }
          : {}),
        ...(patch.date != null ? { date: patch.date.getTime() } : {}),
        updatedAt: Date.now(),
      })
      .where(eq(sessions.id, id))
      .run();

    this.mirrorCache.invalidate();
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.delete(sessions).where(eq(sessions.id, id)).run();
    if (result.changes > 0) this.mirrorCache.invalidate();
    return result.changes > 0;
  }
}
