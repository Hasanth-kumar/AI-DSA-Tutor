import type { DebriefContext } from "./types.js";

export function buildDebriefPrompt(ctx: DebriefContext): string {
  const problemLine = ctx.problemName
    ? `Problem: ${ctx.problemName}`
    : "Problem: (general topic practice)";

  const signals =
    ctx.weaknessSignals.length > 0
      ? ctx.weaknessSignals.join(", ")
      : "none flagged";

  return `You are a DSA coach debriefing a study session.

${problemLine}
Topic: ${ctx.topicName}
Session: ${ctx.problemsSolved} problem(s) in ${ctx.studyDuration} min, productivity ${ctx.productivityScore}/100
Confidence after session: ${ctx.confidence}/100
Weak area: ${ctx.isWeakArea ? "yes" : "no"} (weakness score ${ctx.weaknessScore})
Weakness signals: ${signals}
Sessions on this topic this week: ${ctx.sessionsThisWeekOnTopic}
Avg productivity this week on topic: ${ctx.averageProductivityThisWeek}/100
Current study streak: ${ctx.streakDays} day(s)
Engine recommendation: ${ctx.recommendation}

Write a concise session debrief (under 200 words) that:
1. Acknowledges what went well or what was hard
2. Connects patterns if they struggled repeatedly this week (mention count if >= 2)
3. Gives one specific next action for the next session
4. Uses encouraging but direct tone — no fluff

Format with a short title line, then 2-3 short paragraphs.`;
}
