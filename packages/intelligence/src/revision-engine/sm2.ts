import type { SessionSnapshot, SM2State, TopicState } from "../types.js";
import { addDays } from "../utils/dates.js";

/** SM-2 quality: 0–5 (0 = blackout, 5 = perfect). */
export function sm2Update(state: SM2State, quality: number): SM2State {
  if (quality < 3) {
    return {
      ...state,
      interval: 1,
      repetition: 0,
      efactor: Math.max(1.3, state.efactor - 0.2),
      nextRevisionAt: addDays(new Date(), 1),
    };
  }

  const newEfactor = Math.max(
    1.3,
    state.efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  let newInterval: number;
  if (state.repetition === 0) newInterval = 1;
  else if (state.repetition === 1) newInterval = 6;
  else newInterval = Math.round(state.interval * newEfactor);

  return {
    interval: newInterval,
    repetition: state.repetition + 1,
    efactor: newEfactor,
    nextRevisionAt: addDays(new Date(), newInterval),
  };
}

export function topicToSM2Quality(
  _topic: TopicState,
  session: SessionSnapshot,
): number {
  const productivityNorm = session.productivityScore / 100;
  if (productivityNorm < 0.3) return 1;
  if (productivityNorm < 0.5) return 2;
  if (productivityNorm < 0.65) return 3;
  if (productivityNorm < 0.8) return 4;
  return 5;
}
