import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "./migrations.js";
import {
  upsertEmbedding,
  getEmbedding,
  cardsNeedingEmbedding,
  loadDedupCandidates,
  type EmbeddingDb,
} from "../embeddings/index.js";

/**
 * Stage-4 acceptance (design §6, §13, §15.4). Validates the embedding-store
 * migration applies, vectors round-trip as blobs through SQLite, the work-list
 * and dedup-candidate queries join concepts correctly, and embeddings cascade
 * with their card. Uses node:sqlite so it is native-module-independent.
 */
interface SqliteLike extends EmbeddingDb {
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

function freshDb(): SqliteLike {
  const db = new DatabaseSync!(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of MIGRATIONS) {
    const sql = readFileSync(resolve(repoRoot, "database/migrations", file), "utf-8");
    try {
      db.exec(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("duplicate column name") && !message.includes("no such column")) {
        throw err;
      }
    }
  }
  return db;
}

function insertCard(
  db: SqliteLike,
  id: string,
  sourceHash: string,
  concepts: string[],
  topicId: string | null = null,
): void {
  db.prepare(
    `INSERT INTO cards(id,topic_id,type,front,back,reps,lapses,state,origin,source_hash,dirty,created_at,updated_at)
     VALUES(?,?,?,?,?,0,0,0,'seed',?,1,1,1)`,
  ).run(id, topicId, "plain-recall", `q-${id}`, `a-${id}`, sourceHash);
  for (const c of concepts) {
    db.prepare(`INSERT INTO card_concepts(card_id,concept_id) VALUES(?,?)`).run(id, c);
  }
}

describe.skipIf(!DatabaseSync)("0012 card_embeddings migration + store (§6)", () => {
  it("registers the migration and creates the table with the right columns", () => {
    expect(MIGRATIONS).toContain("0012_card_embeddings.sql");
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(card_embeddings)")
      .all()
      .map((r) => String(r.name));
    expect(cols).toEqual(
      expect.arrayContaining(["card_id", "model", "dim", "vector", "source_hash", "created_at"]),
    );
    // The vector column is a BLOB.
    const vectorCol = db
      .prepare("PRAGMA table_info(card_embeddings)")
      .all()
      .find((r) => r.name === "vector");
    expect(String(vectorCol!.type).toUpperCase()).toContain("BLOB");
  });

  it("round-trips a Float32 vector through a SQLite blob", () => {
    const db = freshDb();
    insertCard(db, "c1", "h1", ["two-pointers"]);
    const vec = Float32Array.from([0.1, -0.2, 0.3, 0.9]);
    upsertEmbedding(db, { cardId: "c1", model: "nomic-embed-text", vector: vec, sourceHash: "h1" });

    const stored = getEmbedding(db, "c1");
    expect(stored?.dim).toBe(4);
    expect(stored?.model).toBe("nomic-embed-text");
    expect(Array.from(stored!.vector)).toEqual([
      expect.closeTo(0.1, 5),
      expect.closeTo(-0.2, 5),
      expect.closeTo(0.3, 5),
      expect.closeTo(0.9, 5),
    ]);
  });

  it("upsert is idempotent and overwrites the vector on conflict", () => {
    const db = freshDb();
    insertCard(db, "c1", "h1", ["x"]);
    upsertEmbedding(db, { cardId: "c1", model: "m", vector: Float32Array.from([1, 0]), sourceHash: "h1" });
    upsertEmbedding(db, { cardId: "c1", model: "m", vector: Float32Array.from([0, 1]), sourceHash: "h2" });
    const count = db.prepare("SELECT COUNT(*) AS n FROM card_embeddings").get() as { n: number };
    expect(Number(count.n)).toBe(1);
    expect(Array.from(getEmbedding(db, "c1")!.vector)).toEqual([0, 1]);
    expect(getEmbedding(db, "c1")!.sourceHash).toBe("h2");
  });

  it("cardsNeedingEmbedding finds missing, model-mismatched, and stale-hash cards", () => {
    const db = freshDb();
    insertCard(db, "missing", "h1", ["a"]);
    insertCard(db, "fresh", "h2", ["b"]);
    insertCard(db, "stale", "h3", ["c"]);
    insertCard(db, "othermodel", "h4", ["d"]);
    upsertEmbedding(db, { cardId: "fresh", model: "nomic-embed-text", vector: Float32Array.from([1]), sourceHash: "h2" });
    upsertEmbedding(db, { cardId: "stale", model: "nomic-embed-text", vector: Float32Array.from([1]), sourceHash: "OLD" });
    upsertEmbedding(db, { cardId: "othermodel", model: "other", vector: Float32Array.from([1]), sourceHash: "h4" });

    const todo = cardsNeedingEmbedding(db, "nomic-embed-text").map((c) => c.id).sort();
    expect(todo).toEqual(["missing", "othermodel", "stale"]);
    expect(todo).not.toContain("fresh");
  });

  it("cardsNeedingEmbedding excludes suspended cards and joins concepts", () => {
    const db = freshDb();
    insertCard(db, "c1", "h1", ["alpha", "beta"]);
    db.prepare("UPDATE cards SET suspended = 1 WHERE id = 'c1'").run();
    insertCard(db, "c2", "h2", ["gamma"]);
    const todo = cardsNeedingEmbedding(db, "m");
    expect(todo.map((c) => c.id)).toEqual(["c2"]);
    expect(todo[0]!.concepts).toEqual(["gamma"]);
  });

  it("loadDedupCandidates returns vectors + concepts, scoped by topic", () => {
    const db = freshDb();
    db.prepare("INSERT INTO topics(id,name,updated_at) VALUES('t1','T1',1),('t2','T2',1)").run();
    insertCard(db, "c1", "h1", ["two-pointers"], "t1");
    insertCard(db, "c2", "h2", ["sliding-window"], "t2");
    upsertEmbedding(db, { cardId: "c1", model: "m", vector: Float32Array.from([1, 0]), sourceHash: "h1" });
    upsertEmbedding(db, { cardId: "c2", model: "m", vector: Float32Array.from([0, 1]), sourceHash: "h2" });

    const all = loadDedupCandidates(db, "m");
    expect(all.map((c) => c.id).sort()).toEqual(["c1", "c2"]);

    const t1 = loadDedupCandidates(db, "m", { topicId: "t1" });
    expect(t1).toHaveLength(1);
    expect(t1[0]!.id).toBe("c1");
    expect(t1[0]!.concepts).toEqual(["two-pointers"]);
    expect(Array.from(t1[0]!.vector)).toEqual([1, 0]);
  });

  it("deleting a card cascades to its embedding (§6 local only)", () => {
    const db = freshDb();
    insertCard(db, "c1", "h1", ["x"]);
    upsertEmbedding(db, { cardId: "c1", model: "m", vector: Float32Array.from([1]), sourceHash: "h1" });
    db.prepare("DELETE FROM cards WHERE id = 'c1'").run();
    expect(getEmbedding(db, "c1")).toBeUndefined();
  });
});
