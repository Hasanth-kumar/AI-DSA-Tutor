import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";
import type { ChatStreamEvent } from "../services/ChatService.js";

function parseHintLevel(raw: string | undefined): 1 | 2 | 3 | 4 | undefined {
  const level = Number(raw);
  return level === 1 || level === 2 || level === 3 || level === 4
    ? level
    : undefined;
}

function writeSseEvent(reply: { raw: ServerResponse }, event: ChatStreamEvent): void {
  reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

async function streamChatEvents(
  reply: { raw: ServerResponse },
  generator: AsyncGenerator<ChatStreamEvent>,
): Promise<void> {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  try {
    for await (const event of generator) {
      writeSseEvent(reply, event);
      if (event.type === "error") break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stream failed";
    writeSseEvent(reply, { type: "error", message });
  } finally {
    reply.raw.end();
  }
}

export async function coachingRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/coaching/debrief", async (_request, reply) => {
    try {
      const result = await ctx.debriefService.generateLatest();
      return reply.send(serializeForJson(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Debrief failed";
      const status = message.includes("not found") ? 404 : 500;
      return reply.status(status).send({ error: message });
    }
  });

  app.get<{ Params: { sessionId: string } }>(
    "/coaching/debrief/:sessionId",
    async (request, reply) => {
      try {
        const result = await ctx.debriefService.generateForSession(
          request.params.sessionId,
        );
        return reply.send(serializeForJson(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Debrief failed";
        const status = message.includes("not found") ? 404 : 500;
        return reply.status(status).send({ error: message });
      }
    },
  );

  app.get<{ Params: { problemId: string }; Querystring: { level?: string } }>(
    "/coaching/hint/:problemId",
    async (request, reply) => {
      const problem = ctx.problemRepo.findById(request.params.problemId);
      if (!problem?.topicId) {
        return reply.status(404).send({ error: "Problem not found" });
      }

      const topic = ctx.topicRepo.findById(problem.topicId);
      if (!topic) {
        return reply.status(404).send({ error: "Topic not found" });
      }

      const hintCtx = ctx.hintService.buildContextFromTopic(
        problem.name,
        topic,
        problem.difficulty ?? "Medium",
        problem.attempts ?? 0,
        parseHintLevel(request.query.level),
      );
      const hint = await ctx.hintService.generateHint(hintCtx);
      return reply.send(serializeForJson({ problemId: problem.id, hint }));
    },
  );

  app.get<{ Querystring: { name?: string; level?: string } }>(
    "/coaching/hint",
    async (request, reply) => {
      const name = request.query.name?.trim();
      if (!name) {
        return reply.status(400).send({ error: "name query parameter is required" });
      }

      const problem = ctx.problemRepo.findByNameFuzzy(name);
      if (!problem?.topicId) {
        return reply.status(404).send({ error: `Problem not found: ${name}` });
      }

      const topic = ctx.topicRepo.findById(problem.topicId);
      if (!topic) {
        return reply.status(404).send({ error: "Topic not found" });
      }

      const hintCtx = ctx.hintService.buildContextFromTopic(
        problem.name,
        topic,
        problem.difficulty ?? "Medium",
        problem.attempts ?? 0,
        parseHintLevel(request.query.level),
      );
      const hint = await ctx.hintService.generateHint(hintCtx);
      return reply.send(serializeForJson({ problemId: problem.id, hint }));
    },
  );

  app.get("/coaching/threads", async (_request, reply) => {
    const threads = ctx.chatService.listThreads();
    return reply.send(serializeForJson({ threads }));
  });

  app.post<{
    Body: {
      threadId?: string;
      message?: string;
      problemId?: string;
      includeContext?: boolean;
      directMode?: boolean;
    };
  }>("/coaching/chat", async (request, reply) => {
    const message = request.body.message?.trim();
    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }

    try {
      const result = await ctx.chatService.sendMessage({
        threadId: request.body.threadId,
        message,
        problemId: request.body.problemId,
        includeContext: request.body.includeContext ?? true,
        directMode: request.body.directMode ?? false,
      });
      return reply.send(serializeForJson(result));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      const status = msg.includes("not found") ? 404 : 500;
      return reply.status(status).send({ error: msg });
    }
  });

  app.post<{
    Body: {
      threadId?: string;
      message?: string;
      problemId?: string;
      includeContext?: boolean;
      directMode?: boolean;
    };
  }>("/coaching/chat/stream", async (request, reply) => {
    const message = request.body.message?.trim();
    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }

    const abortController = new AbortController();
    request.raw.on("aborted", () => abortController.abort());

    reply.hijack();
    await streamChatEvents(
      reply,
      ctx.chatService.sendMessageStream(
        {
          threadId: request.body.threadId,
          message,
          problemId: request.body.problemId,
          includeContext: request.body.includeContext ?? true,
          directMode: request.body.directMode ?? false,
        },
        abortController.signal,
      ),
    );
  });

  app.post<{
    Body: {
      threadId?: string;
      problemId?: string;
      includeContext?: boolean;
      directMode?: boolean;
    };
  }>("/coaching/chat/regenerate/stream", async (request, reply) => {
    const threadId = request.body.threadId?.trim();
    if (!threadId) {
      return reply.status(400).send({ error: "threadId is required" });
    }

    const abortController = new AbortController();
    request.raw.on("aborted", () => abortController.abort());

    reply.hijack();
    await streamChatEvents(
      reply,
      ctx.chatService.regenerateMessageStream(
        {
          threadId,
          problemId: request.body.problemId,
          includeContext: request.body.includeContext ?? true,
          directMode: request.body.directMode ?? false,
        },
        abortController.signal,
      ),
    );
  });

  app.post<{
    Body: {
      threadId?: string;
      messageId?: string;
      content?: string;
      problemId?: string;
      includeContext?: boolean;
      directMode?: boolean;
    };
  }>("/coaching/chat/edit/stream", async (request, reply) => {
    const threadId = request.body.threadId?.trim();
    const messageId = request.body.messageId?.trim();
    const content = request.body.content?.trim();
    if (!threadId || !messageId || !content) {
      return reply
        .status(400)
        .send({ error: "threadId, messageId, and content are required" });
    }

    const abortController = new AbortController();
    request.raw.on("aborted", () => abortController.abort());

    reply.hijack();
    await streamChatEvents(
      reply,
      ctx.chatService.editMessageStream(
        {
          threadId,
          messageId,
          content,
          problemId: request.body.problemId,
          includeContext: request.body.includeContext ?? true,
          directMode: request.body.directMode ?? false,
        },
        abortController.signal,
      ),
    );
  });

  app.get<{ Params: { threadId: string } }>(
    "/coaching/chat/:threadId",
    async (request, reply) => {
      const thread = ctx.chatService.getThread(request.params.threadId);
      if (!thread) {
        return reply.status(404).send({ error: "Thread not found" });
      }
      return reply.send(serializeForJson(thread));
    },
  );

  app.delete<{ Params: { threadId: string } }>(
    "/coaching/chat/:threadId",
    async (request, reply) => {
      const deleted = ctx.chatService.clearThread(request.params.threadId);
      if (!deleted) {
        return reply.status(404).send({ error: "Thread not found" });
      }
      return reply.status(204).send();
    },
  );
}
