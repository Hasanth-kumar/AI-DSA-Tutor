import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "./migrations.js";
import {
  CardGenerationService,
  computeCoverage,
  markTopicDirty,
  listDirtyTopics,
  getTopicGeneration,
  type GenerationDb,
  type TopicVocabulary,
} from "../generation/index.js";
import { upsertEmbedding } from "../embeddings/index.js";
import type { Embedder } from "../embeddings/index.js";
import type { GenerationClient } from "../generation/index.js";

/**
 * Stage-5 end-to-end acceptance (design §4, §5, §8, §9). Drives the real
 * pipeline against node:sqlite with a mock LLM + a deterministic fake embedder,
 * proving: uncovered-concept detection, closed-vocabulary enforcement on
 * generation, Stage-B semantic dedup actually dropping a near-dup, provenance +
 * a CardGenerated event on every stored card, local-only embeddings, and the
 * dirty-flag trigger draining in batch.
 */
interface SqliteLike extends GenerationDb {
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

const DUP = "DUPLICATE_MARKER";

/** Deterministic embedder: a card whose text carries DUP collapses onto the
 *  same vector as the existing hashmap-lookup card; everything else is
 *  orthogonal to it (cosine 0), so only the marked card can be a semantic dup. */
function fakeEmbedder(): Embedder {
  return {
    model: "fake",
    dimension: 3,
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((t) => {
        if (t.includes(DUP)) return Float32Array.from([1, 0, 0]);
        let h = 0;
        for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 997;
        const a = (h / 997) * Math.PI;
        return Float32Array.from([0, Math.cos(a), Math.sin(a)]); // orthogonal to [1,0,0]
      });
    },
  };
}

function insertExistingCard(db: SqliteLike, id: string, concept: string, topicId: string): void {
  db.prepare(
    `INSERT INTO cards(id,topic_id,type,front,back,reps,lapses,state,origin,source_hash,dirty,created_at,updated_at)
     VALUES(?,?,?,?,?,0,0,0,'seed',?,1,1,1)`,
  ).run(id, topicId, "plain-recall", `front-${id}`, `back-${id}`, `hash-${id}`);
  db.prepare(`INSERT INTO card_concepts(card_id,concept_id) VALUES(?,?)`).run(id, concept);
}

const TOPIC = "two-pointers";
const vocab: TopicVocabulary = {
  topicId: TOPIC,
  topicName: "Two Pointers",
  conceptIds: new Set(["hashmap-lookup", "complement-trick", "overflow"]),
  concepts: [
    { id: "hashmap-lookup" },
    { id: "complement-trick", description: "store complements seen so far" },
    { id: "overflow" },
  ],
};

/** LLM output: one clean card per uncovered concept, one invented-tag card
 *  (closed-vocab violation), and one near-duplicate of the existing card. */
const llm: GenerationClient = {
  isConfigured: () => true,
  generate: async () =>
    JSON.stringify([
      { type: "pattern-trigger", front: "sorted array, find pair", back: "two pointers", concepts: ["complement-trick"] },
      { type: "plain-recall", front: "overflow guard?", back: "use lo + (hi-lo)/2", concepts: ["overflow"] },
      { type: "plain-recall", front: "invented", back: "x", concepts: ["totally-made-up"] },
      { type: "plain-recall", front: `${DUP} hashmap lookup cost`, back: "O(1)", concepts: ["complement-trick", "hashmap-lookup"] },
    ]),
};

function makeService(db: SqliteLike): CardGenerationService {
  return new CardGenerationService({
    db,
    llm,
    embedder: fakeEmbedder(),
    resolveVocabulary: (id) => (id === TOPIC ? vocab : undefined),
    loadNotes: () => ({
      excerpts: [{ title: "Two Pointers", excerpt: "I first reached for nested loops" }],
      noteVersion: "note-v1",
    }),
    modelVersion: "qwen2.5",
  });
}

function setup(db: SqliteLike): void {
  db.prepare(`INSERT INTO topics(id,name,updated_at) VALUES(?,?,1)`).run(TOPIC, "Two Pointers");
  // Existing card covers hashmap-lookup; its vector is the dup target.
  insertExistingCard(db, "E1", "hashmap-lookup", TOPIC);
  upsertEmbedding(db, { cardId: "E1", model: "fake", vector: Float32Array.from([1, 0, 0]), sourceHash: "hash-E1" });
}

describe.skipIf(!DatabaseSync)("Stage-5 generation pipeline (§4, §5, §8, §9)", () => {
  it("detects the coverage gap from the closed vocabulary (§4)", () => {
    const db = freshDb();
    setup(db);
    const cov = computeCoverage(db, TOPIC, vocab.conceptIds);
    expect(cov.uncovered.sort()).toEqual(["complement-trick", "overflow"]);
    expect(cov.covered).toBe(1);
    expect(cov.total).toBe(3);
  });

  it("generates only for uncovered concepts, enforces closed vocab, dedups, and stamps provenance", async () => {
    const db = freshDb();
    setup(db);
    const report = await makeService(db).generateForTopic(TOPIC, { clearDirty: true });

    // Targeted the two uncovered concepts.
    expect(report.uncovered.sort()).toEqual(["complement-trick", "overflow"]);
    // The invented-tag card was stripped by the closed-vocabulary check (§4).
    expect(report.droppedBySanitize).toBeGreaterThanOrEqual(1);
    // The DUP card collided with E1 on hashmap-lookup + cosine 1 → Stage B (§6).
    expect(report.droppedByDedup).toBe(1);
    // The two clean cards were stored.
    expect(report.stored).toBe(2);

    // §4: no invented tag ever reached the junction table.
    const tags = db.prepare(`SELECT DISTINCT concept_id FROM card_concepts`).all().map((r) => String(r.concept_id));
    expect(tags).not.toContain("totally-made-up");

    // §8: every generated card carries provenance.
    const gen = db
      .prepare(`SELECT origin, model_version, prompt_version, note_version, source_hash FROM cards WHERE origin='generated'`)
      .all();
    expect(gen).toHaveLength(2);
    for (const c of gen) {
      expect(c.origin).toBe("generated");
      expect(c.model_version).toBe("qwen2.5");
      expect(c.prompt_version).toBe("gen-v1");
      expect(c.note_version).toBe("note-v1");
      expect(String(c.source_hash)).toMatch(/^[0-9a-f]{64}$/);
    }

    // §9: a CardGenerated event per stored card.
    const events = db.prepare(`SELECT COUNT(*) AS n FROM card_events WHERE type='CardGenerated'`).get() as { n: number };
    expect(Number(events.n)).toBe(2);

    // §6: each stored card got a local embedding (never synced).
    const embs = db.prepare(`SELECT COUNT(*) AS n FROM card_embeddings WHERE model='fake'`).get() as { n: number };
    expect(Number(embs.n)).toBe(3); // E1 + 2 generated

    // Coverage is now driven up — both target concepts covered.
    const cov = computeCoverage(db, TOPIC, vocab.conceptIds);
    expect(cov.uncovered).toEqual([]);

    // Dirty flag cleared after the run (§5).
    expect(getTopicGeneration(db, TOPIC)?.dirty).toBe(false);
  });

  it("is a no-op (no inline generation) until the batch job drains the dirty queue (§5)", async () => {
    const db = freshDb();
    setup(db);

    // Marking dirty does NOT generate anything by itself.
    markTopicDirty(db, TOPIC, "note-v1");
    const before = db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE origin='generated'`).get() as { n: number };
    expect(Number(before.n)).toBe(0);
    expect(listDirtyTopics(db).map((d) => d.topicId)).toEqual([TOPIC]);

    // The batch job processes every dirty topic once and clears the flag.
    const reports = await makeService(db).generateForDirtyTopics();
    expect(reports).toHaveLength(1);
    expect(reports[0]!.stored).toBe(2);
    expect(listDirtyTopics(db)).toEqual([]);
  });

  it("skips cleanly when the topic is already fully covered", async () => {
    const db = freshDb();
    db.prepare(`INSERT INTO topics(id,name,updated_at) VALUES(?,?,1)`).run(TOPIC, "Two Pointers");
    insertExistingCard(db, "E1", "hashmap-lookup", TOPIC);
    insertExistingCard(db, "E2", "complement-trick", TOPIC);
    insertExistingCard(db, "E3", "overflow", TOPIC);
    const report = await makeService(db).generateForTopic(TOPIC);
    expect(report.skipped).toBe("fully-covered");
    expect(report.stored).toBe(0);
  });
});
