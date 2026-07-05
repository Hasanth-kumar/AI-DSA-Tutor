import type { LLMChatMessage, LLMClient } from "./LLMClient.js";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  /** Fallback chain tried in order after `model` fails (A1). Defaults to `[model]`. */
  models?: string[];
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 529;
}

/** Matches OpenRouter's generic upstream-provider failure regardless of HTTP status (A2). */
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

  constructor(private readonly config: OpenRouterConfig) {
    this.baseUrl = (config.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.models = config.models && config.models.length > 0 ? config.models : [config.model];
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.models[0]);
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

  /** Tries each configured model in order; only advances once the failing model has yielded nothing. */
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
        for await (const chunk of this.chatStreamModel(model, messages, signal)) {
          yieldedAny = true;
          yield chunk;
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (signal?.aborted || yieldedAny || isLastModel) {
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
  ): AsyncIterable<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    if (this.config.siteUrl) {
      headers["HTTP-Referer"] = this.config.siteUrl;
    }
    if (this.config.siteName) {
      headers["X-Title"] = this.config.siteName;
    }

    const body = JSON.stringify({
      model,
      // OpenRouter native fallback (A1): tries the rest of the chain server-side too.
      models: this.models,
      messages,
      stream: true,
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

              const data = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
                error?: { message?: string };
              };
              if (data.error) {
                throw new Error(`OpenRouter error: ${data.error.message ?? "Unknown error"}`);
              }
              const content = data.choices?.[0]?.delta?.content;
              if (content) yield content;
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
