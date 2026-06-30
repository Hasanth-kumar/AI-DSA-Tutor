import { describe, it, expect } from "vitest";
import {
  detectConfusionPairs,
  DEFAULT_CONFUSION_CONFIG,
  type ConfusionCandidate,
} from "./confusion.js";

/**
 * Confusion-pair detection tests (design §3, §6). Pure function — no DB,
 * no embedder. Uses hand-crafted Float32Array vectors that hit the confusion
 * zone [0.65, 0.84) and stay below the dedup threshold (0.85).
 */

/** Build a unit vector from a 2D angle (easy to reason about similarity). */
function unitVec(angleDeg: number): Float32Array {
  const r = (angleDeg * Math.PI) / 180;
  return new Float32Array([Math.cos(r), Math.sin(r)]);
}

/** cosine of the angle between two unit vectors = cos(|a - b|). */
function cosAngle(aDeg: number, bDeg: number): number {
  return Math.cos(Math.abs((aDeg - bDeg) * (Math.PI / 180)));
}

describe("detectConfusionPairs (§3)", () => {
  const cfg = DEFAULT_CONFUSION_CONFIG; // [0.65, 0.84), limit 10

  it("finds a pair in the confusion zone with non-overlapping concepts", () => {
    // 30° apart → cos(30°) ≈ 0.866 — above dedup threshold, should be EXCLUDED
    // 45° apart → cos(45°) ≈ 0.707 — in confusion zone [0.65, 0.84)
    const a: ConfusionCandidate = { id: "a", vector: unitVec(0), concepts: ["two-pointers"] };
    const b: ConfusionCandidate = { id: "b", vector: unitVec(45), concepts: ["sliding-window"] };
    const fronts = new Map([
      ["a", "When do two-pointers collapse to a single scan?"],
      ["b", "What distinguishes a sliding window from two-pointers?"],
    ]);

    const sim = cosAngle(0, 45);
    expect(sim).toBeGreaterThanOrEqual(cfg.minSimilarity);
    expect(sim).toBeLessThan(cfg.maxSimilarity);

    const pairs = detectConfusionPairs([a, b], fronts, cfg);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.conceptsA).toContain("two-pointers");
    expect(pairs[0]!.conceptsB).toContain("sliding-window");
    expect(pairs[0]!.similarity).toBeCloseTo(sim, 5);
    expect(pairs[0]!.frontA).toBe(fronts.get("a"));
    expect(pairs[0]!.frontB).toBe(fronts.get("b"));
  });

  it("excludes pairs above the maxSimilarity (near-duplicate territory)", () => {
    // 20° apart → cos(20°) ≈ 0.940 — above 0.84 threshold
    const a: ConfusionCandidate = { id: "a", vector: unitVec(0), concepts: ["concept-x"] };
    const b: ConfusionCandidate = { id: "b", vector: unitVec(20), concepts: ["concept-y"] };
    const sim = cosAngle(0, 20);
    expect(sim).toBeGreaterThanOrEqual(cfg.maxSimilarity);
    const pairs = detectConfusionPairs([a, b], new Map(), cfg);
    expect(pairs).toHaveLength(0);
  });

  it("excludes pairs below the minSimilarity (unrelated, not confusing)", () => {
    // 80° apart → cos(80°) ≈ 0.174 — below 0.65 threshold
    const a: ConfusionCandidate = { id: "a", vector: unitVec(0), concepts: ["hashmap"] };
    const b: ConfusionCandidate = { id: "b", vector: unitVec(80), concepts: ["recursion"] };
    const sim = cosAngle(0, 80);
    expect(sim).toBeLessThan(cfg.minSimilarity);
    const pairs = detectConfusionPairs([a, b], new Map(), cfg);
    expect(pairs).toHaveLength(0);
  });

  it("excludes pairs that share a concept tag (even if cosine is in confusion zone)", () => {
    // 45° apart (cosine in confusion zone) but SAME concept tag = near-duplicate,
    // not a useful confusion pair.
    const a: ConfusionCandidate = { id: "a", vector: unitVec(0), concepts: ["two-pointers"] };
    const b: ConfusionCandidate = {
      id: "b",
      vector: unitVec(45),
      concepts: ["two-pointers", "extra"],
    };
    const pairs = detectConfusionPairs([a, b], new Map(), cfg);
    expect(pairs).toHaveLength(0);
  });

  it("sorts pairs by descending similarity and respects the limit", () => {
    // Three pairs at various angles; limit = 2.
    const candidates: ConfusionCandidate[] = [
      { id: "a", vector: unitVec(0), concepts: ["alpha"] },
      { id: "b", vector: unitVec(45), concepts: ["beta"] }, // cos ≈ 0.707 (most confusing)
      { id: "c", vector: unitVec(52), concepts: ["gamma"] }, // cos ≈ 0.616 — below min
      { id: "d", vector: unitVec(48), concepts: ["delta"] }, // cos ≈ 0.669 (second)
    ];
    const pairs = detectConfusionPairs(candidates, new Map(), { ...cfg, limit: 2 });
    // a-b: cos(45) ≈ 0.707; a-d: cos(48) ≈ 0.669; a-c: cos(52) ≈ 0.616 (below 0.65)
    // b-d: cos(3) ≈ 0.999 — above max
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.similarity).toBeGreaterThanOrEqual(pairs[1]!.similarity);
  });

  it("returns empty for a single candidate", () => {
    const a: ConfusionCandidate = { id: "a", vector: unitVec(0), concepts: ["c"] };
    expect(detectConfusionPairs([a], new Map(), cfg)).toHaveLength(0);
  });

  it("uses the fallback front (id) when the card id is not in the fronts map", () => {
    const a: ConfusionCandidate = { id: "card-1", vector: unitVec(0), concepts: ["x"] };
    const b: ConfusionCandidate = { id: "card-2", vector: unitVec(45), concepts: ["y"] };
    const pairs = detectConfusionPairs([a, b], new Map(), cfg);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.frontA).toBe("card-1");
    expect(pairs[0]!.frontB).toBe("card-2");
  });
});
