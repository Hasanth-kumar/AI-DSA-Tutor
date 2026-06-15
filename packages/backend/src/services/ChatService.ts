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

export interface ChatThreadSummaryDto {
  threadId: string;
  preview: string;
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

export type ChatStreamEvent =
  | { type: "meta"; threadId: string; userMessage: ChatMessageDto }
  | { type: "chunk"; text: string }
  | { type: "done"; assistantMessage: ChatMessageDto }
  | { type: "error"; message: string };

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

  listThreads(limit = 30): ChatThreadSummaryDto[] {
    return this.chatRepo.listThreads(limit).map((thread) => {
      const firstUser = this.chatRepo.findFirstUserMessage(thread.id);
      const preview = firstUser?.content.trim().slice(0, 80) ?? "New conversation";
      return {
        threadId: thread.id,
        preview: preview.length >= 80 ? `${preview}…` : preview,
        updatedAt: new Date(thread.updatedAt).toISOString(),
      };
    });
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

    const { thread, history, learningContext, coachOptions } =
      await this.prepareTurn(input, message);

    const reply = await this.llm.generateChatReply(
      learningContext,
      history,
      message,
      coachOptions,
    );

    const userMessage = this.chatRepo.addMessage(thread.id, "user", message);
    const assistantMessage = this.chatRepo.addMessage(thread.id, "assistant", reply);

    return {
      threadId: thread.id,
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
    };
  }

  async *sendMessageStream(
    input: SendChatInput,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const message = input.message.trim();
    if (!message) {
      yield { type: "error", message: "message is required" };
      return;
    }

    try {
      const { thread, history, learningContext, coachOptions } =
        await this.prepareTurn(input, message);

      const userMessage = this.chatRepo.addMessage(thread.id, "user", message);
      yield { type: "meta", threadId: thread.id, userMessage: toMessageDto(userMessage) };

      let reply = "";
      for await (const chunk of this.llm.generateChatReplyStream(
        learningContext,
        history,
        message,
        coachOptions,
        signal,
      )) {
        if (signal?.aborted) break;
        reply += chunk;
        yield { type: "chunk", text: chunk };
      }

      const trimmed = reply.trim();
      if (!trimmed && !signal?.aborted) {
        this.chatRepo.deleteMessage(userMessage.id);
        yield { type: "error", message: "Coach returned an empty response. Please try again." };
        return;
      }

      if (signal?.aborted && !trimmed) {
        this.chatRepo.deleteMessage(userMessage.id);
        yield { type: "error", message: "Generation stopped" };
        return;
      }

      const assistantMessage = this.chatRepo.addMessage(
        thread.id,
        "assistant",
        trimmed || reply,
      );
      yield { type: "done", assistantMessage: toMessageDto(assistantMessage) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      yield { type: "error", message: msg };
    }
  }

  async regenerateMessage(input: {
    threadId: string;
    problemId?: string;
    includeContext?: boolean;
    directMode?: boolean;
  }): Promise<SendChatResult> {
    const thread = this.chatRepo.findThreadById(input.threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const messages = this.chatRepo.findMessagesByThread(input.threadId);
    if (messages.length < 2) {
      throw new Error("Nothing to regenerate");
    }

    const last = messages[messages.length - 1]!;
    if (last.role !== "assistant") {
      throw new Error("Last message is not from the coach");
    }

    const userMsg = messages[messages.length - 2]!;
    if (userMsg.role !== "user") {
      throw new Error("Expected a user message before the coach reply");
    }

    this.chatRepo.deleteMessage(last.id);

    const history = messages.slice(0, -2).map(toHistoryMessage);
    const learningContext = input.includeContext
      ? await this.buildLearningContext(input.problemId)
      : input.problemId
        ? await this.buildProblemOnlyContext(input.problemId)
        : null;

    const reply = await this.llm.generateChatReply(
      learningContext,
      history,
      userMsg.content,
      { directMode: input.directMode, anchored: Boolean(input.problemId) },
    );

    const assistantMessage = this.chatRepo.addMessage(input.threadId, "assistant", reply);

    return {
      threadId: input.threadId,
      userMessage: toMessageDto(userMsg),
      assistantMessage: toMessageDto(assistantMessage),
    };
  }

  async *regenerateMessageStream(
    input: {
      threadId: string;
      problemId?: string;
      includeContext?: boolean;
      directMode?: boolean;
    },
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    try {
      const thread = this.chatRepo.findThreadById(input.threadId);
      if (!thread) {
        yield { type: "error", message: `Thread not found: ${input.threadId}` };
        return;
      }

      const messages = this.chatRepo.findMessagesByThread(input.threadId);
      if (messages.length < 2) {
        yield { type: "error", message: "Nothing to regenerate" };
        return;
      }

      const last = messages[messages.length - 1]!;
      if (last.role !== "assistant") {
        yield { type: "error", message: "Last message is not from the coach" };
        return;
      }

      const userMsg = messages[messages.length - 2]!;
      if (userMsg.role !== "user") {
        yield { type: "error", message: "Expected a user message before the coach reply" };
        return;
      }

      this.chatRepo.deleteMessage(last.id);

      const history = messages.slice(0, -2).map(toHistoryMessage);
      const learningContext = input.includeContext
        ? await this.buildLearningContext(input.problemId)
        : input.problemId
          ? await this.buildProblemOnlyContext(input.problemId)
          : null;

      yield { type: "meta", threadId: input.threadId, userMessage: toMessageDto(userMsg) };

      let reply = "";
      for await (const chunk of this.llm.generateChatReplyStream(
        learningContext,
        history,
        userMsg.content,
        { directMode: input.directMode, anchored: Boolean(input.problemId) },
        signal,
      )) {
        if (signal?.aborted) break;
        reply += chunk;
        yield { type: "chunk", text: chunk };
      }

      const trimmed = reply.trim();
      if (!trimmed && !signal?.aborted) {
        yield { type: "error", message: "Coach returned an empty response. Please try again." };
        return;
      }

      if (signal?.aborted && !trimmed) {
        yield { type: "error", message: "Generation stopped" };
        return;
      }

      const assistantMessage = this.chatRepo.addMessage(
        input.threadId,
        "assistant",
        trimmed || reply,
      );
      yield { type: "done", assistantMessage: toMessageDto(assistantMessage) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Regenerate failed";
      yield { type: "error", message: msg };
    }
  }

  async editMessage(input: {
    threadId: string;
    messageId: string;
    content: string;
    problemId?: string;
    includeContext?: boolean;
    directMode?: boolean;
  }): Promise<SendChatResult> {
    const content = input.content.trim();
    if (!content) {
      throw new Error("content is required");
    }

    const thread = this.chatRepo.findThreadById(input.threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const target = this.chatRepo.findMessageById(input.messageId);
    if (!target || target.threadId !== input.threadId) {
      throw new Error("Message not found");
    }
    if (target.role !== "user") {
      throw new Error("Only user messages can be edited");
    }

    this.chatRepo.updateMessageContent(input.messageId, content);
    this.chatRepo.deleteMessagesAfter(input.threadId, target.createdAt);

    const prior = this.chatRepo
      .findMessagesByThread(input.threadId)
      .filter((m) => m.createdAt < target.createdAt)
      .map(toHistoryMessage);

    const learningContext = input.includeContext
      ? await this.buildLearningContext(input.problemId)
      : input.problemId
        ? await this.buildProblemOnlyContext(input.problemId)
        : null;

    const reply = await this.llm.generateChatReply(
      learningContext,
      prior,
      content,
      { directMode: input.directMode, anchored: Boolean(input.problemId) },
    );

    const userMessage = this.chatRepo.findMessageById(input.messageId)!;
    const assistantMessage = this.chatRepo.addMessage(input.threadId, "assistant", reply);

    return {
      threadId: input.threadId,
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
    };
  }

  async *editMessageStream(
    input: {
      threadId: string;
      messageId: string;
      content: string;
      problemId?: string;
      includeContext?: boolean;
      directMode?: boolean;
    },
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const content = input.content.trim();
    if (!content) {
      yield { type: "error", message: "content is required" };
      return;
    }

    try {
      const thread = this.chatRepo.findThreadById(input.threadId);
      if (!thread) {
        yield { type: "error", message: `Thread not found: ${input.threadId}` };
        return;
      }

      const target = this.chatRepo.findMessageById(input.messageId);
      if (!target || target.threadId !== input.threadId) {
        yield { type: "error", message: "Message not found" };
        return;
      }
      if (target.role !== "user") {
        yield { type: "error", message: "Only user messages can be edited" };
        return;
      }

      this.chatRepo.updateMessageContent(input.messageId, content);
      this.chatRepo.deleteMessagesAfter(input.threadId, target.createdAt);

      const prior = this.chatRepo
        .findMessagesByThread(input.threadId)
        .filter((m) => m.createdAt < target.createdAt)
        .map(toHistoryMessage);

      const learningContext = input.includeContext
        ? await this.buildLearningContext(input.problemId)
        : input.problemId
          ? await this.buildProblemOnlyContext(input.problemId)
          : null;

      const userMessage = this.chatRepo.findMessageById(input.messageId)!;
      yield { type: "meta", threadId: input.threadId, userMessage: toMessageDto(userMessage) };

      let reply = "";
      for await (const chunk of this.llm.generateChatReplyStream(
        learningContext,
        prior,
        content,
        { directMode: input.directMode, anchored: Boolean(input.problemId) },
        signal,
      )) {
        if (signal?.aborted) break;
        reply += chunk;
        yield { type: "chunk", text: chunk };
      }

      const trimmed = reply.trim();
      if (!trimmed && !signal?.aborted) {
        yield { type: "error", message: "Coach returned an empty response. Please try again." };
        return;
      }

      if (signal?.aborted && !trimmed) {
        yield { type: "error", message: "Generation stopped" };
        return;
      }

      const assistantMessage = this.chatRepo.addMessage(
        input.threadId,
        "assistant",
        trimmed || reply,
      );
      yield { type: "done", assistantMessage: toMessageDto(assistantMessage) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Edit failed";
      yield { type: "error", message: msg };
    }
  }

  private async prepareTurn(input: SendChatInput, message: string) {
    const thread =
      input.threadId != null ? this.chatRepo.findThreadById(input.threadId) : null;
    const activeThread = thread ?? this.chatRepo.createThread();

    if (input.threadId && !thread) {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const history = this.chatRepo
      .findMessagesByThread(activeThread.id)
      .map(toHistoryMessage);

    const learningContext = input.includeContext
      ? await this.buildLearningContext(input.problemId)
      : input.problemId
        ? await this.buildProblemOnlyContext(input.problemId)
        : null;

    return {
      thread: activeThread,
      history,
      learningContext,
      coachOptions: {
        directMode: input.directMode,
        anchored: Boolean(input.problemId),
      },
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
        status: problem.status ?? "Not started",
        confidence: topic.confidence,
        solveHistory: solveHistory && solveHistory.length > 0 ? solveHistory : undefined,
        topicMistakeTags: topic.mistakeTagCounts,
        weaknessSignals: weaknessSignals.length > 0 ? weaknessSignals : undefined,
        note: note || undefined,
      },
    };
  }
}

function toHistoryMessage(row: {
  role: string;
  content: string;
}): ChatHistoryMessage {
  return {
    role: row.role as "user" | "assistant",
    content: row.content,
  };
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
