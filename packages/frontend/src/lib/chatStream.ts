import { API_BASE } from "../api/client.js";
import type { ChatMessage, ChatStreamEvent } from "../types/api.js";

export interface StreamChatOptions {
  path: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  onMeta?: (threadId: string, userMessage: ChatMessage) => void;
  onChunk?: (text: string) => void;
}

export interface StreamChatResult {
  threadId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

function parseSseBlock(block: string): ChatStreamEvent | null {
  const lines = block.split("\n");
  let eventType = "";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!eventType || !data) return null;

  try {
    const parsed = JSON.parse(data) as ChatStreamEvent;
    return { ...parsed, type: parsed.type ?? (eventType as ChatStreamEvent["type"]) };
  } catch {
    return null;
  }
}

type StreamAccumulator = {
  threadId: string;
  userMessage: ChatMessage | null;
  assistantMessage: ChatMessage | null;
};

function applyStreamEvent(
  event: ChatStreamEvent,
  acc: StreamAccumulator,
  options: StreamChatOptions,
): void {
  if (event.type === "meta" && event.threadId && event.userMessage) {
    acc.threadId = event.threadId;
    acc.userMessage = event.userMessage;
    options.onMeta?.(event.threadId, event.userMessage);
    return;
  }

  if (event.type === "chunk" && event.text != null && event.text !== "") {
    options.onChunk?.(event.text);
    return;
  }

  if (event.type === "done" && event.assistantMessage) {
    acc.assistantMessage = event.assistantMessage;
    return;
  }

  if (event.type === "error") {
    throw new Error(event.message ?? "Stream failed");
  }
}

function processSseBuffer(
  buffer: string,
  acc: StreamAccumulator,
  options: StreamChatOptions,
  flush = false,
): string {
  if (flush) {
    for (const part of buffer.split("\n\n")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const event = parseSseBlock(trimmed);
      if (event) applyStreamEvent(event, acc, options);
    }
    return "";
  }

  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const event = parseSseBlock(trimmed);
    if (event) applyStreamEvent(event, acc, options);
  }

  return remainder;
}

/** Consume a coaching SSE stream and invoke callbacks for each event. */
export async function consumeChatStream(
  options: StreamChatOptions,
): Promise<StreamChatResult> {
  const res = await fetch(`${API_BASE}${options.path}`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Request failed: ${res.status}`);
    }
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Coach returned an empty stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const acc: StreamAccumulator = {
    threadId: "",
    userMessage: null,
    assistantMessage: null,
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
        buffer = processSseBuffer(buffer, acc, options);
      }

      if (done) {
        buffer += decoder.decode();
        processSseBuffer(buffer, acc, options, true);
        break;
      }
    }
  } catch (err) {
    if (options.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw err;
  } finally {
    reader.releaseLock();
  }

  if (acc.threadId && acc.userMessage && acc.assistantMessage) {
    return {
      threadId: acc.threadId,
      userMessage: acc.userMessage,
      assistantMessage: acc.assistantMessage,
    };
  }

  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (acc.threadId) {
    throw new IncompleteChatStreamError(acc.threadId);
  }

  throw new Error("Coach stream ended without a complete response");
}

/** Thrown when the stream dropped after meta/chunks but the server likely persisted the reply. */
export class IncompleteChatStreamError extends Error {
  constructor(public readonly threadId: string) {
    super("Coach stream ended without a complete response");
    this.name = "IncompleteChatStreamError";
  }
}
