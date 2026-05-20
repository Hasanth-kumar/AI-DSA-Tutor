import type {
  PriorityScore,
  PriorityWeights,
  TopicDifficulty,
  TopicState,
} from "../types.js";
import { differenceInDays } from "../utils/dates.js";

export const DEFAULT_WEIGHTS: PriorityWeights = {
  urgency: 0.3,
  weakness: 0.25,
  confidence: 0.2,
  prerequisite: 0.15,
  recency: 0.1,
};

export function urgencyScore(topic: TopicState, now: Date): number {
  if (!topic.lastRevised) return 1.0;
  if (!topic.nextRevisionAt) return 0.8;
  const daysOverdue = differenceInDays(now, topic.nextRevisionAt);
  if (daysOverdue <= 0) return 0;
  return Math.min(1, daysOverdue / 14);
}

export function weaknessScore(topic: TopicState): number {
  const signals = [
    topic.isWeakArea ? 0.4 : 0,
    topic.confidence < 40 ? 0.3 : topic.confidence < 60 ? 0.1 : 0,
    topic.totalAttempts > 0 && topic.problemsSolved / topic.totalAttempts < 0.5
      ? 0.2
      : 0,
    topic.averageTimeTaken > 45 ? 0.1 : 0,
  ];
  return Math.min(1, signals.reduce((a, b) => a + b, 0));
}

export function confidenceGapScore(topic: TopicState): number {
  return (100 - topic.confidence) / 100;
}

export function prerequisiteBonus(
  topic: TopicState,
  allTopics: Map<string, TopicState>,
): number {
  if (topic.prerequisites.length === 0) return 0.5;
  const prereqsMastered = topic.prerequisites.every(
    (id) => allTopics.get(id)?.status === "Mastered",
  );
  return prereqsMastered ? 1.0 : 0;
}

export function recencyScore(topic: TopicState, now: Date): number {
  if (!topic.lastRevised) return 1.0;
  const daysSince = differenceInDays(now, topic.lastRevised);
  return Math.min(1, daysSince / 30);
}

export function difficultyWeight(difficulty: TopicDifficulty): number {
  switch (difficulty) {
    case "Easy":
      return 1.0;
    case "Medium":
      return 0.95;
    case "Hard":
      return 0.9;
  }
}

export function classifyRecommendation(
  breakdown: PriorityScore["breakdown"],
): PriorityScore["recommendation"] {
  if (breakdown.urgency > 0.5 && breakdown.weakness > 0.4) return "Study now";
  if (breakdown.urgency > 0.5) return "Review soon";
  if (breakdown.weakness > 0.3 || breakdown.confidence > 0.5) return "Practice more";
  return "Maintain";
}

export function computePriorityScore(
  topic: TopicState,
  allTopics: Map<string, TopicState>,
  weights: PriorityWeights = DEFAULT_WEIGHTS,
  now: Date = new Date(),
): PriorityScore {
  const breakdown = {
    urgency: urgencyScore(topic, now),
    weakness: weaknessScore(topic),
    confidence: confidenceGapScore(topic),
    prerequisiteReady: prerequisiteBonus(topic, allTopics),
    recency: recencyScore(topic, now),
    difficulty: difficultyWeight(topic.difficulty),
  };

  const total = Math.min(
    100,
    (weights.urgency * breakdown.urgency +
      weights.weakness * breakdown.weakness +
      weights.confidence * breakdown.confidence +
      weights.prerequisite * breakdown.prerequisiteReady +
      weights.recency * breakdown.recency) *
      breakdown.difficulty *
      100,
  );

  return {
    topicId: topic.id,
    total,
    breakdown,
    recommendation: classifyRecommendation(breakdown),
  };
}
