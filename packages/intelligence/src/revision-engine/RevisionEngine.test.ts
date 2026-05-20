import { describe, expect, it } from "vitest";
import { addDays } from "../utils/dates.js";
import { FIXED_NOW, makeTopic, sampleTopics } from "../test-fixtures/sample-topics.js";
import { RevisionEngine } from "./RevisionEngine.js";

describe("RevisionEngine", () => {
  const engine = new RevisionEngine();

  it("returns overdue topics sorted by most overdue first", () => {
    const queue = engine.getRevisionQueue(sampleTopics(), FIXED_NOW);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].id).toBe("two-pointers");
  });

  it("marks topics without nextRevisionAt as due when in progress", () => {
    const topic = makeTopic({
      id: "x",
      name: "X",
      status: "In progress",
      nextRevisionAt: null,
    });
    expect(engine.isDue(topic, FIXED_NOW)).toBe(true);
  });

  it("updates SM-2 state after a session", () => {
    const topic = makeTopic({ id: "t", name: "T", revisionCount: 2 });
    const session = {
      date: FIXED_NOW,
      problemsSolved: 2,
      productivityScore: 80,
      duration: 45,
    };
    const next = engine.updateAfterSession(topic, session);
    expect(next.repetition).toBe(3);
    expect(next.nextRevisionAt.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("excludes not-started topics from revision queue", () => {
    const topic = makeTopic({
      id: "new",
      name: "New",
      status: "Not started",
      nextRevisionAt: addDays(FIXED_NOW, -10),
    });
    expect(engine.getRevisionQueue([topic], FIXED_NOW)).toHaveLength(0);
  });
});
