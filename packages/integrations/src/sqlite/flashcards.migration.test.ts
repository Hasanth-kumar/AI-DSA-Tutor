import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "./migrations.js";

/**
 * Stage-1 schema acceptance (design §§3,4,7,8,9,15.1). Validates the flashcard
 * migration chain applies cleanly and the `cards` / `card_concepts` /
 * `card_events` tables match the per-card FSRS + provenance + event-log design.
 *
 * Uses Node's built-in `node:sqlite` instead of better-sqlite3 so the test is
 * native-module-independent (the repo's prebuilt better-sqlite3 binary is
 * platform-specific). Skipped automatically on runtimes without `node:sqlite`.
 */
interface SqliteLike {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: unknown[]): Array<Record<string, unknown>> };
}

// Variable specifier so TS treats this as a dynamic import (no static
// module-resolution dependency on @types/node declaring `node:sqlite`).
const sqliteModule = "node:sqlite";
let DatabaseSync: (new (path: string) => SqliteLike) | undefined;
try {
  const mod = (await import(/* @vite-ignore */ sqliteModule)) as {
    DatabaseSync: new (path: string) => SqliteLike;
  };
  DatabaseSync = mod.DatabaseSync;
} catch {
  DatabaseSync = undefined;
}

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

function applyAllMigrations(): SqliteLike {
  const db = new DatabaseSync!(":memory:");
  for (const file of MIGRATIONS) {
    const sql = readFileSync(resolve(repoRoot, "database/migrations", file), "utf-8");
    try {
      db.exec(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        !message.includes("duplicate column name") &&
        !message.includes("no such column")
      ) {
        throw err;
      }
    }
  }
  return db;
}

const columns = (db: SqliteLike, table: string): string[] =>
  db.prepare(`PRAGMA table_info(${table})`).all().map((r) => String(r.name));

describe.skipIf(!DatabaseSync)("0011 flashcards migration", () => {
  it("registers 0011_flashcards.sql in the runner", () => {
    expect(MIGRATIONS).toContain("0011_flashcards.sql");
  });

  it("applies the full migration chain without error", () => {
    const db = applyAllMigrations();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => String(r.name));
    expect(tables).toEqual(
      expect.arrayContaining(["cards", "card_concepts", "card_events"]),
    );
  });

  it("stores per-card FSRS state on cards, not topic-level SM-2 (§7)", () => {
    const db = applyAllMigrations();
    const cols = columns(db, "cards");
    for (const c of [
      "stability",
      "difficulty",
      "due",
      "last_review",
      "reps",
      "lapses",
      "state",
    ]) {
      expect(cols).toContain(c);
    }
    // No SM-2 / single-ease model leaks onto the card row.
    for (const c of ["sm2_interval", "sm2_efactor", "sm2_repetition", "ease"]) {
      expect(cols).not.toContain(c);
    }
  });

  it("stores provenance but defers confidence/quality (§8)", () => {
    const db = applyAllMigrations();
    const cols = columns(db, "cards");
    for (const c of ["source_hash", "model_version", "prompt_version", "note_version"]) {
      expect(cols).toContain(c);
    }
    for (const c of ["generation_confidence", "quality_score"]) {
      expect(cols).not.toContain(c);
    }
  });

  it("uses an app UUID primary key and a dirty-delta flag (§8)", () => {
    const db = applyAllMigrations();
    const info = db.prepare("PRAGMA table_info(cards)").all();
    const pk = info.find((r) => Number(r.pk) === 1);
    expect(pk?.name).toBe("id");
    expect(columns(db, "cards")).toEqual(
      expect.arrayContaining(["dirty", "updated_at", "notion_page_id"]),
    );
  });

  it("normalizes concept tags and supports deterministic coverage (§4)", () => {
    const db = applyAllMigrations();
    expect(columns(db, "card_concepts")).toEqual(["card_id", "concept_id"]);
    db.exec(
      `INSERT INTO cards(id,type,front,back,reps,lapses,state,origin,dirty,created_at,updated_at)
       VALUES('c1','plain-recall','q','a',0,0,0,'seed',1,1,1)`,
    );
    db.exec(`INSERT INTO card_concepts(card_id,concept_id) VALUES('c1','backtracking-blueprint')`);
    const coverage = db
      .prepare("SELECT concept_id, COUNT(*) AS n FROM card_concepts GROUP BY concept_id")
      .all();
    expect(coverage).toEqual([{ concept_id: "backtracking-blueprint", n: 1 }]);
  });

  it("provides an append-only card_events log (§9)", () => {
    const db = applyAllMigrations();
    expect(columns(db, "card_events")).toEqual(
      expect.arrayContaining(["id", "card_id", "type", "payload", "created_at"]),
    );
    db.exec(
      `INSERT INTO cards(id,type,front,back,reps,lapses,state,origin,dirty,created_at,updated_at)
       VALUES('c2','cloze','q','a',0,0,0,'generated',1,1,1)`,
    );
    db.exec(
      `INSERT INTO card_events(id,card_id,type,payload,created_at)
       VALUES('e1','c2','CardGenerated','{"model":"qwen"}',1)`,
    );
    const rows = db.prepare("SELECT type FROM card_events WHERE card_id='c2'").all();
    expect(rows).toEqual([{ type: "CardGenerated" }]);
  });
});
