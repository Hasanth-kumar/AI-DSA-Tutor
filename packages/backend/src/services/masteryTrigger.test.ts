import { describe, expect, it } from "vitest";
import { isNearlyMatureFromCounts, isTopicNearlyMature, topicMaturityFraction } from "./masteryTrigger.js";
import type { CardRow } from "./cardTypes.js";

function card(stability: number, suspended = 0): CardRow {
  return { stability, suspended } as CardRow;
}

describe("masteryTrigger", () => {
  it("counts mature cards by stability threshold", () => {
    const cards = [card(30), card(25), card(5), card(0)];
    expect(topicMaturityFraction(cards)).toBeCloseTo(0.5);
  });

  it("triggers when enough cards are mature", () => {
    const mature = Array.from({ length: 8 }, () => card(30));
    const young = [card(1), card(2)];
    expect(isTopicNearlyMature([...mature, ...young])).toBe(true);
  });

  it("does not trigger with too few cards", () => {
    expect(isTopicNearlyMature([card(30), card(40)])).toBe(false);
    expect(isNearlyMatureFromCounts(2, 2)).toBe(false);
  });
});
