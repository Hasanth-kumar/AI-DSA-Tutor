import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "../sqlite/migrations.js";
import { loadAllSeeds } from "./seed-loader.js";
import { seedTopics, buildSeedRows, type SeedDb } from "./seed-store.js";

/**
 * Stage-2 persistence acceptance (design §§2,8,15.2). Seeds the curated
 * baseline into a real (in-memory) SQLite, confirming cards enter as
 * `origin='seed'` in FSRS New state with provenance, concept links land for a
 * deterministic coverage GROUP BY (§4), and re-seeding is idempotent.
 *
 * Uses Node's built-in `node:sqlite` so the test is native-module-independent
 * (the prebuilt better-sqlite3 binary is platform-specific). Skipped on
 * runtimes without `node:sqlite` (Node < 22.5).
 */
interface StmtLike {
  run(...p: unknown[]): { changes?: number | bigint };
  get(...p: unknown[]): Record<string, unknown>;
  all(...p: unknown[]): Array<Record<string, unknown>>;
}
interface SqliteLike {
  exec(sql: string): void;
  prepare(sql: string): StmtLike;
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
const SEEDS_ROOT = resolve(repoRoot, "database/seeds");
const NOW = 1_700_000_000_000;

function freshDb(): SqliteLike {
  const db = new DatabaseSync!(":memory:");
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

describe.skipIf(!DatabaseSync)("seed-store (§2, §8)", () => {
  it("buildSeedRows yields one row per card with seed provenance", () => {
    const topics = loadAllSeeds(SEEDS_ROOT);
    const { cards, concepts } = buildSeedRows(topics, NOW);
    const totalCards = topics.reduce((n, t) => n + t.cards.length, 0);
    expect(cards.length).toBe(totalCards);
    expect(concepts.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.origin).toBe("seed");
      expect(c.seed_version).toBeGreaterThanOrEqual(1);
      expect(c.source_hash).toHaveLength(64); // sha256 hex
      expect(c.due).toBe(c.created_at); // New cards due immediately
    }
  });

  it("seeds cards as origin=seed in FSRS New state with provenance", () => {
    const db = freshDb();
    const topics = loadAllSeeds(SEEDS_ROOT);
    const insTopic = db.prepare("INSERT INTO topics(id,name,updated_at) VALUES(?,?,?)");
    for (const t of topics) insTopic.run(t.topicId, t.topicName, NOW);

    const result = seedTopics(db as unknown as SeedDb, topics, NOW);
    const total = topics.reduce((n, t) => n + t.cards.length, 0);
    expect(result.cardsInserted).toBe(total);

    const counts = db
      .prepare(
        "SELECT " +
          "(SELECT COUNT(*) FROM cards) AS cards, " +
          "(SELECT COUNT(*) FROM cards WHERE origin='seed') AS seeded, " +
          "(SELECT COUNT(*) FROM cards WHERE state=0 AND reps=0 AND lapses=0 AND due IS NOT NULL) AS fresh, " +
          "(SELECT COUNT(*) FROM cards WHERE source_hash IS NOT NULL AND seed_version IS NOT NULL) AS prov",
      )
      .get();
    expect(counts.cards).toBe(total);
    expect(counts.seeded).toBe(total);
    expect(counts.fresh).toBe(total);
    expect(counts.prov).toBe(total);
  });

  it("supports deterministic coverage via GROUP BY (§4)", () => {
    const db = freshDb();
    const topics = loadAllSeeds(SEEDS_ROOT);
    const insTopic = db.prepare("INSERT INTO topics(id,name,updated_at) VALUES(?,?,?)");
    for (const t of topics) insTopic.run(t.topicId, t.topicName, NOW);
    seedTopics(db as unknown as SeedDb, topics, NOW);

    const coverage = db
      .prepare(
        "SELECT c.topic_id AS topic_id, COUNT(DISTINCT cc.concept_id) AS covered " +
          "FROM cards c JOIN card_concepts cc ON cc.card_id = c.id GROUP BY c.topic_id",
      )
      .all();
    const byTopic = new Map(coverage.map((r) => [String(r.topic_id), Number(r.covered)]));
    for (const t of topics) {
      const tagged = new Set<string>();
      for (const card of t.cards) for (const tag of card.concepts) tagged.add(tag);
      expect(byTopic.get(t.topicId)).toBe(tagged.size);
    }
  });

  it("is idempotent — re-seeding inserts nothing and resets no state", () => {
    const db = freshDb();
    const topics = loadAllSeeds(SEEDS_ROOT);
    const insTopic = db.prepare("INSERT INTO topics(id,name,updated_at) VALUES(?,?,?)");
    for (const t of topics) insTopic.run(t.topicId, t.topicName, NOW);

    seedTopics(db as unknown as SeedDb, topics, NOW);
    // Simulate a review having advanced a card's FSRS state.
    const sample = String(topics[0].cards[0].id);
    db.prepare("UPDATE cards SET reps=5, state=2, stability=12.3 WHERE id=?").run(sample);

    const before = Number(db.prepare("SELECT COUNT(*) AS n FROM cards").get().n);
    const second = seedTopics(db as unknown as SeedDb, topics, NOW + 1);
    const after = Number(db.prepare("SELECT COUNT(*) AS n FROM cards").get().n);

    expect(second.cardsInserted).toBe(0);
    expect(after).toBe(before);
    const reps = Number(db.prepare("SELECT reps AS r FROM cards WHERE id=?").get(sample).r);
    expect(reps).toBe(5); // re-seed must not reset review progress
  });
});
