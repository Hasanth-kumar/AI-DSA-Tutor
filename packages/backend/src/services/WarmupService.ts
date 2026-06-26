import type { WarmupItem } from "@dsa/integrations";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { CardService, WarmupGradeResult } from "./CardService.js";

export interface WarmupAnswerRevealResult {
  answer: string;
  unavailableReason?: "coach_offline" | "generation_failed";
}

/** A warm-up question backed by a real local card (front/back from the bank). */
export interface WarmupQuestion extends WarmupItem {
  /** The source card id (null only if a future non-card item is ever served). */
  cardId: string | null;
  /** Card type (§3) for display/analytics. */
  type: string;
  /** True = non-counting preview filler shown when nothing is due (§11). */
  preview: boolean;
}

export interface WarmupQuestionsResult {
  topicId: string;
  topicName: string;
  questions: WarmupQuestion[];
  /** `due` = real due cards; `preview` = filler only; `empty` = bank empty. */
  source: "due" | "preview" | "empty";
}

const QUESTION_COUNT = 3;

/**
 * Active-recall warm-up (design §11) — a *gateway*, not a study session.
 *
 * Rev 2: the warm-up is now 100% local. Questions are drawn from today's due
 * queue (biased to the topic about to be solved) via {@link CardService}, the
 * answer is the card's stored back revealed instantly, and the self-grade
 * drives **per-card FSRS** — not a live LLM and not topic-level SM-2. There is
 * no LLM or network call on this path, so it works offline and is instant.
 */
export class WarmupService {
  constructor(
    private readonly topicRepo: TopicRepository,
    private readonly cardService: CardService,
  ) {}

  /** 3 due cards for the topic, with the §11 fallback order; never empty unless the bank is. */
  generateQuestions(topicId: string): WarmupQuestionsResult {
    const topic = this.topicRepo.findById(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const selection = this.cardService.buildWarmup(topicId, QUESTION_COUNT);
    const questions: WarmupQuestion[] = selection.cards.map((c) => ({
      question: c.front,
      answer: c.back,
      cardId: c.id,
      type: c.type,
      preview: !c.counting,
    }));

    return {
      topicId,
      topicName: topic.name,
      questions,
      source: selection.source,
    };
  }

  /** Reveal an answer from the local bank — no LLM (§1). */
  revealAnswer(topicId: string, question: string): WarmupAnswerRevealResult {
    const topic = this.topicRepo.findById(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    const answer = this.cardService.findAnswer(topicId, question);
    if (answer && answer.trim()) {
      return { answer };
    }
    return { answer: "", unavailableReason: "generation_failed" };
  }

  /** Self-grade (0–5) → per-card FSRS review of the cards served today (§7). */
  grade(topicId: string, quality: number): WarmupGradeResult {
    return this.cardService.warmupGrade(topicId, quality);
  }
}
