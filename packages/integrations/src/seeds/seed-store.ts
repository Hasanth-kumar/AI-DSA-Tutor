/**
 * Seed persistence (design §2 / §8 / §15.2).
 *
 * Turns validated {@link SeedTopic}s into `cards` + `card_concepts` rows and
 * inserts them. Cards enter as `origin='seed'` with the curated `seed_version`
 * and a content `source_hash` for provenance (§8), and start in FSRS **New**
 * state (state=0, reps=0, lapses=0) due immediately so warm-up/review can pick
 * them up once Stage 3 wires the engine.
 *
 * Inserts are **idempotent and non-destructive**: re-running the seed uses
 * INSERT OR IGNORE keyed on the card's UUID, so a card a learner has already
 * reviewed never has its FSRS state reset. The store talks to a tiny
 * {@link SeedDb} interface satisfied by both better-sqlite3 (production) and
 * node:sqlite (tests) — it deliberately does NOT import the Notion client or
 * any sync target (§10).
 */
import { createHash } from "node:crypto";
import type { SeedTopic } from "./seed-loader.js";

/** Minimal statement surface shared by better-sqlite3 and node:sqlite. */
export interface SeedStatement {
  run(...params: unknown[]): unknown;
}
/** Minimal DB surface shared by better-sqlite3 and node:sqlite. */
export interface SeedDb {
  exec(sql: string): void;
  prepare(sql: string): SeedStatement;
}

/** A `cards` row ready for insertion (positional-friendly plain object). */
export interface SeedCardRow {
  id: string;
  topic_id: string;
  type: string;
  front: string;
  back: string;
  note_ref: string | null;
  origin: "seed";
  seed_version: number;
  source_hash: string;
  due: number;
  created_at: number;
  updated_at: number;
}

/** A `card_concepts` junction row. */
export interface SeedConceptRow {
  card_id: string;
  concept_id: string;
}

export interface SeedResult {
  cardsInserted: number;
  cardsSkipped: number;
  conceptLinks: number;
  topics: number;
}

/** Content hash for provenance + future dedup identity (§8). */
export function cardSourceHash(type: string, front: string, back: string): string {
  return createHash("sha256").update(`${type}\n${front}\n${back}`).digest("hex");
}

/**
 * Pure transform: validated seed topics → flat card + concept rows. No I/O, so
 * it is fully unit-testable. `now` is injected for deterministic timestamps.
 */
export function buildSeedRows(
  topics: SeedTopic[],
  now: number = Date.now(),
): { cards: SeedCardRow[]; concepts: SeedConceptRow[] } {
  const cards: SeedCardRow[] = [];
  const concepts: SeedConceptRow[] = [];

  for (const topic of topics) {
    for (const card of topic.cards) {
      cards.push({
        id: card.id,
        topic_id: topic.topicId,
        type: card.type,
        front: card.front,
        back: card.back,
        note_ref: card.note_ref ?? null,
        origin: "seed",
        seed_version: topic.seedVersion,
        source_hash: cardSourceHash(card.type, card.front, card.back),
        due: now, // New cards are due immediately.
        created_at: now,
        updated_at: now,
      });
      // De-duplicate tags within a card defensively.
      for (const conceptId of new Set(card.concepts)) {
        concepts.push({ card_id: card.id, concept_id: conceptId });
      }
    }
  }

  return { cards, concepts };
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
  ?, ?, NULL, NULL, NULL, ?,
  NULL, 1, NULL, ?, ?
)`;

const INSERT_CONCEPT = `INSERT OR IGNORE INTO card_concepts (card_id, concept_id) VALUES (?, ?)`;

/**
 * Insert the curated baseline into SQLite. Idempotent (INSERT OR IGNORE on the
 * card UUID) and wrapped in a single transaction.
 */
export function seedTopics(
  db: SeedDb,
  topics: SeedTopic[],
  now: number = Date.now(),
): SeedResult {
  const { cards, concepts } = buildSeedRows(topics, now);

  const existing = new Set<string>();
  const cardStmt = db.prepare(INSERT_CARD);
  const conceptStmt = db.prepare(INSERT_CONCEPT);

  let cardsInserted = 0;

  db.exec("BEGIN");
  try {
    for (const c of cards) {
      const res = cardStmt.run(
        c.id,
        c.topic_id,
        c.type,
        c.front,
        c.back,
        c.note_ref,
        c.due,
        c.origin,
        c.source_hash,
        c.seed_version,
        c.created_at,
        c.updated_at,
      ) as { changes?: number | bigint };
      const changes = Number(res?.changes ?? 0);
      if (changes > 0) {
        cardsInserted += 1;
        existing.add(c.id);
      }
    }
    // Only link concepts for cards that were actually inserted this run, so a
    // re-seed doesn't churn the junction for cards already present.
    for (const link of concepts) {
      if (existing.has(link.card_id)) {
        conceptStmt.run(link.card_id, link.concept_id);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    cardsInserted,
    cardsSkipped: cards.length - cardsInserted,
    conceptLinks: concepts.filter((l) => existing.has(l.card_id)).length,
    topics: topics.length,
  };
}
