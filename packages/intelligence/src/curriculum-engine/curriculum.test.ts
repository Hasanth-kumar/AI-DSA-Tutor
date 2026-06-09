import { describe, expect, it } from "vitest";
import { makeTopic } from "../test-fixtures/sample-topics.js";
import {
  CurriculumEngine,
  resolveTopicByLabel,
  type TopicProblemCounts,
} from "./CurriculumEngine.js";

describe("CurriculumEngine", () => {
  const engine = new CurriculumEngine();

  const topics = [
    makeTopic({ id: "bs", name: "Binary Search", status: "In progress" }),
    makeTopic({ id: "trees", name: "Trees", status: "Not started" }),
    makeTopic({ id: "dp", name: "Dynamic Programming", status: "Not started" }),
  ];

  const counts = new Map<string, TopicProblemCounts>([
    ["bs", { total: 3, unsolved: 2 }],
    ["trees", { total: 4, unsolved: 4 }],
    ["dp", { total: 2, unsolved: 2 }],
  ]);

  it("resolves DP alias to Dynamic Programming", () => {
    expect(resolveTopicByLabel("DP", topics)?.id).toBe("dp");
  });

  it("selects first topic with unsolved problems in order", () => {
    const result = engine.selectCurrentTopic(
      { topicNames: ["Binary Search", "Trees", "DP"] },
      topics,
      counts,
    );
    expect(result?.topic.id).toBe("bs");
    expect(result?.index).toBe(0);
    expect(result?.items[0]?.status).toBe("current");
  });

  it("advances when earlier topics are complete", () => {
    const doneCounts = new Map<string, TopicProblemCounts>([
      ["bs", { total: 3, unsolved: 0 }],
      ["trees", { total: 4, unsolved: 2 }],
      ["dp", { total: 2, unsolved: 2 }],
    ]);
    const result = engine.selectCurrentTopic(
      { topicNames: ["Binary Search", "Trees", "DP"] },
      topics,
      doneCounts,
    );
    expect(result?.topic.id).toBe("trees");
    expect(result?.items[0]?.status).toBe("complete");
    expect(result?.items[1]?.status).toBe("current");
  });

  it("honours manual active topic override", () => {
    const result = engine.selectCurrentTopic(
      {
        topicNames: ["Binary Search", "Trees", "DP"],
        activeTopicId: "dp",
      },
      topics,
      counts,
    );
    expect(result?.topic.id).toBe("dp");
    expect(result?.reasoning).toContain("manual selection");
  });
});
