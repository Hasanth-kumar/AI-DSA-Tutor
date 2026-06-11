import { stripWikiLinks, type LLMService } from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import { createCoachLLMService } from "../llm.factory.js";
import type { NoteRepository } from "../repositories/NoteRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { SessionService, RecallResult } from "./SessionService.js";

export interface WarmupQuestionsResult {
  topicId: string;
  topicName: string;
  questions: string[];
  source: "notes" | "generic" | "fallback";
}

const QUESTION_COUNT = 3;
const EXCERPT_CHARS = 1200;

/**
 * Active recall warm-up (3.1): three quick questions before coding,
 * generated from the user's own notes when available. The self-grade feeds
 * SM-2 quality directly via SessionService.applyRecallQuality.
 */
export class WarmupService {
  private readonly llm: LLMService;

  constructor(
    config: AppConfig,
    private readonly topicRepo: TopicRepository,
    private readonly sessionService: SessionService,
    private readonly noteRepo?: NoteRepository,
    llm?: LLMService,
  ) {
    this.llm = llm ?? createCoachLLMService(config);
  }

  async generateQuestions(topicId: string): Promise<WarmupQuestionsResult> {
    const topic = this.topicRepo.findById(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const noteExcerpts = (this.noteRepo?.findByTopicId(topicId) ?? [])
      .filter((n) => n.content)
      .slice(0, 3)
      .map((n) => ({
        title: n.title,
        excerpt: stripWikiLinks(n.content!).trim().slice(0, EXCERPT_CHARS),
      }));

    const result = await this.llm.generateWarmupQuestions({
      topicName: topic.name,
      noteExcerpts,
      questionCount: QUESTION_COUNT,
    });

    return {
      topicId,
      topicName: topic.name,
      questions: result.questions,
      source: result.source,
    };
  }

  /** Self-grade (0–5) → SM-2 quality, applied directly to the topic schedule. */
  grade(topicId: string, quality: number): RecallResult {
    return this.sessionService.applyRecallQuality(topicId, quality);
  }
}
