import type { PriorityScore, PriorityWeights, TopicState } from "../types.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "./scoring.js";

export interface ScoredTopic {
  topic: TopicState;
  score: PriorityScore;
}

export class TopicPriorityEngine {
  constructor(
    private readonly defaultWeights: PriorityWeights = DEFAULT_WEIGHTS,
  ) {}

  get weights(): PriorityWeights {
    return this.defaultWeights;
  }

  scoreAll(
    topics: TopicState[],
    weights?: PriorityWeights,
    now: Date = new Date(),
  ): ScoredTopic[] {
    const map = new Map(topics.map((t) => [t.id, t]));
    return topics
      .map((topic) => ({
        topic,
        score: computePriorityScore(topic, map, weights, now),
      }))
      .sort((a, b) => b.score.total - a.score.total);
  }
}
