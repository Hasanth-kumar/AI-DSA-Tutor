/**
 * Local embedding persistence (design §6, §8). Reads/writes the `card_embeddings`
 * blob table and assembles {@link DedupCandidate}s by joining cards + concept
 * tags + vectors. Talks to the same tiny binding-free DB interface used by the
 * seed store, so it runs against better-sqlite3 (prod) and node:sqlite (tests)
 * and never imports a native driver. Embeddings are LOCAL ONLY — this module has
 * no concept of a sync target (§6).
 */
import { serializeVector, deserializeVector } from "./vector.js";
import type { DedupCandidate } from "./dedup.js";

export interface EmbeddingStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
export interface EmbeddingDb {
  exec(sql: string): void;
  prepare(sql: string): EmbeddingStatement;
}

export interface StoredEmbedding {
  cardId: string;
  model: string;
  dim: number;
  vector: Float32Array;
  sourceHash: string;
}

/** A card that has no current vector for `model` (missing or content-stale). */
export interface CardNeedingEmbedding {
  id: string;
  type: string;
  front: string;
  back: string;
  sourceHash: string | null;
  concepts: string[];
}

// GROUP_CONCAT separator. A flat concept id is lowercase/hyphenated and never
// contains a pipe, so "|" round-trips safely. (A literal "" would make split()
// explode the joined string into individual characters.)
const SEP = "|";

function splitConcepts(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  return value.split(SEP).filter((s) => s.length > 0);
}

const UPSERT = `
INSERT INTO card_embeddings (card_id, model, dim, vector, source_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(card_id) DO UPDATE SET
  model = excluded.model,
  dim = excluded.dim,
  vector = excluded.vector,
  source_hash = excluded.source_hash,
  updated_at = excluded.updated_at
`;

/** Insert or replace a card's vector (idempotent; preserves created_at). */
export function upsertEmbedding(
  db: EmbeddingDb,
  params: {
    cardId: string;
    model: string;
    vector: Float32Array;
    sourceHash: string;
    now?: number;
  },
): void {
  const now = params.now ?? Date.now();
  db.prepare(UPSERT).run(
    params.cardId,
    params.model,
    params.vector.length,
    serializeVector(params.vector),
    params.sourceHash,
    now,
    now,
  );
}

/** Fetch one stored embedding, with its vector deserialized. */
export function getEmbedding(db: EmbeddingDb, cardId: string): StoredEmbedding | undefined {
  const row = db
    .prepare(
      `SELECT card_id, model, dim, vector, source_hash FROM card_embeddings WHERE card_id = ?`,
    )
    .get(cardId) as
    | { card_id: string; model: string; dim: number; vector: Uint8Array; source_hash: string }
    | undefined;
  if (!row) return undefined;
  return {
    cardId: row.card_id,
    model: row.model,
    dim: row.dim,
    vector: deserializeVector(row.vector),
    sourceHash: row.source_hash,
  };
}

/**
 * Cards whose vector is missing or stale for `model` — i.e. no embedding row, a
 * different model, or a `source_hash` that no longer matches the card content.
 * This is the work list for the embed sweep (and re-embed after an edit).
 */
export function cardsNeedingEmbedding(
  db: EmbeddingDb,
  model: string,
): CardNeedingEmbedding[] {
  const rows = db
    .prepare(
      `SELECT c.id AS id, c.type AS type, c.front AS front, c.back AS back,
              c.source_hash AS source_hash,
              GROUP_CONCAT(cc.concept_id, '${SEP}') AS concepts
         FROM cards c
         LEFT JOIN card_embeddings e ON e.card_id = c.id
         LEFT JOIN card_concepts cc ON cc.card_id = c.id
        WHERE c.suspended = 0
          AND (e.card_id IS NULL
               OR e.model != ?
               OR e.source_hash IS NULL
               OR e.source_hash != c.source_hash)
        GROUP BY c.id`,
    )
    .all(model) as Array<{
    id: string;
    type: string;
    front: string;
    back: string;
    source_hash: string | null;
    concepts: unknown;
  }>;
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    front: r.front,
    back: r.back,
    sourceHash: r.source_hash,
    concepts: splitConcepts(r.concepts),
  }));
}

/**
 * Load {@link DedupCandidate}s (id + vector + concept tags) for every card that
 * has a vector for `model`, optionally scoped to a topic. This is the existing
 * bank the §5 generation pipeline dedupes new cards against.
 */
export function loadDedupCandidates(
  db: EmbeddingDb,
  model: string,
  opts: { topicId?: string } = {},
): DedupCandidate[] {
  const params: unknown[] = [model];
  let where = `e.model = ?`;
  if (opts.topicId) {
    where += ` AND c.topic_id = ?`;
    params.push(opts.topicId);
  }
  const rows = db
    .prepare(
      `SELECT e.card_id AS card_id, e.vector AS vector,
              GROUP_CONCAT(cc.concept_id, '${SEP}') AS concepts
         FROM card_embeddings e
         JOIN cards c ON c.id = e.card_id
         LEFT JOIN card_concepts cc ON cc.card_id = e.card_id
        WHERE ${where}
        GROUP BY e.card_id`,
    )
    .all(...params) as Array<{ card_id: string; vector: Uint8Array; concepts: unknown }>;
  return rows.map((r) => ({
    id: r.card_id,
    vector: deserializeVector(r.vector),
    concepts: splitConcepts(r.concepts),
  }));
}
