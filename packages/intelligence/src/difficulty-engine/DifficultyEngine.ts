import type {
  DifficultyRecommendation,
  SessionSnapshot,
  TopicDifficulty,
  TopicState,
} from "../types.js";

export class DifficultyEngine {
  recommendDifficulty(topic: TopicState): DifficultyRecommendation {
    const recentAvgProductivity = this.computeRecentProductivity(
      topic.recentSessions,
      3,
    );
    const { confidence } = topic;

    if (confidence >= 80 && recentAvgProductivity >= 75) {
      return { primary: "Hard", secondary: "Medium", ratio: [0.7, 0.3] };
    }
    if (confidence >= 60 && recentAvgProductivity >= 60) {
      return { primary: "Medium", secondary: "Hard", ratio: [0.8, 0.2] };
    }
    if (confidence >= 40) {
      return { primary: "Easy", secondary: "Medium", ratio: [0.7, 0.3] };
    }
    return { primary: "Easy", secondary: null, ratio: [1.0, 0] };
  }

  pickProblemDifficulties(
    recommendation: DifficultyRecommendation,
    count: number,
  ): TopicDifficulty[] {
    const result: TopicDifficulty[] = [];
    const [primaryRatio] = recommendation.ratio;
    const primaryCount = Math.round(count * primaryRatio);
    const secondaryCount = count - primaryCount;

    for (let i = 0; i < primaryCount; i++) {
      result.push(recommendation.primary);
    }
    if (recommendation.secondary && secondaryCount > 0) {
      for (let i = 0; i < secondaryCount; i++) {
        result.push(recommendation.secondary);
      }
    } else if (result.length < count) {
      while (result.length < count) result.push(recommendation.primary);
    }

    return result;
  }

  private computeRecentProductivity(
    sessions: SessionSnapshot[],
    n: number,
  ): number {
    const recent = sessions.slice(-n);
    if (recent.length === 0) return 50;
    return recent.reduce((acc, s) => acc + s.productivityScore, 0) / recent.length;
  }
}
