import { describe, expect, it } from "vitest";
import { buildHintPrompt } from "./hint.prompt.js";

describe("buildHintPrompt", () => {
  it("includes difficulty-specific guidance", () => {
    const easy = buildHintPrompt({
      problemName: "Two Sum",
      topicName: "Arrays",
      difficulty: "Easy",
      confidence: 40,
      attempts: 1,
    });
    const hard = buildHintPrompt({
      problemName: "Word Ladder",
      topicName: "Graphs",
      difficulty: "Hard",
      confidence: 70,
      attempts: 3,
      recommendedDifficulty: "Hard",
    });

    expect(easy).toContain("gentle nudge");
    expect(hard).toContain("key insight");
    expect(hard).toContain("Engine recommends practicing Hard");
  });
});
