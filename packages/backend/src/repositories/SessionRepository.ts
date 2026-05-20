import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { sessions } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";

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
  constructor(private readonly db: SqliteDb) {}

  findAll(limit = 100): SessionRow[] {
    return this.db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.date))
      .limit(limit)
      .all();
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

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.delete(sessions).where(eq(sessions.id, id)).run();
    return result.changes > 0;
  }
}
