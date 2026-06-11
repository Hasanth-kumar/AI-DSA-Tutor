import type { HintContext, LLMService } from "@dsa/integrations";
import { slugifyProblemName } from "@dsa/integrations";
import type { IntelligenceOrchestrator, TopicDifficulty, TopicState } from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import { createCoachLLMService } from "../llm.factory.js";
import type { CacheService } from "./CacheService.js";

const DIFFICULTIES: TopicDifficulty[] = ["Easy", "Medium", "Hard"];

/** Same problem + difficulty + hint level → cached response (3.3). */
const HINT_CACHE_TTL_SECONDS = 7 * 24 * 3600;

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
    private readonly cache?: CacheService,
  ) {
    this.llm = llm ?? createCoachLLMService(config);
  }

  async generateHint(ctx: HintContext): Promise<string> {
    const cacheKey = `hint:${slugifyProblemName(ctx.problemName)}:${ctx.difficulty}:${ctx.hintLevel ?? 1}`;

    if (this.cache) {
      try {
        const cached = await this.cache.get<string>(cacheKey);
        if (cached) return cached;
      } catch {
        // Redis optional
      }
    }

    const hint = await this.llm.generateHint(ctx);

    if (this.cache && !hint.includes("unavailable")) {
      try {
        await this.cache.set(cacheKey, hint, HINT_CACHE_TTL_SECONDS);
      } catch {
        // Redis optional
      }
    }

    return hint;
  }

  buildContextFromTopic(
    problemName: string,
    topic: TopicState,
    difficulty: string,
    attempts: number,
    hintLevel?: 1 | 2 | 3 | 4,
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
      hintLevel,
    };
  }
}
