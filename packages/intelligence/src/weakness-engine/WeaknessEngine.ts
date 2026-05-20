import type { TopicState, WeaknessAnalysis, WeaknessReport } from "../types.js";
import {
  confidenceSignal,
  revisionFailureSignal,
  retryRateSignal,
  sessionProductivitySignal,
  timeSignal,
  WEAKNESS_THRESHOLD,
} from "./signals.js";

export class WeaknessEngine {
  analyzeWeakness(topic: TopicState): WeaknessAnalysis {
    const signals = [
      confidenceSignal(topic),
      retryRateSignal(topic),
      timeSignal(topic),
      sessionProductivitySignal(topic),
      revisionFailureSignal(topic),
    ];

    const score = signals.reduce((acc, s) => acc + s.weight * s.value, 0);
    const isWeak = score > WEAKNESS_THRESHOLD;

    return {
      topicId: topic.id,
      score,
      isWeak,
      signals: signals.filter((s) => s.value > 0),
      recommendation: this.buildRecommendation(signals, isWeak),
    };
  }

  detectAllWeaknesses(topics: TopicState[]): WeaknessReport {
    const analyses = topics.map((t) => this.analyzeWeakness(t));
    const weakTopics = analyses.filter((a) => a.isWeak);
    const strongTopics = analyses.filter((a) => !a.isWeak && a.score < 0.2);

    return {
      weakTopics,
      strongTopics,
      summary: this.summarize(analyses, weakTopics.length),
    };
  }

  private buildRecommendation(
    signals: ReturnType<typeof confidenceSignal>[],
    isWeak: boolean,
  ): string {
    if (!isWeak) return "Continue current pace; no major weakness detected.";

    const active = signals.filter((s) => s.value > 0).map((s) => s.name);
    if (active.includes("low_confidence")) {
      return "Rebuild fundamentals: review concepts, then solve easy problems.";
    }
    if (active.includes("high_retry_rate")) {
      return "Focus on pattern recognition; study solutions before re-attempting.";
    }
    if (active.includes("slow_solution_time")) {
      return "Practice timed easy/medium problems to build speed.";
    }
    return "Schedule extra revision sessions and track productivity per session.";
  }

  private summarize(
    analyses: WeaknessAnalysis[],
    weakCount: number,
  ): string {
    if (weakCount === 0) {
      return `All ${analyses.length} topics look stable — maintain with spaced revision.`;
    }
    return `${weakCount} of ${analyses.length} topics flagged as weak areas needing focused practice.`;
  }
}
