import type { ChatCoachOptions, ChatLearningContext } from "./types.js";

function formatLearningContext(ctx: ChatLearningContext): string {
  const sections: string[] = [];

  if (ctx.todayPlan) {
    const problems =
      ctx.todayPlan.suggestedProblems.length > 0
        ? ctx.todayPlan.suggestedProblems.join(", ")
        : "none listed";
    sections.push(
      `Today's plan: focus on ${ctx.todayPlan.primaryTopic} (~${ctx.todayPlan.estimatedDuration} min). ` +
        `Reasoning: ${ctx.todayPlan.reasoning} Suggested problems: ${problems}.`,
    );
  }

  if (ctx.weakTopics && ctx.weakTopics.length > 0) {
    const lines = ctx.weakTopics
      .slice(0, 3)
      .map((w) => `- ${w.name} (weakness ${w.score}/100): ${w.recommendation}`)
      .join("\n");
    sections.push(`Weak areas:\n${lines}`);
  }

  if (ctx.streakDays != null) {
    sections.push(`Current study streak: ${ctx.streakDays} day(s).`);
  }

  if (ctx.problem) {
    const p = ctx.problem;
    const lines = [
      `Anchored problem: ${p.name} (${p.difficulty}) — topic ${p.topicName}, ` +
        `status ${p.status}, ${p.attempts} attempt(s), topic confidence ${p.confidence}/100.`,
    ];

    if (p.solveHistory && p.solveHistory.length > 0) {
      const history = p.solveHistory
        .slice(0, 5)
        .map(
          (h) =>
            `  - ${h.solvedAt.slice(0, 10)}: ${
              h.timeTakenMinutes != null ? `${h.timeTakenMinutes} min` : "time unknown"
            }${h.mistakeTag ? `, struggled with: ${h.mistakeTag}` : ""}`,
        )
        .join("\n");
      lines.push(`Past attempts on this problem:\n${history}`);
    }

    const tagEntries = Object.entries(p.topicMistakeTags ?? {}).filter(([, n]) => n > 0);
    if (tagEntries.length > 0) {
      const tags = tagEntries
        .sort((a, b) => b[1] - a[1])
        .map(([tag, n]) => `${tag} ×${n}`)
        .join(", ");
      lines.push(`Recent mistake patterns on similar ${p.topicName} problems: ${tags}.`);
    }

    if (p.weaknessSignals && p.weaknessSignals.length > 0) {
      lines.push(`Active weakness signals for ${p.topicName}: ${p.weaknessSignals.join("; ")}.`);
    }

    if (p.note) {
      lines.push(
        `The student's own note on this problem (from their Obsidian vault):\n"""\n${p.note}\n"""`,
      );
    }

    sections.push(lines.join("\n"));
  }

  return sections.length > 0 ? sections.join("\n\n") : "No learner context available.";
}

const HINT_LADDER = `
Graduated hints (strict): NEVER reveal the full solution unprompted. Escalate one rung at a time, each rung only on explicit request:
1. Conceptual nudge — point at the relevant idea or observation, no approach.
2. Approach/pattern name — name the technique (e.g. "two pointers"), no steps.
3. Pseudocode — outline the algorithm, no final code.
4. Full solution — only when the student explicitly asks for the solution or code.
If the student is stuck, offer the next rung; do not skip ahead.`;

const FAILURE_MODES = `
Diagnose where the student is stuck and respond accordingly:
- Doesn't understand the problem → always free and direct, no gating: restate it in plain English, show input→output on one tiny concrete example, and say what each constraint forces (e.g. n ≤ 1e5 ⇒ need ~O(n log n)). Don't reveal the approach unless asked.
- Doesn't know the approach → surface 2–3 candidate patterns and the signal that distinguishes them, then let the student choose; don't hand over the full algorithm.
- Has an approach but the code is wrong → name the bug *class*, not just the line — coding (off-by-one, empty/single-input, loop-invariant, wrong-base-case) or reasoning (missed-sorted, wrong-complexity, greedy-vs-dp). Explain why, then let them fix it.
- Solved it but can't re-derive → don't just re-explain; prompt a cold re-solve and point at the recognition signal to recall.`;

export function buildChatSystemPrompt(
  learningContext: ChatLearningContext | null,
  options: ChatCoachOptions = {},
): string {
  const style = options.directMode
    ? "Explain concepts clearly and directly when asked. You may walk through approaches step by step."
    : "Use a Socratic style by default: ask guiding questions and give hints before full explanations. Only give complete solutions when the student explicitly asks.";

  const anchored = options.anchored ?? Boolean(learningContext?.problem);
  const ladderBlock = !options.directMode && anchored ? `\n${HINT_LADDER}` : "";

  const contextBlock = learningContext
    ? `\n\nLearner context (from their DSA Mastery OS data):\n${formatLearningContext(learningContext)}`
    : "";

  return `You are a personal DSA coach helping one student prepare for technical interviews and build algorithmic mastery.

${style}${ladderBlock}
${FAILURE_MODES}

Guidelines:
- Stay focused on data structures, algorithms, problem-solving, and interview prep.
- Reference the learner's weak areas and current plan when relevant.
- When a dominant mistake tag is present, open with a pointed diagnostic question targeting it (e.g. if "missed-sorted" recurs: "First check — is the input sorted?"). Connect new guidance to the student's own notes and past errors rather than giving generic advice.
- Use concise markdown when helpful (bullet lists, short code snippets).
- If asked something off-topic, briefly redirect to DSA learning.
- Do not invent problems or stats not present in the learner context.${contextBlock}`;
}
