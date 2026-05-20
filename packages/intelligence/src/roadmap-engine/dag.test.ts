import { describe, expect, it } from "vitest";
import { TopicDAG } from "./dag.js";

describe("TopicDAG", () => {
  it("collects transitive prerequisites", () => {
    const dag = new TopicDAG();
    dag.addEdge("a", "b");
    dag.addEdge("b", "c");
    expect(dag.getAllPrerequisites("c").sort()).toEqual(["a", "b"]);
  });

  it("checks unlock status against mastered set", () => {
    const dag = new TopicDAG();
    dag.addEdge("a", "b");
    expect(dag.isUnlocked("b", new Set(["a"]))).toBe(true);
    expect(dag.isUnlocked("b", new Set())).toBe(false);
  });

  it("detects cycles", () => {
    const dag = new TopicDAG();
    dag.addEdge("a", "b");
    dag.addEdge("b", "c");
    dag.addEdge("c", "a");
    expect(dag.hasCycle()).toBe(true);
  });
});
