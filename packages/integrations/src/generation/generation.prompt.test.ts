import { describe, it, expect } from "vitest";
import { buildGenerationPrompt, GENERATION_PROMPT_VERSION } from "./generation.prompt.js";

/**
 * Stage-5 prompt acceptance (design §2, §4, §5). The prompt must target the
 * uncovered concepts, enforce the closed vocabulary, carry the Stage-A "don't
 * repeat" instruction, and be coverage-driven (NOT "generate N cards").
 */
describe("buildGenerationPrompt", () => {
  const prompt = buildGenerationPrompt({
    topicName: "Two Sum",
    uncovered: [
      { id: "complement-trick", description: "store complements seen so far" },
      { id: "overflow" },
    ],
    noteExcerpts: [{ title: "Two Sum", excerpt: "I first reached for nested loops" }],
    existingFronts: ["What is the hashmap lookup complexity?"],
    maxPerConcept: 3,
  });

  it("targets ONLY the uncovered concepts (§4/§5)", () => {
    expect(prompt).toContain("complement-trick");
    expect(prompt).toContain("overflow");
    expect(prompt).toMatch(/only for these currently-uncovered concepts/i);
  });

  it("enforces the closed vocabulary in-prompt (§4)", () => {
    expect(prompt).toMatch(/NEVER invent a new tag/i);
    expect(prompt).toMatch(/ONLY the concept ids listed/i);
  });

  it("includes the note material as source of truth (§2)", () => {
    expect(prompt).toContain("nested loops");
    expect(prompt).toMatch(/SOURCE OF TRUTH/i);
  });

  it("carries the Stage-A 'do not repeat existing' instruction (§5)", () => {
    expect(prompt).toContain("What is the hashmap lookup complexity?");
    expect(prompt).toMatch(/do not repeat/i);
  });

  it("is coverage-driven, not a fixed card count", () => {
    expect(prompt).toMatch(/Do NOT pad to a fixed count/i);
    expect(prompt).not.toMatch(/generate \d+ (cards|questions)/i);
  });

  it("exposes a stable prompt version for provenance (§8)", () => {
    expect(GENERATION_PROMPT_VERSION).toBe("gen-v1");
  });
});
