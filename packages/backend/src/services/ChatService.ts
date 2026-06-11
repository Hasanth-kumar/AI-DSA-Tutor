import {
  stripWikiLinks,
  type ChatHistoryMessage,
  type ChatLearningContext,
  type LLMService,
} from "@dsa/integrations";
import type { IntelligenceOrchestrator } from "@dsa/intelligence";
import type { AppConfig } from "@dsa/shared";
import { createCoachLLMService } from "../llm.factory.js";
import type { AttemptRepository } from "../repositories/AttemptRepository.js";
import type { ChatRepository } from "../repositories/ChatRepository.js";
import type { NoteRepository } from "../repositories/NoteRepository.js";
import type { ProblemRepository } from "../repositories/ProblemRepository.js";
import type { TopicRepository } from "../repositories/TopicRepository.js";
import type { AnalyticsService } from "./AnalyticsService.js";
import type { PlanService } from "./PlanService.js";

export interface ChatMessageDto {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatThreadDto {
  threadId: string;
  messages: ChatMessageDto[];
  updatedAt: string;
}

export interface SendChatInput {
  threadId?: string;
  message: string;
  problemId?: string;
  includeContext?: boolean;
  directMode?: boolean;
}

export interface SendChatResult {
  threadId: string;
  userMessage: ChatMessageDto;
  assistantMessage: ChatMessageDto;
}

export class ChatService {
  private readonly llm: LLMService;
  private learningContextCache: {
    ctx: ChatLearningContext;
    expiresAt: number;
  } | null = null;
  private static readonly CONTEXT_TTL_MS = 60_000;

  constructor(
    config: AppConfig,
    private readonly chatRepo: ChatRepository,
    private readonly planService: PlanService,
    private readonly analyticsService: AnalyticsService,
    private readonly intelligence: IntelligenceOrchestrator,
    private readonly topicRepo: TopicRepository,
    private readonly problemRepo: ProblemRepository,
    llm?: LLMService,
    private readonly attemptRepo?: AttemptRepository,
    private readonly noteRepo?: NoteRepository,
  ) {
    this.llm = llm ?? createCoachLLMService(config);
  }

  getThread(threadId: string): ChatThreadDto | null {
    const thread = this.chatRepo.findThreadById(threadId);
    if (!thread) return null;

    return {
      threadId: thread.id,
      messages: this.chatRepo.findMessagesByThread(threadId).map(toMessageDto),
      updatedAt: new Date(thread.updatedAt).toISOString(),
    };
  }

  clearThread(threadId: string): boolean {
    return this.chatRepo.deleteThread(threadId);
  }

  async sendMessage(input: SendChatInput): Promise<SendChatResult> {
    const message = input.message.trim();
    if (!message) {
      throw new Error("message is required");
    }

    const thread =
      input.threadId != null
        ? this.chatRepo.findThreadById(input.threadId)
        : null;
    const activeThread = thread ?? this.chatRepo.createThread();

    if (input.threadId && !thread) {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const history = this.chatRepo
      .findMessagesByThread(activeThread.id)
      .map(
        (row): ChatHistoryMessage => ({
          role: row.role as "user" | "assistant",
          content: row.content,
        }),
      );

    const learningContext = input.includeContext
      ? await this.buildLearningContext(input.problemId)
      : input.problemId
        ? await this.buildProblemOnlyContext(input.problemId)
        : null;

    const reply = await this.llm.generateChatReply(
      learningContext,
      history,
      message,
      { directMode: input.directMode, anchored: Boolean(input.problemId) },
    );

    const userMessage = this.chatRepo.addMessage(activeThread.id, "user", message);
    const assistantMessage = this.chatRepo.addMessage(
      activeThread.id,
      "assistant",
      reply,
    );

    return {
      threadId: activeThread.id,
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
    };
  }

  private async buildLearningContext(problemId?: string): Promise<ChatLearningContext> {
    const now = Date.now();
    if (
      !problemId &&
      this.learningContextCache &&
      this.learningContextCache.expiresAt > now
    ) {
      return this.learningContextCache.ctx;
    }

    const [plan, streak, topics] = await Promise.all([
      this.planService.generateTodaysPlan(),
      Promise.resolve(this.analyticsService.getStreak()),
      Promise.resolve(this.topicRepo.findAll()),
    ]);

    const weakness = this.intelligence.getWeaknessReport(topics);

    const ctx: ChatLearningContext = {
      todayPlan: {
        primaryTopic: plan.primaryTopic.name,
        reasoning: plan.reasoning,
        estimatedDuration: plan.estimatedDuration,
        suggestedProblems: plan.suggestedProblems.map((p) => p.name),
      },
      weakTopics: weakness.weakTopics.slice(0, 3).map((w) => {
        const topic = topics.find((t) => t.id === w.topicId);
        return {
          name: topic?.name ?? w.topicId,
          score: w.score,
          recommendation: w.recommendation,
        };
      }),
      streakDays: streak.currentStreakDays,
    };

    if (problemId) {
      const problemCtx = await this.buildProblemOnlyContext(problemId);
      if (problemCtx?.problem) {
        ctx.problem = problemCtx.problem;
      }
    } else {
      this.learningContextCache = {
        ctx,
        expiresAt: now + ChatService.CONTEXT_TTL_MS,
      };
    }

    return ctx;
  }

  private async buildProblemOnlyContext(
    problemId: string,
  ): Promise<ChatLearningContext | null> {
    const problem = this.problemRepo.findById(problemId);
    if (!problem?.topicId) return null;

    const topic = this.topicRepo.findById(problem.topicId);
    if (!topic) return null;

    const solveHistory = this.attemptRepo
      ?.findByProblemId(problemId, 5)
      .map((a) => ({
        solvedAt: new Date(a.solvedAt).toISOString(),
        timeTakenMinutes: a.timeTaken,
        mistakeTag: a.mistakeTag,
      }));

    const weakness = this.intelligence.analyzeTopicWeakness(topic);
    const weaknessSignals = weakness.signals
      .filter((s) => s.value > 0)
      .map((s) => s.description);

    const noteRow = this.noteRepo?.findByProblemId(problemId);
    const note = noteRow?.content
      ? stripWikiLinks(noteRow.content).trim().slice(0, 4000)
      : undefined;

    return {
      problem: {
        name: problem.name,
        topicName: topic.name,
        difficulty: problem.difficulty ?? "Medium",
        attempts: problem.attempts ?? 0,
        status: problem.status ?? "Unsolved",
        confidence: topic.confidence,
        solveHistory: solveHistory && solveHistory.length > 0 ? solveHistory : undefined,
        topicMistakeTags: topic.mistakeTagCounts,
        weaknessSignals: weaknessSignals.length > 0 ? weaknessSignals : undefined,
        note: note || undefined,
      },
    };
  }
}

function toMessageDto(row: {
  id: string;
  role: string;
  content: string;
  createdAt: number;
}): ChatMessageDto {
  return {
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
