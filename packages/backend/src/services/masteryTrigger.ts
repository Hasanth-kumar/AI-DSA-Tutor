/**
 * Mastery-triggered generation (design §7). When most of a topic's cards are
 * mature (high stability / long intervals), mark the topic dirty so the batch
 * pipeline can expand coverage with harder cards — one trigger, no parallel cron.
 */
import type { CardRow } from "./cardTypes.js";

/** FSRS stability in days — cards at or above this count as "mature". */
export const MASTERY_STABILITY_DAYS = 21;

/** Fraction of non-suspended cards that must be mature before triggering. */
export const MASTERY_FRACTION = 0.8;

/** Minimum active cards before mastery expansion makes sense. */
export const MASTERY_MIN_CARDS = 3;

export function topicMaturityFraction(cards: readonly CardRow[]): number {
  const active = cards.filter((c) => c.suspended === 0);
  if (active.length === 0) return 0;
  const mature = active.filter((c) => (c.stability ?? 0) >= MASTERY_STABILITY_DAYS);
  return mature.length / active.length;
}

export function isTopicNearlyMature(cards: readonly CardRow[]): boolean {
  const active = cards.filter((c) => c.suspended === 0);
  return isNearlyMatureFromCounts(
    active.length,
    active.filter((c) => (c.stability ?? 0) >= MASTERY_STABILITY_DAYS).length,
  );
}

export function isNearlyMatureFromCounts(active: number, mature: number): boolean {
  if (active < MASTERY_MIN_CARDS) return false;
  return mature / active >= MASTERY_FRACTION;
}
