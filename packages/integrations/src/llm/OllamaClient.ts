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
    let full = "";
    for await (const chunk of this.chatStream(messages)) {
      full += chunk;
    }
    return full.trim() || null;
  }

  async *chatStream(
    messages: OllamaChatMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const { baseUrl, model, timeoutMs = 120_000 } = this.config;

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Ollama returned an empty stream");
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
          if (!trimmed) continue;

          const data = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
          };

          const content = data.message?.content;
          if (content) yield content;
          if (data.done) return;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export function createOllamaClient(config: OllamaConfig): OllamaClient {
  return new OllamaClient(config);
}
