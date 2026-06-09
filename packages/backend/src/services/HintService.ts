import type { HintContext, LLMService } from "@dsa/integrations";
import type { IntelligenceOrchestrator, TopicDifficulty, TopicState } from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import { createAppLLMService } from "../llm.factory.js";

const DIFFICULTIES: TopicDifficulty[] = ["Easy", "Medium", "Hard"];

function asDifficulty(value: string): TopicDifficulty {
  if (DIFFICULTIES.includes(value as TopicDifficulty)) {
    return value as TopicDifficulty;
  }
  return "Medium";
}

export class HintService {
  private readonly llm: LLMService;

  constructor(
    config: AppConfig,
    private readonly intelligence?: IntelligenceOrchestrator,
    llm?: LLMService,
  ) {
    this.llm = llm ?? createAppLLMService(config);
  }

  async generateHint(ctx: HintContext): Promise<string> {
    return this.llm.generateHint(ctx);
  }

  buildContextFromTopic(
    problemName: string,
    topic: TopicState,
    difficulty: string,
    attempts: number,
  ): HintContext {
    const problemDifficulty = asDifficulty(difficulty);
    const recommendedDifficulty = this.intelligence
      ? this.intelligence.getDifficultyRecommendation(topic).primary
      : undefined;

    return {
      problemName,
      topicName: topic.name,
      difficulty: problemDifficulty,
      confidence: topic.confidence,
      attempts,
      recommendedDifficulty,
    };
  }
}
