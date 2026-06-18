import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { serializeForJson } from "../lib/json.js";

export async function warmupRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  /** 3 recall questions for the topic — from the user's notes when possible (3.1). */
  app.get<{ Querystring: { topicId?: string } }>(
    "/warmup",
    async (request, reply) => {
      const topicId = request.query.topicId;
      if (!topicId) {
        return reply.status(400).send({ error: "topicId query parameter is required" });
      }
      try {
        const result = await ctx.warmupService.generateQuestions(topicId);
        return reply.send(serializeForJson(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Warm-up failed";
        const status = message.includes("not found") ? 404 : 500;
        return reply.status(status).send({ error: message });
      }
    },
  );

  /** Factual model answer for one warm-up question (on Show Answer). */
  app.post<{ Body: { topicId?: string; question?: string } }>(
    "/warmup/answer",
    async (request, reply) => {
      const { topicId, question } = request.body ?? {};
      if (!topicId || !question?.trim()) {
        return reply.status(400).send({ error: "topicId and question are required" });
      }
      try {
        const result = await ctx.warmupService.revealAnswer(topicId, question);
        return reply.send(serializeForJson(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Answer failed";
        const status = message.includes("not found") ? 404 : 500;
        return reply.status(status).send({ error: message });
      }
    },
  );

  /** Self-grade (0–5) → SM-2 quality, applied directly to the topic. */
  app.post<{ Body: { topicId?: string; quality?: number } }>(
    "/warmup/grade",
    async (request, reply) => {
      const { topicId, quality } = request.body ?? {};
      if (!topicId || quality == null) {
        return reply.status(400).send({ error: "topicId and quality (0–5) are required" });
      }
      try {
        const result = ctx.sessionService.applyRecallQuality(topicId, quality);
        ctx.events.publish("topic");
        return reply.send(serializeForJson(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Grade failed";
        const status = message.includes("not found") ? 404 : 500;
        return reply.status(status).send({ error: message });
      }
    },
  );
}
