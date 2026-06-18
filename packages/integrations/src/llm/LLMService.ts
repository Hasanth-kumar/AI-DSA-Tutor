import { formatWarmupAnswer } from "@dsa/intelligence";
import { buildChatSystemPrompt } from "../prompts/chat.prompt.js";
import { buildDebriefPrompt } from "../prompts/debrief.prompt.js";
import { buildHintPrompt } from "../prompts/hint.prompt.js";
import {
  buildWarmupAnswerPrompt,
  buildWarmupAnswerRetryPrompt,
  buildWarmupAnswersBatchPrompt,
  buildWarmupPrompt,
  fallbackWarmupQuestions,
  isWeakWarmupAnswer,
  type WarmupItem,
} from "../prompts/warmup.prompt.js";
import type {
  ChatCoachOptions,
  ChatLearningContext,
  DebriefContext,
  HintContext,
  WarmupQuestionContext,
} from "../prompts/types.js";
import type { LLMClient } from "./LLMClient.js";
import { createOpenRouterClient } from "./OpenRouterClient.js";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMServiceConfig {
  model: string;
  timeoutMs?: number;
  openrouter: {
    apiKey: string;
    baseUrl?: string;
    siteUrl?: string;
    siteName?: string;
  };
}

export class LLMService {
  private readonly client: LLMClient;

  constructor(config: LLMServiceConfig, client?: LLMClient) {
    this.client =
      client ??
      createOpenRouterClient({
        apiKey: config.openrouter.apiKey,
        model: config.model,
        baseUrl: config.openrouter.baseUrl,
        siteUrl: config.openrouter.siteUrl,
        siteName: config.openrouter.siteName,
        timeoutMs: config.timeoutMs,
      });
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async generateHint(ctx: HintContext): Promise<string> {
    const prompt = buildHintPrompt(ctx);
    try {
      const text = await this.client.generate(prompt);
      if (!text) {
        return fallbackHint(ctx);
      }
      return `💡 Hint for ${ctx.problemName}\n\n${text}`;
    } catch {
      return fallbackHint(ctx);
    }
  }

  async generateDebrief(ctx: DebriefContext): Promise<string> {
    const prompt = buildDebriefPrompt(ctx);
    try {
      const text = await this.client.generate(prompt);
      if (!text) {
        return fallbackDebrief(ctx);
      }
      return `📝 Session Debrief\n\n${text}`;
    } catch {
      return fallbackDebrief(ctx);
    }
  }

  /**
   * Active-recall warm-up questions (3.1). Prefers the user's own notes;
   * falls back to generic topic questions when the LLM is unavailable or
   * returns unparseable output.
   */
  async generateWarmupQuestions(ctx: WarmupQuestionContext): Promise<{
    questions: WarmupItem[];
    source: "notes" | "generic" | "fallback";
  }> {
    const prompt = buildWarmupPrompt(ctx);
    let questions: WarmupItem[] | null = null;
    let source: "notes" | "generic" | "fallback" = "fallback";

    try {
      const text = await this.client.generate(prompt);
      questions = parseWarmupItems(text, ctx.questionCount);
      if (questions) {
        source = ctx.noteExcerpts.length > 0 ? "notes" : "generic";
      }
    } catch {
      // fall through to static questions
    }

    if (!questions) {
      questions = fallbackWarmupQuestions(ctx.topicName, ctx.questionCount);
      source = "fallback";
    }

    const filled = await this.fillWarmupAnswers(ctx, questions);
    return { questions: filled, source };
  }

  /** Factual model answer for one warm-up question (used when user clicks Show Answer). */
  async generateWarmupAnswer(
    ctx: WarmupQuestionContext & { question: string },
  ): Promise<string> {
    if (!this.isConfigured()) {
      return "";
    }

    const answerCtx = {
      topicName: ctx.topicName,
      question: ctx.question,
      noteExcerpts: ctx.noteExcerpts,
    };

    const primary = await this.requestWarmupAnswer(
      buildWarmupAnswerPrompt(answerCtx),
    );
    if (primary) return primary;

    const retry = await this.requestWarmupAnswer(
      buildWarmupAnswerRetryPrompt(answerCtx),
    );
    if (retry) return retry;

    return "";
  }

  private async requestWarmupAnswer(prompt: string): Promise<string | null> {
    try {
      const text = await this.client.generate(prompt);
      const answer = text?.trim();
      if (!answer || isWeakWarmupAnswer(answer)) return null;
      const formatted = formatWarmupAnswer(answer);
      return formatted || null;
    } catch {
      return null;
    }
  }

  private formatWarmupItem(item: WarmupItem): WarmupItem {
    if (isWeakWarmupAnswer(item.answer)) {
      return { ...item, answer: "" };
    }
    return { ...item, answer: formatWarmupAnswer(item.answer) };
  }

  private async fillWarmupAnswers(
    ctx: WarmupQuestionContext,
    items: WarmupItem[],
  ): Promise<WarmupItem[]> {
    const needsFill = items.some((item) => isWeakWarmupAnswer(item.answer));
    if (!needsFill) {
      return items.map((item) => this.formatWarmupItem(item));
    }

    const missing = items.map((item) => item.question);
    const batchAnswers = await this.generateWarmupAnswersBatch(ctx, missing);
    if (batchAnswers) {
      return items.map((item, i) =>
        this.formatWarmupItem({
          question: item.question,
          answer: isWeakWarmupAnswer(item.answer) ? (batchAnswers[i] ?? "") : item.answer,
        }),
      );
    }

    return items.map((item) => this.formatWarmupItem(item));
  }

  private async generateWarmupAnswersBatch(
    ctx: WarmupQuestionContext,
    questions: string[],
  ): Promise<string[] | null> {
    if (!this.isConfigured() || questions.length === 0) return null;

    const prompt = buildWarmupAnswersBatchPrompt(ctx, questions);
    try {
      const text = await this.client.generate(prompt);
      return parseAnswerArray(text, questions.length);
    } catch {
      return null;
    }
  }

  async generateChatReply(
    learningContext: ChatLearningContext | null,
    history: ChatHistoryMessage[],
    userMessage: string,
    options: ChatCoachOptions = {},
  ): Promise<string> {
    if (!this.isConfigured()) {
      return fallbackChatReply();
    }

    const messages = this.buildChatMessages(learningContext, history, userMessage, options);

    try {
      const text = await this.client.chat(messages);
      if (!text?.trim()) {
        throw new Error("Coach returned an empty response. Please try again.");
      }
      return text;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Coach is temporarily unavailable (${detail}). Please try again.`);
    }
  }

  async *generateChatReplyStream(
    learningContext: ChatLearningContext | null,
    history: ChatHistoryMessage[],
    userMessage: string,
    options: ChatCoachOptions = {},
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    if (!this.isConfigured()) {
      yield fallbackChatReply();
      return;
    }

    const messages = this.buildChatMessages(learningContext, history, userMessage, options);

    try {
      let hasContent = false;
      for await (const chunk of this.client.chatStream(messages, signal)) {
        hasContent = true;
        yield chunk;
      }
      if (!hasContent) {
        throw new Error("Coach returned an empty response. Please try again.");
      }
    } catch (err) {
      if (signal?.aborted) return;
      const detail = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Coach is temporarily unavailable (${detail}). Please try again.`);
    }
  }

  private buildChatMessages(
    learningContext: ChatLearningContext | null,
    history: ChatHistoryMessage[],
    userMessage: string,
    options: ChatCoachOptions,
  ) {
    const systemPrompt = buildChatSystemPrompt(learningContext, options);
    return [
      { role: "system" as const, content: systemPrompt },
      ...history,
      { role: "user" as const, content: userMessage },
    ];
  }
}

/** Extract a JSON string-array of answers from LLM output. */
function parseAnswerArray(text: string | null, expected: number): string[] | null {
  if (!text) return null;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const answers = parsed
      .slice(0, expected)
      .map((a) => (typeof a === "string" ? a.trim() : ""))
      .map((a) => (isWeakWarmupAnswer(a) ? "" : a));
    return answers.some((a) => a.length > 0) ? answers : null;
  } catch {
    return null;
  }
}

/** Extract warmup Q&A items from possibly fenced/chatty LLM output. */
function parseWarmupItems(text: string | null, expected: number): WarmupItem[] | null {
  if (!text) return null;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const items = parsed
      .map((entry): WarmupItem | null => {
        if (typeof entry === "string" && entry.trim().length > 0) {
          return { question: entry.trim(), answer: "" };
        }
        if (entry && typeof entry === "object" && "question" in entry) {
          const question =
            typeof entry.question === "string" ? entry.question.trim() : "";
          const answer =
            "answer" in entry && typeof entry.answer === "string"
              ? entry.answer.trim()
              : "";
          if (question.length > 0) {
            return {
              question,
              answer: isWeakWarmupAnswer(answer) ? "" : answer,
            };
          }
        }
        return null;
      })
      .filter((item): item is WarmupItem => item !== null)
      .slice(0, expected);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

function fallbackHint(ctx: HintContext): string {
  const depth =
    ctx.difficulty === "Easy"
      ? "Start with a brute-force approach and look for repeated work."
      : ctx.difficulty === "Medium"
        ? "Identify the pattern, then optimize time or space."
        : "Break into subproblems; verify invariants before coding.";

  return `💡 LLM unavailable (check OpenRouter API key).\n\nFor ${ctx.problemName} (${ctx.difficulty}): focus on ${ctx.topicName}. ${depth}`;
}

function fallbackChatReply(): string {
  return (
    "Coach is unavailable right now. Check your OpenRouter coach key (`OPENROUTER_COACH_API_KEY` " +
    "or `OPENROUTER_API_KEY`) and model (`COACH_LLM_MODEL`, e.g. `deepseek/deepseek-r1:free`)."
  );
}

function fallbackDebrief(ctx: DebriefContext): string {
  const focus = ctx.isWeakArea
    ? `Weak area detected — schedule extra ${ctx.topicName} practice.`
    : `Solid session on ${ctx.topicName}.`;

  return `📝 Session Debrief\n\n${focus}\nProductivity: ${ctx.productivityScore}/100. ${ctx.recommendation}`;
}

export function createLLMService(config: LLMServiceConfig): LLMService {
  return new LLMService(config);
}
