import type { LLMChatMessage, LLMClient } from "./LLMClient.js";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

export type OllamaChatMessage = LLMChatMessage;

export class OllamaClient implements LLMClient {
  constructor(private readonly config: OllamaConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl && this.config.model);
  }

  async generate(prompt: string): Promise<string | null> {
    const { baseUrl, model, timeoutMs = 60_000 } = this.config;

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}`);
    }

    const data = (await res.json()) as { response?: string };
    return data.response?.trim() ?? null;
  }

  async chat(messages: OllamaChatMessage[]): Promise<string | null> {
    const { baseUrl, model, timeoutMs = 120_000 } = this.config;

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() ?? null;
  }
}

export function createOllamaClient(config: OllamaConfig): OllamaClient {
  return new OllamaClient(config);
}
