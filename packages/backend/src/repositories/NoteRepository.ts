import { eq, isNotNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { notes } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";
import type { MirrorCache } from "../services/MirrorCache.js";

export type NoteRow = typeof notes.$inferSelect;

export interface UpsertNoteInput {
  path: string;
  title: string;
  problemId?: string | null;
  topicId?: string | null;
  frontmatter?: Record<string, string>;
  content?: string;
  contentHash?: string;
  matchedBy?: "frontmatter" | "filename" | null;
}

export class NoteRepository {
  constructor(
    private readonly db: SqliteDb,
    private readonly mirrorCache: MirrorCache,
  ) {}

  findAll(): NoteRow[] {
    return this.db.select().from(notes).all();
  }

  findByPath(path: string): NoteRow | null {
    return this.db.select().from(notes).where(eq(notes.path, path)).get() ?? null;
  }

  findByProblemId(problemId: string): NoteRow | null {
    return (
      this.db.select().from(notes).where(eq(notes.problemId, problemId)).get() ?? null
    );
  }

  /** Notes matched to any problem of the given topic. */
  findByTopicId(topicId: string): NoteRow[] {
    return this.db.select().from(notes).where(eq(notes.topicId, topicId)).all();
  }

  /** Set of problem ids that have a matched note — weakness-engine input. */
  notedProblemIds(): Set<string> {
    const rows = this.db
      .select({ problemId: notes.problemId })
      .from(notes)
      .where(isNotNull(notes.problemId))
      .all();
    return new Set(rows.map((r) => r.problemId!));
  }

  upsertByPath(input: UpsertNoteInput): NoteRow {
    const existing = this.findByPath(input.path);
    const now = Date.now();
    const values = {
      path: input.path,
      title: input.title,
      problemId: input.problemId ?? null,
      topicId: input.topicId ?? null,
      frontmatter: input.frontmatter ? JSON.stringify(input.frontmatter) : null,
      content: input.content ?? null,
      contentHash: input.contentHash ?? null,
      matchedBy: input.matchedBy ?? null,
      updatedAt: now,
    };

    if (existing) {
      this.db.update(notes).set(values).where(eq(notes.id, existing.id)).run();
      this.mirrorCache.invalidate();
      return this.findByPath(input.path)!;
    }

    this.db
      .insert(notes)
      .values({ id: randomUUID(), ...values })
      .run();
    this.mirrorCache.invalidate();
    return this.findByPath(input.path)!;
  }

  deleteByPath(path: string): boolean {
    const result = this.db.delete(notes).where(eq(notes.path, path)).run();
    if (result.changes > 0) this.mirrorCache.invalidate();
    return result.changes > 0;
  }
}
