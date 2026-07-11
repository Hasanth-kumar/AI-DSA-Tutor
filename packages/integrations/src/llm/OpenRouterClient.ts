import type { LLMChatMessage, LLMClient } from "./LLMClient.js";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  /** Fallback chain tried in order after `model` fails. Defaults to `[model]`. */
  models?: string[];
  /** Optional per-model API keys (e.g. Gemma on the general key, GPT-OSS on the coach key). */
  modelApiKeys?: Record<string, string>;
  baseUrl?: string;
  siteUrl?: string;
  siteName?: string;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string };
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
/** Enough headroom for free reasoning models once reasoning tokens are excluded. */
const DEFAULT_MAX_TOKENS = 2_048;
/** OpenRouter rejects requests when `models` has more than 3 entries. */
const OPENROUTER_MODELS_CAP = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 529;
}

/** Matches OpenRouter's generic upstream-provider failure regardless of HTTP status. */
function isProviderError(message: string): boolean {
  return message.toLowerCase().includes("provider returned error");
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  const message = err.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

export class OpenRouterClient implements LLMClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly models: string[];
  private readonly modelApiKeys: Record<string, string>;

  constructor(private readonly config: OpenRouterConfig) {
    this.baseUrl = (config.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.models = config.models && config.models.length > 0 ? config.models : [config.model];
    this.modelApiKeys = config.modelApiKeys ?? {};
  }

  private apiKeyFor(model: string): string {
    return this.modelApiKeys[model] || this.config.apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKeyFor(this.models[0] ?? this.config.model) && this.models[0]);
  }

  async generate(prompt: string): Promise<string | null> {
    return this.chat([{ role: "user", content: prompt }]);
  }

  async chat(messages: LLMChatMessage[]): Promise<string | null> {
    let full = "";
    for await (const chunk of this.chatStream(messages)) {
      full += chunk;
    }
    return full.trim() || null;
  }

  /**
   * Tries each configured model in order. Advances only when the failing model
   * yielded nothing. Partial streams are kept and finished (no second model).
   */
  async *chatStream(
    messages: LLMChatMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const attempted: string[] = [];
    let lastError: Error | null = null;

    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i]!;
      attempted.push(model);
      const isLastModel = i === this.models.length - 1;
      let yieldedAny = false;

      try {
        // OpenRouter's native `models` array shares one Authorization header —
        // only include fallbacks that use the same key as the current model.
        const key = this.apiKeyFor(model);
        const sameKeyRoute = this.models
          .slice(i)
          .filter((m) => this.apiKeyFor(m) === key)
          .slice(0, OPENROUTER_MODELS_CAP);
        for await (const chunk of this.chatStreamModel(
          model,
          messages,
          signal,
          sameKeyRoute,
          key,
        )) {
          yieldedAny = true;
          yield chunk;
        }
        // Empty 200 (common when reasoning ate the budget) → try next model.
        if (!yieldedAny) {
          throw new Error(`OpenRouter returned no content from ${model}`);
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Partial content: keep what we have and finish — do not fall back.
        if (yieldedAny) return;
        if (signal?.aborted || isLastModel) {
          throw attempted.length > 1
            ? new Error(`All models failed (tried: ${attempted.join(", ")}): ${lastError.message}`)
            : lastError;
        }
      }
    }

    throw lastError ?? new Error("OpenRouter request failed after retries");
  }

  private async *chatStreamModel(
    model: string,
    messages: LLMChatMessage[],
    signal?: AbortSignal,
    routeModels: string[] = [model],
    apiKey: string = this.config.apiKey,
  ): AsyncIterable<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    if (this.config.siteUrl) {
      headers["HTTP-Referer"] = this.config.siteUrl;
    }
    if (this.config.siteName) {
      headers["X-Title"] = this.config.siteName;
    }

    const body = JSON.stringify({
      model,
      // OpenRouter native fallback (max 3). Client-side loop covers the rest.
      models: routeModels.slice(0, OPENROUTER_MODELS_CAP),
      messages,
      stream: true,
      max_tokens: DEFAULT_MAX_TOKENS,
      // Free "reasoning" models often spend the whole budget on delta.reasoning
      // and leave delta.content empty — exclude so the coach gets a real reply.
      reasoning: { exclude: true },
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body,
          signal: signal ?? AbortSignal.timeout(this.timeoutMs),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ChatCompletionResponse;
          const detail = data.error?.message ?? `HTTP ${res.status}`;
          const err = new Error(`OpenRouter error: ${detail}`);
          // Provider errors: advance to next model immediately (no same-model retry).
          if (
            !isProviderError(detail) &&
            isRetryableStatus(res.status) &&
            attempt < MAX_RETRIES - 1
          ) {
            lastError = err;
            await sleep(RETRY_BASE_MS * 2 ** attempt);
            continue;
          }
          throw err;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("OpenRouter returned an empty stream");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let yieldedAny = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;

              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") return;

              let data: {
                choices?: Array<{ delta?: { content?: string } }>;
                error?: { message?: string };
              };
              try {
                data = JSON.parse(payload) as typeof data;
              } catch {
                // Transient malformed SSE line — skip and keep reading.
                continue;
              }

              if (data.error) {
                // Mid-stream error: keep partial if we already yielded; else fail the model.
                if (yieldedAny) return;
                throw new Error(`OpenRouter error: ${data.error.message ?? "Unknown error"}`);
              }

              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                yieldedAny = true;
                yield content;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        return;
      } catch (err) {
        if (isRetryableError(err) && attempt < MAX_RETRIES - 1) {
          lastError = err instanceof Error ? err : new Error(String(err));
          await sleep(RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("OpenRouter request failed after retries");
  }
}

export function createOpenRouterClient(config: OpenRouterConfig): OpenRouterClient {
  return new OpenRouterClient(config);
}
