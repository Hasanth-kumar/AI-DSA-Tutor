import type { AppConfig } from "@dsa/shared";
import type { TopicState } from "@dsa/intelligence";

export interface HintContext {
  problemName: string;
  topicName: string;
  difficulty: string;
  confidence: number;
  attempts: number;
}

function buildHintPrompt(ctx: HintContext): string {
  return `You are a DSA tutor helping a developer master algorithms.

Problem: ${ctx.problemName}
Topic: ${ctx.topicName}
Difficulty: ${ctx.difficulty}
Student's current confidence: ${ctx.confidence}/100
Previous attempts: ${ctx.attempts}

Provide a targeted hint that:
1. Does NOT give away the solution
2. Points toward the right pattern/approach
3. Is calibrated to difficulty (${ctx.difficulty})
4. References the underlying ${ctx.topicName} concept

Keep it under 150 words.`;
}

export class HintService {
  constructor(private readonly config: AppConfig) {}

  async generateHint(ctx: HintContext): Promise<string> {
    const { baseUrl, model } = this.config.ollama;
    const prompt = buildHintPrompt(ctx);

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        throw new Error(`Ollama returned ${res.status}`);
      }

      const data = (await res.json()) as { response?: string };
      const text = data.response?.trim();
      if (!text) {
        return "No hint available right now. Try again in a moment.";
      }
      return `💡 Hint for ${ctx.problemName}\n\n${text}`;
    } catch {
      return `💡 Hint unavailable (is Ollama running at ${baseUrl}?).\n\nFocus on the core ${ctx.topicName} pattern for a ${ctx.difficulty} problem — break it into subproblems before coding.`;
    }
  }

  buildContextFromTopic(
    problemName: string,
    topic: TopicState,
    difficulty: string,
    attempts: number,
  ): HintContext {
    return {
      problemName,
      topicName: topic.name,
      difficulty,
      confidence: topic.confidence,
      attempts,
    };
  }
}
