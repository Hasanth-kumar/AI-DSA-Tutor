import type { DebriefContext } from "./types.js";

const CALIBRATION_RULES = `Calibration rating (§5 spaced-review engine):
- 1 = solved only with significant help → re-solve cold in ~2 days
- 2 = solved with a nudge / slowly → re-solve cold in ~5–7 days
- 3 = solved cleanly, could re-derive and recognise the pattern elsewhere → spaced review in ~2–3 weeks`;

const MISTAKE_TAG_VOCAB = `Mistake tag vocabulary:
- coding: off-by-one, empty/single-input, loop-invariant, wrong-base-case, mutate-while-iterating, null-deref
- reasoning: missed-sorted, wrong-complexity, greedy-vs-dp, missed-invariant, wrong-data-structure, over-complicated`;

export function buildDebriefPrompt(ctx: DebriefContext): string {
  const problemLine = ctx.problemName
    ? `Problem: ${ctx.problemName}`
    : "Problem: (general topic practice)";

  const signals =
    ctx.weaknessSignals.length > 0
      ? ctx.weaknessSignals.join(", ")
      : "none flagged";

  const repeatedStruggle =
    ctx.sessionsThisWeekOnTopic >= 2 && ctx.averageProductivityThisWeek < 60;

  return `You are a DSA coach producing a structured session debrief that feeds the spaced-review engine.

${problemLine}
Topic: ${ctx.topicName}
Session: ${ctx.problemsSolved} problem(s) in ${ctx.studyDuration} min, productivity ${ctx.productivityScore}/100
Engine confidence (0–100): ${ctx.confidence}
Weak area: ${ctx.isWeakArea ? "yes" : "no"} (weakness score ${ctx.weaknessScore})
Weakness signals: ${signals}
Sessions on this topic this week: ${ctx.sessionsThisWeekOnTopic}
Avg productivity this week on topic: ${ctx.averageProductivityThisWeek}/100
Current study streak: ${ctx.streakDays} day(s)
Engine recommendation: ${ctx.recommendation}

${CALIBRATION_RULES}

${MISTAKE_TAG_VOCAB}

Output the debrief using EXACTLY these labelled lines, in this order — no prose paragraphs, no preamble, no trailing summary:

**${ctx.topicName} debrief**
- **Calibration (1–3):** <your proposed rating> — <one short clause of rationale grounded in the session data above>
- **Re-solve:** <the cold re-solve window that matches the rating above, copied from the calibration rules>
- **Signal → pattern → gotcha:** <fill what you can infer, e.g. "sorted array + pair-sum → two pointers → forgot to skip duplicates"; use "_____" for any segment only the student can supply>
- **Mistake tag:** <dominant tag from the vocabulary above, or "—" if no clear mistake this session>
- **Next action:** <one specific, concrete next step for the next session>${
    repeatedStruggle
      ? `\n\nThe student has hit this topic ${ctx.sessionsThisWeekOnTopic} times this week with average productivity ${ctx.averageProductivityThisWeek}/100 — name that pattern explicitly in the Next action line and steer toward a smaller, more foundational sub-skill rather than another full problem.`
      : ""
  }

Rules:
- Keep the whole thing under 130 words.
- Encouraging but direct — no fluff, no "great job!", no recap of what they did.
- Do not invent stats or problems not present in the context above.`;
}
