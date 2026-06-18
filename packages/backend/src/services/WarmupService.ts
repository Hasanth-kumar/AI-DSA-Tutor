import {
  fallbackWarmupQuestions,
  stripWikiLinks,
  type LLMService,
  type WarmupItem,
} from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import {
  createAppLLMService,
  createCoachLLMService,
  createWarmupLLMService,
} from "../llm.factory.js";
import type { NoteRepository } from "../repositories/NoteRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { SessionService, RecallResult } from "./SessionService.js";

export interface WarmupAnswerRevealResult {
  answer: string;
  unavailableReason?: "coach_offline" | "generation_failed";
}

export interface WarmupQuestionsResult {
  topicId: string;
  topicName: string;
  questions: WarmupItem[];
  source: "notes" | "generic" | "fallback";
}

const QUESTION_COUNT = 3;
const EXCERPT_CHARS = 1200;

type NoteExcerpt = { title: string; excerpt: string };

/**
 * Active recall warm-up (3.1): three quick questions before coding,
 * generated from the user's own notes when available. The self-grade feeds
 * SM-2 quality directly via SessionService.applyRecallQuality.
 */
export class WarmupService {
  private readonly llmChain: LLMService[];

  constructor(
    config: AppConfig,
    private readonly topicRepo: TopicRepository,
    private readonly sessionService: SessionService,
    private readonly noteRepo?: NoteRepository,
    llmChain?: LLMService[],
  ) {
    this.llmChain =
      llmChain ??
      [
        createWarmupLLMService(config),
        createCoachLLMService(config),
        createAppLLMService(config),
      ];
  }

  private anyLlmConfigured(): boolean {
    return this.llmChain.some((llm) => llm.isConfigured());
  }

  private noteExcerptsForTopic(topicId: string): NoteExcerpt[] {
    return (this.noteRepo?.findByTopicId(topicId) ?? [])
      .filter((n) => n.content)
      .slice(0, 3)
      .map((n) => ({
        title: n.title,
        excerpt: stripWikiLinks(n.content!).trim().slice(0, EXCERPT_CHARS),
      }));
  }

  async generateQuestions(topicId: string): Promise<WarmupQuestionsResult> {
    const topic = this.topicRepo.findById(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const noteExcerpts = this.noteExcerptsForTopic(topicId);
    const ctx = {
      topicName: topic.name,
      noteExcerpts,
      questionCount: QUESTION_COUNT,
    };

    let result: { questions: WarmupItem[]; source: "notes" | "generic" | "fallback" } | null =
      null;

    for (const llm of this.llmChain) {
      if (!llm.isConfigured()) continue;
      try {
        const attempt = await llm.generateWarmupQuestions(ctx);
        if (attempt.source !== "fallback") {
          result = attempt;
          break;
        }
        result ??= attempt;
      } catch {
        // try next model in chain
      }
    }

    if (!result) {
      result = {
        questions: fallbackWarmupQuestions(topic.name, QUESTION_COUNT),
        source: "fallback",
      };
    }

    return {
      topicId,
      topicName: topic.name,
      questions: result.questions,
      source: result.source,
    };
  }

  async revealAnswer(topicId: string, question: string): Promise<WarmupAnswerRevealResult> {
    const topic = this.topicRepo.findById(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    if (!this.anyLlmConfigured()) {
      return { answer: "", unavailableReason: "coach_offline" };
    }

    const ctx = {
      topicName: topic.name,
      noteExcerpts: this.noteExcerptsForTopic(topicId),
      questionCount: QUESTION_COUNT,
      question: question.trim(),
    };

    for (const llm of this.llmChain) {
      if (!llm.isConfigured()) continue;
      try {
        const answer = await llm.generateWarmupAnswer(ctx);
        if (answer.trim()) {
          return { answer };
        }
      } catch {
        // try next model in chain
      }
    }

    return { answer: "", unavailableReason: "generation_failed" };
  }

  /** Self-grade (0–5) → SM-2 quality, applied directly to the topic schedule. */
  grade(topicId: string, quality: number): RecallResult {
    return this.sessionService.applyRecallQuality(topicId, quality);
  }
}
