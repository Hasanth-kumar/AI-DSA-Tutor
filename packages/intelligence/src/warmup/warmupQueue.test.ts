/**
 * Phase 4 — "Again" behavior in warm-up (TDD spec).
 *
 * RED until Phase 4 lands. The queue/cap/last-grade logic currently lives inline
 * in `WarmupCard.tsx` and only ever advances (a "Forgot" grade is treated the
 * same as any other). The frontend has no test runner and isn't in the vitest
 * workspace, so this spec drives EXTRACTING the logic into a pure reducer at
 * `packages/intelligence/src/warmup/warmupQueue.ts` — fitting the "engines are
 * pure computation, no I/O" rule — which the component then consumes.
 *
 * Encodes ADR Decision C:
 *   - Forgot (quality < 3) re-queues the question at the END of the queue.
 *   - Hard / Good / Easy (>= 3) mark the question done and advance.
 *   - Safety cap: at most `maxExtraPasses` (default 2) re-queues per question,
 *     then auto-advance carrying the LAST grade.
 *   - Topic grade = last grade per question, averaged for SM-2 (same as today).
 */
import { describe, expect, it } from "vitest";
import {
  gradeWarmup,
  initWarmupQueue,
  warmupAverageQuality,
} from "./warmupQueue.js";

describe("warmup queue — Forgot re-queues at end (Phase 4)", () => {
  it("Forgot → Good on a single question recovers with final grade Good", () => {
    let q = initWarmupQueue(1);
    q = gradeWarmup(q, 1); // Forgot
    expect(q.done).toBe(false);
    expect(q.currentIndex).toBe(0); // re-queued, only question left

    q = gradeWarmup(q, 4); // Good
    expect(q.done).toBe(true);
    expect(q.finalGrades[0]).toBe(4); // last grade wins, not the Forgot
    expect(warmupAverageQuality(q)).toBe(4);
  });

  it("re-queues to the END: other questions are shown before the retry", () => {
    let q = initWarmupQueue(2); // questions [0, 1], current = 0
    q = gradeWarmup(q, 1); // Forgot question 0 → queue becomes [1, 0]
    expect(q.done).toBe(false);
    expect(q.currentIndex).toBe(1); // question 1 next, NOT an immediate retry

    q = gradeWarmup(q, 4); // Good on 1
    expect(q.currentIndex).toBe(0); // now the re-queued 0

    q = gradeWarmup(q, 3); // Hard on 0 → advance
    expect(q.done).toBe(true);
  });

  it("Hard/Good/Easy advance immediately without re-queueing", () => {
    let q = initWarmupQueue(3);
    q = gradeWarmup(q, 3); // Hard
    q = gradeWarmup(q, 4); // Good
    q = gradeWarmup(q, 5); // Easy
    expect(q.done).toBe(true);
    expect(q.finalGrades).toEqual({ 0: 3, 1: 4, 2: 5 });
  });
});

describe("warmup queue — safety cap (Phase 4)", () => {
  it("auto-advances after maxExtraPasses re-queues, carrying the last grade", () => {
    let q = initWarmupQueue(1, { maxExtraPasses: 2 });
    q = gradeWarmup(q, 1); // attempt 1 (forgot) → re-queue
    q = gradeWarmup(q, 1); // attempt 2 (forgot) → re-queue
    expect(q.done).toBe(false);

    q = gradeWarmup(q, 1); // attempt 3 (forgot) → cap hit, auto-advance
    expect(q.done).toBe(true);
    expect(q.finalGrades[0]).toBe(1); // last grade carried through
  });

  it("never loops forever even if every question is always Forgot", () => {
    let q = initWarmupQueue(3, { maxExtraPasses: 2 });
    let guard = 0;
    while (!q.done && guard < 100) {
      q = gradeWarmup(q, 1);
      guard++;
    }
    expect(q.done).toBe(true);
    expect(guard).toBeLessThan(100); // terminated via cap, not the guard
  });
});

describe("warmup queue — grade feeding SM-2 is unchanged (Phase 4)", () => {
  it("averages the FINAL grade per question (rounded the same as today)", () => {
    let q = initWarmupQueue(3);
    q = gradeWarmup(q, 1); // 0 Forgot → re-queue (current → 1)
    q = gradeWarmup(q, 5); // 1 Easy
    q = gradeWarmup(q, 3); // 2 Hard
    q = gradeWarmup(q, 4); // 0 recovered to Good
    expect(q.done).toBe(true);

    // finals = {0:4, 1:5, 2:3} → mean 4 → Math.round(4) = 4 (call-site rounding
    // matches WarmupCard's existing `Math.round(quality)`).
    expect(warmupAverageQuality(q)).toBeCloseTo(4, 5);
    expect(Math.round(warmupAverageQuality(q))).toBe(4);
  });
});
