import type { TopicState, WeaknessSignal } from "../types.js";

const SIGNAL_WEIGHTS = {
  confidence: 0.3,
  retryRate: 0.25,
  slowTime: 0.15,
  sessionProductivity: 0.15,
  revisionFailure: 0.15,
} as const;

export function confidenceSignal(topic: TopicState): WeaknessSignal {
  let value = 0;
  if (topic.confidence < 50) value = 1;
  else if (topic.confidence < 70) value = 0.5;

  return {
    name: "low_confidence",
    weight: SIGNAL_WEIGHTS.confidence,
    value,
    description:
      value > 0
        ? `Confidence is ${topic.confidence}% (below target)`
        : "Confidence is adequate",
  };
}

export function retryRateSignal(topic: TopicState): WeaknessSignal {
  const ratio =
    topic.problemsSolved > 0
      ? topic.totalAttempts / topic.problemsSolved
      : topic.totalAttempts > 0
        ? 3
        : 0;
  const value = ratio > 2.5 ? 1 : ratio > 1.5 ? 0.5 : 0;

  return {
    name: "high_retry_rate",
    weight: SIGNAL_WEIGHTS.retryRate,
    value,
    description:
      value > 0
        ? `High retry ratio (${ratio.toFixed(1)} attempts per solve)`
        : "Retry rate is normal",
  };
}

export function timeSignal(topic: TopicState): WeaknessSignal {
  const value = topic.averageTimeTaken > 45 ? 1 : topic.averageTimeTaken > 30 ? 0.5 : 0;

  return {
    name: "slow_solution_time",
    weight: SIGNAL_WEIGHTS.slowTime,
    value,
    description:
      value > 0
        ? `Average time ${topic.averageTimeTaken} min (above 45 min threshold)`
        : "Solution time is acceptable",
  };
}

export function sessionProductivitySignal(topic: TopicState): WeaknessSignal {
  const sessions = topic.recentSessions;
  if (sessions.length === 0) {
    return {
      name: "low_session_productivity",
      weight: SIGNAL_WEIGHTS.sessionProductivity,
      value: 0,
      description: "No recent sessions to evaluate",
    };
  }

  const avg =
    sessions.reduce((acc, s) => acc + s.productivityScore, 0) / sessions.length;
  const value = avg < 60 ? 1 : avg < 75 ? 0.5 : 0;

  return {
    name: "low_session_productivity",
    weight: SIGNAL_WEIGHTS.sessionProductivity,
    value,
    description:
      value > 0
        ? `Recent session productivity avg ${avg.toFixed(0)}%`
        : "Session productivity is healthy",
  };
}

export function revisionFailureSignal(topic: TopicState): WeaknessSignal {
  const recent = topic.recentSessions.slice(-3);
  const failures = recent.filter((s) => s.productivityScore < 60).length;
  const value =
    failures >= 2 ? 1 : failures === 1 ? 0.5 : topic.revisionCount > 0 && topic.confidence < 50 ? 0.5 : 0;

  return {
    name: "revision_failures",
    weight: SIGNAL_WEIGHTS.revisionFailure,
    value,
    description:
      value > 0
        ? `${failures} recent low-productivity sessions`
        : "Revision performance is stable",
  };
}

export const WEAKNESS_THRESHOLD = 0.45;
