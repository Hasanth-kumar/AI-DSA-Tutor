import { describe, expect, it } from "vitest";
import { makeTopic, sampleTopics } from "../test-fixtures/sample-topics.js";
import { RoadmapEngine } from "./RoadmapEngine.js";

describe("RoadmapEngine", () => {
  it("unlocks topics when prerequisites are mastered", () => {
    const engine = new RoadmapEngine();
    const topics = sampleTopics();
    engine.registerTopicsByName(topics);

    const sliding = topics.find((t) => t.id === "sliding-window")!;
    expect(engine.isUnlocked(sliding, topics)).toBe(true);

    const notReady = makeTopic({
      id: "bst",
      name: "Binary Search Tree",
      prerequisites: ["trees"],
      status: "In progress",
    });
    expect(engine.isUnlocked(notReady, [...topics, notReady])).toBe(false);
  });

  it("detects prerequisite violations", () => {
    const engine = new RoadmapEngine();
    const topics = [
      makeTopic({ id: "trees", name: "Trees", status: "Not started" }),
      makeTopic({
        id: "bst",
        name: "Binary Search Tree",
        prerequisites: ["trees"],
        status: "In progress",
      }),
    ];
    engine.registerTopics(topics);
    const violations = engine.findPrerequisiteViolations(topics);
    expect(violations).toHaveLength(1);
    expect(violations[0].missingPrerequisites).toContain("Trees");
  });
});
