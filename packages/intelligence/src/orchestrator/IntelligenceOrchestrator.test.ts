import { describe, expect, it } from "vitest";
import { FIXED_NOW, makeTopic, sampleTopics } from "../test-fixtures/sample-topics.js";
import { createIntelligenceOrchestrator } from "./IntelligenceOrchestrator.js";

describe("IntelligenceOrchestrator", () => {
  const orchestrator = createIntelligenceOrchestrator();

  it("getRevisionQueue returns overdue topics", () => {
    const queue = orchestrator.getRevisionQueue(sampleTopics());
    expect(queue.every((t) => t.status !== "Not started")).toBe(true);
  });

  it("updateAfterSession returns SM-2 and weakness updates", () => {
    const topic = makeTopic({ id: "t", name: "T" });
    const update = orchestrator.updateAfterSession(topic, {
      date: FIXED_NOW,
      problemsSolved: 2,
      productivityScore: 75,
      duration: 50,
    });
    expect(update.sm2.repetition).toBeGreaterThan(topic.revisionCount);
    expect(update.weaknessUpdate.topicId).toBe("t");
  });

  it("updateExecutionAfterSession returns weakness only (no SM-2)", () => {
    const topic = makeTopic({ id: "t", name: "T" });
    const update = orchestrator.updateExecutionAfterSession(topic, {
      date: FIXED_NOW,
      problemsSolved: 2,
      productivityScore: 75,
      duration: 50,
    });
    expect(update.weaknessUpdate.topicId).toBe("t");
    expect("sm2" in update).toBe(false);
  });
});
