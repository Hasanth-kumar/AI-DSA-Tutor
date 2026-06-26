/**
 * Semantic duplicate detection (design §6). Pure and dependency-free.
 *
 * The duplicate rule is **concept-tag match + high cosine** — NOT raw question
 * text similarity. We embed concept + answer + question (see
 * {@link cardEmbeddingText}) so "same answer, different wording" is caught, and
 * we additionally require a shared concept tag so two genuinely different facts
 * that happen to phrase similarly are not collapsed.
 *
 * Matching is brute-force cosine over the candidate set (sub-millisecond for a
 * few thousand cards) — there is no vector DB. The threshold is configurable
 * (default ~0.85, tuned against the golden set in `golden-set.ts`), never a
 * magic number inlined at a call site.
 */
import { cosineSimilarity } from "./vector.js";

/**
 * Default cosine threshold for "duplicate" (§6). MiniLM/nomic similarities run
 * high, so ~0.85 is the starting point; re-tune against the golden set whenever
 * the embedding model changes. Exported so it is configured in exactly one place.
 */
export const DEFAULT_DEDUP_THRESHOLD = 0.85;

export interface DedupConfig {
  /** Cosine at or above which two concept-matched cards are duplicates. */
  threshold: number;
  /**
   * Require a shared concept tag in addition to high cosine (§6). On by
   * default; can be relaxed for topics that are not yet tagged.
   */
  requireConceptOverlap: boolean;
}

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  threshold: DEFAULT_DEDUP_THRESHOLD,
  requireConceptOverlap: true,
};

/** A card reduced to what dedup needs: id, its vector, and its concept tags. */
export interface DedupCandidate {
  id: string;
  vector: Float32Array;
  concepts: readonly string[];
}

export interface DedupVerdict {
  duplicate: boolean;
  similarity: number;
  /** Whether the two cards share at least one concept tag. */
  conceptMatch: boolean;
}

export interface DedupMatch extends DedupVerdict {
  /** The id of the existing card the candidate duplicates. */
  matchId: string;
}

/** True iff the two tag lists share at least one concept id. */
export function conceptsOverlap(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  for (const t of b) {
    if (set.has(t)) return true;
  }
  return false;
}

/**
 * Build the text that gets embedded for a card. Combines concept tags, the
 * answer (back) and the question (front) so the vector captures *meaning incl.
 * the answer* — this is what makes "same answer, different wording" dedup work
 * (§6). Type is included so a cloze and a plain-recall of the same fact stay
 * comparable.
 */
export function cardEmbeddingText(card: {
  type?: string;
  front: string;
  back: string;
  concepts?: readonly string[];
}): string {
  const tags = card.concepts?.length ? `concepts: ${[...card.concepts].sort().join(", ")}` : "";
  return [tags, `type: ${card.type ?? ""}`, `answer: ${card.back}`, `question: ${card.front}`]
    .filter((s) => s.length > 0)
    .join("\n");
}

/** Evaluate whether two candidates are duplicates under the given config. */
export function isDuplicatePair(
  a: DedupCandidate,
  b: DedupCandidate,
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): DedupVerdict {
  const similarity = cosineSimilarity(a.vector, b.vector);
  const conceptMatch = conceptsOverlap(a.concepts, b.concepts);
  const conceptOk = config.requireConceptOverlap ? conceptMatch : true;
  return {
    duplicate: conceptOk && similarity >= config.threshold,
    similarity,
    conceptMatch,
  };
}

/**
 * Brute-force search: return every existing card the candidate duplicates,
 * sorted by descending similarity (closest first). A card never matches itself.
 */
export function findDuplicates(
  candidate: DedupCandidate,
  existing: readonly DedupCandidate[],
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): DedupMatch[] {
  const matches: DedupMatch[] = [];
  for (const other of existing) {
    if (other.id === candidate.id) continue;
    const verdict = isDuplicatePair(candidate, other, config);
    if (verdict.duplicate) {
      matches.push({ ...verdict, matchId: other.id });
    }
  }
  matches.sort((x, y) => y.similarity - x.similarity);
  return matches;
}

export interface DedupBatchResult {
  /** Candidates kept — unique against `existing` and against each other. */
  unique: DedupCandidate[];
  /** Candidates dropped as duplicates, each with the id it collided with. */
  dropped: Array<{ candidate: DedupCandidate; matchId: string; similarity: number }>;
}

/**
 * Stage-B dedup for the §5 generation pipeline: filter a freshly generated batch
 * against the existing bank AND against earlier items in the same batch, so a
 * run never inserts two near-identical new cards. Pure — the LLM's "I didn't
 * repeat" claim (Stage A) is never trusted alone.
 */
export function dedupeBatch(
  candidates: readonly DedupCandidate[],
  existing: readonly DedupCandidate[],
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): DedupBatchResult {
  const unique: DedupCandidate[] = [];
  const dropped: DedupBatchResult["dropped"] = [];
  const pool: DedupCandidate[] = [...existing];

  for (const candidate of candidates) {
    const matches = findDuplicates(candidate, pool, config);
    if (matches.length > 0) {
      dropped.push({
        candidate,
        matchId: matches[0]!.matchId,
        similarity: matches[0]!.similarity,
      });
    } else {
      unique.push(candidate);
      pool.push(candidate);
    }
  }

  return { unique, dropped };
}
