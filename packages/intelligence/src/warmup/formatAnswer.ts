/** True when text is a system placeholder, not a real model answer. */
export function isUnavailableWarmupAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return /^(no model answer available|coach is unavailable|could not generate)/i.test(trimmed);
}

/** Patterns that indicate a LeetCode solution walkthrough, not an Anki back. */
const WALKTHROUGH_PATTERNS: RegExp[] = [
  /\bthis (problem|is also|question)\b/i,
  /\bsimilar to (the |a )?\w+/i,
  /\bthe difference is\b/i,
  /\bhere we (don'?t|do|need|add|use)\b/i,
  /\bwe (don'?t|add|use) (need|different)\b/i,
  /\binstead of (a |the )?(single|one)\b/i,
  /\bafter using (a |the )?(num|element|number)\b/i,
  /\bgiven an array\b/i,
  /\breturn all the\b/i,
  /\bleetcode\b/i,
  /\bfor this problem\b/i,
  /\bin the (above|following) (problem|example)\b/i,
];

export function isWalkthroughWarmupAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [trimmed];
  const walkthroughCount = sentences.filter((s) =>
    WALKTHROUGH_PATTERNS.some((p) => p.test(s)),
  ).length;

  if (walkthroughCount === 0) return false;
  if (sentences.length === 1) return walkthroughCount > 0;
  return walkthroughCount >= Math.ceil(sentences.length / 2);
}

function isWalkthroughSentence(sentence: string): boolean {
  return WALKTHROUGH_PATTERNS.some((p) => p.test(sentence));
}

/**
 * Normalize warm-up answer text for display: drop note rubric and problem
 * walkthroughs; keep at most a few terse Anki-style facts.
 */
export function formatWarmupAnswer(answer: string, maxSentences = 3): string {
  let text = answer.trim();
  if (!text || isUnavailableWarmupAnswer(text)) return "";

  const solutionMatch = text.match(/\bsolution\s*:\s*(.+)/is);
  if (solutionMatch) {
    text = solutionMatch[1]!.trim();
  } else {
    text = text.replace(/^description\s*:\s*/i, "");
  }

  text = text
    .replace(/\b(description|approach|complexity|pattern|key\s*idea|note)\s*:\s*/gi, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (sentences?.length) {
    const factual = sentences
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence && !isWalkthroughSentence(sentence));

    if (!factual.length) return "";

    return factual
      .slice(0, maxSentences)
      .join(" ")
      .trim();
  }

  if (isWalkthroughWarmupAnswer(text)) return "";

  const maxChars = 220;
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars - 1).trimEnd();
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
  }

  return text;
}
