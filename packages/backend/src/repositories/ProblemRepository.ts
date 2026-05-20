import { eq } from "drizzle-orm";
import { problems } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";

export type ProblemRow = typeof problems.$inferSelect;

export class ProblemRepository {
  constructor(private readonly db: SqliteDb) {}

  findAll(): ProblemRow[] {
    return this.db.select().from(problems).all();
  }

  findByTopicId(topicId: string): ProblemRow[] {
    return this.db.select().from(problems).where(eq(problems.topicId, topicId)).all();
  }

  findById(id: string): ProblemRow | null {
    return this.db.select().from(problems).where(eq(problems.id, id)).get() ?? null;
  }

  findByNameFuzzy(name: string): ProblemRow | null {
    const normalized = name.toLowerCase().trim();
    if (!normalized) return null;

    const all = this.findAll();
    const exact = all.find((p) => p.name.toLowerCase() === normalized);
    if (exact) return exact;

    const contains = all.filter((p) => p.name.toLowerCase().includes(normalized));
    if (contains.length === 1) return contains[0];
    if (contains.length > 1) {
      const best = contains.sort((a, b) => a.name.length - b.name.length)[0];
      return best;
    }

    return null;
  }
}
