import { describe, expect, it } from "vitest";
import { sm2Update, topicToSM2Quality } from "./sm2.js";
import { makeTopic } from "../test-fixtures/sample-topics.js";

describe("sm2Update", () => {
  const base = {
    interval: 6,
    repetition: 2,
    efactor: 2.5,
    nextRevisionAt: new Date("2025-01-01"),
  };

  it("resets on quality < 3", () => {
    const next = sm2Update(base, 2);
    expect(next.repetition).toBe(0);
    expect(next.interval).toBe(1);
    expect(next.efactor).toBeLessThan(base.efactor);
  });

  it("extends interval on successful review", () => {
    const next = sm2Update(base, 4);
    expect(next.repetition).toBe(3);
    expect(next.interval).toBeGreaterThan(base.interval);
    expect(next.efactor).toBeGreaterThanOrEqual(1.3);
  });

  it("uses 1-day then 6-day intervals for early repetitions", () => {
    const first = sm2Update(
      { ...base, repetition: 0, interval: 1 },
      4,
    );
    expect(first.interval).toBe(1);

    const second = sm2Update(first, 4);
    expect(second.interval).toBe(6);
  });
});

describe("topicToSM2Quality", () => {
  it("maps productivity to SM-2 quality bands", () => {
    const topic = makeTopic({ id: "t", name: "T" });
    expect(
      topicToSM2Quality(topic, {
        date: new Date(),
        problemsSolved: 1,
        productivityScore: 20,
        duration: 30,
      }),
    ).toBe(1);
    expect(
      topicToSM2Quality(topic, {
        date: new Date(),
        problemsSolved: 1,
        productivityScore: 85,
        duration: 30,
      }),
    ).toBe(5);
  });
});
