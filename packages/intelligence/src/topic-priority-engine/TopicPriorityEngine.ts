import type {
  DifficultyRecommendation,
  PlanOptions,
  PriorityScore,
  PriorityWeights,
  ProblemSuggestion,
  StudyPlan,
  TopicState,
} from "../types.js";
import type { RevisionEngine } from "../revision-engine/RevisionEngine.js";
import { computePriorityScore, DEFAULT_WEIGHTS } from "./scoring.js";

export interface ScoredTopic {
  topic: TopicState;
  score: PriorityScore;
}

export class TopicPriorityEngine {
  constructor(
    private readonly revisionEngine: RevisionEngine,
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

  generatePlan(
    topics: TopicState[],
    options: PlanOptions = {},
    now: Date = new Date(),
  ): StudyPlan {
    const allTopicsMap = new Map(topics.map((t) => [t.id, t]));

    const scored = topics
      .filter(
        (t) => t.status !== "Mastered" || this.revisionEngine.isDue(t, now),
      )
      .map((t) => ({
        topic: t,
        score: computePriorityScore(t, allTopicsMap, this.defaultWeights, now),
      }))
      .sort((a, b) => b.score.total - a.score.total);

    if (scored.length === 0) {
      throw new Error("No eligible topics to build a study plan");
    }

    const [primary, ...rest] = scored;
    const maxRevision = options.maxRevisionTopics ?? 2;
    const revisionTopics = rest
      .filter((s) => s.score.breakdown.urgency > 0.5)
      .slice(0, maxRevision)
      .map((s) => s.topic);

    return {
      date: now,
      primaryTopic: primary.topic,
      revisionTopics,
      suggestedProblems: this.selectProblems(primary.topic),
      estimatedDuration: this.estimateDuration(primary.topic, revisionTopics),
      reasoning: this.explainPlan(primary, revisionTopics),
    };
  }

  buildPlan(
    scored: ScoredTopic[],
    difficultyRec: DifficultyRecommendation,
    options: PlanOptions = {},
    suggestedProblems?: ProblemSuggestion[],
  ): StudyPlan {
    if (scored.length === 0) {
      throw new Error("No scored topics to build a study plan");
    }

    const [primary, ...rest] = scored;
    const maxRevision = options.maxRevisionTopics ?? 2;
    const revisionTopics = rest
      .filter((s) => s.score.breakdown.urgency > 0.5)
      .slice(0, maxRevision)
      .map((s) => s.topic);

    const difficulties = [difficultyRec.primary];
    if (difficultyRec.secondary) difficulties.push(difficultyRec.secondary);

    const problems =
      suggestedProblems ??
      difficulties.map((d, i) => ({
        problemId: `${primary.topic.id}-suggested-${i}`,
        name: `${primary.topic.name} — ${d} practice`,
        difficulty: d,
      }));

    return {
      date: new Date(),
      primaryTopic: primary.topic,
      revisionTopics,
      suggestedProblems: problems,
      estimatedDuration: this.estimateDuration(primary.topic, revisionTopics),
      reasoning: this.explainPlan(primary, revisionTopics),
    };
  }

  private selectProblems(topic: TopicState): ProblemSuggestion[] {
    return [
      {
        problemId: `${topic.id}-practice-1`,
        name: `${topic.name} — ${topic.difficulty} practice`,
        difficulty: topic.difficulty,
      },
    ];
  }

  private estimateDuration(
    primary: TopicState,
    revisions: TopicState[],
  ): number {
    const base = 45 + (100 - primary.confidence) * 0.3;
    const revisionMinutes = revisions.length * 25;
    return Math.round(base + revisionMinutes);
  }

  private explainPlan(
    primary: ScoredTopic,
    revisionTopics: TopicState[],
  ): string {
    const b = primary.score.breakdown;
    const parts = [
      `Primary focus: ${primary.topic.name} (score ${primary.score.total.toFixed(0)}/100, ${primary.score.recommendation}).`,
      `Drivers: urgency ${(b.urgency * 100).toFixed(0)}%, weakness ${(b.weakness * 100).toFixed(0)}%, confidence gap ${(b.confidence * 100).toFixed(0)}%.`,
    ];
    if (revisionTopics.length > 0) {
      parts.push(
        `Revision: ${revisionTopics.map((t) => t.name).join(", ")}.`,
      );
    }
    return parts.join(" ");
  }
}
