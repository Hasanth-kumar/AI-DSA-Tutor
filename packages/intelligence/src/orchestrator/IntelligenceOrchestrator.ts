import { DifficultyEngine } from "../difficulty-engine/DifficultyEngine.js";
import { ProblemReviewEngine } from "../problem-review-engine/ProblemReviewEngine.js";
import { RevisionEngine } from "../revision-engine/RevisionEngine.js";
import { TopicPriorityEngine } from "../topic-priority-engine/TopicPriorityEngine.js";
import type {
  IntelligenceUpdate,
  PriorityScore,
  PriorityWeights,
  SessionSnapshot,
  TopicState,
} from "../types.js";
import { explainPriorityScore } from "../topic-priority-engine/explain.js";
import { computePriorityScore } from "../topic-priority-engine/scoring.js";
import { WeaknessEngine } from "../weakness-engine/WeaknessEngine.js";

export class IntelligenceOrchestrator {
  constructor(
    private readonly topicPriority: TopicPriorityEngine,
    private readonly revision: RevisionEngine,
    private readonly weakness: WeaknessEngine,
    private readonly difficulty: DifficultyEngine,
    /** Problem re-solve decisions (§8) — stateless, exposed directly. */
    readonly problemReview: ProblemReviewEngine = new ProblemReviewEngine(),
  ) {}

  explainTopicScore(topic: TopicState, allTopics: TopicState[]) {
    const map = new Map(allTopics.map((t) => [t.id, t]));
    const score = computePriorityScore(
      topic,
      map,
      this.topicPriority.weights,
    );
    return explainPriorityScore(score, topic);
  }

  updateAfterSession(
    topic: TopicState,
    session: SessionSnapshot,
  ): IntelligenceUpdate {
    const sm2 = this.revision.updateAfterSession(topic, session);
    const weaknessUpdate = this.analyzeWeaknessAfterSession(topic, session);
    return { sm2, weaknessUpdate };
  }

  /**
   * Execution-only path when warm-up already drove SRS for this topic today.
   * Updates weakness signals without touching SM-2 / nextRevisionAt.
   */
  updateExecutionAfterSession(topic: TopicState, session: SessionSnapshot) {
    return {
      weaknessUpdate: this.analyzeWeaknessAfterSession(topic, session),
    };
  }

  private analyzeWeaknessAfterSession(topic: TopicState, session: SessionSnapshot) {
    return this.weakness.analyzeWeakness({
      ...topic,
      recentSessions: [...topic.recentSessions, session],
    });
  }

  getRevisionQueue(topics: TopicState[]): TopicState[] {
    return this.revision.getRevisionQueue(topics);
  }

  /** Catch-up compression for the revision backlog (see RevisionEngine.compressQueue). */
  compressRevisionQueue(
    queue: TopicState[],
    options?: { maxPerDay?: number; overdueTolerance?: number },
    now?: Date,
  ): ReturnType<RevisionEngine["compressQueue"]> {
    return this.revision.compressQueue(queue, options, now);
  }

  /** Apply an explicit SM-2 quality (0–5) from a recall warm-up grade. */
  applyRecallQuality(topic: TopicState, quality: number) {
    return this.revision.applyQuality(topic, quality);
  }

  getWeaknessReport(topics: TopicState[]) {
    return this.weakness.detectAllWeaknesses(topics);
  }

  analyzeTopicWeakness(topic: TopicState) {
    return this.weakness.analyzeWeakness(topic);
  }

  getDifficultyRecommendation(topic: TopicState) {
    return this.difficulty.recommendDifficulty(topic);
  }

  scoreTopics(topics: TopicState[]): PriorityScore[] {
    return this.topicPriority.scoreAll(topics).map((s) => s.score);
  }
}

export function createIntelligenceOrchestrator(
  weights?: PriorityWeights,
): IntelligenceOrchestrator {
  const revision = new RevisionEngine();
  const weakness = new WeaknessEngine();
  const difficulty = new DifficultyEngine();
  const topicPriority = new TopicPriorityEngine(weights);

  return new IntelligenceOrchestrator(
    topicPriority,
    revision,
    weakness,
    difficulty,
    new ProblemReviewEngine(),
  );
}
