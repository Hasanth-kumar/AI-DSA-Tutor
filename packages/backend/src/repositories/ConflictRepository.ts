import { desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { syncConflicts } from "@dsa/database/schema";
import type { SqliteDb } from "@dsa/integrations";

export type ConflictRow = typeof syncConflicts.$inferSelect;

export interface LogConflictInput {
  entityType: "topic" | "problem";
  entityId: string;
  entityName?: string | null;
  localValue: unknown;
  remoteValue: unknown;
}

export class ConflictRepository {
  constructor(private readonly db: SqliteDb) {}

  log(input: LogConflictInput): ConflictRow {
    const id = randomUUID();
    this.db
      .insert(syncConflicts)
      .values({
        id,
        entityType: input.entityType,
        entityId: input.entityId,
        entityName: input.entityName ?? null,
        localValue: JSON.stringify(input.localValue),
        remoteValue: JSON.stringify(input.remoteValue),
        detectedAt: Date.now(),
      })
      .run();
    return this.findById(id)!;
  }

  findById(id: string): ConflictRow | null {
    return (
      this.db.select().from(syncConflicts).where(eq(syncConflicts.id, id)).get() ??
      null
    );
  }

  findUnresolved(): ConflictRow[] {
    return this.db
      .select()
      .from(syncConflicts)
      .where(isNull(syncConflicts.resolvedAt))
      .orderBy(desc(syncConflicts.detectedAt))
      .all();
  }

  findRecent(limit = 50): ConflictRow[] {
    return this.db
      .select()
      .from(syncConflicts)
      .orderBy(desc(syncConflicts.detectedAt))
      .limit(limit)
      .all();
  }

  resolve(id: string, winner: "local" | "remote"): ConflictRow | null {
    const existing = this.findById(id);
    if (!existing) return null;
    this.db
      .update(syncConflicts)
      .set({ resolvedAt: Date.now(), winner })
      .where(eq(syncConflicts.id, id))
      .run();
    return this.findById(id);
  }

  unresolvedCount(): number {
    return this.findUnresolved().length;
  }
}
