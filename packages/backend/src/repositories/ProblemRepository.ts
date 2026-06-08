import { and, eq } from "drizzle-orm";
import type { TopicDifficulty } from "@dsa/intelligence";
import { problems } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";

export type ProblemRow = typeof problems.$inferSelect;

export interface ProblemUpdate {
  status?: string;
  attempts?: number;
  timeTaken?: number | null;
  notes?: string;
}

const DIFFICULTIES: TopicDifficulty[] = ["Easy", "Medium", "Hard"];

function asDifficulty(value: string | null | undefined): TopicDifficulty | null {
  if (value && DIFFICULTIES.includes(value as TopicDifficulty)) {
    return value as TopicDifficulty;
  }
  return null;
}

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

  findUnsolvedByTopicId(
    topicId: string,
    options: { difficulties?: TopicDifficulty[]; limit?: number } = {},
  ): ProblemRow[] {
    const { difficulties, limit = 3 } = options;
    const rows = this.db
      .select()
      .from(problems)
      .where(
        and(
          eq(problems.topicId, topicId),
          eq(problems.status, "Unsolved"),
        ),
      )
      .all();

    const filtered =
      difficulties && difficulties.length > 0
        ? rows.filter((p) => {
            const d = asDifficulty(p.difficulty);
            return d != null && difficulties.includes(d);
          })
        : rows;

    const difficultyOrder = (d: string | null) => {
      const idx = DIFFICULTIES.indexOf(asDifficulty(d) ?? "Medium");
      return idx >= 0 ? idx : 1;
    };

    return filtered
      .sort((a, b) => difficultyOrder(a.difficulty) - difficultyOrder(b.difficulty))
      .slice(0, limit);
  }

  update(id: string, patch: ProblemUpdate): void {
    const now = Date.now();
    this.db
      .update(problems)
      .set({
        ...(patch.status != null ? { status: patch.status } : {}),
        ...(patch.attempts != null ? { attempts: patch.attempts } : {}),
        ...(patch.timeTaken !== undefined ? { timeTaken: patch.timeTaken } : {}),
        ...(patch.notes != null ? { notes: patch.notes } : {}),
        updatedAt: now,
      })
      .where(eq(problems.id, id))
      .run();
  }

  recordSolve(id: string, timeTakenMinutes: number): ProblemRow | null {
    const problem = this.findById(id);
    if (!problem) return null;

    this.update(id, {
      status: "Solved",
      attempts: (problem.attempts ?? 0) + 1,
      timeTaken: timeTakenMinutes,
    });
    return this.findById(id);
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
