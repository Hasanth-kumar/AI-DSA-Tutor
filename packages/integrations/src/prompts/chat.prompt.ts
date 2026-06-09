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
    sections.push(
      `Selected problem: ${ctx.problem.name} (${ctx.problem.difficulty}) — topic ${ctx.problem.topicName}, ` +
        `status ${ctx.problem.status}, ${ctx.problem.attempts} attempt(s), topic confidence ${ctx.problem.confidence}/100.`,
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : "No learner context available.";
}

export function buildChatSystemPrompt(
  learningContext: ChatLearningContext | null,
  options: ChatCoachOptions = {},
): string {
  const style = options.directMode
    ? "Explain concepts clearly and directly when asked. You may walk through approaches step by step."
    : "Use a Socratic style by default: ask guiding questions and give hints before full explanations. Only give complete solutions when the student explicitly asks.";

  const contextBlock = learningContext
    ? `\n\nLearner context (from their DSA Mastery OS data):\n${formatLearningContext(learningContext)}`
    : "";

  return `You are a personal DSA coach helping one student prepare for technical interviews and build algorithmic mastery.

${style}

Guidelines:
- Stay focused on data structures, algorithms, problem-solving, and interview prep.
- Reference the learner's weak areas and current plan when relevant.
- Use concise markdown when helpful (bullet lists, short code snippets).
- If asked something off-topic, briefly redirect to DSA learning.
- Do not invent problems or stats not present in the learner context.${contextBlock}`;
}
