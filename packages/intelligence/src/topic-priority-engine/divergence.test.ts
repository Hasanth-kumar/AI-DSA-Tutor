/**
 * Cross-cutting — surface the memory/execution divergence (TDD spec).
 *
 * RED until the cross-cutting change lands. ADR Decision B keeps SM-2 (memory)
 * and execution analytics separate — but that separation can HIDE the most
 * important signal: "I can recall it, but I still can't solve it." When SM-2
 * says a topic is not due (or far out) yet weakness/execution is high, the topic
 * must NOT silently drop off the plan — the Priority Engine should rank it up
 * and flag the divergence.
 *
 * Target: `PriorityScore` gains `memoryExecutionDivergence: boolean`, set when
 * urgency ≈ 0 (not due per SM-2) but weakness is high.
 */
import { describe, expect, it } from "vitest";
import { addDays } from "../utils/dates.js";
import { FIXED_NOW, makeTopic } from "../test-fixtures/sample-topics.js";
import { TopicPriorityEngine } from "./TopicPriorityEngine.js";

const engine = new TopicPriorityEngine();

// Recallable-but-unsolvable: SM-2 not due (far-future review) but weak execution.
const divergent = makeTopic({
  id: "divergent",
  name: "Backtracking",
  nextRevisionAt: addDays(FIXED_NOW, 20), // SM-2: not due, urgency ~0
  isWeakArea: true,
  confidence: 30,
  problemsSolved: 2,
  totalAttempts: 10, // poor solve ratio
  averageTimeTaken: 60, // slow
});

// Genuinely fine: not due AND strong execution — should stay low / "Maintain".
const maintained = makeTopic({
  id: "maintained",
  name: "Arrays",
  nextRevisionAt: addDays(FIXED_NOW, 20),
  isWeakArea: false,
  confidence: 90,
  problemsSolved: 9,
  totalAttempts: 10,
  averageTimeTaken: 20,
});

describe("Priority Engine surfaces memory/execution divergence", () => {
  it("flags a not-due-but-weak topic as divergent", () => {
    const [scored] = engine.scoreAll([divergent], undefined, FIXED_NOW);
    expect(scored.score.breakdown.urgency).toBeLessThan(0.1); // SM-2 says not due
    expect(scored.score.memoryExecutionDivergence).toBe(true);
  });

  it("does NOT flag a not-due topic with strong execution", () => {
    const [scored] = engine.scoreAll([maintained], undefined, FIXED_NOW);
    expect(scored.score.memoryExecutionDivergence).toBe(false);
  });

  it("ranks the divergent topic above the maintained one so it stays on the plan", () => {
    const ranked = engine.scoreAll([maintained, divergent], undefined, FIXED_NOW);
    expect(ranked[0].topic.id).toBe("divergent");
  });
});
