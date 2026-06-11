import { buildChatSystemPrompt } from "../prompts/chat.prompt.js";
import { buildDebriefPrompt } from "../prompts/debrief.prompt.js";
import { buildHintPrompt } from "../prompts/hint.prompt.js";
import {
  buildWarmupPrompt,
  fallbackWarmupQuestions,
} from "../prompts/warmup.prompt.js";
import type {
  ChatCoachOptions,
  ChatLearningContext,
  DebriefContext,
  HintContext,
  WarmupQuestionContext,
} from "../prompts/types.js";
import type { LLMClient } from "./LLMClient.js";
import { createOllamaClient } from "./OllamaClient.js";
import { createOpenRouterClient } from "./OpenRouterClient.js";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type LLMProvider = "ollama" | "openrouter";

export interface LLMServiceConfig {
  provider: LLMProvider;
  model: string;
  timeoutMs?: number;
  ollama?: { baseUrl: string };
  openrouter?: {
    apiKey: string;
    baseUrl?: string;
    siteUrl?: string;
    siteName?: string;
  };
}

export class LLMService {
  private readonly client: LLMClient;
  private readonly provider: LLMProvider;

  constructor(config: LLMServiceConfig, client?: LLMClient) {
    this.provider = config.provider;
    this.client =
      client ??
      (config.provider === "openrouter"
        ? createOpenRouterClient({
            apiKey: config.openrouter?.apiKey ?? "",
            model: config.model,
            baseUrl: config.openrouter?.baseUrl,
            siteUrl: config.openrouter?.siteUrl,
            siteName: config.openrouter?.siteName,
            timeoutMs: config.timeoutMs,
          })
        : createOllamaClient({
            baseUrl: config.ollama?.baseUrl ?? "http://localhost:11434",
            model: config.model,
            timeoutMs: config.timeoutMs,
          }));
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async generateHint(ctx: HintContext): Promise<string> {
    const prompt = buildHintPrompt(ctx);
    try {
      const text = await this.client.generate(prompt);
      if (!text) {
        return fallbackHint(ctx, this.provider);
      }
      return `💡 Hint for ${ctx.problemName}\n\n${text}`;
    } catch {
      return fallbackHint(ctx, this.provider);
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
    questions: string[];
    source: "notes" | "generic" | "fallback";
  }> {
    const prompt = buildWarmupPrompt(ctx);
    try {
      const text = await this.client.generate(prompt);
      const questions = parseQuestionArray(text, ctx.questionCount);
      if (questions) {
        return {
          questions,
          source: ctx.noteExcerpts.length > 0 ? "notes" : "generic",
        };
      }
    } catch {
      // fall through to static questions
    }
    return {
      questions: fallbackWarmupQuestions(ctx.topicName, ctx.questionCount),
      source: "fallback",
    };
  }

  async generateChatReply(
    learningContext: ChatLearningContext | null,
    history: ChatHistoryMessage[],
    userMessage: string,
    options: ChatCoachOptions = {},
  ): Promise<string> {
    const systemPrompt = buildChatSystemPrompt(learningContext, options);
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history,
      { role: "user" as const, content: userMessage },
    ];

    try {
      const text = await this.client.chat(messages);
      if (!text) {
        return fallbackChatReply(this.provider);
      }
      return text;
    } catch {
      return fallbackChatReply(this.provider);
    }
  }
}

/** Extract a JSON string-array from possibly fenced/chatty LLM output. */
function parseQuestionArray(text: string | null, expected: number): string[] | null {
  if (!text) return null;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const questions = parsed
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .map((q) => q.trim())
      .slice(0, expected);
    return questions.length > 0 ? questions : null;
  } catch {
    return null;
  }
}

function fallbackHint(ctx: HintContext, provider: LLMProvider): string {
  const depth =
    ctx.difficulty === "Easy"
      ? "Start with a brute-force approach and look for repeated work."
      : ctx.difficulty === "Medium"
        ? "Identify the pattern, then optimize time or space."
        : "Break into subproblems; verify invariants before coding.";

  const providerNote =
    provider === "openrouter"
      ? "LLM unavailable (check OpenRouter API key)."
      : "Hint unavailable (is Ollama running?).";

  return `💡 ${providerNote}\n\nFor ${ctx.problemName} (${ctx.difficulty}): focus on ${ctx.topicName}. ${depth}`;
}

function fallbackChatReply(provider: LLMProvider): string {
  if (provider === "openrouter") {
    return (
      "Coach is unavailable right now. Check your OpenRouter API key (`OPENROUTER_API_KEY`) " +
      "and model (`OPENROUTER_MODEL`, e.g. `google/gemma-4-31b-it:free`)."
    );
  }

  return (
    "Coach is unavailable right now. Ensure Ollama is running (`pnpm docker:up`) " +
    "and your model is pulled (e.g. `ollama pull qwen2.5-coder:3b`)."
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
