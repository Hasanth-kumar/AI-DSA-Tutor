/**
 * Labelled golden set for the dedup threshold (design §6).
 *
 * A small, version-controlled set of known duplicate / non-duplicate card pairs.
 * Its job: let you re-tune the cosine threshold **objectively** whenever you swap
 * embedding models (MiniLM vs nomic score differently), instead of eyeballing.
 *
 * Split cleanly into:
 *   - the labelled data (`GOLDEN_PAIRS`) — pure text + concept tags + label;
 *   - `scoreGoldenPairs(embedder)` — embeds each pair (needs a real Embedder);
 *   - pure metric math (`evaluateScoredPairs`, `sweepThreshold`) — testable with
 *     synthetic scores, no model required.
 */
import type { Embedder } from "./Embedder.js";
import {
  cardEmbeddingText,
  conceptsOverlap,
  type DedupConfig,
  DEFAULT_DEDUP_CONFIG,
} from "./dedup.js";
import { cosineSimilarity } from "./vector.js";

export interface GoldenCard {
  type?: string;
  front: string;
  back: string;
  concepts: string[];
}

export interface GoldenPair {
  a: GoldenCard;
  b: GoldenCard;
  /** Ground truth: are these two cards duplicates? */
  duplicate: boolean;
  note?: string;
}

/**
 * Hand-labelled DSA flashcard pairs. Positives = genuine duplicates (same fact,
 * different wording / type / concept overlap). Negatives = confusably-close but
 * distinct cards (the classic two-pointers vs sliding-window confusion, same
 * topic different concept, etc.). Add to this set as the bank grows.
 */
export const GOLDEN_PAIRS: GoldenPair[] = [
  // --- Duplicates -----------------------------------------------------------
  {
    duplicate: true,
    note: "same answer, different wording",
    a: {
      type: "plain-recall",
      concepts: ["two-sum-hashmap"],
      front: "What is the time complexity of Two Sum using a hash map?",
      back: "O(n) — one pass storing complements in a hash map.",
    },
    b: {
      type: "plain-recall",
      concepts: ["two-sum-hashmap"],
      front: "Two Sum with a hashmap runs in what big-O time?",
      back: "Linear, O(n): a single scan keeping seen values in a map.",
    },
  },
  {
    duplicate: true,
    note: "pattern-trigger vs plain-recall of the same mapping",
    a: {
      type: "pattern-trigger",
      concepts: ["two-pointers"],
      front: "Sorted array, find a pair summing to a target — which pattern?",
      back: "Two pointers from both ends.",
    },
    b: {
      type: "plain-recall",
      concepts: ["two-pointers"],
      front: "Which technique finds a pair with a given sum in a sorted array?",
      back: "The two-pointer technique (one pointer at each end).",
    },
  },
  {
    duplicate: true,
    note: "cloze vs recall of the same binary-search line",
    a: {
      type: "cloze",
      concepts: ["binary-search-bounds"],
      front: "Binary search midpoint: mid = lo + ____",
      back: "(hi - lo) / 2  (avoids lo+hi overflow)",
    },
    b: {
      type: "plain-recall",
      concepts: ["binary-search-bounds"],
      front: "How do you compute mid in binary search without overflow?",
      back: "mid = lo + (hi - lo) / 2 instead of (lo + hi) / 2.",
    },
  },
  // --- Non-duplicates -------------------------------------------------------
  {
    duplicate: false,
    note: "classic confusion pair — different concepts",
    a: {
      type: "pattern-trigger",
      concepts: ["two-pointers"],
      front: "Find a pair summing to target in a sorted array — pattern?",
      back: "Two pointers.",
    },
    b: {
      type: "pattern-trigger",
      concepts: ["sliding-window"],
      front: "Longest substring without repeating characters — pattern?",
      back: "Sliding window.",
    },
  },
  {
    duplicate: false,
    note: "same topic, different concept",
    a: {
      type: "plain-recall",
      concepts: ["two-sum-hashmap"],
      front: "Space complexity of hash-map Two Sum?",
      back: "O(n) for the hash map.",
    },
    b: {
      type: "plain-recall",
      concepts: ["two-sum-hashmap"],
      front: "Time complexity of hash-map Two Sum?",
      back: "O(n) single pass.",
    },
  },
  {
    duplicate: false,
    note: "different data structures entirely",
    a: {
      type: "plain-recall",
      concepts: ["heap-operations"],
      front: "Time to push onto a binary heap?",
      back: "O(log n).",
    },
    b: {
      type: "plain-recall",
      concepts: ["hashmap-lookup"],
      front: "Average time for a hash-map lookup?",
      back: "O(1).",
    },
  },
];

/** A pair reduced to the two signals the dedup rule uses. */
export interface ScoredPair {
  similarity: number;
  conceptMatch: boolean;
  duplicate: boolean;
}

export interface DedupMetrics {
  threshold: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
}

/**
 * Embed each golden pair with a real {@link Embedder} and reduce it to
 * {@link ScoredPair}. Needs the model runtime; the metric math below does not.
 */
export async function scoreGoldenPairs(
  embedder: Embedder,
  pairs: readonly GoldenPair[] = GOLDEN_PAIRS,
): Promise<ScoredPair[]> {
  const texts: string[] = [];
  for (const p of pairs) {
    texts.push(cardEmbeddingText(p.a), cardEmbeddingText(p.b));
  }
  const vectors = await embedder.embed(texts);
  return pairs.map((p, i) => ({
    similarity: cosineSimilarity(vectors[i * 2]!, vectors[i * 2 + 1]!),
    conceptMatch: conceptsOverlap(p.a.concepts, p.b.concepts),
    duplicate: p.duplicate,
  }));
}

/**
 * Compute precision / recall / F1 / accuracy of the dedup rule over scored pairs
 * at a given config. Pure — feed synthetic {@link ScoredPair}s to test it, or
 * the output of {@link scoreGoldenPairs} to evaluate a real model.
 */
export function evaluateScoredPairs(
  scored: readonly ScoredPair[],
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): DedupMetrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const s of scored) {
    const conceptOk = config.requireConceptOverlap ? s.conceptMatch : true;
    const predicted = conceptOk && s.similarity >= config.threshold;
    if (predicted && s.duplicate) tp++;
    else if (predicted && !s.duplicate) fp++;
    else if (!predicted && !s.duplicate) tn++;
    else fn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const total = tp + fp + tn + fn;
  const accuracy = total === 0 ? 1 : (tp + tn) / total;
  return {
    threshold: config.threshold,
    truePositive: tp,
    falsePositive: fp,
    trueNegative: tn,
    falseNegative: fn,
    precision,
    recall,
    f1,
    accuracy,
  };
}

/**
 * Sweep candidate thresholds and return the metrics for each plus the best by
 * F1 (ties broken by higher accuracy, then lower threshold). This is the
 * objective re-tuning step when an embedding model changes (§6).
 */
export function sweepThreshold(
  scored: readonly ScoredPair[],
  thresholds: readonly number[],
  requireConceptOverlap = DEFAULT_DEDUP_CONFIG.requireConceptOverlap,
): { results: DedupMetrics[]; best: DedupMetrics } {
  const results = thresholds.map((threshold) =>
    evaluateScoredPairs(scored, { threshold, requireConceptOverlap }),
  );
  const best = results.reduce((a, b) => {
    if (b.f1 !== a.f1) return b.f1 > a.f1 ? b : a;
    if (b.accuracy !== a.accuracy) return b.accuracy > a.accuracy ? b : a;
    return b.threshold < a.threshold ? b : a;
  });
  return { results, best };
}
