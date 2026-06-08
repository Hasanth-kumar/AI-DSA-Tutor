import { describe, expect, it } from "vitest";
import { computePriorityScore } from "./scoring.js";
import { explainPriorityScore } from "./explain.js";
import { makeTopic } from "../test-fixtures/sample-topics.js";

describe("explainPriorityScore", () => {
  it("returns human-readable explanation lines", () => {
    const topic = makeTopic({ id: "t1", name: "Arrays", confidence: 40 });
    const score = computePriorityScore(topic, new Map([[topic.id, topic]]));
    const explained = explainPriorityScore(score, topic);

    expect(explained.topicName).toBe("Arrays");
    expect(explained.explanation.length).toBeGreaterThan(3);
    expect(explained.explanation.join(" ")).toContain("Arrays");
  });
});
