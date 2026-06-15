import { API_BASE } from "../api/client.js";
import type { ChatMessage, ChatStreamEvent, SendChatResult } from "../types/api.js";

export interface StreamHandlers {
  onMeta?: (event: ChatStreamEvent) => void;
  onChunk?: (text: string) => void;
  onDone?: (assistantMessage: ChatMessage) => void;
}

function parseSseBlock(block: string): { eventType: string; data: string } | null {
  const lines = block.split("\n");
  let eventType = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) eventType = line.slice(7).trim();
    else if (line.startsWith("data: ")) data = line.slice(6);
  }

  return data ? { eventType, data } : null;
}

export async function consumeCoachStream(
  path: string,
  body: Record<string, unknown>,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<SendChatResult | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `Request failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Empty stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let threadId = "";
  let userMessage: ChatMessage | undefined;
  let assistantMessage: ChatMessage | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const parsed = parseSseBlock(block);
        if (!parsed) continue;

        const event = JSON.parse(parsed.data) as ChatStreamEvent;

        if (event.type === "meta") {
          threadId = event.threadId ?? "";
          userMessage = event.userMessage;
          handlers.onMeta?.(event);
        } else if (event.type === "chunk") {
          handlers.onChunk?.(event.text ?? "");
        } else if (event.type === "done") {
          assistantMessage = event.assistantMessage;
          if (assistantMessage) handlers.onDone?.(assistantMessage);
        } else if (event.type === "error") {
          throw new Error(event.message ?? "Stream failed");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (threadId && userMessage && assistantMessage) {
    return { threadId, userMessage, assistantMessage };
  }

  return null;
}
