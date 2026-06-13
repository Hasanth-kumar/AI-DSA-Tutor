import type { LLMChatMessage, LLMClient } from "./LLMClient.js";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
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

  constructor(private readonly config: OpenRouterConfig) {
    this.baseUrl = (config.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.model);
  }

  async generate(prompt: string): Promise<string | null> {
    return this.chat([{ role: "user", content: prompt }]);
  }

  async chat(messages: LLMChatMessage[]): Promise<string | null> {
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
      model: this.config.model,
      messages,
      stream: false,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        const data = (await res.json()) as ChatCompletionResponse;

        if (!res.ok) {
          const detail = data.error?.message ?? `HTTP ${res.status}`;
          const err = new Error(`OpenRouter error: ${detail}`);
          if (isRetryableStatus(res.status) && attempt < MAX_RETRIES - 1) {
            lastError = err;
            await sleep(RETRY_BASE_MS * 2 ** attempt);
            continue;
          }
          throw err;
        }

        const content = data.choices?.[0]?.message?.content?.trim() ?? null;
        if (!content && attempt < MAX_RETRIES - 1) {
          lastError = new Error("OpenRouter returned an empty response");
          await sleep(RETRY_BASE_MS * 2 ** attempt);
          continue;
        }

        return content;
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
