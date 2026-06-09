import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "./chat.prompt.js";

describe("buildChatSystemPrompt", () => {
  it("includes learner context when provided", () => {
    const prompt = buildChatSystemPrompt({
      todayPlan: {
        primaryTopic: "Graphs",
        reasoning: "High urgency",
        estimatedDuration: 90,
        suggestedProblems: ["Course Schedule"],
      },
      weakTopics: [
        { name: "DP", score: 72, recommendation: "Practice tabulation" },
      ],
      streakDays: 3,
    });

    expect(prompt).toContain("Graphs");
    expect(prompt).toContain("DP");
    expect(prompt).toContain("3 day(s)");
    expect(prompt).toContain("Socratic");
  });

  it("uses direct mode guidance when enabled", () => {
    const prompt = buildChatSystemPrompt(null, { directMode: true });
    expect(prompt).toContain("Explain concepts clearly");
    expect(prompt).not.toContain("Socratic style by default");
  });
});
