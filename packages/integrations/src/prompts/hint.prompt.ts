import type { TopicDifficulty } from "@dsa/intelligence";
import type { HintContext } from "./types.js";

const DIFFICULTY_GUIDANCE: Record<TopicDifficulty, string> = {
  Easy:
    "Give a gentle nudge toward the basic pattern. Mention a simple example or brute-force starting point.",
  Medium:
    "Point toward the optimal pattern without naming the full algorithm. Suggest what to optimize from a naive approach.",
  Hard:
    "Focus on the key insight or invariant. Reference advanced techniques only if confidence is high; otherwise break the problem into stages.",
};

export function buildHintPrompt(ctx: HintContext): string {
  const guidance = DIFFICULTY_GUIDANCE[ctx.difficulty];
  const recLine = ctx.recommendedDifficulty
    ? `Engine recommends practicing ${ctx.recommendedDifficulty} problems for this topic.`
    : "";

  return `You are a DSA tutor helping a developer master algorithms.

Problem: ${ctx.problemName}
Topic: ${ctx.topicName}
Problem difficulty: ${ctx.difficulty}
Student confidence: ${ctx.confidence}/100
Previous attempts: ${ctx.attempts}
${recLine}

Difficulty-specific guidance: ${guidance}

Provide a targeted hint that:
1. Does NOT give away the solution or code
2. Points toward the right pattern/approach for a ${ctx.difficulty} problem
3. Calibrates depth to confidence (${ctx.confidence}/100) — lower confidence = more foundational
4. References the underlying ${ctx.topicName} concept

Keep it under 150 words.`;
}
