import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function sessionRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  app.get("/session", async (request, reply) => {
    const limit = Number((request.query as { limit?: string }).limit ?? 50);
    const sessions = ctx.sessionService.list(limit);
    return reply.send(serializeForJson({ sessions, count: sessions.length }));
  });

  app.get("/session/activity", async (request, reply) => {
    const days = Number((request.query as { days?: string }).days ?? 182);
    const safeDays = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 365) : 182;
    const dailyCounts = ctx.sessionService.getActivityDailyCounts(safeDays);
    return reply.send(serializeForJson({ dailyCounts, days: safeDays }));
  });

  app.get<{ Params: { id: string } }>("/session/:id", async (request, reply) => {
    const session = ctx.sessionService.getById(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return reply.send(serializeForJson({ session }));
  });

  app.post<{
    Body: {
      topicId: string;
      problemsSolved: number;
      studyDuration: number;
      productivityScore: number;
      date?: string;
      pushToNotion?: boolean;
      problemId?: string;
    };
  }>("/session", async (request, reply) => {
    const {
      topicId,
      problemsSolved,
      studyDuration,
      productivityScore,
      date,
      pushToNotion,
      problemId,
    } = request.body;

    if (!topicId || problemsSolved == null || studyDuration == null || productivityScore == null) {
      return reply.status(400).send({
        error: "topicId, problemsSolved, studyDuration, and productivityScore are required",
      });
    }

    try {
      const result = await ctx.sessionService.completeSession({
        topicId,
        problemsSolved,
        studyDuration,
        productivityScore,
        date: date ? new Date(date) : undefined,
        pushToNotion,
        problemId,
      });
      return reply.status(201).send(serializeForJson(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to log session";
      const status = message.includes("not found") ? 404 : 500;
      return reply.status(status).send({ error: message });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: {
      problemsSolved?: number;
      studyDuration?: number;
      productivityScore?: number;
      date?: string;
    };
  }>("/session/:id", async (request, reply) => {
    const { date, ...rest } = request.body;
    const session = ctx.sessionService.update(request.params.id, {
      ...rest,
      date: date ? new Date(date) : undefined,
    });
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return reply.send(serializeForJson({ session }));
  });

  app.delete<{ Params: { id: string } }>("/session/:id", async (request, reply) => {
    const deleted = ctx.sessionService.delete(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return reply.status(204).send();
  });
}
