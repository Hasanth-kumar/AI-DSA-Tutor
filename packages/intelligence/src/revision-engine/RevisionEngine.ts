import type { SessionSnapshot, TopicState } from "../types.js";
import { differenceInDays, isBefore } from "../utils/dates.js";
import type { SM2State } from "../types.js";
import { sm2Update, topicToSM2Quality } from "./sm2.js";

export class RevisionEngine {
  isDue(topic: TopicState, now: Date = new Date()): boolean {
    if (topic.status === "Not started") return false;
    if (!topic.nextRevisionAt) return true;
    return isBefore(topic.nextRevisionAt, now);
  }

  getRevisionQueue(topics: TopicState[], now: Date = new Date()): TopicState[] {
    return topics
      .filter((t) => t.status !== "Not started" && this.isDue(t, now))
      .sort((a, b) => {
        const aDays = a.nextRevisionAt
          ? differenceInDays(now, a.nextRevisionAt)
          : 999;
        const bDays = b.nextRevisionAt
          ? differenceInDays(now, b.nextRevisionAt)
          : 999;
        return bDays - aDays;
      });
  }

  updateAfterSession(
    topic: TopicState,
    session: SessionSnapshot,
  ): SM2State {
    const quality = topicToSM2Quality(topic, session);
    const currentState: SM2State = {
      interval: topic.revisionCount > 0 ? topic.revisionCount : 1,
      repetition: topic.revisionCount,
      efactor: this.computeEfactor(topic),
      nextRevisionAt: topic.nextRevisionAt ?? topic.lastRevised ?? new Date(),
    };
    return sm2Update(currentState, quality);
  }

  private computeEfactor(topic: TopicState): number {
    const base = 2.5;
    const penalty = topic.isWeakArea ? 0.2 : 0;
    const confidenceAdjust = (100 - topic.confidence) / 500;
    return Math.max(1.3, Math.min(2.5, base - penalty - confidenceAdjust));
  }
}
