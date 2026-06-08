export interface ProgressSummaryInput {
  weekStart: string;
  weekEnd: string;
  sessionsCount: number;
  problemsSolved: number;
  totalStudyMinutes: number;
  averageProductivity: number;
  currentStreakDays: number;
  longestStreakDays?: number;
  weakTopics: { name: string; score: number }[];
  masteredTopics: number;
  inProgressTopics: number;
  intelligenceSummary: string;
  velocityTrend?: "up" | "down" | "stable";
  problemsPerHour?: number;
  weaknessTrendDirection?: "improving" | "worsening" | "stable";
  difficultyInsight?: string;
}

const VELOCITY_LABELS: Record<NonNullable<ProgressSummaryInput["velocityTrend"]>, string> = {
  up: "📈 accelerating",
  down: "📉 slowing",
  stable: "➡️ steady",
};

const WEAKNESS_LABELS: Record<
  NonNullable<ProgressSummaryInput["weaknessTrendDirection"]>,
  string
> = {
  improving: "✅ fewer weak areas than last week",
  worsening: "⚠️ more weak areas than last week",
  stable: "➡️ weak areas unchanged",
};

export function formatProgressForWhatsApp(summary: ProgressSummaryInput): string {
  const lines: string[] = [
    `📊 Weekly Progress (${summary.weekStart} → ${summary.weekEnd})`,
    "",
    `Sessions: ${summary.sessionsCount}`,
    `Problems solved: ${summary.problemsSolved}`,
    `Study time: ${summary.totalStudyMinutes} min`,
    `Avg productivity: ${summary.averageProductivity}/100`,
    `Streak: ${summary.currentStreakDays} day(s)`,
  ];

  if (summary.longestStreakDays != null && summary.longestStreakDays > 0) {
    lines.push(`Best streak: ${summary.longestStreakDays} day(s)`);
  }

  if (summary.problemsPerHour != null && summary.problemsPerHour > 0) {
    const trend = summary.velocityTrend
      ? VELOCITY_LABELS[summary.velocityTrend]
      : "";
    lines.push(`Velocity: ${summary.problemsPerHour} problems/hr ${trend}`.trim());
  }

  lines.push(
    "",
    `Mastered: ${summary.masteredTopics} | In progress: ${summary.inProgressTopics}`,
  );

  if (summary.weaknessTrendDirection) {
    lines.push(`Weakness trend: ${WEAKNESS_LABELS[summary.weaknessTrendDirection]}`);
  }

  if (summary.weakTopics.length > 0) {
    lines.push("", "⚠️ Focus areas:");
    for (const w of summary.weakTopics) {
      lines.push(`   • ${w.name} (weakness ${w.score})`);
    }
  }

  if (summary.difficultyInsight) {
    lines.push("", `🎯 Difficulty: ${summary.difficultyInsight}`);
  }

  lines.push("", summary.intelligenceSummary);
  return lines.join("\n");
}
