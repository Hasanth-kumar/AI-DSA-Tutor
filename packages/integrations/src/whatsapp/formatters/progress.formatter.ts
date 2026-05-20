export interface ProgressSummaryInput {
  weekStart: string;
  weekEnd: string;
  sessionsCount: number;
  problemsSolved: number;
  totalStudyMinutes: number;
  averageProductivity: number;
  currentStreakDays: number;
  weakTopics: { name: string; score: number }[];
  masteredTopics: number;
  inProgressTopics: number;
  intelligenceSummary: string;
}

export function formatProgressForWhatsApp(summary: ProgressSummaryInput): string {
  const lines: string[] = [
    `📊 Weekly Progress (${summary.weekStart} → ${summary.weekEnd})`,
    "",
    `Sessions: ${summary.sessionsCount}`,
    `Problems solved: ${summary.problemsSolved}`,
    `Study time: ${summary.totalStudyMinutes} min`,
    `Avg productivity: ${summary.averageProductivity}/100`,
    `Streak: ${summary.currentStreakDays} day(s)`,
    "",
    `Mastered: ${summary.masteredTopics} | In progress: ${summary.inProgressTopics}`,
  ];

  if (summary.weakTopics.length > 0) {
    lines.push("", "⚠️ Focus areas:");
    for (const w of summary.weakTopics) {
      lines.push(`   • ${w.name} (weakness ${w.score})`);
    }
  }

  lines.push("", summary.intelligenceSummary);
  return lines.join("\n");
}
