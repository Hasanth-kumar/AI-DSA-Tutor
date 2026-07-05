import { describe, expect, it } from "vitest";
import { makeTopic, sampleTopics } from "../test-fixtures/sample-topics.js";
import { WeaknessEngine } from "./WeaknessEngine.js";

describe("WeaknessEngine", () => {
  const engine = new WeaknessEngine();

  it("flags weak topics above threshold", () => {
    const weak = makeTopic({
      id: "w",
      name: "Weak",
      confidence: 30,
      isWeakArea: true,
      totalAttempts: 15,
      problemsSolved: 3,
      averageTimeTaken: 50,
      recentSessions: [
        { date: new Date(), problemsSolved: 1, productivityScore: 40, duration: 60 },
        { date: new Date(), problemsSolved: 1, productivityScore: 45, duration: 60 },
      ],
    });
    const analysis = engine.analyzeWeakness(weak);
    expect(analysis.isWeak).toBe(true);
    expect(analysis.signals.length).toBeGreaterThan(0);
  });

  it("reports weak and strong topics in batch", () => {
    const report = engine.detectAllWeaknesses(sampleTopics());
    expect(report.weakTopics.length).toBeGreaterThan(0);
    expect(report.summary).toContain("weak");
  });

  it("coach-reliant solving raises the weakness score (D)", () => {
    const base = {
      id: "c",
      name: "Coached",
      confidence: 75,
      problemsSolved: 4,
      totalAttempts: 5,
    };
    const cold = engine.analyzeWeakness(makeTopic(base));
    const assisted = engine.analyzeWeakness(
      makeTopic({ ...base, coachAssist: { assisted: 3, solved: 4 } }),
    );
    expect(assisted.score).toBeGreaterThan(cold.score);
    expect(assisted.signals.some((s) => s.name === "coach_reliance")).toBe(true);
    // Below the 2-solve floor the signal stays silent — no verdict on thin data.
    const thin = engine.analyzeWeakness(
      makeTopic({ ...base, coachAssist: { assisted: 1, solved: 1 } }),
    );
    expect(thin.signals.some((s) => s.name === "coach_reliance")).toBe(false);
  });
});
