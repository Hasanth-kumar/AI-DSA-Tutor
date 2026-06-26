import { describe, it, expect } from "vitest";
import type { Embedder } from "./Embedder.js";
import {
  GOLDEN_PAIRS,
  scoreGoldenPairs,
  evaluateScoredPairs,
  sweepThreshold,
  type ScoredPair,
} from "./golden-set.js";
import { conceptsOverlap } from "./dedup.js";

/** Deterministic, dependency-free bag-of-chars embedder for structural tests. */
const fakeEmbedder: Embedder = {
  model: "fake-test",
  dimension: 16,
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(16);
      for (const ch of t) v[ch.charCodeAt(0) % 16] += 1;
      return v;
    });
  },
};

describe("golden set data (§6)", () => {
  it("contains both positive and negative labelled pairs", () => {
    const pos = GOLDEN_PAIRS.filter((p) => p.duplicate).length;
    const neg = GOLDEN_PAIRS.filter((p) => !p.duplicate).length;
    expect(pos).toBeGreaterThanOrEqual(2);
    expect(neg).toBeGreaterThanOrEqual(2);
  });

  it("every pair carries front/back/concepts on both cards", () => {
    for (const p of GOLDEN_PAIRS) {
      for (const c of [p.a, p.b]) {
        expect(c.front.length).toBeGreaterThan(0);
        expect(c.back.length).toBeGreaterThan(0);
        expect(Array.isArray(c.concepts)).toBe(true);
      }
    }
  });
});

describe("scoreGoldenPairs (§6)", () => {
  it("reduces each pair to similarity + true conceptMatch + label", async () => {
    const scored = await scoreGoldenPairs(fakeEmbedder);
    expect(scored).toHaveLength(GOLDEN_PAIRS.length);
    scored.forEach((s, i) => {
      expect(s.similarity).toBeGreaterThanOrEqual(-1.0001);
      expect(s.similarity).toBeLessThanOrEqual(1.0001);
      expect(s.duplicate).toBe(GOLDEN_PAIRS[i]!.duplicate);
      expect(s.conceptMatch).toBe(
        conceptsOverlap(GOLDEN_PAIRS[i]!.a.concepts, GOLDEN_PAIRS[i]!.b.concepts),
      );
    });
  });
});

describe("evaluateScoredPairs metrics (§6)", () => {
  const scored: ScoredPair[] = [
    { similarity: 0.95, conceptMatch: true, duplicate: true }, // TP
    { similarity: 0.9, conceptMatch: true, duplicate: true }, // TP
    { similarity: 0.92, conceptMatch: true, duplicate: false }, // FP
    { similarity: 0.5, conceptMatch: true, duplicate: false }, // TN
    { similarity: 0.99, conceptMatch: false, duplicate: false }, // TN (concept gate)
    { similarity: 0.4, conceptMatch: true, duplicate: true }, // FN
  ];

  it("computes TP/FP/TN/FN, precision, recall, F1, accuracy", () => {
    const m = evaluateScoredPairs(scored, { threshold: 0.85, requireConceptOverlap: true });
    expect(m).toMatchObject({ truePositive: 2, falsePositive: 1, trueNegative: 2, falseNegative: 1 });
    expect(m.precision).toBeCloseTo(2 / 3);
    expect(m.recall).toBeCloseTo(2 / 3);
    expect(m.f1).toBeCloseTo(2 / 3);
    expect(m.accuracy).toBeCloseTo(4 / 6);
  });

  it("the concept gate suppresses a high-cosine cross-concept pair (FP→TN)", () => {
    const withoutGate = evaluateScoredPairs(scored, {
      threshold: 0.85,
      requireConceptOverlap: false,
    });
    // The conceptMatch=false, duplicate=false, sim=0.99 row flips to a FP.
    expect(withoutGate.falsePositive).toBe(2);
  });
});

describe("sweepThreshold picks the best F1 (§6)", () => {
  it("selects a threshold that separates the labelled pairs", () => {
    const scored: ScoredPair[] = [
      { similarity: 0.9, conceptMatch: true, duplicate: true },
      { similarity: 0.88, conceptMatch: true, duplicate: true },
      { similarity: 0.7, conceptMatch: true, duplicate: false },
      { similarity: 0.6, conceptMatch: true, duplicate: false },
    ];
    const grid = [0.6, 0.7, 0.8, 0.85, 0.9, 0.95];
    const { best, results } = sweepThreshold(scored, grid);
    expect(results).toHaveLength(grid.length);
    expect(best.f1).toBeCloseTo(1); // 0.8 or 0.85 perfectly separates
    expect(best.threshold).toBeGreaterThanOrEqual(0.75);
    expect(best.threshold).toBeLessThanOrEqual(0.88);
  });
});
