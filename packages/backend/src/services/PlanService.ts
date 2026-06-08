import type { IntelligenceOrchestrator, PlanOptions, StudyPlan } from "@dsa/intelligence";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import { formatDateKey } from "../lib/json.js";
import type { CacheService } from "./CacheService.js";
import { ProblemSuggestionService } from "./ProblemSuggestionService.js";

export class PlanService {
  private readonly problemSuggestions: ProblemSuggestionService;

  constructor(
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly topicRepo: TopicRepository,
    problemRepo: ProblemRepository,
    private readonly cache: CacheService,
  ) {
    this.problemSuggestions = new ProblemSuggestionService(problemRepo);
  }

  async generateTodaysPlan(options: PlanOptions = {}): Promise<StudyPlan> {
    const cacheKey = `plan:${formatDateKey(new Date())}`;
    try {
      const cached = await this.cache.get<StudyPlan>(cacheKey);
      if (cached) return cached;
    } catch {
      // Redis optional — continue without cache
    }

    const topics = this.topicRepo.findAll();
    if (topics.length === 0) {
      throw new Error("No topics in mirror. Run sync or db:seed first.");
    }

    const basePlan = this.intelligence.generateDailyPlan(topics, options);
    const difficultyRec = this.intelligence.getDifficultyRecommendation(
      basePlan.primaryTopic,
    );
    const suggestedProblems = this.problemSuggestions.selectForTopic(
      basePlan.primaryTopic,
      difficultyRec,
    );
    const plan = { ...basePlan, suggestedProblems };

    try {
      await this.cache.set(cacheKey, plan, 3600);
    } catch {
      // Redis optional
    }
    return plan;
  }

  async invalidateTodaysPlan(): Promise<void> {
    try {
      await this.cache.del(`plan:${formatDateKey(new Date())}`);
    } catch {
      // Redis optional
    }
  }
}
