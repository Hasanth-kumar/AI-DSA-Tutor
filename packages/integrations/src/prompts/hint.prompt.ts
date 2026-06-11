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

const HINT_LEVEL_GUIDANCE: Record<1 | 2 | 3 | 4, string> = {
  1: "Level 1 — conceptual nudge: point at the key observation or property. Do NOT name the algorithm/pattern, give steps, or code.",
  2: "Level 2 — approach: name the pattern/technique to use (e.g. 'sliding window') and why it fits. No pseudocode, no code.",
  3: "Level 3 — pseudocode: outline the algorithm step by step in plain pseudocode. No runnable code in any language.",
  4: "Level 4 — full solution: walk through the complete solution with code and complexity analysis.",
};

export function buildHintPrompt(ctx: HintContext): string {
  const guidance = DIFFICULTY_GUIDANCE[ctx.difficulty];
  const recLine = ctx.recommendedDifficulty
    ? `Engine recommends practicing ${ctx.recommendedDifficulty} problems for this topic.`
    : "";
  const level = ctx.hintLevel ?? 1;

  return `You are a DSA tutor helping a developer master algorithms.

Problem: ${ctx.problemName}
Topic: ${ctx.topicName}
Problem difficulty: ${ctx.difficulty}
Student confidence: ${ctx.confidence}/100
Previous attempts: ${ctx.attempts}
${recLine}

Difficulty-specific guidance: ${guidance}

Hint depth requested: ${HINT_LEVEL_GUIDANCE[level]}

Provide a targeted hint that:
1. Stays strictly within the requested hint depth — never reveal more than asked
2. Points toward the right pattern/approach for a ${ctx.difficulty} problem
3. Calibrates depth to confidence (${ctx.confidence}/100) — lower confidence = more foundational
4. References the underlying ${ctx.topicName} concept

Keep it under ${level === 4 ? 400 : 150} words.`;
}
