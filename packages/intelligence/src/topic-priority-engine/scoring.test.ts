import { describe, expect, it } from "vitest";
import { FIXED_NOW, makeTopic, sampleTopics } from "../test-fixtures/sample-topics.js";
import { computePriorityScore, urgencyScore } from "./scoring.js";

describe("scoring", () => {
  it("scores never-studied topics with max urgency", () => {
    const topic = makeTopic({
      id: "new",
      name: "New",
      lastRevised: null,
      nextRevisionAt: null,
    });
    expect(urgencyScore(topic, FIXED_NOW)).toBe(1);
  });

  it("produces deterministic explainable scores", () => {
    const topics = sampleTopics();
    const map = new Map(topics.map((t) => [t.id, t]));
    const a = computePriorityScore(topics[1], map, undefined, FIXED_NOW);
    const b = computePriorityScore(topics[1], map, undefined, FIXED_NOW);
    expect(a).toEqual(b);
    expect(a.total).toBeGreaterThan(0);
    expect(a.breakdown).toHaveProperty("urgency");
    expect(["Study now", "Review soon", "Practice more", "Maintain"]).toContain(
      a.recommendation,
    );
  });
});
