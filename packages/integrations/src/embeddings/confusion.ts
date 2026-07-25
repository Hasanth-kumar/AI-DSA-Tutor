/**
 * Confusion-pair detection (design §3, §6). Finds cards from DIFFERENT concept
 * tags whose vectors are close enough to be confusing but below the dedup
 * threshold — i.e. things the learner is likely to mix up. The generation
 * pipeline uses these pairs to produce "confusion-pair" discrimination cards.
 *
 * Canonical example: "two-pointers" vs "sliding-window" — high cosine because
 * both involve an index pair scanning a sequence, but the invariant and
 * termination conditions differ. A confusion-pair card on this pairing forces
 * deliberate discrimination ("when do you use X instead of Y?").
 *
 * Detection uses the same brute-force cosine the dedup utility uses (§6) —
 * no vector DB needed. O(n²) over typically a few hundred cards is
 * sub-millisecond. The confusion zone is strictly BELOW the dedup threshold:
 * if two cards are above the dedup threshold and share a concept, they are
 * near-duplicates, not useful confusion pairs.
 */
import type { SqliteLike } from "../sqlite/sqlite-like.js";
import { cosineSimilarity } from "./vector.js";
import { deserializeVector } from "./vector.js";

export interface ConfusionPairConfig {
  /**
   * Lower bound (inclusive) of the cosine confusion zone. Cards closer than
   * `max` but at or above `min` are "confusingly similar."
   * Default 0.65 (clearly related; below this is just vaguely topical).
   */
  minSimilarity: number;
  /**
   * Upper bound (exclusive) of the confusion zone. Should be BELOW (or equal
   * to) the dedup threshold so true duplicates aren't surfaced as pairs.
   * Default 0.84 (just below the 0.85 dedup threshold).
   */
  maxSimilarity: number;
  /**
   * Maximum number of pairs to return (sorted by similarity descending, so
   * the most confusable pairs come first). Default 10.
   */
  limit: number;
}

export const DEFAULT_CONFUSION_CONFIG: ConfusionPairConfig = {
  minSimilarity: 0.65,
  maxSimilarity: 0.84,
  limit: 10,
};

/** A candidate with the fields needed for confusion detection. */
export interface ConfusionCandidate {
  id: string;
  vector: Float32Array;
  /** Concept tags for this card. */
  concepts: readonly string[];
}

export interface ConfusionPair {
  /** Front of the "A" card in the pair. */
  frontA: string;
  /** Front of the "B" card in the pair. */
  frontB: string;
  /** Concept tags of card A. */
  conceptsA: readonly string[];
  /** Concept tags of card B. */
  conceptsB: readonly string[];
  /** Cosine similarity between the two. */
  similarity: number;
}

/**
 * From a flat list of candidates (each with id/vector/concepts), find pairs
 * whose cosine falls inside [minSimilarity, maxSimilarity) AND whose concept
 * sets do NOT overlap (overlapping concepts + high cosine = near-duplicate, not
 * a useful confusion pair).
 *
 * This is the pure, I/O-free inner loop — the DB query that loads candidates
 * is in {@link findCrossConceptPairs}.
 */
export function detectConfusionPairs(
  candidates: readonly ConfusionCandidate[],
  fronts: Map<string, string>,
  config: ConfusionPairConfig = DEFAULT_CONFUSION_CONFIG,
): ConfusionPair[] {
  const pairs: ConfusionPair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;

      // Skip if they share any concept — that's near-duplicate territory, not confusion.
      const setA = new Set(a.concepts);
      const overlaps = b.concepts.some((c) => setA.has(c));
      if (overlaps) continue;

      const sim = cosineSimilarity(a.vector, b.vector);
      if (sim >= config.minSimilarity && sim < config.maxSimilarity) {
        pairs.push({
          frontA: fronts.get(a.id) ?? a.id,
          frontB: fronts.get(b.id) ?? b.id,
          conceptsA: a.concepts,
          conceptsB: b.concepts,
          similarity: sim,
        });
      }
    }
  }

  // Most confusable pairs first, then cap.
  pairs.sort((x, y) => y.similarity - x.similarity);
  return pairs.slice(0, config.limit);
}

// ---------------------------------------------------------------------------
// DB-backed variant (same interface as EmbeddingStore — works with any
// binding-free SqliteLike that satisfies `prepare().all()`).
// ---------------------------------------------------------------------------

/**
 * Load embeddings from `card_embeddings` + concept tags, optionally filtered to
 * ONE topic (the "home" side), then detect confusion pairs against the full
 * cross-concept pool. If `topicId` is provided, at least one card in each pair
 * is from that topic — useful for a per-topic generation run that wants to know
 * what its concepts are confusable with.
 *
 * Returns pairs sorted by descending similarity (most confusable first).
 */
export function findCrossConceptPairs(
  db: SqliteLike,
  model: string,
  opts: {
    topicId?: string;
    config?: ConfusionPairConfig;
  } = {},
): ConfusionPair[] {
  const cfg = opts.config ?? DEFAULT_CONFUSION_CONFIG;
  const SEP = "|";

  // Load all embedded cards (or just those of the topic, plus the rest we need
  // to compare against). For a per-topic run we want a cross-topic comparison:
  // load the topic's cards + all other cards; the topic filter is applied AFTER
  // pairing so we only keep pairs where at least one card is in the topic.
  const rows = (
    db
      .prepare(
        `SELECT e.card_id AS id, e.vector AS vector, c.front AS front,
                GROUP_CONCAT(cc.concept_id, '${SEP}') AS concepts,
                c.topic_id AS topic_id
           FROM card_embeddings e
           JOIN cards c ON c.id = e.card_id
           LEFT JOIN card_concepts cc ON cc.card_id = e.card_id
          WHERE e.model = ? AND c.suspended = 0
          GROUP BY e.card_id`,
      )
      .all(model) as Array<{
      id: string;
      vector: Uint8Array;
      front: string;
      concepts: string | null;
      topic_id: string | null;
    }>
  );

  const candidates: ConfusionCandidate[] = rows.map((r) => ({
    id: r.id,
    vector: deserializeVector(r.vector),
    concepts: r.concepts ? r.concepts.split(SEP).filter((s) => s.length > 0) : [],
  }));

  const fronts = new Map<string, string>(rows.map((r) => [r.id, r.front]));
  const topicIds = new Map<string, string | null>(rows.map((r) => [r.id, r.topic_id]));

  let pairs = detectConfusionPairs(candidates, fronts, cfg);

  // If a topicId was requested, filter to pairs where at least one card is in
  // that topic. This gives the generation pipeline the confusion context for the
  // topic being expanded.
  if (opts.topicId) {
    const tid = opts.topicId;
    pairs = pairs.filter(
      (p) =>
        rows.some((r) => r.front === p.frontA && topicIds.get(r.id) === tid) ||
        rows.some((r) => r.front === p.frontB && topicIds.get(r.id) === tid),
    );
  }

  return pairs;
}
