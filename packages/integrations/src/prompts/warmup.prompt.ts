import type { WarmupQuestionContext } from "./types.js";

/**
 * Active-recall warm-up (3.1): short questions generated preferably from the
 * user's own notes ("You wrote that X — why does that work?"), falling back to
 * generic topic questions when no notes exist.
 */
export function buildWarmupPrompt(ctx: WarmupQuestionContext): string {
  const noteBlock =
    ctx.noteExcerpts.length > 0
      ? `The student's own notes on ${ctx.topicName} (use these as the primary source — quote or paraphrase what THEY wrote and ask why it works, when it applies, or what breaks it):\n` +
        ctx.noteExcerpts
          .map((n) => `--- note: ${n.title} ---\n${n.excerpt}`)
          .join("\n\n")
      : `The student has no notes on ${ctx.topicName}; ask fundamental concept questions about the topic instead.`;

  return `You are a DSA coach running a ${ctx.questionCount}-question active-recall warm-up before a study session on "${ctx.topicName}".

${noteBlock}

Generate exactly ${ctx.questionCount} short recall questions. Each must be answerable in 1–3 sentences from memory — no coding required.

Respond with ONLY a JSON array of strings, e.g. ["question 1", "question 2", "question 3"]. No markdown fences, no commentary.`;
}

/** Generic per-topic fallback questions used when the LLM is unavailable. */
export function fallbackWarmupQuestions(topicName: string, count = 3): string[] {
  const all = [
    `What is the core idea behind ${topicName}, in one sentence?`,
    `What is the typical time and space complexity of common ${topicName} operations?`,
    `When would you choose ${topicName} over an alternative approach — and when not?`,
    `What is the most common implementation mistake when working with ${topicName}?`,
  ];
  return all.slice(0, count);
}
