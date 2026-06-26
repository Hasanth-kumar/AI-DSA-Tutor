import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEDUP_THRESHOLD,
  DEFAULT_DEDUP_CONFIG,
  conceptsOverlap,
  cardEmbeddingText,
  isDuplicatePair,
  findDuplicates,
  dedupeBatch,
  type DedupCandidate,
} from "./dedup.js";

const cand = (id: string, vec: number[], concepts: string[]): DedupCandidate => ({
  id,
  vector: Float32Array.from(vec),
  concepts,
});

describe("dedup rule = concept-tag match + high cosine (§6)", () => {
  it("exposes a configurable default threshold ~0.85, not inlined", () => {
    expect(DEFAULT_DEDUP_THRESHOLD).toBeCloseTo(0.85);
    expect(DEFAULT_DEDUP_CONFIG.threshold).toBe(DEFAULT_DEDUP_THRESHOLD);
    expect(DEFAULT_DEDUP_CONFIG.requireConceptOverlap).toBe(true);
  });

  it("concept match + high cosine => duplicate", () => {
    const a = cand("a", [1, 0, 0], ["two-pointers"]);
    const b = cand("b", [0.99, 0.01, 0], ["two-pointers", "sorting"]);
    const v = isDuplicatePair(a, b);
    expect(v.conceptMatch).toBe(true);
    expect(v.similarity).toBeGreaterThan(0.85);
    expect(v.duplicate).toBe(true);
  });

  it("high cosine but NO shared concept => not a duplicate", () => {
    const a = cand("a", [1, 0, 0], ["two-pointers"]);
    const b = cand("b", [1, 0, 0], ["sliding-window"]);
    const v = isDuplicatePair(a, b);
    expect(v.similarity).toBeCloseTo(1);
    expect(v.conceptMatch).toBe(false);
    expect(v.duplicate).toBe(false);
  });

  it("shared concept but low cosine => not a duplicate", () => {
    const a = cand("a", [1, 0, 0], ["two-pointers"]);
    const b = cand("b", [0, 1, 0], ["two-pointers"]);
    expect(isDuplicatePair(a, b).duplicate).toBe(false);
  });

  it("threshold is honored", () => {
    const a = cand("a", [1, 0], ["x"]);
    const b = cand("b", [0.9, 0.436], ["x"]); // cosine ~0.9
    expect(isDuplicatePair(a, b, { threshold: 0.95, requireConceptOverlap: true }).duplicate).toBe(
      false,
    );
    expect(isDuplicatePair(a, b, { threshold: 0.8, requireConceptOverlap: true }).duplicate).toBe(
      true,
    );
  });

  it("requireConceptOverlap=false falls back to cosine only", () => {
    const a = cand("a", [1, 0, 0], ["two-pointers"]);
    const b = cand("b", [1, 0, 0], ["sliding-window"]);
    expect(
      isDuplicatePair(a, b, { threshold: 0.85, requireConceptOverlap: false }).duplicate,
    ).toBe(true);
  });

  it("conceptsOverlap is empty-safe", () => {
    expect(conceptsOverlap([], ["a"])).toBe(false);
    expect(conceptsOverlap(["a"], ["b"])).toBe(false);
    expect(conceptsOverlap(["a", "b"], ["b"])).toBe(true);
  });
});

describe("cardEmbeddingText (§6 — dedup on concept/answer, not just question)", () => {
  it("includes concepts, answer, and question", () => {
    const text = cardEmbeddingText({
      type: "plain-recall",
      front: "Q?",
      back: "A.",
      concepts: ["beta", "alpha"],
    });
    expect(text).toContain("answer: A.");
    expect(text).toContain("question: Q?");
    // concepts are sorted for stability
    expect(text).toContain("concepts: alpha, beta");
  });
});

describe("findDuplicates brute-force search (§6)", () => {
  const existing = [
    cand("e1", [1, 0, 0], ["two-pointers"]),
    cand("e2", [0.98, 0.02, 0], ["two-pointers"]),
    cand("e3", [0, 1, 0], ["sliding-window"]),
  ];

  it("returns matches sorted by descending similarity, never matching self", () => {
    const c = cand("e1", [1, 0, 0], ["two-pointers"]);
    const matches = findDuplicates(c, existing);
    expect(matches.map((m) => m.matchId)).toEqual(["e2"]); // self e1 excluded
    expect(matches[0]!.similarity).toBeGreaterThan(0.85);
  });

  it("returns [] when nothing is close enough on the matched concept", () => {
    const c = cand("new", [0, 0, 1], ["dynamic-programming"]);
    expect(findDuplicates(c, existing)).toEqual([]);
  });
});

describe("dedupeBatch — Stage B against bank + within batch (§5/§6)", () => {
  it("drops within-batch near-duplicates and keeps the first", () => {
    const existing = [cand("e1", [1, 0, 0], ["two-pointers"])];
    const batch = [
      cand("n1", [0, 1, 0], ["sliding-window"]), // unique
      cand("n2", [0, 0.99, 0.01], ["sliding-window"]), // dup of n1
      cand("n3", [0.99, 0.01, 0], ["two-pointers"]), // dup of e1
    ];
    const res = dedupeBatch(batch, existing);
    expect(res.unique.map((c) => c.id)).toEqual(["n1"]);
    expect(res.dropped.map((d) => ({ id: d.candidate.id, m: d.matchId }))).toEqual([
      { id: "n2", m: "n1" },
      { id: "n3", m: "e1" },
    ]);
  });
});
