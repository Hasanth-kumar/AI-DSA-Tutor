import { describe, expect, it } from "vitest";
import {
  computeCardAnalytics,
  computeCardQuality,
  computeCoverageTrend,
  computeRetentionTrend,
  findRetireCandidates,
} from "./cardAnalytics.js";
import type { CardEventRecord } from "./types.js";

// Fixed clock so trailing-week buckets are deterministic.
const NOW = Date.parse("2026-06-27T12:00:00.000Z");
const DAY = 86_400_000;

function reviewed(cardId: string, rating: number, daysAgo: number): CardEventRecord {
  return {
    cardId,
    type: "CardReviewed",
    createdAt: NOW - daysAgo * DAY,
    payload: { rating, quality: rating === 1 ? 1 : rating },
  };
}

function generated(cardId: string, daysAgo: number, concepts: string[] = []): CardEventRecord {
  return { cardId, type: "CardGenerated", createdAt: NOW - daysAgo * DAY, payload: { concepts } };
}

describe("computeRetentionTrend", () => {
  it("buckets recalls vs lapses into trailing weeks", () => {
    const events: CardEventRecord[] = [
      reviewed("a", 4, 1), // this week, recall
      reviewed("a", 3, 2), // this week, recall
      reviewed("b", 1, 3), // this week, lapse
      reviewed("c", 4, 9), // last week, recall
    ];
    const trend = computeRetentionTrend(events, 2, NOW);
    expect(trend).toHaveLength(2);
    const lastWeek = trend[0]!;
    const thisWeek = trend[1]!;
    expect(lastWeek.reviews).toBe(1);
    expect(lastWeek.retention).toBe(1);
    expect(thisWeek.reviews).toBe(3);
    expect(thisWeek.recalled).toBe(2);
    expect(thisWeek.lapses).toBe(1);
    expect(thisWeek.retention).toBeCloseTo(0.67, 2);
  });

  it("reports zero retention for a week with no reviews", () => {
    const trend = computeRetentionTrend([reviewed("a", 4, 1)], 3, NOW);
    expect(trend[0]!.reviews).toBe(0);
    expect(trend[0]!.retention).toBe(0);
  });
});

describe("computeCoverageTrend", () => {
  it("tracks cumulative cards and distinct concepts over time", () => {
    const events: CardEventRecord[] = [
      generated("a", 9, ["two-pointers"]), // last week
      generated("b", 2, ["sliding-window"]), // this week
      generated("c", 1, ["two-pointers"]), // this week, concept repeats
      { cardId: "a", type: "CardDeleted", createdAt: NOW - 1 * DAY, payload: {} },
    ];
    const trend = computeCoverageTrend(events, 2, NOW);
    const lastWeek = trend[0]!;
    const thisWeek = trend[1]!;
    expect(lastWeek.cardsAdded).toBe(1);
    expect(lastWeek.cumulativeCards).toBe(1);
    expect(thisWeek.cardsAdded).toBe(2);
    expect(thisWeek.cardsRemoved).toBe(1);
    expect(thisWeek.cumulativeCards).toBe(2); // 1 + 2 - 1
    expect(thisWeek.cumulativeConcepts).toBe(2); // two-pointers, sliding-window
  });

  it("seeds cumulative totals from events before the trend window", () => {
    const events: CardEventRecord[] = [
      generated("old1", 30, ["a"]),
      generated("old2", 25, ["b"]),
      generated("new", 1, ["c"]),
    ];
    const trend = computeCoverageTrend(events, 2, NOW);
    expect(trend[1]!.cumulativeCards).toBe(3);
    expect(trend[1]!.cumulativeConcepts).toBe(3);
  });
});

describe("computeCardQuality", () => {
  it("folds review history into per-card retention and avgRating", () => {
    const events: CardEventRecord[] = [
      reviewed("a", 4, 5),
      reviewed("a", 1, 3),
      reviewed("a", 3, 1),
      { cardId: "a", type: "CardEdited", createdAt: NOW - 2 * DAY, payload: {} },
    ];
    const [q] = computeCardQuality(events);
    expect(q!.cardId).toBe("a");
    expect(q!.reviews).toBe(3);
    expect(q!.recalls).toBe(2);
    expect(q!.lapses).toBe(1);
    expect(q!.retention).toBeCloseTo(0.67, 2);
    expect(q!.avgRating).toBeCloseTo(2.67, 2);
    expect(q!.edits).toBe(1);
    expect(q!.lastReviewedAt).toBe(NOW - 1 * DAY);
  });

  it("flags leeches and unreviewed cards stay neutral-high", () => {
    const events: CardEventRecord[] = [
      generated("fresh", 1),
      { cardId: "leechy", type: "LeechDetected", createdAt: NOW, payload: { lapses: 8 } },
    ];
    const quality = computeCardQuality(events);
    const fresh = quality.find((q) => q.cardId === "fresh")!;
    const leechy = quality.find((q) => q.cardId === "leechy")!;
    expect(fresh.reviews).toBe(0);
    expect(fresh.qualityScore).toBe(1); // no negative signal
    expect(leechy.leech).toBe(true);
    expect(leechy.flags).toContain("leech");
    expect(leechy.qualityScore).toBeLessThan(1);
  });

  it("sorts worst quality first", () => {
    const events: CardEventRecord[] = [
      reviewed("good", 4, 1),
      reviewed("good", 4, 2),
      reviewed("bad", 1, 1),
      reviewed("bad", 1, 2),
    ];
    const quality = computeCardQuality(events);
    expect(quality[0]!.cardId).toBe("bad");
  });
});

describe("findRetireCandidates", () => {
  it("flags a reviewed card that keeps failing", () => {
    const events: CardEventRecord[] = [
      reviewed("dud", 1, 1),
      reviewed("dud", 1, 2),
      reviewed("dud", 4, 3),
      reviewed("dud", 1, 4),
      reviewed("dud", 1, 5),
      reviewed("dud", 1, 6),
    ];
    const quality = computeCardQuality(events);
    const candidates = findRetireCandidates(quality);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.cardId).toBe("dud");
    expect(candidates[0]!.reason).toMatch(/low retention/);
  });

  it("never retires suspended or deleted cards", () => {
    const events: CardEventRecord[] = [
      reviewed("s", 1, 1),
      reviewed("s", 1, 2),
      reviewed("s", 1, 3),
      reviewed("s", 1, 4),
      reviewed("s", 1, 5),
      { cardId: "s", type: "CardSuspended", createdAt: NOW, payload: {} },
    ];
    const quality = computeCardQuality(events);
    expect(findRetireCandidates(quality)).toHaveLength(0);
  });

  it("respects configurable thresholds", () => {
    const events: CardEventRecord[] = [
      reviewed("x", 1, 1),
      reviewed("x", 4, 2),
      reviewed("x", 4, 3),
    ];
    const quality = computeCardQuality(events);
    // Default minReviews=5 → not enough reviews to retire.
    expect(findRetireCandidates(quality)).toHaveLength(0);
    // Lower the bar → now it qualifies (retention 0.67 < 0.7).
    expect(findRetireCandidates(quality, { retireMinReviews: 3 })).toHaveLength(1);
  });
});

describe("computeCardAnalytics", () => {
  it("produces a coherent on-demand report from only the log", () => {
    const events: CardEventRecord[] = [
      generated("a", 10, ["two-pointers"]),
      generated("b", 10, ["sliding-window"]),
      reviewed("a", 4, 1),
      reviewed("a", 3, 2),
      reviewed("b", 1, 1),
      { cardId: "b", type: "LeechDetected", createdAt: NOW, payload: { lapses: 8 } },
    ];
    const report = computeCardAnalytics(events, { now: NOW, weeks: 4 });
    expect(report.summary.cardsEverSeen).toBe(2);
    expect(report.summary.liveCards).toBe(2);
    expect(report.summary.totalReviews).toBe(3);
    expect(report.summary.overallRetention).toBeCloseTo(0.67, 2);
    expect(report.summary.leechCards).toBe(1);
    expect(report.retentionTrend).toHaveLength(4);
    expect(report.coverageTrend.at(-1)!.cumulativeCards).toBe(2);
    expect(report.cardQuality).toHaveLength(2);
  });

  it("returns empty-but-valid output for an empty log", () => {
    const report = computeCardAnalytics([], { now: NOW, weeks: 3 });
    expect(report.summary.totalReviews).toBe(0);
    expect(report.summary.overallRetention).toBe(0);
    expect(report.retentionTrend).toHaveLength(3);
    expect(report.cardQuality).toHaveLength(0);
    expect(report.retireCandidates).toHaveLength(0);
  });
});
