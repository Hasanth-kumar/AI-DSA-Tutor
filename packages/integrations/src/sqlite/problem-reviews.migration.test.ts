import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "./migrations.js";

/**
 * Re-solve stage-1 acceptance (problem-spaced-repetition design §4, §7, §13).
 * Validates the 0016 migration: `problem_attempts.kind`, the `problem_reviews`
 * table, and the admission backfill over existing attempt history (struggle
 * signals in, clean solves out, staggered due dates, run-once semantics).
 * Uses node:sqlite so it is native-module-independent.
 */
interface SqliteLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...p: unknown[]): unknown;
    get(...p: unknown[]): unknown;
    all(...p: unknown[]): Array<Record<string, unknown>>;
  };
}

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
const MIGRATION = "0016_problem_reviews.sql";

function applyMigration(db: SqliteLike, file: string): void {
  const sql = readFileSync(resolve(repoRoot, "database/migrations", file), "utf-8");
  try {
    db.exec(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Same tolerance as runMigrations in client.ts.
    if (!message.includes("duplicate column name") && !message.includes("no such column")) {
      throw err;
    }
  }
}

/** DB with every migration up to (but excluding) 0016, so history can be seeded first. */
function dbBefore0016(): SqliteLike {
  const db = new DatabaseSync!(":memory:");
  for (const file of MIGRATIONS) {
    if (file === MIGRATION) break;
    applyMigration(db, file);
  }
  return db;
}

function insertProblem(db: SqliteLike, id: string, difficulty: string): void {
  db.prepare(`INSERT INTO problems(id,name,difficulty,updated_at) VALUES(?,?,?,1)`).run(
    id,
    `p-${id}`,
    difficulty,
  );
}

function insertAttempt(
  db: SqliteLike,
  problemId: string,
  opts: {
    solvedAt?: number;
    timeTaken?: number | null;
    mistakeTag?: string | null;
    usedCoach?: number;
    hintCount?: number;
  } = {},
): void {
  db.prepare(
    `INSERT INTO problem_attempts(id,problem_id,solved_at,time_taken,mistake_tag,used_coach,hint_count,created_at)
     VALUES(?,?,?,?,?,?,?,1)`,
  ).run(
    `${problemId}-a${Math.random()}`,
    problemId,
    opts.solvedAt ?? 1,
    opts.timeTaken ?? null,
    opts.mistakeTag ?? null,
    opts.usedCoach ?? 0,
    opts.hintCount ?? 0,
  );
}

function pool(db: SqliteLike): Array<Record<string, unknown>> {
  return db.prepare("SELECT * FROM problem_reviews ORDER BY problem_id").all();
}

describe.skipIf(!DatabaseSync)("0016 problem_reviews migration + backfill (§4, §7)", () => {
  it("registers the migration and creates the FSRS-shaped table", () => {
    expect(MIGRATIONS).toContain(MIGRATION);
    const db = dbBefore0016();
    applyMigration(db, MIGRATION);
    const cols = db
      .prepare("PRAGMA table_info(problem_reviews)")
      .all()
      .map((r) => String(r.name));
    expect(cols).toEqual(
      expect.arrayContaining([
        "problem_id", "admitted_at", "admission_reason", "retired", "suspended",
        "stability", "difficulty", "due", "last_review", "reps", "lapses",
        "state", "elapsed_days", "scheduled_days", "learning_steps",
      ]),
    );
  });

  it("adds problem_attempts.kind defaulting to 'solve'", () => {
    const db = dbBefore0016();
    applyMigration(db, MIGRATION);
    insertProblem(db, "p1", "Easy");
    insertAttempt(db, "p1");
    const row = db.prepare("SELECT kind FROM problem_attempts").get() as { kind: string };
    expect(row.kind).toBe("solve");
  });

  it("backfills by struggle signal with reason priority mistake > coach > slow > hard", () => {
    const db = dbBefore0016();
    // mistake wins even with coach usage on another attempt
    insertProblem(db, "mistake", "Medium");
    insertAttempt(db, "mistake", { usedCoach: 1 });
    insertAttempt(db, "mistake", { mistakeTag: '["off-by-one"]' });
    // legacy bare-string tag also counts as a mistake
    insertProblem(db, "legacy", "Easy");
    insertAttempt(db, "legacy", { mistakeTag: "edge-case" });
    // coach: hint_count alone is enough
    insertProblem(db, "coach", "Medium");
    insertAttempt(db, "coach", { hintCount: 2 });
    // slow: Medium over 45 min
    insertProblem(db, "slow", "Medium");
    insertAttempt(db, "slow", { timeTaken: 50 });
    // hard: clean fast solve, admitted unconditionally
    insertProblem(db, "hard", "Hard");
    insertAttempt(db, "hard", { timeTaken: 10 });
    applyMigration(db, MIGRATION);

    const reasons = Object.fromEntries(pool(db).map((r) => [r.problem_id, r.admission_reason]));
    expect(reasons).toEqual({
      mistake: "mistake",
      legacy: "mistake",
      coach: "coach",
      slow: "slow",
      hard: "hard",
    });
  });

  it("does not admit clean, fast, unaided Easy/Medium solves or empty mistake tags", () => {
    const db = dbBefore0016();
    insertProblem(db, "clean-easy", "Easy");
    insertAttempt(db, "clean-easy", { timeTaken: 10, mistakeTag: "[]" });
    insertProblem(db, "clean-medium", "Medium");
    insertAttempt(db, "clean-medium", { timeTaken: 45, mistakeTag: "" });
    insertProblem(db, "unattempted", "Hard");
    applyMigration(db, MIGRATION);
    expect(pool(db)).toEqual([]);
  });

  it("initializes FSRS state as New with due dates staggered rustiest-first", () => {
    const db = dbBefore0016();
    const before = Date.now();
    for (let i = 0; i < 3; i++) {
      insertProblem(db, `p${i}`, "Hard");
      // p0 solved longest ago -> due first
      insertAttempt(db, `p${i}`, { solvedAt: 1000 + i });
    }
    applyMigration(db, MIGRATION);

    const rows = pool(db);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.state).toBe(0);
      expect(r.reps).toBe(0);
      expect(r.stability).toBeNull();
      expect(Number(r.due)).toBeGreaterThanOrEqual(before - 1000);
    }
    const dueByProblem = Object.fromEntries(rows.map((r) => [r.problem_id, Number(r.due)]));
    const day = 86400000;
    expect(dueByProblem.p1 - dueByProblem.p0).toBe(day);
    expect(dueByProblem.p2 - dueByProblem.p1).toBe(day);
  });

  it("re-running the migration never re-runs the backfill (run-once via the kind ALTER)", () => {
    const db = dbBefore0016();
    insertProblem(db, "p1", "Hard");
    insertAttempt(db, "p1");
    applyMigration(db, MIGRATION);
    db.prepare("UPDATE problem_reviews SET retired = 1 WHERE problem_id = 'p1'").run();
    // New struggling problem appears after first application...
    insertProblem(db, "p2", "Hard");
    insertAttempt(db, "p2");
    // ...boot-time re-run must not admit it or touch the retired row.
    applyMigration(db, MIGRATION);

    const rows = pool(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.problem_id).toBe("p1");
    expect(rows[0]!.retired).toBe(1);
  });
});
