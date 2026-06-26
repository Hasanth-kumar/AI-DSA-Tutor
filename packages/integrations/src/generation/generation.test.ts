import { describe, it, expect } from "vitest";
import {
  parseGeneratedCards,
  sanitizeGeneratedCards,
  buildGeneratedCardRows,
  type RawGeneratedCard,
  type SanitizeOptions,
} from "./generation.js";
import { extractMistakeSection } from "./generation.prompt.js";

/**
 * Stage-5 pure-core acceptance (design §4, §5, §8). The closed-vocabulary
 * enforcement and provenance stamping are the highest-signal checks — they are
 * the parts the LLM must never be trusted to do itself.
 */

const known = new Set(["hashmap-lookup", "complement-trick", "overflow"]);
const baseOpts: SanitizeOptions = {
  knownConcepts: known,
  uncovered: new Set(["hashmap-lookup", "complement-trick"]),
  maxPerConcept: 3,
};

describe("parseGeneratedCards (§5)", () => {
  it("extracts a JSON array from fenced / chatty output", () => {
    const text =
      "Sure! Here are the cards:\n```json\n[{\"type\":\"plain-recall\",\"front\":\"q\",\"back\":\"a\",\"concepts\":[\"x\"]}]\n```";
    const cards = parseGeneratedCards(text);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.front).toBe("q");
  });

  it("returns [] for null / non-array / malformed input", () => {
    expect(parseGeneratedCards(null)).toEqual([]);
    expect(parseGeneratedCards("no json here")).toEqual([]);
    expect(parseGeneratedCards("[ not valid")).toEqual([]);
    expect(parseGeneratedCards('{"front":"q"}')).toEqual([]);
  });
});

describe("sanitizeGeneratedCards — closed vocabulary (§4)", () => {
  it("strips an invented tag and keeps the card if a legal+uncovered tag remains", () => {
    const raw: RawGeneratedCard[] = [
      {
        type: "pattern-trigger",
        front: "sorted array, find pair summing to target",
        back: "two pointers",
        concepts: ["complement-trick", "HASHMAP", "invented-tag"],
      },
    ];
    const { kept, dropped } = sanitizeGeneratedCards(raw, baseOpts);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.concepts).toEqual(["complement-trick"]);
    expect(dropped).toHaveLength(0);
  });

  it("DROPS a card whose every tag is outside the closed vocabulary", () => {
    const raw: RawGeneratedCard[] = [
      { type: "plain-recall", front: "q", back: "a", concepts: ["totally-new", "also-new"] },
    ];
    const { kept, dropped } = sanitizeGeneratedCards(raw, baseOpts);
    expect(kept).toHaveLength(0);
    expect(dropped[0]!.reason).toBe("no-legal-concept");
    expect(dropped[0]!.strippedTags).toEqual(["totally-new", "also-new"]);
  });

  it("DROPS an on-vocabulary card that targets only an already-covered concept", () => {
    const raw: RawGeneratedCard[] = [
      { type: "plain-recall", front: "q", back: "a", concepts: ["overflow"] },
    ];
    const { kept, dropped } = sanitizeGeneratedCards(raw, baseOpts);
    expect(kept).toHaveLength(0);
    expect(dropped[0]!.reason).toBe("off-target");
  });

  it("rejects unknown card types and empty content", () => {
    const raw: RawGeneratedCard[] = [
      { type: "essay", front: "q", back: "a", concepts: ["hashmap-lookup"] },
      { type: "plain-recall", front: "q", back: "", concepts: ["hashmap-lookup"] },
    ];
    const { kept, dropped } = sanitizeGeneratedCards(raw, baseOpts);
    expect(kept).toHaveLength(0);
    expect(dropped.map((d) => d.reason)).toEqual(["unknown-type", "empty-content"]);
  });

  it("drops exact in-batch duplicates (case/space-insensitive)", () => {
    const raw: RawGeneratedCard[] = [
      { type: "plain-recall", front: "What is O(1)?", back: "constant", concepts: ["hashmap-lookup"] },
      { type: "plain-recall", front: "what  is   o(1)?", back: "CONSTANT", concepts: ["hashmap-lookup"] },
    ];
    const { kept, dropped } = sanitizeGeneratedCards(raw, baseOpts);
    expect(kept).toHaveLength(1);
    expect(dropped[0]!.reason).toBe("in-batch-duplicate");
  });

  it("enforces the per-concept cap against existing counts (§4)", () => {
    const opts: SanitizeOptions = {
      ...baseOpts,
      existingCounts: new Map([["hashmap-lookup", 3]]),
    };
    const raw: RawGeneratedCard[] = [
      { type: "plain-recall", front: "q", back: "a", concepts: ["hashmap-lookup"] },
    ];
    const { kept, dropped } = sanitizeGeneratedCards(raw, opts);
    expect(kept).toHaveLength(0);
    expect(dropped[0]!.reason).toBe("over-cap");
  });
});

describe("buildGeneratedCardRows — provenance (§8)", () => {
  it("stamps origin=generated + model/prompt/note versions + a source hash", () => {
    let n = 0;
    const rows = buildGeneratedCardRows(
      "topic-1",
      [{ type: "plain-recall", front: "q", back: "a", concepts: ["hashmap-lookup"] }],
      { modelVersion: "qwen2.5", promptVersion: "gen-v1", noteVersion: "note-abc" },
      1000,
      () => `card-${++n}`,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r).toMatchObject({
      id: "card-1",
      topic_id: "topic-1",
      origin: "generated",
      model_version: "qwen2.5",
      prompt_version: "gen-v1",
      note_version: "note-abc",
      due: 1000,
    });
    expect(r.source_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("extractMistakeSection (§3)", () => {
  it("pulls the ## Mistakes body and stops at the next heading", () => {
    const note = `# Two Sum\n\n## Approach\nuse a hashmap\n\n## Mistakes\n- reached for nested loops first\n- forgot the complement\n\n## Complexity\nO(n)`;
    const section = extractMistakeSection(note);
    expect(section).toContain("nested loops");
    expect(section).toContain("complement");
    expect(section).not.toContain("O(n)");
    expect(section).not.toContain("hashmap");
  });

  it("returns null when there is no Mistakes section", () => {
    expect(extractMistakeSection("# Topic\n\njust prose")).toBeNull();
  });
});
