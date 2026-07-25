import { describe, expect, it } from "vitest";
import { FIXED_NOW, sampleTopics } from "../test-fixtures/sample-topics.js";
import { TopicPriorityEngine } from "./TopicPriorityEngine.js";

describe("TopicPriorityEngine", () => {
  const engine = new TopicPriorityEngine();

  it("ranks topics by priority score", () => {
    const scored = engine.scoreAll(sampleTopics(), undefined, FIXED_NOW);
    expect(scored[0].score.total).toBeGreaterThanOrEqual(scored[1].score.total);
  });
});
