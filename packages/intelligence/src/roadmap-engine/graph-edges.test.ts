import { describe, expect, it } from "vitest";
import { buildTopicGraphEdges } from "./graph-edges.js";

const topics = [
  { id: "tp", name: "Two Pointers", prerequisites: [] as string[] },
  { id: "sw", name: "Sliding Window", prerequisites: [] as string[] },
  { id: "bs", name: "Binary Search", prerequisites: [] as string[] },
  { id: "dp", name: "Dynamic Programming (1D)", prerequisites: [] as string[] },
  { id: "dps", name: "DP on Subarrays", prerequisites: [] as string[] },
  { id: "dijk", name: "Graph – Dijkstra's Algorithm", prerequisites: [] as string[] },
  { id: "bfs", name: "BFS", prerequisites: [] as string[] },
];

describe("buildTopicGraphEdges", () => {
  it("infers curriculum edges for matching topic names", () => {
    const edges = buildTopicGraphEdges(topics);
    expect(edges).toContainEqual({ from: "tp", to: "sw" });
    expect(edges).toContainEqual({ from: "dp", to: "dps" });
    expect(edges).toContainEqual({ from: "bfs", to: "dijk" });
  });

  it("includes explicit Notion/DB prerequisites", () => {
    const withPrereq = [
      ...topics,
      {
        id: "custom",
        name: "Custom Topic",
        prerequisites: ["bs"],
      },
    ];
    const edges = buildTopicGraphEdges(withPrereq);
    expect(edges).toContainEqual({ from: "bs", to: "custom" });
  });

  it("deduplicates overlapping edge sources", () => {
    const edges = buildTopicGraphEdges(topics);
    const tpToSw = edges.filter((e) => e.from === "tp" && e.to === "sw");
    expect(tpToSw).toHaveLength(1);
  });
});
