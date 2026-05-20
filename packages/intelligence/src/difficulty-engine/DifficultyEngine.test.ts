import { describe, expect, it } from "vitest";
import { makeTopic } from "../test-fixtures/sample-topics.js";
import { DifficultyEngine } from "./DifficultyEngine.js";

describe("DifficultyEngine", () => {
  const engine = new DifficultyEngine();

  it("recommends Hard for high confidence and productivity", () => {
    const topic = makeTopic({
      id: "strong",
      name: "Strong",
      confidence: 85,
      recentSessions: [
        { date: new Date(), problemsSolved: 2, productivityScore: 80, duration: 45 },
        { date: new Date(), problemsSolved: 2, productivityScore: 78, duration: 45 },
      ],
    });
    expect(engine.recommendDifficulty(topic).primary).toBe("Hard");
  });

  it("recommends Easy only for low confidence", () => {
    const topic = makeTopic({
      id: "weak",
      name: "Weak",
      confidence: 25,
      recentSessions: [],
    });
    const rec = engine.recommendDifficulty(topic);
    expect(rec.primary).toBe("Easy");
    expect(rec.secondary).toBeNull();
  });

  it("picks problem difficulties by ratio", () => {
    const rec = { primary: "Medium" as const, secondary: "Hard" as const, ratio: [0.8, 0.2] as [number, number] };
    const picks = engine.pickProblemDifficulties(rec, 5);
    expect(picks.filter((d) => d === "Medium").length).toBeGreaterThanOrEqual(3);
  });
});
