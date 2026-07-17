/**
 * Characterization tests for the chat stream paths (send / regenerate / edit).
 * These pin the event protocol — meta → chunk → done, error events instead of
 * throws — that the SSE routes and the frontend chatStream reader rely on.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LLMService, runMigrations, type LLMClient } from "@dsa/integrations";
import { loadConfig, resetConfigCache, type AppConfig } from "@dsa/shared";
import { createAppContext, type AppContext } from "../context.js";
import type { ChatStreamEvent } from "./ChatService.js";

const REPLY_CHUNKS = ["Think about ", "two pointers."];

function createTestCoachLLM(): LLMService {
  const client: LLMClient = {
    isConfigured: () => true,
    generate: async () => "unused",
    chat: async () => REPLY_CHUNKS.join(""),
    async *chatStream() {
      // Real replies never land in the same millisecond as the user message;
      // deleteMessagesAfter cuts strictly-later rows, so keep that ordering.
      await new Promise((resolve) => setTimeout(resolve, 2));
      for (const chunk of REPLY_CHUNKS) yield chunk;
    },
  };
  return new LLMService({ model: "test", openrouter: { apiKey: "test-key" } }, client);
}

async function collect(gen: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

let testDbPath: string;
let config: AppConfig;
let ctx: AppContext;

describe("ChatService stream paths", () => {
  beforeEach(() => {
    resetConfigCache();
    testDbPath = join(tmpdir(), `dsa-chat-stream-test-${Date.now()}-${Math.random()}.db`);
    process.env.SQLITE_PATH = testDbPath;
    process.env.ENABLE_SCHEDULERS = "false";
    runMigrations(testDbPath);
    config = loadConfig("/nonexistent/.env");
    config = {
      ...config,
      sqlite: { path: testDbPath },
      schedulers: { ...config.schedulers, enabled: false },
    };
    ctx = createAppContext(config, { coachLlm: createTestCoachLLM() });
  });

  afterEach(async () => {
    await ctx.close();
    resetConfigCache();
    try {
      rmSync(testDbPath);
    } catch {
      // ignore
    }
  });

  it("sendMessageStream yields meta → chunks → done and persists both messages", async () => {
    const events = await collect(
      ctx.chatService.sendMessageStream({ message: "How do I solve Two Sum?" }),
    );

    expect(events.map((e) => e.type)).toEqual(["meta", "chunk", "chunk", "done"]);
    const meta = events[0]! as Extract<ChatStreamEvent, { type: "meta" }>;
    expect(meta.userMessage.content).toBe("How do I solve Two Sum?");

    const thread = ctx.chatService.getThread(meta.threadId)!;
    expect(thread.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(thread.messages[1]!.content).toBe(REPLY_CHUNKS.join(""));
  });

  it("sendMessageStream yields an error event for an empty message", async () => {
    const events = await collect(ctx.chatService.sendMessageStream({ message: "   " }));
    expect(events).toEqual([{ type: "error", message: "message is required" }]);
  });

  it("regenerateMessageStream replaces the last assistant reply in place", async () => {
    const sent = await collect(ctx.chatService.sendMessageStream({ message: "Hint please" }));
    const threadId = (sent[0] as Extract<ChatStreamEvent, { type: "meta" }>).threadId;

    const events = await collect(ctx.chatService.regenerateMessageStream({ threadId }));
    expect(events.map((e) => e.type)).toEqual(["meta", "chunk", "chunk", "done"]);
    const meta = events[0]! as Extract<ChatStreamEvent, { type: "meta" }>;
    expect(meta.userMessage.content).toBe("Hint please");

    // Still exactly one user + one assistant message — no duplicates.
    const thread = ctx.chatService.getThread(threadId)!;
    expect(thread.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("regenerateMessageStream yields an error for an unknown thread", async () => {
    const events = await collect(
      ctx.chatService.regenerateMessageStream({ threadId: "nope" }),
    );
    expect(events).toEqual([{ type: "error", message: "Thread not found: nope" }]);
  });

  it("editMessageStream rewrites the user message and truncates what followed", async () => {
    const sent = await collect(ctx.chatService.sendMessageStream({ message: "Original" }));
    const meta = sent[0]! as Extract<ChatStreamEvent, { type: "meta" }>;

    const events = await collect(
      ctx.chatService.editMessageStream({
        threadId: meta.threadId,
        messageId: meta.userMessage.id,
        content: "Edited question",
      }),
    );
    expect(events.map((e) => e.type)).toEqual(["meta", "chunk", "chunk", "done"]);

    const thread = ctx.chatService.getThread(meta.threadId)!;
    expect(thread.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Edited question"],
      ["assistant", REPLY_CHUNKS.join("")],
    ]);
  });

  it("editMessageStream yields an error for empty content", async () => {
    const events = await collect(
      ctx.chatService.editMessageStream({ threadId: "t", messageId: "m", content: " " }),
    );
    expect(events).toEqual([{ type: "error", message: "content is required" }]);
  });
});
