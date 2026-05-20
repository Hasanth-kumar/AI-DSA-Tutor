import { describe, expect, it } from "vitest";
import { RevisionEngine } from "../revision-engine/RevisionEngine.js";
import { FIXED_NOW, sampleTopics } from "../test-fixtures/sample-topics.js";
import { TopicPriorityEngine } from "./TopicPriorityEngine.js";

describe("TopicPriorityEngine", () => {
  const engine = new TopicPriorityEngine(new RevisionEngine());

  it("ranks topics by priority score", () => {
    const scored = engine.scoreAll(sampleTopics(), undefined, FIXED_NOW);
    expect(scored[0].score.total).toBeGreaterThanOrEqual(scored[1].score.total);
  });

  it("generatePlan returns primary and revision topics", () => {
    const plan = engine.generatePlan(sampleTopics(), { maxRevisionTopics: 1 }, FIXED_NOW);
    expect(plan.primaryTopic).toBeDefined();
    expect(plan.reasoning).toContain("Primary focus");
    expect(plan.estimatedDuration).toBeGreaterThan(0);
  });
});
