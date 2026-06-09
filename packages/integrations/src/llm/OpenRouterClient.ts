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

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const data = (await res.json()) as ChatCompletionResponse;

    if (!res.ok) {
      const detail = data.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`OpenRouter error: ${detail}`);
    }

    return data.choices?.[0]?.message?.content?.trim() ?? null;
  }
}

export function createOpenRouterClient(config: OpenRouterConfig): OpenRouterClient {
  return new OpenRouterClient(config);
}
