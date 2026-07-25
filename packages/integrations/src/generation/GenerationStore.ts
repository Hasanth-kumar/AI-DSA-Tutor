/**
 * Generation persistence + the dirty-flag trigger queue (design §4, §5, §8, §9).
 *
 * Talks to the same tiny binding-free DB surface used by the seed/embedding
 * stores, so it runs against better-sqlite3 (prod) and node:sqlite (tests) and
 * never imports a native driver. It owns three things:
 *   - **Coverage-gap reads** (§4): which closed-vocabulary concepts have no card.
 *   - **Store-with-provenance + event** (§8/§9): insert generated cards, their
 *     concept links, and a `CardGenerated` event, idempotently in one txn.
 *   - **The dirty queue** (§5): mark a topic dirty on note change, drain it in a
 *     batch job, clear it after a run. Generation never runs inline on the edit.
 *
 * It deliberately imports no sync target and no embedding logic (§6/§10): vectors
 * are upserted separately by the service after the card rows exist (FK order).
 */
import { randomUUID } from "node:crypto";
import type { SqliteLike } from "../sqlite/sqlite-like.js";
import type { GeneratedCardRow } from "./generation.js";

/** Per-topic coverage snapshot (§4): the deterministic generation input. */
export interface CoverageReport {
  topicId: string;
  total: number;
  covered: number;
  /** Concept ids with zero non-suspended cards — the generation target list. */
  uncovered: string[];
  /** concept_id → current non-suspended card count (for the per-concept cap). */
  counts: Map<string, number>;
}

/**
 * Compute the coverage gap for a topic against its closed vocabulary (§4).
 * Coverage = concept ids with ≥1 non-suspended card. Suspended cards do not
 * count toward coverage (a suspended card is not really "covering" anything).
 * Returns the uncovered set (the generation target) and current per-concept
 * counts so the caller can respect the cap.
 */
export function computeCoverage(
  db: SqliteLike,
  topicId: string,
  knownConcepts: Iterable<string>,
): CoverageReport {
  const counts = new Map<string, number>();
  const rows = db
    .prepare(
      `SELECT cc.concept_id AS concept_id, COUNT(*) AS n
         FROM card_concepts cc
         JOIN cards c ON c.id = cc.card_id
        WHERE c.topic_id = ? AND c.suspended = 0
        GROUP BY cc.concept_id`,
    )
    .all(topicId) as Array<{ concept_id: string; n: number }>;
  for (const r of rows) counts.set(r.concept_id, Number(r.n));

  const all = [...knownConcepts];
  const uncovered = all.filter((id) => (counts.get(id) ?? 0) === 0);
  return {
    topicId,
    total: all.length,
    covered: all.length - uncovered.length,
    uncovered,
    counts,
  };
}

/** Fronts of existing (non-suspended) cards for a topic — Stage-A dedup (§5). */
export function existingFronts(db: SqliteLike, topicId: string, limit = 200): string[] {
  const rows = db
    .prepare(
      `SELECT front FROM cards WHERE topic_id = ? AND suspended = 0 ORDER BY created_at LIMIT ?`,
    )
    .all(topicId, limit) as Array<{ front: string }>;
  return rows.map((r) => r.front);
}

const INSERT_CARD = `
INSERT OR IGNORE INTO cards (
  id, topic_id, type, front, back, note_ref,
  suspended, leech,
  stability, difficulty, due, last_review, reps, lapses, state,
  elapsed_days, scheduled_days, learning_steps,
  origin, source_hash, model_version, prompt_version, note_version, seed_version,
  notion_page_id, dirty, synced_at, created_at, updated_at
) VALUES (
  ?, ?, ?, ?, ?, ?,
  0, 0,
  NULL, NULL, ?, NULL, 0, 0, 0,
  0, 0, 0,
  'generated', ?, ?, ?, ?, NULL,
  NULL, 1, NULL, ?, ?
)`;

const INSERT_CONCEPT = `INSERT OR IGNORE INTO card_concepts (card_id, concept_id) VALUES (?, ?)`;
const INSERT_EVENT = `INSERT INTO card_events (id, card_id, type, payload, created_at) VALUES (?, ?, 'CardGenerated', ?, ?)`;

export interface StoreResult {
  inserted: number;
  conceptLinks: number;
  events: number;
}

/**
 * Persist generated cards with provenance (§8) + a `CardGenerated` event each
 * (§9), in a single transaction. Idempotent (INSERT OR IGNORE on the UUID), so a
 * re-run never duplicates or resets a card. Concept links + events are only
 * written for cards actually inserted this run.
 */
export function storeGeneratedCards(
  db: SqliteLike,
  rows: GeneratedCardRow[],
  now: number = Date.now(),
  eventIdFactory: () => string = randomUUID,
): StoreResult {
  const cardStmt = db.prepare(INSERT_CARD);
  const conceptStmt = db.prepare(INSERT_CONCEPT);
  const eventStmt = db.prepare(INSERT_EVENT);

  let inserted = 0;
  let conceptLinks = 0;
  let events = 0;

  db.exec("BEGIN");
  try {
    for (const r of rows) {
      const res = cardStmt.run(
        r.id,
        r.topic_id,
        r.type,
        r.front,
        r.back,
        r.note_ref,
        r.due,
        r.source_hash,
        r.model_version,
        r.prompt_version,
        r.note_version,
        r.created_at,
        r.updated_at,
      ) as { changes?: number | bigint };
      if (Number(res?.changes ?? 0) === 0) continue;
      inserted += 1;

      for (const conceptId of new Set(r.concepts)) {
        conceptStmt.run(r.id, conceptId);
        conceptLinks += 1;
      }

      const payload = JSON.stringify({
        origin: r.origin,
        model_version: r.model_version,
        prompt_version: r.prompt_version,
        note_version: r.note_version,
        source_hash: r.source_hash,
        concepts: [...new Set(r.concepts)],
      });
      eventStmt.run(eventIdFactory(), r.id, payload, now);
      events += 1;
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { inserted, conceptLinks, events };
}

// ---------------------------------------------------------------------------
// Dirty-flag trigger queue (§5) — the trigger is the flag, never the edit.
// ---------------------------------------------------------------------------

export interface DirtyTopic {
  topicId: string;
  noteHash: string | null;
  dirtySince: number | null;
}

const MARK_DIRTY = `
INSERT INTO topic_generation (topic_id, dirty, dirty_since, note_hash)
VALUES (?, 1, ?, ?)
ON CONFLICT(topic_id) DO UPDATE SET
  dirty = 1,
  dirty_since = COALESCE(topic_generation.dirty_since, excluded.dirty_since),
  note_hash = excluded.note_hash
`;

/**
 * Mark a topic dirty (§5). Called when a note for the topic changes. Repeated
 * calls collapse into one pending unit of work and preserve the original
 * `dirty_since` so the debounce window starts at the *first* edit, letting the
 * batch job merge several edits into a single generation run.
 */
export function markTopicDirty(
  db: SqliteLike,
  topicId: string,
  noteHash: string | null = null,
  now: number = Date.now(),
): void {
  db.prepare(MARK_DIRTY).run(topicId, now, noteHash);
}

const CLEAR_DIRTY = `
INSERT INTO topic_generation (topic_id, dirty, dirty_since, last_generated_at, last_generated_hash)
VALUES (?, 0, NULL, ?, ?)
ON CONFLICT(topic_id) DO UPDATE SET
  dirty = 0,
  dirty_since = NULL,
  last_generated_at = excluded.last_generated_at,
  last_generated_hash = excluded.last_generated_hash
`;

/** Clear the dirty flag after a successful generation run (§5). */
export function clearTopicDirty(
  db: SqliteLike,
  topicId: string,
  generatedHash: string | null = null,
  now: number = Date.now(),
): void {
  db.prepare(CLEAR_DIRTY).run(topicId, now, generatedHash);
}

/** Topics awaiting generation, oldest-dirty first (the batch job's work list). */
export function listDirtyTopics(db: SqliteLike): DirtyTopic[] {
  const rows = db
    .prepare(
      `SELECT topic_id, note_hash, dirty_since
         FROM topic_generation
        WHERE dirty = 1
        ORDER BY COALESCE(dirty_since, 0), topic_id`,
    )
    .all() as Array<{ topic_id: string; note_hash: string | null; dirty_since: number | null }>;
  return rows.map((r) => ({
    topicId: r.topic_id,
    noteHash: r.note_hash,
    dirtySince: r.dirty_since,
  }));
}

/** Read the generation bookkeeping row for a topic (or undefined). */
export function getTopicGeneration(
  db: SqliteLike,
  topicId: string,
): { dirty: boolean; noteHash: string | null; lastGeneratedHash: string | null } | undefined {
  const row = db
    .prepare(
      `SELECT dirty, note_hash, last_generated_hash FROM topic_generation WHERE topic_id = ?`,
    )
    .get(topicId) as
    | { dirty: number; note_hash: string | null; last_generated_hash: string | null }
    | undefined;
  if (!row) return undefined;
  return {
    dirty: Number(row.dirty) === 1,
    noteHash: row.note_hash,
    lastGeneratedHash: row.last_generated_hash,
  };
}
