import { isWalkthroughWarmupAnswer } from "@dsa/intelligence";
import type { WarmupQuestionContext } from "./types.js";

export interface WarmupItem {
  question: string;
  answer: string;
}

export interface WarmupAnswerContext {
  topicName: string;
  question: string;
  noteExcerpts: { title: string; excerpt: string }[];
}

const ANKI_ANSWER_RULES = `Write the BACK of an Anki flashcard — terse facts the student checks after active recall.

Rules:
- 1–2 short sentences OR 2–3 semicolon-separated facts (max ~40 words)
- State definitions, properties, complexity, invariant, or pattern steps — reusable concept knowledge
- Do NOT explain a specific LeetCode problem, walk through code, or narrate "this problem is similar to…"
- Do NOT quote problem statements ("given an array…", "return all…")
- Do NOT use meta-instructions ("state", "name", "identify", "explain why")
- Answer the QUESTION directly as memorizable knowledge

GOOD: "Permutations via backtracking: fix index i, swap each later element in, recurse, swap back. O(n!) time, O(n) stack."
GOOD: "Subset sum: include/exclude each element; prune when partial sum exceeds target. O(2^n) time."
BAD: "This is similar to the permutation problem but the difference is we add different permutations…"
BAD: "Given an array nums of distinct integers, return all possible permutations."`;

function noteBlock(ctx: { topicName: string; noteExcerpts: { title: string; excerpt: string }[] }): string {
  return ctx.noteExcerpts.length > 0
    ? `The student's own notes on ${ctx.topicName} (use only to inspire QUESTIONS — never copy solution walkthroughs into answers):\n` +
        ctx.noteExcerpts
          .map((n) => `--- note: ${n.title} ---\n${n.excerpt}`)
          .join("\n\n")
    : `The student has no notes on ${ctx.topicName}.`;
}

/**
 * Active-recall warm-up (3.1): short questions generated preferably from the
 * user's own notes ("You wrote that X — why does that work?"), falling back to
 * generic topic questions when no notes exist.
 */
export function buildWarmupPrompt(ctx: WarmupQuestionContext): string {
  const notes = noteBlock(ctx);

  return `You are a DSA coach running a ${ctx.questionCount}-question active-recall warm-up before a study session on "${ctx.topicName}".

${notes}

Generate exactly ${ctx.questionCount} short recall questions. Each must be answerable from memory in a few facts — no coding required. Questions should test concept knowledge (pattern, complexity, when to use, invariant), not "how did you solve problem X".

For each question, provide the Anki-style model answer (back of card):

${ANKI_ANSWER_RULES}

Respond with ONLY a JSON array of objects, e.g. [{"question":"...","answer":"..."}]. No markdown fences, no commentary.`;
}

/** Generate an Anki-style model answer for one warm-up question (on demand). */
export function buildWarmupAnswerPrompt(ctx: WarmupAnswerContext): string {
  return `You write the BACK of an Anki flashcard for DSA active recall.

Topic: "${ctx.topicName}"
Question (front of card): "${ctx.question}"

${ANKI_ANSWER_RULES}

Respond with ONLY the answer text. No JSON, no markdown fences, no commentary.`;
}

/** Shorter retry prompt when the first answer is rejected or empty. */
export function buildWarmupAnswerRetryPrompt(ctx: WarmupAnswerContext): string {
  return `Write the back of an Anki flashcard for DSA active recall.

Topic: "${ctx.topicName}"
Question: "${ctx.question}"

Reply with 1–2 short factual sentences (under 35 words). State the concept, pattern, or complexity — not a LeetCode problem walkthrough. Answer only:`;
}

/** Fill answers for questions that were generated without them. */
export function buildWarmupAnswersBatchPrompt(
  ctx: WarmupQuestionContext,
  questions: string[],
): string {
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

  return `You write Anki flashcard backs for a DSA warm-up on "${ctx.topicName}".

${ANKI_ANSWER_RULES}

Questions (front of each card):
${numbered}

Respond with ONLY a JSON array of strings — one answer per question, in the same order. No markdown fences, no commentary.`;
}

/** True when an answer is empty, meta-instruction, or a problem walkthrough. */
export function isWeakWarmupAnswer(answer: string): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return true;
  if (/^(state|name|identify|compare|explain|describe|list|recall)\b/i.test(trimmed)) {
    return true;
  }
  return isWalkthroughWarmupAnswer(trimmed);
}

/** Notes are not suitable as warmup answers — they are problem write-ups. */
export function answerFromNotes(
  _noteExcerpts: { title: string; excerpt: string }[],
): string | null {
  return null;
}

/** Generic per-topic fallback questions used when the LLM is unavailable. */
export function fallbackWarmupQuestions(topicName: string, count = 3): WarmupItem[] {
  const all: WarmupItem[] = [
    {
      question: `What is the core idea behind ${topicName}, in one sentence?`,
      answer: "",
    },
    {
      question: `What is the typical time and space complexity of common ${topicName} operations?`,
      answer: "",
    },
    {
      question: `When would you choose ${topicName} over an alternative approach — and when not?`,
      answer: "",
    },
    {
      question: `What is the most common implementation mistake when working with ${topicName}?`,
      answer: "",
    },
  ];
  return all.slice(0, count);
}
