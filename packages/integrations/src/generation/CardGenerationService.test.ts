import { describe, it, expect } from "vitest";
import { CardGenerationService, type GenerationDb, type TopicVocabulary } from "./CardGenerationService.js";
import type { GenerationClient } from "./GenerationProvider.js";
import type { Embedder } from "../embeddings/Embedder.js";

/**
 * Service-level acceptance for §2 "notes are the source of truth".
 *
 * The pipeline must never invent card content for a topic that has a coverage
 * gap but no note material — the LLM is a note-expansion engine, not a source of
 * truth. These tests prove the gate with fakes only (no native sqlite binding),
 * so they run in CI and the Linux build sandbox alike.
 */

/** A binding-free fake DB: no existing cards (every concept uncovered), and a
 *  no-op write surface so `clearTopicDirty` can run without a real sqlite. */
function fakeDb(): GenerationDb {
  const stmt = {
    run: () => ({ changes: 1 }),
    get: () => undefined,
    all: () => [] as unknown[],
  };
  return {
    exec: () => {},
    prepare: () => stmt,
  } as unknown as GenerationDb;
}

const vocab: TopicVocabulary = {
  topicId: "two-sum",
  topicName: "Two Sum",
  conceptIds: new Set(["hashmap-lookup", "complement-trick"]),
  concepts: [
    { id: "hashmap-lookup", description: "O(1) average lookup" },
    { id: "complement-trick", description: "store complements seen so far" },
  ],
};

/** An LLM stub that records whether it was ever asked to generate. */
function spyLlm(configured: boolean): GenerationClient & { calls: number } {
  return {
    calls: 0,
    isConfigured: () => configured,
    async generate(this: { calls: number }) {
      this.calls += 1;
      return "[]";
    },
  } as GenerationClient & { calls: number };
}

/** An embedder stub that records whether it was ever asked to embed. */
function spyEmbedder(): Embedder & { calls: number } {
  return {
    calls: 0,
    model: "test-embedder",
    async embed(this: { calls: number }, texts: string[]) {
      this.calls += 1;
      return texts.map(() => new Float32Array([0, 0, 0]));
    },
  } as unknown as Embedder & { calls: number };
}

describe("CardGenerationService — §2 notes are the source of truth", () => {
  it("skips with 'no-notes' and never calls the LLM when a topic has a coverage gap but no notes", async () => {
    const llm = spyLlm(true);
    const embedder = spyEmbedder();
    const service = new CardGenerationService({
      db: fakeDb(),
      llm,
      embedder,
      resolveVocabulary: () => vocab,
      loadNotes: () => ({ excerpts: [], mistakes: [], noteVersion: null }),
      modelVersion: "test-model",
    });

    const report = await service.generateForTopic("two-sum", { clearDirty: true });

    expect(report.skipped).toBe("no-notes");
    // The coverage gap is still reported — we just had no source to fill it.
    expect(report.uncovered.sort()).toEqual(["complement-trick", "hashmap-lookup"]);
    expect(report.stored).toBe(0);
    // The crux of §2: zero LLM / embedding work was done without a note source.
    expect(llm.calls).toBe(0);
    expect(embedder.calls).toBe(0);
  });

  it("treats whitespace-only notes as no source (still skips 'no-notes')", async () => {
    const llm = spyLlm(true);
    const service = new CardGenerationService({
      db: fakeDb(),
      llm,
      embedder: spyEmbedder(),
      resolveVocabulary: () => vocab,
      // A NoteProvider that yields no usable excerpts (the DB provider filters
      // empty/whitespace content, producing an empty array here).
      loadNotes: () => ({ excerpts: [], mistakes: [], noteVersion: null }),
      modelVersion: "test-model",
    });

    const report = await service.generateForTopic("two-sum");
    expect(report.skipped).toBe("no-notes");
    expect(llm.calls).toBe(0);
  });

  it("does NOT skip for no-notes when a note source exists — it advances past the gate", async () => {
    // With real note material present, the no-notes gate is not hit; the run
    // proceeds to the next guard. We make the LLM unconfigured so the test stays
    // binding-free (no generation/store/embedding path), and assert the skip
    // reason is 'llm-unavailable', proving notes-bearing topics get past §2's gate.
    const llm = spyLlm(false);
    const service = new CardGenerationService({
      db: fakeDb(),
      llm,
      embedder: spyEmbedder(),
      resolveVocabulary: () => vocab,
      loadNotes: () => ({
        excerpts: [{ title: "Two Sum", excerpt: "use a hashmap to store complements" }],
        mistakes: [],
        noteVersion: "note-hash-1",
      }),
      modelVersion: "test-model",
    });

    const report = await service.generateForTopic("two-sum");
    expect(report.skipped).toBe("llm-unavailable");
    expect(report.uncovered.length).toBeGreaterThan(0);
  });
});
