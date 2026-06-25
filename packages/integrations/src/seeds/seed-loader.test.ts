import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAllSeeds,
  loadSeedTopic,
  topicCoverage,
  SeedValidationError,
  MAX_CARDS_PER_CONCEPT,
} from "./seed-loader.js";
import {
  buildVocabulary,
  assertClosedVocabulary,
  filterToVocabulary,
  isFlatConceptId,
  ConceptVocabularyError,
} from "./concept-vocabulary.js";
import { CARD_TYPES } from "@dsa/database/schema";

/**
 * Stage-2 acceptance (design §§2,3,4,15.2). The curated baseline under
 * `database/seeds` must parse, every card must reference the closed concept
 * vocabulary, ids must be flat, `requires` edges must resolve, and the
 * per-concept cap must hold. Validation is the same enforcement point the
 * generation pipeline will reuse (§5).
 */
const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const SEEDS_ROOT = resolve(repoRoot, "database/seeds");

describe("concept vocabulary (§4)", () => {
  it("treats dotted ids as non-flat", () => {
    expect(isFlatConceptId("hashmap-lookup")).toBe(true);
    expect(isFlatConceptId("arrays.hashmap.lookup")).toBe(false);
  });

  it("rejects a dotted concept id", () => {
    expect(() => buildVocabulary([{ id: "arrays.hashmap.lookup" }])).toThrow(
      ConceptVocabularyError,
    );
  });

  it("rejects duplicate concept ids", () => {
    expect(() => buildVocabulary([{ id: "a" }, { id: "a" }])).toThrow(
      ConceptVocabularyError,
    );
  });

  it("rejects a requires edge that points outside the vocabulary", () => {
    expect(() =>
      buildVocabulary([{ id: "a", requires: ["does-not-exist"] }]),
    ).toThrow(/requires.*unknown/i);
  });

  it("accepts a resolvable requires edge and returns the id set", () => {
    const ids = buildVocabulary([{ id: "a" }, { id: "b", requires: ["a"] }]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("assertClosedVocabulary throws only on unknown tags", () => {
    const known = new Set(["a", "b"]);
    expect(() => assertClosedVocabulary(known, ["a", "b"])).not.toThrow();
    expect(() => assertClosedVocabulary(known, ["a", "c"])).toThrow(
      ConceptVocabularyError,
    );
  });

  it("filterToVocabulary strips unknown tags without throwing", () => {
    const known = new Set(["a", "b"]);
    expect(filterToVocabulary(known, ["a", "x", "b", "x"])).toEqual({
      kept: ["a", "b"],
      dropped: ["x"],
    });
  });
});

describe("seed baseline (§2, §15.2)", () => {
  const topics = loadAllSeeds(SEEDS_ROOT);

  it("loads at least the first few topics", () => {
    expect(topics.length).toBeGreaterThanOrEqual(3);
  });

  it("each topic has a curated baseline of 10–16 cards", () => {
    for (const t of topics) {
      expect(t.cards.length).toBeGreaterThanOrEqual(10);
      expect(t.cards.length).toBeLessThanOrEqual(16);
    }
  });

  it("every card references the closed vocabulary only (§4)", () => {
    for (const t of topics) {
      for (const card of t.cards) {
        expect(card.concepts.length).toBeGreaterThan(0);
        for (const tag of card.concepts) {
          expect(t.conceptIds.has(tag)).toBe(true);
        }
      }
    }
  });

  it("respects the per-concept cap (§4)", () => {
    for (const t of topics) {
      const per = new Map<string, number>();
      for (const card of t.cards)
        for (const tag of card.concepts) per.set(tag, (per.get(tag) ?? 0) + 1);
      for (const [, count] of per) expect(count).toBeLessThanOrEqual(MAX_CARDS_PER_CONCEPT);
    }
  });

  it("uses only closed card types and is type-diverse (§3)", () => {
    const typeSet = new Set(CARD_TYPES);
    const seen = new Set<string>();
    for (const t of topics)
      for (const card of t.cards) {
        expect(typeSet.has(card.type)).toBe(true);
        seen.add(card.type);
      }
    // The baseline exercises more than just plain recall.
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it("reports deterministic, auditable coverage (§4)", () => {
    for (const t of topics) {
      const cov = topicCoverage(t);
      expect(cov.total).toBe(t.conceptIds.size);
      expect(cov.covered).toBeLessThanOrEqual(cov.total);
      expect(cov.covered + cov.uncovered.length).toBe(cov.total);
    }
  });

  it("card ids are globally unique UUIDs across topics (§8)", () => {
    const ids = new Set<string>();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const t of topics)
      for (const card of t.cards) {
        expect(uuid.test(card.id)).toBe(true);
        expect(ids.has(card.id)).toBe(false);
        ids.add(card.id);
      }
  });
});

describe("closed-vocabulary enforcement at load (§4)", () => {
  it("rejects a seed card that references a concept not in concepts.yaml", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "seed-bad-"));
    try {
      const topicDir = resolve(dir, "topic-x");
      mkdirSync(topicDir);
      writeFileSync(
        resolve(topicDir, "concepts.yaml"),
        "topic_id: 11111111-1111-1111-1111-111111111111\ntopic_name: X\nconcepts:\n  - id: known\n",
      );
      writeFileSync(
        resolve(topicDir, "cards.yaml"),
        "topic_id: 11111111-1111-1111-1111-111111111111\ntopic_name: X\nseed_version: 1\n" +
          "cards:\n  - id: 99999999-9999-9999-9999-999999999999\n    type: plain-recall\n" +
          "    concepts: [known, invented-tag]\n    front: q\n    back: a\n",
      );
      let caught: unknown;
      try {
        loadSeedTopic(dir, "topic-x");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(SeedValidationError);
      expect((caught as SeedValidationError).problems.join(" ")).toMatch(/invented-tag/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
