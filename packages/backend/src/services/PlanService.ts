import type {
  IntelligenceOrchestrator,
  PlanOptions,
  StudyPlan,
  TopicState,
} from "@dsa/intelligence";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import { formatDateKey } from "../lib/json.js";
import type { CacheService } from "./CacheService.js";
import type { CurriculumService } from "./CurriculumService.js";
import { ProblemSuggestionService } from "./ProblemSuggestionService.js";

export class PlanService {
  private readonly problemSuggestions: ProblemSuggestionService;

  constructor(
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly topicRepo: TopicRepository,
    problemRepo: ProblemRepository,
    private readonly cache: CacheService,
    private readonly curriculumService: CurriculumService,
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

    const plan = this.buildPlan(topics, options, {
      rescheduleDeferred: true,
    });

    try {
      await this.cache.set(cacheKey, plan, 3600);
    } catch {
      // Redis optional
    }
    return plan;
  }

  buildPlan(
    topics: TopicState[],
    options: PlanOptions = {},
    internal: { rescheduleDeferred?: boolean } = {},
  ): StudyPlan {
    const selection = this.curriculumService.selectForTopics(topics);
    if (!selection) {
      throw new Error("No topics available for planning");
    }

    const primaryTopic = selection.topic;
    const difficultyRec = this.intelligence.getDifficultyRecommendation(primaryTopic);
    const suggestedProblems = this.problemSuggestions.selectForTopic(
      primaryTopic,
      difficultyRec,
    );

    const queue = this.intelligence
      .getRevisionQueue(topics)
      .filter((t) => t.id !== primaryTopic.id);

    // Catch-up compression (1.5): after skipped days, never stack the whole
    // backlog into one plan — keep 1–2 items and push the rest forward.
    const { active, deferred } = this.intelligence.compressRevisionQueue(queue, {
      maxPerDay: options.maxRevisionTopics ?? 2,
    });
    const scored = active.slice(0, options.maxRevisionTopics ?? 2);

    if (internal.rescheduleDeferred && deferred.length > 0) {
      for (const { topic, nextRevisionAt } of deferred) {
        this.topicRepo.update(topic.id, { nextRevisionAt });
      }
    }

    const estimatedDuration = this.estimateDuration(primaryTopic, scored);

    return {
      date: new Date(),
      primaryTopic,
      revisionTopics: scored,
      suggestedProblems,
      estimatedDuration,
      reasoning: selection.reasoning,
      curriculum: this.curriculumService.toProgress(selection),
      revisionTotalDue: queue.length,
      revisionDeferred: deferred.length,
    };
  }

  private estimateDuration(primary: TopicState, revisions: TopicState[]): number {
    const base = 45 + (100 - primary.confidence) * 0.3;
    const revisionMinutes = revisions.length * 25;
    return Math.round(base + revisionMinutes);
  }

  async invalidateTodaysPlan(): Promise<void> {
    try {
      await this.cache.del(`plan:${formatDateKey(new Date())}`);
    } catch {
      // Redis optional
    }
  }
}
