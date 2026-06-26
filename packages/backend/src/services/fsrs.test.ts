import { describe, expect, it } from "vitest";
import { Rating, State } from "ts-fsrs";
import type { CardRow } from "./cardTypes.js";
import {
  LEECH_LAPSE_THRESHOLD,
  fsrsCardToPatch,
  reviewRow,
  rowToFsrsCard,
  selfGradeToRating,
} from "./fsrs.js";

/**
 * Per-card FSRS engine (design §7). Confirms the 0–5 self-grade → Rating map,
 * lossless row ↔ ts-fsrs round-trip, that a review advances scheduling on the
 * independent stability/difficulty axes, that a lapse on a mature card is
 * counted, and that the leech threshold raises the flag — none of which a
 * single SM-2 `ease` number could represent.
 */
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function cardRow(over: Partial<CardRow> = {}): CardRow {
  return {
    id: "c1",
    topicId: "t1",
    type: "plain-recall",
    front: "Q",
    back: "A",
    noteRef: null,
    suspended: 0,
    leech: 0,
    stability: null,
    difficulty: null,
    due: NOW,
    lastReview: null,
    reps: 0,
    lapses: 0,
    state: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    origin: "seed",
    sourceHash: null,
    modelVersion: null,
    promptVersion: null,
    noteVersion: null,
    seedVersion: 1,
    notionPageId: null,
    dirty: 1,
    syncedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as CardRow;
}

describe("selfGradeToRating", () => {
  it("maps the 0–5 self-grade scale onto FSRS ratings", () => {
    expect(selfGradeToRating(0)).toBe(Rating.Again);
    expect(selfGradeToRating(2)).toBe(Rating.Again);
    expect(selfGradeToRating(3)).toBe(Rating.Hard);
    expect(selfGradeToRating(4)).toBe(Rating.Good);
    expect(selfGradeToRating(5)).toBe(Rating.Easy);
  });
});

describe("row ↔ ts-fsrs round-trip", () => {
  it("preserves state with no NaNs", () => {
    const fsrsCard = rowToFsrsCard(cardRow({ stability: 12.5, difficulty: 6.1, state: 2, reps: 4 }), NOW);
    const patch = fsrsCardToPatch(fsrsCard);
    expect(patch.stability).toBeCloseTo(12.5);
    expect(patch.difficulty).toBeCloseTo(6.1);
    expect(patch.state).toBe(2);
    expect(patch.reps).toBe(4);
    expect(Number.isNaN(patch.due)).toBe(false);
  });
});

describe("reviewRow", () => {
  it("a Good review of a new card schedules it forward with both axes set", () => {
    const { patch, intervalDays, leechTriggered } = reviewRow(cardRow(), 4, NOW);
    expect(patch.reps).toBe(1);
    expect(patch.due).toBeGreaterThan(NOW);
    expect(patch.stability).toBeGreaterThan(0);
    expect(patch.difficulty).toBeGreaterThan(0);
    // Independent axes: stability (retrievability driver) ≠ difficulty.
    expect(patch.stability).not.toBe(patch.difficulty);
    expect(intervalDays).toBeGreaterThanOrEqual(0);
    expect(leechTriggered).toBe(false);
  });

  it("a lapse on a mature (Review) card is counted and relearns", () => {
    const mature = cardRow({ state: State.Review, stability: 30, difficulty: 5, reps: 6, lapses: 0, due: NOW });
    const { patch } = reviewRow(mature, 1, NOW); // Forgot
    expect(patch.lapses).toBe(1);
    expect(patch.state).toBe(State.Relearning);
  });

  it("flags a leech once lapses cross the threshold", () => {
    const almost = cardRow({
      state: State.Review,
      stability: 8,
      difficulty: 7,
      reps: 20,
      lapses: LEECH_LAPSE_THRESHOLD - 1,
      due: NOW,
    });
    const { patch, leechTriggered } = reviewRow(almost, 1, NOW);
    expect(patch.lapses).toBe(LEECH_LAPSE_THRESHOLD);
    expect(leechTriggered).toBe(true);
    expect(patch.leech).toBe(true);
  });

  it("does not re-flag a card already marked a leech", () => {
    const leeched = cardRow({ leech: 1, state: State.Review, lapses: LEECH_LAPSE_THRESHOLD, due: NOW });
    const { leechTriggered } = reviewRow(leeched, 1, NOW);
    expect(leechTriggered).toBe(false);
  });

  it("Easy schedules further out than Hard", () => {
    const base = cardRow({ state: State.Review, stability: 10, difficulty: 5, reps: 5, due: NOW });
    const easy = reviewRow(base, 5, NOW).patch.due;
    const hard = reviewRow(base, 3, NOW).patch.due;
    expect(easy).toBeGreaterThan(hard);
    expect(hard - NOW).toBeGreaterThan(DAY); // a mature card still goes out at least a day
  });
});
