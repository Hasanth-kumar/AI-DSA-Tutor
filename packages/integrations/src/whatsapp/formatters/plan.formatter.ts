import type { StudyPlan } from "@dsa/intelligence";

export function formatStudyPlanForWhatsApp(plan: StudyPlan): string {
  const dateStr = plan.date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const lines: string[] = [
    `🧠 DSA Study Plan — ${dateStr}`,
    "",
    `📚 PRIMARY: ${plan.primaryTopic.name}`,
    `   ${plan.reasoning}`,
    `   ⏱ ~${plan.estimatedDuration} min`,
  ];

  if (plan.revisionTopics.length > 0) {
    lines.push("", `🔄 REVISION (${plan.revisionTopics.length}):`);
    for (const t of plan.revisionTopics) {
      const due =
        t.nextRevisionAt && t.nextRevisionAt.getTime() < Date.now()
          ? " (overdue)"
          : "";
      lines.push(`   • ${t.name}${due}`);
    }
  }

  if (plan.suggestedProblems.length > 0) {
    lines.push("", "📋 Suggested problems:");
    plan.suggestedProblems.forEach((p, i) => {
      const link = p.leetcodeLink ? ` — ${p.leetcodeLink}` : "";
      lines.push(`   ${i + 1}. ${p.name} (${p.difficulty})${link}`);
    });
  }

  lines.push("", 'Type "hint <problem>" for a nudge anytime.');
  return lines.join("\n");
}
